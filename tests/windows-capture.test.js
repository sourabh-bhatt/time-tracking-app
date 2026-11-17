/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { captureWindowsScreenshot } = require('../lib/windows-capture');

const screen = { getPrimaryDisplay: () => ({ id: 7, size: { width: 1920, height: 1080 }, scaleFactor: 1.5 }) };
const png = Buffer.from('test-png');
const source = (id, empty = false) => ({ display_id: id, thumbnail: { isEmpty: () => empty, toPNG: () => png } });

test('selects the primary display by ID and requests physical pixel dimensions', async () => {
    let options;
    const result = await captureWindowsScreenshot({ screen, desktopCapturer: { getSources: async (value) => {
        options = value;
        return [source('8', true), source('7')];
    } } });
    assert.equal(result, png);
    assert.deepEqual(options, { types: ['screen'], thumbnailSize: { width: 2880, height: 1620 }, fetchWindowIcons: false });
});

test('handles a single display with no display ID', async () => {
    assert.equal(await captureWindowsScreenshot({ screen, desktopCapturer: { getSources: async () => [source('')] } }), png);
});

test('rejects empty, missing, ambiguous and denied captures', async () => {
    for (const sources of [[], [source('7', true)], [source('8'), source('9')]]) {
        await assert.rejects(() => captureWindowsScreenshot({ screen, desktopCapturer: { getSources: async () => sources } }), /unavailable/);
    }
    await assert.rejects(() => captureWindowsScreenshot({ screen, desktopCapturer: { getSources: async () => { throw new Error('Permission denied'); } } }), /Permission denied/);
    await assert.rejects(() => captureWindowsScreenshot({ screen, desktopCapturer: { getSources: async () => [{ display_id: '7', thumbnail: { isEmpty: () => false, toPNG: () => Buffer.alloc(0) } }] } }), /empty image/);
});
