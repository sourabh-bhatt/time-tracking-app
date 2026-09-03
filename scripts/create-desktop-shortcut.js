const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const desktopPath = path.join(process.env.USERPROFILE || 'C:\\Users\\soura', 'Desktop');
const shortcutPath = path.join(desktopPath, 'Time Tracker - Sourabh.lnk');
const batPath = path.join(desktopPath, 'Launch Time Tracker (Sourabh).bat');
const targetBat = path.resolve(__dirname, '..', 'start-sourabh-app.bat');
const iconExe = path.resolve(__dirname, '..', 'portable-dist', 'Time Tracker-win32-x64', 'Time Tracker.exe');
const workingDir = path.resolve(__dirname, '..');

// 1. Create Desktop .bat file
const batContent = `@echo off\r\ncd /d "${workingDir}"\r\nset USER_ID=sourabh\r\nstart "" "${iconExe}"\r\n`;
fs.writeFileSync(batPath, batContent);
console.log(`Created bat launcher at: ${batPath}`);

// 2. Create Desktop .lnk shortcut with icon
const vbsScript = `
Set oWS = WScript.CreateObject("WScript.Shell")
sLinkFile = "${shortcutPath.replace(/\\/g, '\\\\')}"
Set oLink = oWS.CreateShortcut(sLinkFile)
oLink.TargetPath = "${targetBat.replace(/\\/g, '\\\\')}"
oLink.WorkingDirectory = "${workingDir.replace(/\\/g, '\\\\')}"
oLink.WindowStyle = 1
oLink.IconLocation = "${iconExe.replace(/\\/g, '\\\\')}, 0"
oLink.Description = "Time Tracker - Sourabh"
oLink.Save
`;

const tempVbs = path.join(__dirname, 'create_shortcut.vbs');
fs.writeFileSync(tempVbs, vbsScript);

try {
    execSync(`cscript //nologo "${tempVbs}"`, { stdio: 'inherit' });
    console.log(`Created shortcut at: ${shortcutPath}`);
} finally {
    if (fs.existsSync(tempVbs)) {
        fs.unlinkSync(tempVbs);
    }
}
