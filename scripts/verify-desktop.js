/* eslint-disable @typescript-eslint/no-require-imports */
// A real Electron capture and renderer check. No uploads, tracking or image files.
const { app, BrowserWindow, desktopCapturer, screen, ipcMain, nativeImage } = require('electron');
const path = require('node:path');
const assert = require('node:assert/strict');
const appRoot = path.resolve(process.env.TRACKER_VERIFY_APP_ROOT || path.join(__dirname, '..'));
const { captureWindowsScreenshot } = require(path.join(appRoot, 'lib', 'windows-capture'));

const timeout = setTimeout(() => { console.error('Desktop verification timed out'); app.exit(1); }, 30000);
app.whenReady().then(async () => {
    const png = await captureWindowsScreenshot({ desktopCapturer, screen });
    const dimensions = nativeImage.createFromBuffer(png).getSize();
    assert.ok(dimensions.width > 0 && dimensions.height > 0);
    console.log(`Native screenshot captured in memory: ${dimensions.width}x${dimensions.height}, ${png.length} bytes.`);
    const { uIOhook } = require(path.join(appRoot, 'node_modules', 'uiohook-napi'));
    uIOhook.start();
    uIOhook.stop();
    console.log('Native input hook loaded and started successfully.');
    const window = new BrowserWindow({ show: false, webPreferences: {
        nodeIntegration: false, contextIsolation: true, sandbox: true,
        preload: path.join(appRoot, 'preload.js'),
    } });
    const errors = [];
    window.webContents.on('console-message', (event) => { if (event.level === 'error') errors.push(event.message); });
    await window.loadFile(path.join(appRoot, 'index.html'));
    const result = await window.webContents.executeJavaScript(`({ node: typeof require, bridge: typeof window.tracker?.send, loginButtons: document.querySelectorAll('.user-btn').length })`);
    assert.equal(result.node, 'undefined');
    assert.equal(result.bridge, 'function');
    assert.equal(result.loginButtons, 2);
    const login = new Promise((resolve) => ipcMain.once('user-login', (_event, user) => resolve(user)));
    await window.webContents.executeJavaScript(`document.querySelector('.user-btn').click()`);
    assert.equal(await login, 'sourabh');
    window.webContents.send('init-user', 'sourabh');
    window.webContents.send('new-screenshot', { timestamp: new Date().toISOString(), image: `data:image/png;base64,${png.toString('base64')}` });
    const state = await window.webContents.executeJavaScript(`({ mainVisible: document.getElementById('main-container').style.display, preview: document.getElementById('screenshotPreview').src.startsWith('data:image/png;base64,') })`);
    assert.equal(state.mainVisible, 'flex');
    assert.equal(state.preview, true);
    assert.deepEqual(errors, []);
    console.log('Isolated renderer, login IPC, and screenshot preview verified.');
    window.destroy();
    clearTimeout(timeout);
    app.quit();
}).catch((error) => { console.error(error); clearTimeout(timeout); app.exit(1); });
