/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const screenshot = require('screenshot-desktop');
const { promisify } = require('util');
const {
    IDLE_THRESHOLD_SECONDS,
    TRACKING_TIME_LABEL,
    TRACKING_TIMEZONE,
    deleteLogById,
    getTrackingStats,
    getUserState,
    normalizeUserId,
    saveLogEntry,
    saveUserState,
} = require('./lib/s3-storage');

let mainWindow;
let intervalId;
let heartbeatIntervalId;
let statusIntervalId;
let isTracking = false;
let currentUserId = null;
let currentMemo = '';
let todaySeconds = 0;
let weekSeconds = 0;
let scheduledCaptureTimeoutIds = new Set();
let sessionWorkedSeconds = 0;
let trackingStartedAt = null;
let activeSince = null;
let idleSince = null;
let lastInputAt = null;
let inputMonitoringReady = false;
let exitPresenceSaved = false;
let presenceSyncInFlight = false;
let pendingPresenceReason = null;
let uIOhook = null;
let inputMonitoringLoadAttempted = false;
const execFileAsync = promisify(execFile);

const INTERVAL_MS = 10 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 30 * 1000;
const STATUS_INTERVAL_MS = 1000;
const IDLE_THRESHOLD_MS = IDLE_THRESHOLD_SECONDS * 1000;
const BLOCK_END_CAPTURE_OFFSET_MS = 10 * 1000;
const MIN_MIDDLE_CAPTURE_DELAY_MS = 60 * 1000;
const MIDDLE_CAPTURE_GAP_MS = 45 * 1000;
let inputCounts = {
    mouseClicks: 0,
    keyPresses: 0,
    mouseMoves: 0,
};

function writeStartupLog(message) {
    try {
        const baseDir = app.isReady()
            ? app.getPath('userData')
            : path.join(process.env.APPDATA || process.cwd(), 'employee-monitor');
        fs.mkdirSync(baseDir, { recursive: true });
        const logPath = path.join(baseDir, 'tracker_debug.log');
        const timestamp = new Date().toISOString();
        fs.appendFileSync(logPath, `[${timestamp}] ${message}\n`);
    } catch (error) {
        console.error('Failed to write startup log:', error);
    }
}

function logToFile(message) {
    writeStartupLog(message);
}

function toIso(value) {
    return new Date(value).toISOString();
}

function getIdleStartIso(now = Date.now()) {
    if (!lastInputAt) {
        return toIso(now);
    }

    return toIso(lastInputAt + IDLE_THRESHOLD_MS);
}

function isIdleAt(now = Date.now()) {
    if (!isTracking) {
        return false;
    }

    if (!lastInputAt) {
        return true;
    }

    return (now - lastInputAt) >= IDLE_THRESHOLD_MS;
}

function buildPresenceState(now = Date.now()) {
    const idle = isIdleAt(now);
    const nextActiveSince = isTracking && !idle ? (activeSince || toIso(lastInputAt || now)) : null;
    const nextIdleSince = isTracking && idle ? (idleSince || getIdleStartIso(now)) : null;

    return {
        isOnline: Boolean(currentUserId),
        isTracking,
        isIdle: idle,
        trackingStartedAt: isTracking ? trackingStartedAt : null,
        activeSince: nextActiveSince,
        idleSince: nextIdleSince,
        lastHeartbeatAt: currentUserId ? toIso(now) : null,
        lastActivityAt: lastInputAt ? toIso(lastInputAt) : null,
        platform: process.platform,
    };
}

function buildRendererPresence(now = Date.now()) {
    const presence = buildPresenceState(now);

    return {
        ...presence,
        sessionWorkedSeconds,
        idleThresholdSeconds: IDLE_THRESHOLD_SECONDS,
        trackingTimeZone: TRACKING_TIMEZONE,
        trackingTimeLabel: TRACKING_TIME_LABEL,
    };
}

function sendTrackingConfig() {
    if (!mainWindow) return;

    mainWindow.webContents.send('tracking-config', {
        trackingTimeZone: TRACKING_TIMEZONE,
        trackingTimeLabel: TRACKING_TIME_LABEL,
        idleThresholdSeconds: IDLE_THRESHOLD_SECONDS,
    });
}

function sendPresenceUpdate() {
    if (!mainWindow) return;
    mainWindow.webContents.send('presence-update', buildRendererPresence());
}

async function persistPresence(reason = 'heartbeat') {
    if (!currentUserId) {
        return;
    }

    try {
        await saveUserState(currentUserId, buildPresenceState());
    } catch (error) {
        console.error(`Error syncing presence (${reason}):`, error);
        logToFile(`Error syncing presence (${reason}): ${error.message}`);
    }
}

function queuePresenceSync(reason = 'heartbeat') {
    if (presenceSyncInFlight) {
        pendingPresenceReason = reason;
        return;
    }

    presenceSyncInFlight = true;

    persistPresence(reason)
        .finally(() => {
            presenceSyncInFlight = false;

            if (pendingPresenceReason) {
                const nextReason = pendingPresenceReason;
                pendingPresenceReason = null;
                queuePresenceSync(nextReason);
            }
        });
}

function clearTrackingSchedule() {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }

    for (const timeoutId of scheduledCaptureTimeoutIds) {
        clearTimeout(timeoutId);
    }

    scheduledCaptureTimeoutIds = new Set();
}

function resetActivityCounters() {
    inputCounts = { mouseClicks: 0, keyPresses: 0, mouseMoves: 0 };
}

function updateIdleState(now = Date.now()) {
    if (!isTracking) {
        activeSince = null;
        idleSince = null;
        return false;
    }

    if (isIdleAt(now)) {
        if (!idleSince) {
            idleSince = getIdleStartIso(now);
            activeSince = null;
            logToFile('User marked idle after 5 minutes of inactivity. Tracking continues.');
            queuePresenceSync('idle');
        }

        return true;
    }

    if (!activeSince) {
        activeSince = toIso(lastInputAt || now);
    }

    idleSince = null;
    return false;
}

function recordInput(counterKey) {
    if (isTracking) {
        inputCounts[counterKey] += 1;
    }

    const now = Date.now();
    const wasIdle = isIdleAt(now);
    lastInputAt = now;

    if (isTracking && (wasIdle || !activeSince)) {
        activeSince = toIso(now);
        idleSince = null;
        logToFile('Activity resumed.');
        queuePresenceSync('activity-resumed');
    }

    sendPresenceUpdate();
}

function createWindow() {
    writeStartupLog('Creating main window.');
    mainWindow = new BrowserWindow({
        width: 450,
        height: 760,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        autoHideMenuBar: true,
        backgroundColor: '#121212',
        show: true,
    });

    mainWindow.loadFile('index.html').catch((error) => {
        writeStartupLog(`loadFile failed: ${error.message}`);
    });

    mainWindow.once('ready-to-show', () => {
        writeStartupLog('Main window ready to show.');
        mainWindow.webContents.send('set-env-user', process.env.USER_ID || 'sourabh');
        sendTrackingConfig();
        sendPresenceUpdate();
        mainWindow.show();
    });

    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
        writeStartupLog(`Renderer failed to load: ${errorCode} ${errorDescription}`);
    });

    mainWindow.webContents.on('render-process-gone', (_event, details) => {
        writeStartupLog(`Renderer process gone: ${JSON.stringify(details)}`);
    });

    mainWindow.on('closed', () => {
        writeStartupLog('Main window closed.');
        mainWindow = null;
    });
}

function setupInputMonitoring() {
    if (inputMonitoringReady) {
        return;
    }

    if (!inputMonitoringLoadAttempted) {
        inputMonitoringLoadAttempted = true;

        try {
            ({ uIOhook } = require('uiohook-napi'));
        } catch (error) {
            writeStartupLog(`Input monitoring unavailable: ${error.message}`);
            console.error('Input monitoring unavailable:', error);
            return;
        }
    }

    if (!uIOhook) {
        return;
    }

    uIOhook.on('keydown', () => {
        recordInput('keyPresses');
    });
    uIOhook.on('mousedown', () => {
        recordInput('mouseClicks');
    });
    uIOhook.on('mousemove', () => {
        recordInput('mouseMoves');
    });
    uIOhook.start();
    inputMonitoringReady = true;
    writeStartupLog('Input monitoring started.');
}

async function sendStatsUpdate(manualData) {
    if (!mainWindow) return;

    const hourlyRate = 5;
    const todayEarnings = (todaySeconds / 3600) * hourlyRate;
    const weekEarnings = (weekSeconds / 3600) * hourlyRate;

    mainWindow.webContents.send('update-stats', {
        todaySeconds,
        weekSeconds,
        todayEarnings,
        weekEarnings,
    });

    if (!currentUserId) return;

    if (manualData) {
        mainWindow.webContents.send('update-manual-earnings-data', manualData);
        return;
    }

    try {
        const state = await getUserState(currentUserId);
        mainWindow.webContents.send('update-manual-earnings-data', {
            weeklyPaid: Number(state.manual_weekly_paid || 0),
            weeklyPending: Number(state.manual_weekly_pending || 0),
            totalPending: Number(state.manual_total_pending || 0),
        });
    } catch (error) {
        console.error('Error loading manual earnings:', error);
    }
}

async function fetchStats(userId) {
    if (!userId) return;

    try {
        const stats = await getTrackingStats(userId, new Date());
        todaySeconds = stats.todaySeconds;
        weekSeconds = stats.weekSeconds;

        await sendStatsUpdate(stats.manual);
    } catch (error) {
        console.error('Error fetching stats:', error);
        logToFile(`Error fetching stats: ${error.message}`);
    }
}

function scheduleCapture(delayMs, callback) {
    const timeoutId = setTimeout(async () => {
        scheduledCaptureTimeoutIds.delete(timeoutId);
        await callback();
    }, delayMs);

    scheduledCaptureTimeoutIds.add(timeoutId);
}

function pickMiddleCaptureDelays(count) {
    const latestDelay = INTERVAL_MS - BLOCK_END_CAPTURE_OFFSET_MS - MIN_MIDDLE_CAPTURE_DELAY_MS;
    const delays = [];

    while (delays.length < count && latestDelay > MIN_MIDDLE_CAPTURE_DELAY_MS) {
        const candidate = Math.floor(
            Math.random() * (latestDelay - MIN_MIDDLE_CAPTURE_DELAY_MS + 1),
        ) + MIN_MIDDLE_CAPTURE_DELAY_MS;

        const tooClose = delays.some((delay) => Math.abs(delay - candidate) < MIDDLE_CAPTURE_GAP_MS);
        if (!tooClose) {
            delays.push(candidate);
        }
    }

    return delays.sort((left, right) => left - right);
}

function getLinuxScreenshotInstallHint() {
    return 'Install a Linux screenshot tool, for example: sudo apt install -y gnome-screenshot imagemagick scrot';
}

async function captureLinuxScreenshotBuffer() {
    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'time-tracker-shot-'));
    const filePath = path.join(tempDir, `capture-${Date.now()}.png`);
    const attempts = [
        { command: 'gnome-screenshot', args: ['-f', filePath] },
        { command: 'grim', args: [filePath] },
        { command: 'spectacle', args: ['-b', '-n', '-o', filePath] },
        { command: 'scrot', args: [filePath] },
        { command: 'maim', args: [filePath] },
        { command: 'import', args: ['-window', 'root', filePath] },
    ];
    const errors = [];

    try {
        for (const attempt of attempts) {
            try {
                await execFileAsync(attempt.command, attempt.args, {
                    env: process.env,
                    timeout: 15000,
                    windowsHide: true,
                });

                const buffer = await fs.promises.readFile(filePath);
                if (buffer.length > 0) {
                    logToFile(`Captured Linux screenshot using ${attempt.command}.`);
                    return buffer;
                }

                errors.push(`${attempt.command}: empty output`);
            } catch (error) {
                errors.push(`${attempt.command}: ${error.code || error.message}`);
            }
        }

        throw new Error(`No Linux screenshot command succeeded. ${errors.join(' | ')}. ${getLinuxScreenshotInstallHint()}`);
    } finally {
        await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
}

async function captureScreenshotBuffer() {
    if (process.platform === 'linux') {
        return captureLinuxScreenshotBuffer();
    }

    return screenshot({ format: 'png' });
}

async function captureAndLog(type = 'auto', options = {}) {
    if (!currentUserId) return;
    if (type === 'auto' && !isTracking) return;

    try {
        let imgBuffer;

        try {
            imgBuffer = await captureScreenshotBuffer();
        } catch (screenshotErr) {
            console.error('Screenshot failed:', screenshotErr);
            logToFile(`Screenshot failed: ${screenshotErr.message}`);

            if (mainWindow) {
                mainWindow.webContents.send('show-notification', {
                    title: 'Screenshot Failed',
                    body: process.platform === 'linux'
                        ? 'Install gnome-screenshot or another Linux screenshot tool.'
                        : 'Unable to capture the screen.',
                });
            }

            return;
        }

        const timestamp = new Date();
        const savedLog = await saveLogEntry({
            userId: currentUserId,
            timestamp,
            imageBuffer: imgBuffer,
            activity: { ...inputCounts },
            memo: currentMemo,
            project: 'Internal Work',
            client: 'Time Tracker',
            type,
            countsTowardTime: Boolean(options.countsTowardTime),
        });

        await fetchStats(currentUserId);

        if (mainWindow) {
            mainWindow.webContents.send('new-screenshot', {
                _id: savedLog._id,
                timestamp,
                image: `data:image/png;base64,${imgBuffer.toString('base64')}`,
                type,
            });
            mainWindow.webContents.send('play-sound');
            mainWindow.webContents.send('show-notification', {
                title: 'Screenshot Taken',
                body: 'Your activity has been logged.',
            });
        }

        console.log(`Logged (${type}) for ${currentUserId}`);
        logToFile(`Logged (${type}) successfully.`);
        resetActivityCounters();
    } catch (error) {
        console.error('Error capturing/logging:', error);
        logToFile(`Critical Error in captureAndLog: ${error.message}`);
    }
}

function startRandomCycle() {
    function scheduleBlockCaptures() {
        if (!isTracking) return;

        const middleCaptureCount = Math.random() < 0.5 ? 2 : 3;
        const middleCaptureDelays = pickMiddleCaptureDelays(middleCaptureCount);

        console.log(`Scheduled ${middleCaptureCount + 2} screenshots in current 10-minute block.`);

        captureAndLog('block-start', { countsTowardTime: false });

        for (const delay of middleCaptureDelays) {
            scheduleCapture(delay, () => captureAndLog('sample', { countsTowardTime: false }));
        }

        scheduleCapture(INTERVAL_MS - BLOCK_END_CAPTURE_OFFSET_MS, () => captureAndLog('auto', { countsTowardTime: true }));
    }

    scheduleBlockCaptures();
    intervalId = setInterval(scheduleBlockCaptures, INTERVAL_MS);
}

function ensureStatusLoop() {
    if (statusIntervalId) {
        return;
    }

    statusIntervalId = setInterval(() => {
        const now = Date.now();
        updateIdleState(now);

        if (isTracking) {
            sessionWorkedSeconds += 1;
        }

        sendPresenceUpdate();
    }, STATUS_INTERVAL_MS);
}

function ensureHeartbeatLoop() {
    if (heartbeatIntervalId) {
        return;
    }

    heartbeatIntervalId = setInterval(() => {
        if (!currentUserId) {
            return;
        }

        queuePresenceSync('heartbeat');
    }, HEARTBEAT_INTERVAL_MS);
}

async function markUserOffline() {
    if (!currentUserId) {
        return;
    }

    try {
        await saveUserState(currentUserId, {
            isOnline: false,
            isTracking: false,
            isIdle: false,
            trackingStartedAt: null,
            activeSince: null,
            idleSince: null,
            lastHeartbeatAt: new Date().toISOString(),
            lastActivityAt: lastInputAt ? new Date(lastInputAt).toISOString() : null,
            platform: process.platform,
        });
    } catch (error) {
        console.error('Error saving offline presence:', error);
        logToFile(`Error saving offline presence: ${error.message}`);
    }
}

ipcMain.on('user-login', async (event, userId) => {
    const nextUserId = normalizeUserId(userId);

    if (currentUserId && currentUserId !== nextUserId) {
        await markUserOffline();
    }

    currentUserId = nextUserId;
    exitPresenceSaved = false;
    sessionWorkedSeconds = 0;
    trackingStartedAt = null;
    activeSince = null;
    idleSince = null;
    lastInputAt = Date.now();

    console.log(`User logged in: ${currentUserId}`);
    event.sender.send('init-user', currentUserId);
    sendTrackingConfig();
    sendPresenceUpdate();
    queuePresenceSync('login');

    await fetchStats(currentUserId);
});

ipcMain.on('update-memo', (_event, memo) => {
    currentMemo = memo;
});

ipcMain.on('start-tracking', () => {
    if (isTracking) return;

    const now = Date.now();
    isTracking = true;
    sessionWorkedSeconds = 0;
    trackingStartedAt = toIso(now);
    activeSince = toIso(now);
    idleSince = null;
    lastInputAt = now;
    resetActivityCounters();

    console.log('Tracking started');
    logToFile('Tracking started.');

    sendPresenceUpdate();
    queuePresenceSync('tracking-started');
    startRandomCycle();
});

ipcMain.on('stop-tracking', async () => {
    isTracking = false;
    trackingStartedAt = null;
    activeSince = null;
    idleSince = null;
    clearTrackingSchedule();

    console.log('Tracking stopped');
    logToFile('Tracking stopped.');

    sendPresenceUpdate();
    queuePresenceSync('tracking-stopped');
    await captureAndLog('stop', { countsTowardTime: false });
});

ipcMain.on('delete-screenshot', async (_event, id) => {
    if (!currentUserId) return;

    try {
        await deleteLogById(id);
        await fetchStats(currentUserId);
    } catch (error) {
        console.error('Error deleting screenshot:', error);
        logToFile(`Error deleting screenshot: ${error.message}`);
    }
});

ipcMain.on('get-manual-earnings', async (event) => {
    if (!currentUserId) return;

    try {
        const state = await getUserState(currentUserId);
        event.sender.send('update-manual-earnings-data', {
            weeklyPaid: Number(state.manual_weekly_paid || 0),
            weeklyPending: Number(state.manual_weekly_pending || 0),
            totalPending: Number(state.manual_total_pending || 0),
        });
    } catch (error) {
        console.error('Error fetching manual earnings:', error);
    }
});

ipcMain.on('update-manual-earnings', async (event, data) => {
    if (!currentUserId) return;

    try {
        const updatedState = await saveUserState(currentUserId, {
            manual_weekly_paid: parseFloat(data.weeklyPaid) || 0,
            manual_weekly_pending: parseFloat(data.weeklyPending) || 0,
            manual_total_pending: parseFloat(data.totalPending) || 0,
        });

        event.sender.send('update-manual-earnings-data', {
            weeklyPaid: Number(updatedState.manual_weekly_paid || 0),
            weeklyPending: Number(updatedState.manual_weekly_pending || 0),
            totalPending: Number(updatedState.manual_total_pending || 0),
        });
    } catch (error) {
        console.error('Error updating manual earnings:', error);
        logToFile(`Error updating manual earnings: ${error.message}`);
    }
});

ipcMain.on('open-external', (_event, url) => {
    shell.openExternal(url);
});

app.on('ready', async () => {
    writeStartupLog('App ready event fired.');
    createWindow();
    ensureStatusLoop();
    ensureHeartbeatLoop();

    try {
        setupInputMonitoring();
    } catch (error) {
        writeStartupLog(`Input monitoring failed to start: ${error.message}`);
        console.error('Input monitoring failed to start:', error);
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (mainWindow === null) createWindow();
});

app.on('before-quit', async (event) => {
    if (exitPresenceSaved || !currentUserId) {
        return;
    }

    event.preventDefault();
    exitPresenceSaved = true;
    await markUserOffline();
    app.quit();
});

app.on('will-quit', () => {
    if (inputMonitoringReady && uIOhook) {
        uIOhook.stop();
    }

    clearTrackingSchedule();

    if (heartbeatIntervalId) {
        clearInterval(heartbeatIntervalId);
    }

    if (statusIntervalId) {
        clearInterval(statusIntervalId);
    }
});

process.on('uncaughtException', (error) => {
    writeStartupLog(`Uncaught exception: ${error.stack || error.message}`);
});

process.on('unhandledRejection', (error) => {
    writeStartupLog(`Unhandled rejection: ${error?.stack || error?.message || error}`);
});
