#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

export USER_ID=prayash

LATEST_APPIMAGE="$(find "$(pwd)/dist" -maxdepth 1 -type f -name '*.AppImage' | sort | tail -n 1 || true)"

if [ -n "${LATEST_APPIMAGE}" ]; then
  chmod +x "${LATEST_APPIMAGE}"
  exec "${LATEST_APPIMAGE}"
fi

exec ./start-linux.sh
