/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require('electron');

const sendChannels = new Set([
    'user-login', 'update-memo', 'set-on-call', 'start-tracking', 'stop-tracking',
    'confirm-on-call-checkin', 'delete-screenshot', 'get-manual-earnings',
    'update-manual-earnings', 'open-external',
]);
const receiveChannels = new Set([
    'tracking-config', 'set-env-user', 'init-user', 'update-stats', 'presence-update',
    'flags-update', 'play-sound', 'update-manual-earnings-data', 'show-notification',
    'new-screenshot', 'on-call-checkin-start', 'on-call-checkin-dismissed',
    'on-call-checkin-cancel', 'on-call-checkin-expired',
]);

contextBridge.exposeInMainWorld('tracker', {
    send(channel, ...args) {
        if (!sendChannels.has(channel)) throw new Error('Unsupported tracker command');
        ipcRenderer.send(channel, ...args);
    },
    on(channel, callback) {
        if (!receiveChannels.has(channel) || typeof callback !== 'function') throw new Error('Unsupported tracker event');
        // Never expose the Electron event or its privileged sender to the page.
        const listener = (_event, ...args) => callback(null, ...args);
        ipcRenderer.on(channel, listener);
        return () => ipcRenderer.removeListener(channel, listener);
    },
});
