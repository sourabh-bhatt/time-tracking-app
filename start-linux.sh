#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

load_shell_env() {
  for env_file in "${HOME}/.profile" "${HOME}/.bash_profile" "${HOME}/.bashrc"; do
    if [ -f "${env_file}" ]; then
      # shellcheck disable=SC1090
      . "${env_file}"
    fi
  done

  if [ -f "${HOME}/.nvm/nvm.sh" ]; then
    # shellcheck disable=SC1090
    . "${HOME}/.nvm/nvm.sh"
  fi
}

export USER_ID="${USER_ID:-sourabh}"

echo "Starting Time Tracker for ${USER_ID} on Linux..."

if ! command -v npm >/dev/null 2>&1; then
  load_shell_env
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is not available from the desktop launcher environment."
  echo "Install Node.js correctly or add npm to PATH for the Linux user session."
  exit 1
fi

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
