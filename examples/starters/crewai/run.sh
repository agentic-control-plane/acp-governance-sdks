#!/usr/bin/env bash
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${here}"

if [ ! -d .venv ]; then
  uv venv
fi
uv pip install --quiet -e . >/dev/null

source .venv/bin/activate
python starter.py
