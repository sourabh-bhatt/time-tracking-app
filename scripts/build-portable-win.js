/* eslint-disable @typescript-eslint/no-require-imports */
const path = require('node:path');

async function build() {
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
        out: path.resolve(__dirname, '..', 'portable-dist'),
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
    for (const output of outputs) console.log(`Built ${output}`);
}

build().catch((error) => { console.error(error.message); process.exitCode = 1; });
