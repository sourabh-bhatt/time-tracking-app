#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
DESKTOP_DIR="${HOME}/.local/share/applications"
DESKTOP_FILE="${DESKTOP_DIR}/time-tracker-prayash.desktop"
ICON_PATH="${APP_DIR}/public/time-tracker-linux.svg"

chmod +x "${APP_DIR}/start-linux.sh" "${APP_DIR}/start-prayash-linux.sh"

mkdir -p "${DESKTOP_DIR}"

cat > "${DESKTOP_FILE}" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Time Tracker (Prayash)
Comment=Launch Prayash's Time Tracker
Exec=bash -lc 'cd "${APP_DIR}" && ./start-prayash-linux.sh'
Path=${APP_DIR}
Icon=${ICON_PATH}
Terminal=false
Categories=Office;Utility;
StartupNotify=true
EOF

chmod +x "${DESKTOP_FILE}"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "${DESKTOP_DIR}" >/dev/null 2>&1 || true
fi

echo "Launcher installed:"
echo "${DESKTOP_FILE}"
echo
echo "You can now search for 'Time Tracker (Prayash)' in the app menu."
