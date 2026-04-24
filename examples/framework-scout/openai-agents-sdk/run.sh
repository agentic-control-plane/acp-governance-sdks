#!/usr/bin/env bash
# Install deps + run the Framework Scout under the OpenAI Agents SDK.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$here"

# Venv lives inside the folder so each example is self-contained.
if [ ! -d .venv ]; then
  uv venv
fi
uv pip install --quiet -e . >/dev/null

source .venv/bin/activate
python scout.py
