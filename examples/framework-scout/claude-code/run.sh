#!/usr/bin/env bash
# Runs the Framework Scout inside a headless Claude Code session.
# Governance fires automatically via the installed ACP Claude Code plugin
# (~/.claude/settings.json → hooks → ~/.acp/govern.mjs).
#
# Usage:  ./run.sh
# Cron:   see com.acp.framework-scout.plist.example (macOS launchd)

set -euo pipefail

# Shared creds — never committed to git. Written by the scout harness.
source "${HOME}/.framework-scout/creds.env"

# Export so the Bash tool inside Claude Code can read them.
export RESEND_API_KEY EMAIL_FROM EMAIL_TO

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --print              = one-shot mode, writes final output to stdout and exits
# --permission-mode=dontAsk
#                      = only tools in .claude/settings.json's `allow` list
#                        run; anything else is auto-denied (no prompt, no
#                        execution). Session aborts after 3 denials in a row.
#                        Strictly better than --dangerously-skip-permissions
#                        because the built-in safety layer stays alive.
# --add-dir /tmp       = expand Claude Code's write sandbox to include /tmp,
#                        where the scout stages the email payload.
# cd into this dir so .claude/settings.json is the project-local settings
# that get merged with the global ACP plugin hooks.
cd "${here}"
# --permission-mode=auto = Anthropic's recommended headless mode.
#   ML classifiers approve/deny each action (prompt-injection probe +
#   transcript classifier). Better than --dangerously-skip-permissions
#   because built-in safety stays alive. Worse than a narrow allowlist
#   for deterministic-policy needs. Anthropic's own reported 17%
#   false-negative rate on dangerous actions is exactly the gap an ACP
#   governance layer is meant to close.
#
#   Alternative: --permission-mode=dontAsk + .claude/settings.json's
#   `permissions.allow` for deterministic (allowlist-only) control.
#   See README for when to pick which.
# --add-dir /tmp = expand Claude Code's write sandbox to include /tmp.
claude --print \
       --permission-mode=auto \
       --add-dir /tmp \
       "$(cat "${here}/scout.prompt.md")"
