#!/usr/bin/env bash
# Runs the Framework Scout inside a headless Codex CLI session.
# Governance fires automatically via the installed ACP Codex plugin
# (~/.codex/hooks.json → hooks → ~/.acp/govern.mjs, env ACP_CLIENT=codex).
#
# Usage:  ./run.sh
# Cron:   see ../claude-code/com.acp.framework-scout.plist.example for the
#         macOS launchd pattern — swap the ProgramArguments path to this file.

set -euo pipefail

source "${HOME}/.framework-scout/creds.env"
export RESEND_API_KEY EMAIL_FROM EMAIL_TO

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --full-auto = OpenAI's recommended headless flag (= --sandbox
#   workspace-write + non-interactive execution). Strictly preferable
#   to --dangerously-bypass-approvals-and-sandbox, which OpenAI's own
#   docs label "Elevated Risk / not recommended".
#
# -c sandbox_workspace_write.network_access=true = explicitly grant
#   network access inside the workspace-write sandbox. `--full-auto`
#   blocks network by default, which would prevent the scout from
#   hitting HN Algolia or Resend. This override keeps filesystem
#   isolation (only the workspace is writable) while allowing the
#   specific network calls the scout needs.
#
# Note: Codex `PreToolUse` hooks currently fire for Bash calls but
# have gaps around `apply_patch` and most MCP tools (upstream issue
# openai/codex#16732). Governance coverage of non-shell edits is
# partial today; the ACP hook catches every Bash-mediated call.
codex exec \
      --full-auto \
      -c 'sandbox_workspace_write.network_access=true' \
      "$(cat "${here}/scout.prompt.md")"
