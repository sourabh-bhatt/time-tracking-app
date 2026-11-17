/* eslint-disable @typescript-eslint/no-require-imports */
const { randomBytes, scryptSync } = require('node:crypto');
const { stdin, stdout } = process;

if (!stdin.isTTY) {
    console.error('Run this command in an interactive terminal. Password input is hidden.');
    process.exitCode = 1;
} else {
    stdout.write('New password (hidden): ');
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.resume();
    let password = '';
    stdin.on('data', (input) => {
        for (const char of input) {
            if (char === '\u0003') { stdin.setRawMode(false); process.exit(1); }
            if (char === '\r' || char === '\n') {
                stdin.setRawMode(false);
                stdin.pause();
                if (password.length < 12) {
                    console.error('\nUse a password with at least 12 characters.');
                    process.exitCode = 1;
                } else {
                    const salt = randomBytes(16).toString('hex');
                    console.log('\nscrypt:' + salt + ':' + scryptSync(password, salt, 64).toString('hex'));
                }
                return;
            }
            if (char === '\u007f' || char === '\b') password = password.slice(0, -1);
            else if (password.length < 1024) password += char;
        }
    });
}
