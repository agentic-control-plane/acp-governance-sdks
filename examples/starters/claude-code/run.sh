#!/usr/bin/env bash
# Run an ACP-governed Claude Code agent headless.
#
# Governance is automatic: the installed ACP Claude Code plugin at
# ~/.claude/settings.json registers PreToolUse/PostToolUse hooks that
# POST to $ACP_GATEWAY_URL on every tool call. This script sets up the
# creds the hook needs and invokes `claude --print --permission-mode=auto`.
#
# Prereq: ACP Claude Code plugin installed (check ~/.claude/settings.json
# has a hooks.PreToolUse entry calling ~/.acp/govern.mjs).

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ -f "${here}/.env" ] && set -a && source "${here}/.env" && set +a || {
  echo "Missing ${here}/.env — copy .env.example and fill in your keys."
  exit 1
}

cd "${here}"
claude --print \
       --permission-mode=auto \
       --add-dir /tmp \
       "$(cat "${here}/starter.prompt.md")"
