const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const screenshot = require('screenshot-desktop');
const { uIOhook } = require('uiohook-napi');
const { MongoClient, ObjectId } = require('mongodb');

let mainWindow;
let intervalId;
let dbClient;
let dbInstance; // Store DB instance to get collections dynamically
let isTracking = false;

// Global State
let currentUserId = null;
let currentMemo = '';
let todaySeconds = 0;
let weekSeconds = 0;
let pendingTimeout = null; // Store timeout for random capture

// Configuration
const MONGO_URI = 'mongodb+srv://sourabhbhatt825_db_user:YkIRl7d8d8hzouyJ@time.kzzgpr1.mongodb.net/';
const INTERVAL_MS = 10 * 60 * 1000; // 10 Minutes Fixed Block

// Connect to MongoDB
async function connectDB() {
    try {
        dbClient = new MongoClient(MONGO_URI, { tls: true });
        await dbClient.connect();
        dbInstance = dbClient.db('employee_monitor');
        console.log('Connected to MongoDB');
    } catch (err) {
        console.error('MongoDB connection error:', err);
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 450, // Slightly wider for new UI
        height: 700,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        autoHideMenuBar: true,
        backgroundColor: '#121212', // Match dark theme
        show: false // Wait until ready
    });

    mainWindow.loadFile('index.html');

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}

// --- Input Monitoring Logic ---
let inputCounts = {
    mouseClicks: 0,
    keyPresses: 0,
    mouseMoves: 0
};

function setupInputMonitoring() {
    uIOhook.on('keydown', () => { if (isTracking) inputCounts.keyPresses++; });
    uIOhook.on('mousedown', () => { if (isTracking) inputCounts.mouseClicks++; });
    uIOhook.on('mousemove', () => { if (isTracking) inputCounts.mouseMoves++; });
    uIOhook.start();
}

// --- Stats Aggregation ---
async function fetchStats(userId) {
    if (!dbInstance || !userId) return;

    // Select collection based on user
    const collectionName = `logs_${userId.toLowerCase()}`;
    const dbCollection = dbInstance.collection(collectionName);

    const now = new Date();

    // Today (Start of day 00:00:00)
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    // Week (Start of week - assuming Monday as start)
    const weekStart = new Date(now);
    const day = weekStart.getDay();
    const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    weekStart.setDate(diff);
    weekStart.setHours(0, 0, 0, 0);

    try {
        // Count documents for today (Only auto logs count for valid time)
        const todayCount = await dbCollection.countDocuments({
            userId: userId,
            timestamp: { $gte: todayStart },
            type: 'auto'
        });

        // Count documents for week
        const weekCount = await dbCollection.countDocuments({
            userId: userId,
            timestamp: { $gte: weekStart },
            type: 'auto'
        });

        // Calculate seconds (each screenshot = 10 minutes of work = 600 seconds)
        todaySeconds = todayCount * 600;
        weekSeconds = weekCount * 600;

        sendStatsUpdate();

        // --- SYNC INITIAL USER STATS TO DB ---
        const statsCollection = dbInstance.collection('user_stats');
        const readableDate = new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });

        await statsCollection.updateOne(
            { userId: userId },
            {
                $set: {
                    userId: userId,
                    weeklyLimitHours: 60,
                    todaySeconds: todaySeconds,
                    weekSeconds: weekSeconds,
                    dateStr: readableDate,
                    lastUpdated: new Date()
                }
            },
            { upsert: true }
        );

    } catch (err) {
        console.error('Error fetching stats:', err);
    }
}

function sendStatsUpdate() {
    if (mainWindow) {
        // Hardcoded rate for now as requested
        const hourlyRate = 5;
        const todayEarnings = (todaySeconds / 3600) * hourlyRate;
        const weekEarnings = (weekSeconds / 3600) * hourlyRate;

        mainWindow.webContents.send('update-stats', {
            todaySeconds,
            weekSeconds,
            todayEarnings,
            weekEarnings
        });

        // Also send manual earnings if we have them
        const statsCollection = dbInstance.collection('user_stats');
        statsCollection.findOne({ userId: currentUserId }).then(stats => {
            if (stats) {
                mainWindow.webContents.send('update-manual-earnings-data', {
                    weeklyPaid: stats.manual_weekly_paid || 0,
                    weeklyPending: stats.manual_weekly_pending || 0,
                    totalPending: stats.manual_total_pending || 0
                });
            }
        });
    }
}

// --- Screenshot & Logging Logic ---
const fs = require('fs');

function logToFile(message) {
    const logPath = path.join(app.getPath('userData'), 'tracker_debug.log');
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logPath, `[${timestamp}] ${message}\n`);
}

async function captureAndLog(type = 'auto') {
    // type: 'start' | 'auto' | 'stop'
    if (!dbInstance || !isTracking || !currentUserId) return;

    // Select collection based on user
    const collectionName = `logs_${currentUserId.toLowerCase()}`;
    const dbCollection = dbInstance.collection(collectionName);
    const statsCollection = dbInstance.collection('user_stats');

    try {
        let imgBuffer;
        try {
            imgBuffer = await screenshot({ format: 'png' });
        } catch (screenshotErr) {
            console.error('Screenshot failed:', screenshotErr);
            logToFile(`Screenshot failed: ${screenshotErr.message}`);
            // Create a 1x1 dummy PNG buffer (base64 for a black pixel)
            imgBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
        }

        const timestamp = new Date();

        const logEntry = {
            userId: currentUserId,
            timestamp: timestamp,
            image: imgBuffer,
            activity: { ...inputCounts },
            memo: currentMemo,
            project: 'Internal Work',
            client: 'Time Tracker',
            type: type // 'start', 'auto', 'stop'
        };

        const result = await dbCollection.insertOne(logEntry);

        // ONLY Increment time for 'auto' types
        if (type === 'auto') {
            todaySeconds += 600;
            weekSeconds += 600;
        }

        const hourlyRate = 5;
        const todayEarnings = (todaySeconds / 3600) * hourlyRate;
        const weekEarnings = (weekSeconds / 3600) * hourlyRate;

        sendStatsUpdate();

        // --- UPDATE USER STATS IN DB ---
        const readableDate = timestamp.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });

        await statsCollection.updateOne(
            { userId: currentUserId },
            {
                $set: {
                    userId: currentUserId,
                    weeklyLimitHours: 60,
                    todaySeconds: todaySeconds,
                    weekSeconds: weekSeconds,
                    todayEarnings: todayEarnings,
                    weekEarnings: weekEarnings,
                    dateStr: readableDate,
                    lastUpdated: timestamp
                }
            },
            { upsert: true } // Create if doesn't exist
        );

        // Send Screenshot to UI
        if (mainWindow) {
            mainWindow.webContents.send('new-screenshot', {
                _id: result.insertedId.toString(),
                timestamp: timestamp,
                image: `data:image/png;base64,${imgBuffer.toString('base64')}`,
                type: type
            });

            // Trigger Notification & Sound
            mainWindow.webContents.send('play-sound');
            mainWindow.webContents.send('show-notification', {
                title: 'Screenshot Taken',
                body: 'Your activity has been logged.'
            });
        }

        console.log(`Logged (${type}) for ${currentUserId} in ${collectionName}`);
        logToFile(`Logged (${type}) successfully.`);

        // Reset counts
        inputCounts = { mouseClicks: 0, keyPresses: 0, mouseMoves: 0 };

    } catch (err) {
        console.error('Error capturing/logging:', err);
        logToFile(`Critical Error in captureAndLog: ${err.message}`);
    }
}

// Logic: "In each 10 minutes take random"
// We run a cycle every 10 mins. Inside that cycle, we pick a random delay.
function startRandomCycle() {
    function scheduleInBlock() {
        if (!isTracking) return;
        // Random delay between 0 and 10 mins (minus small buffer e.g. 5s to be safe?)
        // Let's use 0 to 9.5 mins to avoid overlap edge cases
        const delay = Math.random() * (INTERVAL_MS - 30000);
        console.log(`Scheduled auto-capture in ${(delay / 60000).toFixed(2)} mins`);

        pendingTimeout = setTimeout(() => {
            captureAndLog('auto');
        }, delay);
    }

    // Schedule for FIRST block immediately
    scheduleInBlock();

    // Schedule for SUBSEQUENT blocks every 10 mins
    intervalId = setInterval(scheduleInBlock, INTERVAL_MS);
}

// --- IPC Handlers ---
ipcMain.on('user-login', async (event, userId) => {
    currentUserId = userId;
    console.log(`User logged in: ${currentUserId}`);
    event.sender.send('init-user', currentUserId);

    // Fetch initial stats
    await fetchStats(currentUserId);
});

ipcMain.on('update-memo', (event, memo) => {
    currentMemo = memo;
});

ipcMain.on('start-tracking', () => {
    if (isTracking) return; // Prevent double start
    isTracking = true;
    console.log('Tracking started');

    // 1. Capture Start Screenshot (Time = 0)
    captureAndLog('start');

    // 2. Start Random Loop (Time = +10m each)
    startRandomCycle();
});

ipcMain.on('stop-tracking', () => {
    isTracking = false;
    console.log('Tracking stopped');

    if (intervalId) clearInterval(intervalId);
    if (pendingTimeout) clearTimeout(pendingTimeout);

    // 3. Capture Stop Screenshot (Time = 0)
    captureAndLog('stop');
});

ipcMain.on('delete-screenshot', async (event, id) => {
    if (!dbInstance || !currentUserId) return;
    const collectionName = `logs_${currentUserId.toLowerCase()}`;
    const dbCollection = dbInstance.collection(collectionName);

    try {
        await dbCollection.deleteOne({ _id: new ObjectId(id) });
        // Re-fetch stats to correct time
        await fetchStats(currentUserId);
    } catch (err) {
        console.error('Error deleting screenshot:', err);
    }
});

ipcMain.on('get-manual-earnings', async (event) => {
    if (!dbInstance || !currentUserId) return;
    const statsCollection = dbInstance.collection('user_stats');
    try {
        const stats = await statsCollection.findOne({ userId: currentUserId });
        event.sender.send('update-manual-earnings-data', {
            weeklyPaid: stats?.manual_weekly_paid || 0,
            weeklyPending: stats?.manual_weekly_pending || 0,
            totalPending: stats?.manual_total_pending || 0
        });
    } catch (err) {
        console.error('Error fetching manual earnings:', err);
    }
});

ipcMain.on('update-manual-earnings', async (event, data) => {
    if (!dbInstance || !currentUserId) return;
    const statsCollection = dbInstance.collection('user_stats');
    try {
        await statsCollection.updateOne(
            { userId: currentUserId },
            {
                $set: {
                    manual_weekly_paid: parseFloat(data.weeklyPaid) || 0,
                    manual_weekly_pending: parseFloat(data.weeklyPending) || 0,
                    manual_total_pending: parseFloat(data.totalPending) || 0,
                    lastUpdated: new Date()
                }
            },
            { upsert: true }
        );
        // Echo back to update UI
        event.sender.send('update-manual-earnings-data', {
            weeklyPaid: parseFloat(data.weeklyPaid) || 0,
            weeklyPending: parseFloat(data.weeklyPending) || 0,
            totalPending: parseFloat(data.totalPending) || 0
        });
    } catch (err) {
        console.error('Error updating manual earnings:', err);
    }
});

ipcMain.on('open-external', (event, url) => {
    shell.openExternal(url);
});

app.on('ready', async () => {
    await connectDB();
    createWindow();
    setupInputMonitoring();
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
    if (mainWindow === null) createWindow();
});

app.on('will-quit', async () => {
    uIOhook.stop();
    if (intervalId) clearInterval(intervalId);
    if (dbClient) await dbClient.close();
});
