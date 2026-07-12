#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f ".env.local" ]; then
  echo ".env.local is required before packaging."
  exit 1
fi

python3 - <<'PY'
from pathlib import Path

env_path = Path(".env.local")
lines = env_path.read_text().splitlines()
updated = []
found = False

for line in lines:
    if line.startswith("USER_ID="):
        updated.append("USER_ID=prayash")
        found = True
    else:
        updated.append(line)

if not found:
    updated.append("USER_ID=prayash")

env_path.write_text("\n".join(updated) + "\n")
PY

echo "Building Linux package for Prayash..."
npm install
npm run build:linux:arm64
