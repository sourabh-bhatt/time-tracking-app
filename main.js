/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const screenshot = require('screenshot-desktop');
const { uIOhook } = require('uiohook-napi');
const {
    deleteLogById,
    getTrackingStats,
    getUserState,
    normalizeUserId,
    saveLogEntry,
    saveUserState,
} = require('./lib/s3-storage');

let mainWindow;
let intervalId;
let isTracking = false;

// Global State
let currentUserId = null;
let currentMemo = '';
let todaySeconds = 0;
let weekSeconds = 0;
let pendingTimeout = null;

// Configuration
const INTERVAL_MS = 10 * 60 * 1000;
const FALLBACK_PIXEL = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
);
let inputMonitoringReady = false;

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

function createWindow() {
    writeStartupLog('Creating main window.');
    mainWindow = new BrowserWindow({
        width: 450,
        height: 700,
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

// --- Input Monitoring Logic ---
let inputCounts = {
    mouseClicks: 0,
    keyPresses: 0,
    mouseMoves: 0,
};

function setupInputMonitoring() {
    uIOhook.on('keydown', () => {
        if (isTracking) inputCounts.keyPresses += 1;
    });
    uIOhook.on('mousedown', () => {
        if (isTracking) inputCounts.mouseClicks += 1;
    });
    uIOhook.on('mousemove', () => {
        if (isTracking) inputCounts.mouseMoves += 1;
    });
    uIOhook.start();
    inputMonitoringReady = true;
    writeStartupLog('Input monitoring started.');
}

// --- Stats Aggregation ---
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

// --- Screenshot & Logging Logic ---
function logToFile(message) {
    writeStartupLog(message);
}

async function captureAndLog(type = 'auto') {
    if (!currentUserId) return;
    if (type === 'auto' && !isTracking) return;

    try {
        let imgBuffer;

        try {
            imgBuffer = await screenshot({ format: 'png' });
        } catch (screenshotErr) {
            console.error('Screenshot failed:', screenshotErr);
            logToFile(`Screenshot failed: ${screenshotErr.message}`);
            imgBuffer = FALLBACK_PIXEL;
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

        inputCounts = { mouseClicks: 0, keyPresses: 0, mouseMoves: 0 };
    } catch (error) {
        console.error('Error capturing/logging:', error);
        logToFile(`Critical Error in captureAndLog: ${error.message}`);
    }
}

// Logic: "In each 10 minutes take random"
function startRandomCycle() {
    function scheduleInBlock() {
        if (!isTracking) return;

        const delay = Math.random() * (INTERVAL_MS - 30000);
        console.log(`Scheduled auto-capture in ${(delay / 60000).toFixed(2)} mins`);

        pendingTimeout = setTimeout(() => {
            captureAndLog('auto');
        }, delay);
    }

    scheduleInBlock();
    intervalId = setInterval(scheduleInBlock, INTERVAL_MS);
}

// --- IPC Handlers ---
ipcMain.on('user-login', async (event, userId) => {
    currentUserId = normalizeUserId(userId);
    console.log(`User logged in: ${currentUserId}`);
    event.sender.send('init-user', currentUserId);

    await fetchStats(currentUserId);
});

ipcMain.on('update-memo', (event, memo) => {
    currentMemo = memo;
});

ipcMain.on('start-tracking', () => {
    if (isTracking) return;

    isTracking = true;
    console.log('Tracking started');

    captureAndLog('start');
    startRandomCycle();
});

ipcMain.on('stop-tracking', () => {
    isTracking = false;
    console.log('Tracking stopped');

    if (intervalId) clearInterval(intervalId);
    if (pendingTimeout) clearTimeout(pendingTimeout);

    captureAndLog('stop');
});

ipcMain.on('delete-screenshot', async (event, id) => {
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

ipcMain.on('open-external', (event, url) => {
    shell.openExternal(url);
});

app.on('ready', async () => {
    writeStartupLog('App ready event fired.');
    createWindow();

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

app.on('will-quit', () => {
    if (inputMonitoringReady) {
        uIOhook.stop();
    }
    if (intervalId) clearInterval(intervalId);
});

process.on('uncaughtException', (error) => {
    writeStartupLog(`Uncaught exception: ${error.stack || error.message}`);
});

process.on('unhandledRejection', (error) => {
    writeStartupLog(`Unhandled rejection: ${error?.stack || error?.message || error}`);
});
