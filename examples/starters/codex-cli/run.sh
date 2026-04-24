#!/usr/bin/env bash
# Run an ACP-governed Codex CLI agent headless.
#
# Governance is automatic: the installed ACP Codex plugin at
# ~/.codex/hooks.json registers PreToolUse/PostToolUse hooks that
# POST to $ACP_GATEWAY_URL on every tool call.
#
# Prereq: ACP Codex plugin installed + `codex login` done.

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ -f "${here}/.env" ] && set -a && source "${here}/.env" && set +a || {
  echo "Missing ${here}/.env — copy .env.example and fill in your keys."
  exit 1
}

# --full-auto = OpenAI's recommended headless flag (= --sandbox
#   workspace-write, non-interactive).
# sandbox_workspace_write.network_access=true = explicit grant so
#   curl-to-external-APIs works inside the workspace sandbox.
codex exec \
      --full-auto \
      -c 'sandbox_workspace_write.network_access=true' \
      "$(cat "${here}/starter.prompt.md")"
