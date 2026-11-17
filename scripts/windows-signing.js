/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const execFileAsync = promisify(execFile);
const { pathToFileURL } = require('node:url');

function getWindowsSigningOptions(env = process.env) {
    const certificateFile = env.WINDOWS_CERTIFICATE_FILE;
    const hookModulePath = env.WINDOWS_SIGN_HOOK_MODULE_PATH;
    const signWithParams = env.WINDOWS_SIGN_WITH_PARAMS;
    if (!certificateFile && !hookModulePath && !signWithParams) {
        throw new Error('Windows release signing is not configured. Set WINDOWS_CERTIFICATE_FILE, WINDOWS_SIGN_WITH_PARAMS, or WINDOWS_SIGN_HOOK_MODULE_PATH using a trusted signing identity. No release was built. See docs/windows-signing.md.');
    }
    for (const file of [certificateFile, hookModulePath]) {
        if (file && (!fs.existsSync(file) || !fs.statSync(file).isFile())) throw new Error('A configured signing certificate or hook file does not exist.');
    }
    return {
        certificateFile: certificateFile ? path.resolve(certificateFile) : undefined,
        certificatePassword: env.WINDOWS_CERTIFICATE_PASSWORD,
        hookModulePath: hookModulePath ? path.resolve(hookModulePath) : undefined,
        signWithParams,
        signToolPath: env.WINDOWS_SIGNTOOL_PATH,
        timestampServer: env.WINDOWS_TIMESTAMP_SERVER || 'http://timestamp.digicert.com',
        hashes: ['sha256'],
        continueOnError: false,
    };
}

function windowsSignModulePath() {
    return require.resolve('@electron/windows-sign', { paths: [path.dirname(require.resolve('@electron/packager'))] });
}

function findWindowsBinaries(directory) {
    const files = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) files.push(...findWindowsBinaries(file));
        else if (entry.isFile() && /\.(exe|dll|node|sys|efi|scr)$/i.test(entry.name)) {
            const descriptor = fs.openSync(file, 'r');
            const magic = Buffer.alloc(2);
            try { if (fs.readSync(descriptor, magic, 0, 2, 0) === 2 && magic.toString() === 'MZ') files.push(file); }
            finally { fs.closeSync(descriptor); }
        }
    }
    return files;
}

async function signWindowsRelease(appDirectory, options) {
    const files = findWindowsBinaries(appDirectory);
    if (!files.length) throw new Error('No Windows binaries to sign.');
    const { sign } = await import(pathToFileURL(windowsSignModulePath()).href);
    await sign({ ...options, files });
}

async function verifyWindowsSignatures(appDirectory) {
    const root = path.resolve(appDirectory);
    const executable = path.join(path.dirname(windowsSignModulePath()), '..', 'vendor', 'signtool.exe');
    const files = findWindowsBinaries(root);
    if (!files.includes(path.join(root, 'Time Tracker.exe'))) throw new Error('Time Tracker.exe is missing or is not a Windows binary.');
    const failures = [];
    for (const file of files) {
        try {
            await execFileAsync(executable, ['verify', '/pa', '/all', file], {
                windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024,
            });
        } catch {
            failures.push(path.relative(root, file));
        }
    }
    if (failures.length) throw new Error('Trusted signature verification failed for:\n' + failures.map((file) => ' - ' + file).join('\n'));
    console.log(`Verified trusted Authenticode signatures on all ${files.length} Windows binaries.`);
}

module.exports = { getWindowsSigningOptions, findWindowsBinaries, signWindowsRelease, verifyWindowsSignatures };
