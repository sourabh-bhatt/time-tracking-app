#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

export USER_ID="${USER_ID:-sourabh}"

echo "Starting Time Tracker for ${USER_ID} on Linux..."

if [ ! -d "node_modules" ]; then
  echo "First time setup: installing dependencies..."
  npm install
fi

if ! command -v gnome-screenshot >/dev/null 2>&1 \
  && ! command -v grim >/dev/null 2>&1 \
  && ! command -v spectacle >/dev/null 2>&1 \
  && ! command -v scrot >/dev/null 2>&1 \
  && ! command -v maim >/dev/null 2>&1 \
  && ! command -v import >/dev/null 2>&1; then
  echo "Warning: no Linux screenshot tool found."
  echo "Install one with: sudo apt install -y gnome-screenshot imagemagick scrot"
fi

echo "Launching Electron app..."
npm start
