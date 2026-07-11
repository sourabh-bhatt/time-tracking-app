#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

export USER_ID="${USER_ID:-sourabh}"

echo "Starting Time Tracker for ${USER_ID} on Linux..."

if [ ! -d "node_modules" ]; then
  echo "First time setup: installing dependencies..."
  npm install
fi

echo "Launching Electron app..."
npm start
