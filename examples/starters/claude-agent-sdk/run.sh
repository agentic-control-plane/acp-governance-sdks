#!/usr/bin/env bash
# Run the ACP-governed agent starter.
#
# Prereq: shared creds at ~/.acp/creds.env with at least:
#   ANTHROPIC_API_KEY=sk-ant-...
#   ACP_USER_TOKEN=gsk_<tenant-slug>_<random>
# Optional:
#   ACP_GATEWAY_URL=https://api.agenticcontrolplane.com  (default)

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "${here}/../../.." && pwd)"

cd "${repo}"
node_modules/.bin/tsx "${here}/starter.ts"
