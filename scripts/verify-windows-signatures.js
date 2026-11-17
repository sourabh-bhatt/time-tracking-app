/* eslint-disable @typescript-eslint/no-require-imports */
const { verifyWindowsSignatures } = require('./windows-signing');

if (!process.argv[2]) {
    console.error('Usage: node scripts/verify-windows-signatures.js APP_DIRECTORY');
    process.exitCode = 1;
} else {
    verifyWindowsSignatures(process.argv[2]).catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
