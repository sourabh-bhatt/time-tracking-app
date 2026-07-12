#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
APPLICATIONS_DIR="${HOME}/.local/share/applications"
APPLICATIONS_FILE="${APPLICATIONS_DIR}/time-tracker-prayash.desktop"
DESKTOP_SHORTCUT="${HOME}/Desktop/time-tracker-prayash.desktop"
ICON_PATH="${APP_DIR}/public/time-tracker-linux.svg"
LAUNCH_SCRIPT="${APP_DIR}/start-prayash-linux.sh"

chmod +x "${APP_DIR}/start-linux.sh" "${LAUNCH_SCRIPT}"

mkdir -p "${APPLICATIONS_DIR}"

write_desktop_entry() {
  local target_file="$1"
  cat > "${target_file}" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Time Tracker (Prayash)
Comment=Launch Prayash's Time Tracker
Exec=${LAUNCH_SCRIPT}
TryExec=${LAUNCH_SCRIPT}
Path=${APP_DIR}
Icon=${ICON_PATH}
Terminal=false
Categories=Office;Utility;
StartupNotify=true
EOF
}

write_desktop_entry "${APPLICATIONS_FILE}"
chmod +x "${APPLICATIONS_FILE}"

if [ -d "${HOME}/Desktop" ]; then
  write_desktop_entry "${DESKTOP_SHORTCUT}"
  chmod +x "${DESKTOP_SHORTCUT}"

  if command -v gio >/dev/null 2>&1; then
    gio set "${DESKTOP_SHORTCUT}" metadata::trusted true >/dev/null 2>&1 || true
  fi
fi

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "${APPLICATIONS_DIR}" >/dev/null 2>&1 || true
fi

echo "Launcher installed:"
echo "${APPLICATIONS_FILE}"
if [ -f "${DESKTOP_SHORTCUT}" ]; then
  echo "${DESKTOP_SHORTCUT}"
fi
echo
echo "You can now search for 'Time Tracker (Prayash)' in the app menu or click the desktop icon."
