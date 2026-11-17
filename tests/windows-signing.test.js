/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const { getWindowsSigningOptions, findWindowsBinaries } = require('../scripts/windows-signing');

test('release signing requires an explicit identity and rejects missing files', () => {
    assert.throws(() => getWindowsSigningOptions({}), /signing is not configured/);
    assert.throws(() => getWindowsSigningOptions({ WINDOWS_CERTIFICATE_FILE: path.join(__dirname, 'missing.pfx') }), /does not exist/);
    assert.throws(() => getWindowsSigningOptions({ WINDOWS_SIGN_HOOK_MODULE_PATH: path.join(__dirname, 'missing-hook.js') }), /does not exist/);
});

test('signing uses SHA-256 and cannot continue after a signing failure', () => {
    const options = getWindowsSigningOptions({ WINDOWS_SIGN_WITH_PARAMS: '/sha1 PUBLIC_THUMBPRINT /fd SHA256' });
    assert.equal(options.continueOnError, false);
    assert.deepEqual(options.hashes, ['sha256']);
    assert.equal(options.signWithParams, '/sha1 PUBLIC_THUMBPRINT /fd SHA256');
});

test('an unconfigured release build fails before packaging or overwriting the app', () => {
    const env = { ...process.env };
    for (const key of ['WINDOWS_CERTIFICATE_FILE', 'WINDOWS_CERTIFICATE_PASSWORD', 'WINDOWS_SIGN_WITH_PARAMS', 'WINDOWS_SIGN_HOOK_MODULE_PATH']) delete env[key];
    const result = spawnSync(process.execPath, [path.resolve(__dirname, '..', 'scripts', 'build-portable-win.js')], { env, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /signing is not configured/);
    assert.doesNotMatch(result.stdout, /Built|Packaging/);
});

test('signing selects Windows binaries and excludes Linux/macOS native modules', (context) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-signing-test-'));
    context.after(() => {
        for (const file of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, file));
        fs.rmdirSync(directory);
    });
    fs.writeFileSync(path.join(directory, 'Time Tracker.exe'), Buffer.from('MZtest'));
    fs.writeFileSync(path.join(directory, 'windows.node'), Buffer.from('MZtest'));
    fs.writeFileSync(path.join(directory, 'linux.node'), Buffer.from('\x7fELFtest'));
    fs.writeFileSync(path.join(directory, 'macos.node'), Buffer.from('mach-o-test'));
    fs.writeFileSync(path.join(directory, 'notes.txt'), Buffer.from('MZtest'));
    assert.deepEqual(findWindowsBinaries(directory).map(file => path.basename(file)).sort(), ['Time Tracker.exe', 'windows.node'].sort());
});
