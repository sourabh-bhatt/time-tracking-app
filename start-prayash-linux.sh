#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

export USER_ID=prayash

exec ./start-linux.sh
