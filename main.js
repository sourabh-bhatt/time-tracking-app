/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, ipcMain, powerMonitor, shell } = require('electron');
const { execFile, spawn } = require('child_process');
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
    listFlagsForUser,
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
let onCall = false;
let lastInputAt = null;
let inputMonitoringReady = false;
let exitPresenceSaved = false;
let presenceSyncInFlight = false;
let pendingPresenceReason = null;
let uIOhook = null;
let inputMonitoringLoadAttempted = false;
let linuxInputProcess = null;
let systemIdleErrorLogged = false;
const execFileAsync = promisify(execFile);

const INTERVAL_MS = 10 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 30 * 1000;
const STATUS_INTERVAL_MS = 1000;
const IDLE_THRESHOLD_MS = IDLE_THRESHOLD_SECONDS * 1000;
const MIN_RANDOM_CAPTURE_DELAY_MS = 30 * 1000;
const MAX_RANDOM_CAPTURE_DELAY_MS = INTERVAL_MS - (30 * 1000);
const MIN_RANDOM_CAPTURE_GAP_MS = 90 * 1000;
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (!mainWindow) {
            return;
        }

        if (mainWindow.isMinimized()) {
            mainWindow.restore();
        }

        mainWindow.show();
        mainWindow.focus();
    });
}

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

function getSystemIdleSnapshot(now = Date.now()) {
    try {
        const idleSeconds = Math.max(0, Number(powerMonitor.getSystemIdleTime() || 0));
        return {
            idleSeconds,
            lastActivityAt: now - (idleSeconds * 1000),
        };
    } catch (error) {
        if (!systemIdleErrorLogged) {
            systemIdleErrorLogged = true;
            logToFile(`System idle monitoring unavailable: ${error.message}`);
        }

        return null;
    }
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

    if (onCall) {
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
        onCall: Boolean(isTracking && onCall),
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
        onCall: Boolean(isTracking && onCall),
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
        onCall,
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

    if (onCall) {
        if (!activeSince) {
            activeSince = toIso(lastInputAt || now);
        }
        idleSince = null;
        return false;
    }

    if (isIdleAt(now)) {
        if (!idleSince) {
            idleSince = getIdleStartIso(now);
            activeSince = null;
            resetActivityCounters();
            logToFile('User marked idle after 15 minutes of inactivity. Screenshots and time are paused.');
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

function markActivityDetected(now = Date.now()) {
    const wasIdle = isIdleAt(now);
    lastInputAt = now;

    if (isTracking && (wasIdle || !activeSince)) {
        activeSince = toIso(now);
        idleSince = null;
        logToFile('Activity resumed.');
        queuePresenceSync('activity-resumed');
    }
}

function syncSystemActivity(now = Date.now()) {
    const snapshot = getSystemIdleSnapshot(now);
    if (!snapshot) {
        return;
    }

    const previousLastInputAt = lastInputAt;
    const systemActivityIsNewer = !previousLastInputAt
        || snapshot.lastActivityAt > previousLastInputAt + 500;

    if (systemActivityIsNewer) {
        const wasIdle = isIdleAt(now);
        lastInputAt = snapshot.lastActivityAt;

        // System idle changes supplement native hooks and keep activity bars
        // useful on Linux display servers that expose only part of the input stream.
        if (isTracking) {
            inputCounts.mouseMoves += 1;
        }

        if (isTracking && (wasIdle || !activeSince)) {
            activeSince = toIso(snapshot.lastActivityAt);
            idleSince = null;
            logToFile('Activity resumed from system idle monitoring.');
            queuePresenceSync('activity-resumed');
        }
    }
}

async function setOnCallMode(nextOnCall) {
    onCall = Boolean(nextOnCall && isTracking);

    if (onCall) {
        activeSince = activeSince || toIso(lastInputAt || Date.now());
        idleSince = null;
    }

    sendTrackingConfig();
    sendPresenceUpdate();
    queuePresenceSync(onCall ? 'on-call-enabled' : 'on-call-disabled');
}

function recordInput(counterKey) {
    if (isTracking) {
        inputCounts[counterKey] += 1;
    }

    const now = Date.now();
    markActivityDetected(now);

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
        icon: path.join(__dirname, 'public', 'time-tracker-linux.png'),
        show: true,
    });

    mainWindow.loadFile('index.html').catch((error) => {
        writeStartupLog(`loadFile failed: ${error.message}`);
    });

    mainWindow.once('ready-to-show', () => {
        writeStartupLog('Main window ready to show.');
        mainWindow.webContents.send('set-env-user', normalizeUserId(process.env.USER_ID || ''));
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

function setupLinuxInputMonitoring() {
    if (process.platform !== 'linux' || linuxInputProcess) {
        return;
    }

    let outputBuffer = '';
    const child = spawn('xinput', ['test-xi2', '--root'], {
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    linuxInputProcess = child;
    inputMonitoringReady = true;

    child.stdout.on('data', (chunk) => {
        outputBuffer += chunk.toString();
        const lines = outputBuffer.split(/\r?\n/);
        outputBuffer = lines.pop() || '';

        for (const line of lines) {
            if (line.includes('RawKeyPress')) {
                recordInput('keyPresses');
            } else if (line.includes('RawButtonPress')) {
                recordInput('mouseClicks');
            } else if (line.includes('RawMotion')) {
                recordInput('mouseMoves');
            }
        }
    });

    child.on('spawn', () => {
        writeStartupLog('Linux input monitoring started with xinput.');
    });

    child.on('error', (error) => {
        inputMonitoringReady = false;
        linuxInputProcess = null;
        writeStartupLog(`Linux xinput monitoring unavailable: ${error.message}`);
    });

    child.on('exit', (code, signal) => {
        inputMonitoringReady = false;
        linuxInputProcess = null;
        writeStartupLog(`Linux xinput monitoring stopped (${code ?? signal ?? 'unknown'}).`);
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
        }
    }

    if (!uIOhook) {
        setupLinuxInputMonitoring();
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

async function fetchFlags(userId) {
    if (!userId || !mainWindow || mainWindow.isDestroyed()) return;
    try {
        mainWindow.webContents.send('flags-update', await listFlagsForUser(userId));
    } catch (error) {
        console.error('Error fetching flags:', error);
        logToFile(`Error fetching flags: ${error.message}`);
    }
}

function scheduleCapture(delayMs, callback) {
    const timeoutId = setTimeout(async () => {
        scheduledCaptureTimeoutIds.delete(timeoutId);
        await callback();
    }, delayMs);

    scheduledCaptureTimeoutIds.add(timeoutId);
}

function pickRandomCaptureDelays() {
    const delays = [];

    while (delays.length < 2) {
        const candidate = Math.floor(
            Math.random() * (MAX_RANDOM_CAPTURE_DELAY_MS - MIN_RANDOM_CAPTURE_DELAY_MS + 1),
        ) + MIN_RANDOM_CAPTURE_DELAY_MS;

        const tooClose = delays.some((delay) => Math.abs(delay - candidate) < MIN_RANDOM_CAPTURE_GAP_MS);
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
    if (!currentUserId || !isTracking) return null;

    const captureStartedAt = Date.now();
    syncSystemActivity(captureStartedAt);

    if (updateIdleState(captureStartedAt)) {
        logToFile(`Skipped ${type} screenshot because the user has been idle for 15 minutes.`);
        return null;
    }

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

            return null;
        }

        syncSystemActivity(Date.now());
        if (!isTracking || updateIdleState(Date.now())) {
            logToFile(`Discarded ${type} screenshot because tracking stopped or the user became idle.`);
            return null;
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
            if (process.platform !== 'linux') {
                mainWindow.webContents.send('play-sound');
            }
            mainWindow.webContents.send('show-notification', {
                title: 'Screenshot Taken',
                body: 'Your activity has been logged.',
                silent: process.platform === 'linux',
            });
        }

        console.log(`Logged (${type}) for ${currentUserId}`);
        logToFile(`Logged (${type}) successfully.`);
        resetActivityCounters();
        return savedLog;
    } catch (error) {
        console.error('Error capturing/logging:', error);
        logToFile(`Critical Error in captureAndLog: ${error.message}`);
        return null;
    }
}

function startRandomCycle() {
    function scheduleBlockCaptures() {
        if (!isTracking) return;

        const [firstDelay, secondDelay] = pickRandomCaptureDelays();
        const blockState = { firstCapturePromise: Promise.resolve(null) };

        console.log('Scheduled 2 random screenshots in current 10-minute block.');

        scheduleCapture(firstDelay, () => {
            blockState.firstCapturePromise = captureAndLog('sample', { countsTowardTime: false });
            return blockState.firstCapturePromise;
        });

        scheduleCapture(secondDelay, async () => {
            const firstCapture = await blockState.firstCapturePromise;
            return captureAndLog('auto', {
                countsTowardTime: Boolean(firstCapture),
            });
        });
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
        syncSystemActivity(now);
        const idle = updateIdleState(now);

        if (isTracking && !idle) {
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
        fetchFlags(currentUserId);
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
            onCall: false,
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
    onCall = false;
    lastInputAt = Date.now();

    console.log(`User logged in: ${currentUserId}`);
    event.sender.send('init-user', currentUserId);
    sendTrackingConfig();
    sendPresenceUpdate();
    queuePresenceSync('login');

    await fetchStats(currentUserId);
    await fetchFlags(currentUserId);
});

ipcMain.on('update-memo', (_event, memo) => {
    currentMemo = memo;
});

ipcMain.on('set-on-call', async (_event, value) => {
    await setOnCallMode(value);
});

ipcMain.on('start-tracking', async () => {
    if (isTracking) return;

    const now = Date.now();
    const state = currentUserId ? await getUserState(currentUserId) : null;
    isTracking = true;
    sessionWorkedSeconds = 0;
    trackingStartedAt = toIso(now);
    activeSince = toIso(now);
    idleSince = null;
    onCall = Boolean(state?.onCall);
    lastInputAt = getSystemIdleSnapshot(now)?.lastActivityAt || now;
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
    onCall = false;
    clearTrackingSchedule();

    console.log('Tracking stopped');
    logToFile('Tracking stopped.');

    sendPresenceUpdate();
    queuePresenceSync('tracking-stopped');
    resetActivityCounters();
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

    if (linuxInputProcess) {
        linuxInputProcess.kill();
        linuxInputProcess = null;
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
