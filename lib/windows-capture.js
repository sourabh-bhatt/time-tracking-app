// Capture inside Electron rather than compiling/running a helper in %TEMP%.
// Device Guard can reject that helper even when normal screen capture is allowed.
async function captureWindowsScreenshot({ desktopCapturer, screen }) {
    const display = screen.getPrimaryDisplay();
    const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
            width: Math.round(display.size.width * display.scaleFactor),
            height: Math.round(display.size.height * display.scaleFactor),
        },
        fetchWindowIcons: false,
    });
    const source = sources.find((item) => item.display_id === String(display.id))
        || (sources.length === 1 ? sources[0] : null);

    if (!source || source.thumbnail.isEmpty()) {
        throw new Error('Screen capture is unavailable. Unlock the desktop and check screen recording permissions.');
    }

    const buffer = source.thumbnail.toPNG();
    if (!buffer.length) {
        throw new Error('Screen capture returned an empty image.');
    }
    return buffer;
}

module.exports = { captureWindowsScreenshot };
