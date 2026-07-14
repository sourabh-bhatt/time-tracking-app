#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

export USER_ID=prayash

if ! command -v xinput >/dev/null 2>&1 && command -v notify-send >/dev/null 2>&1; then
  notify-send "Employee Tracker" "Install xinput for detailed activity bars: sudo apt install -y xinput" || true
fi

LATEST_APPIMAGE="$(find "$(pwd)/dist" -maxdepth 1 -type f -name '*.AppImage' | sort | tail -n 1 || true)"

if [ -n "${LATEST_APPIMAGE}" ]; then
  chmod +x "${LATEST_APPIMAGE}"
  exec "${LATEST_APPIMAGE}"
fi

exec ./start-linux.sh
