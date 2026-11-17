/* eslint-disable @typescript-eslint/no-require-imports */
const path = require('node:path');
const { getWindowsSigningOptions, signWindowsRelease, verifyWindowsSignatures } = require('./windows-signing');

async function build() {
    const unsigned = process.argv.includes('--unsigned');
    const windowsSign = unsigned ? undefined : getWindowsSigningOptions();
    if (!unsigned && process.platform !== 'win32') throw new Error('Build and verify the signed Windows release on Windows.');
    if (unsigned) console.warn('UNSIGNED DEVELOPMENT BUILD: Windows Smart App Control may block this app.');
    const { packager } = await import('@electron/packager');
    const allowed = new Set([
        'main.js', 'preload.js', 'renderer.js', 'index.html', 'styles.css',
        'package.json', 'node_modules', 'lib', 'public', '.env.desktop',
    ]);
    const outputs = await packager({
        dir: path.resolve(__dirname, '..'),
        name: 'Time Tracker',
        platform: 'win32',
        arch: 'x64',
        out: path.resolve(__dirname, '..', unsigned ? 'portable-dev-dist' : 'portable-dist'),
        overwrite: true,
        asar: false,
        prune: true,
        ignore: (file) => {
            const relative = file.replace(/\\/g, '/').replace(/^\//, '');
            const root = relative.split('/')[0];
            if (root === 'lib' && relative !== 'lib') {
                return !['lib/s3-storage.js', 'lib/windows-capture.js'].includes(relative);
            }
            return Boolean(root && !allowed.has(root));
        },
    });
    for (const output of outputs) {
        if (!unsigned) {
            await signWindowsRelease(output, windowsSign);
            await verifyWindowsSignatures(output);
        }
        console.log(`${unsigned ? 'Built unsigned development app' : 'Built and verified signed release'}: ${output}`);
    }
}

build().catch((error) => {
    // Signing tools may include credential-bearing command arguments in errors.
    // Show a generic failure if signing configuration was supplied.
    const signingConfigured = process.env.WINDOWS_CERTIFICATE_FILE || process.env.WINDOWS_SIGN_WITH_PARAMS || process.env.WINDOWS_SIGN_HOOK_MODULE_PATH;
    console.error(signingConfigured ? 'Windows release build/signature verification failed. Check signing configuration and run node scripts/verify-windows-signatures.js on any output before distributing it.' : error.message);
    process.exitCode = 1;
});
