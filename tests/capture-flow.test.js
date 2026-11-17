/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness(saveLogEntry) {
    const events = [];
    const root = path.resolve(__dirname, '..');
    const code = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
    const electron = {
        app: { requestSingleInstanceLock: () => true, on: () => {}, isReady: () => true, getPath: () => root },
        ipcMain: { on: () => {} }, powerMonitor: { getSystemIdleTime: () => 0 },
    };
    const context = {
        require: (name) => {
            if (name === 'electron') return electron;
            if (name === './lib/s3-storage') return { IDLE_THRESHOLD_SECONDS: 900, saveLogEntry };
            if (name === './lib/windows-capture') return require('../lib/windows-capture');
            return require(name);
        },
        module: { exports: {} }, __dirname: root,
        process: { platform: 'win32', env: {}, on: () => {} },
        Buffer, console: { log: () => {}, error: () => {} },
        setTimeout, clearTimeout, setInterval, clearInterval,
        send: (...args) => events.push(args),
    };
    vm.runInNewContext(code + `
        mainWindow = { isDestroyed: () => false, webContents: { send } };
        logToFile = () => {};
        fetchStats = async () => {};
        currentUserId = 'sourabh'; isTracking = true; lastInputAt = Date.now(); trackingStartedAt = 'session-1';
        module.exports = {
            captureAndLog,
            setCapture: (capture) => { captureScreenshotBuffer = capture; },
            changeUser: () => { currentUserId = 'prayash'; },
            stop: () => { isTracking = false; },
            restart: () => { trackingStartedAt = 'session-2'; },
        };
    `, context);
    return { ...context.module.exports, events };
}

test('capture failures never reach storage or claim success', async () => {
    let writes = 0;
    const app = harness(async () => { writes++; });
    app.setCapture(async () => { throw new Error('Screen recording denied'); });
    assert.equal(await app.captureAndLog(), null);
    assert.equal(writes, 0);
    assert.equal(app.events.find(([name]) => name === 'show-notification')[1].title, 'Screenshot Failed');
});

test('storage failures have their own notification', async () => {
    const app = harness(async () => { throw new Error('S3 unavailable'); });
    app.setCapture(async () => Buffer.from('png'));
    assert.equal(await app.captureAndLog(), null);
    assert.equal(app.events.find(([name]) => name === 'show-notification')[1].title, 'Screenshot Save Failed');
    assert.equal(app.events.some(([name]) => name === 'new-screenshot'), false);
});

test('an in-flight capture is discarded after user switch, stop, or session restart', async () => {
    for (const change of ['changeUser', 'stop', 'restart']) {
        let writes = 0;
        let resolve;
        const app = harness(async () => { writes++; });
        app.setCapture(() => new Promise((done) => { resolve = done; }));
        const capture = app.captureAndLog();
        app[change]();
        resolve(Buffer.from('png'));
        assert.equal(await capture, null);
        assert.equal(writes, 0);
    }
});

test('successful captures retain the owner and only notify after storage succeeds', async () => {
    let stored;
    const app = harness(async (record) => { stored = record; return { _id: 'saved' }; });
    app.setCapture(async () => Buffer.from('png'));
    assert.equal((await app.captureAndLog('sample', { countsTowardTime: false }))._id, 'saved');
    assert.equal(stored.userId, 'sourabh');
    assert.equal(stored.countsTowardTime, false);
    assert.equal(app.events.find(([name]) => name === 'show-notification')[1].title, 'Screenshot Taken');
});
