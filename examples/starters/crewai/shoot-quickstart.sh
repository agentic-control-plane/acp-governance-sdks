#!/usr/bin/env bash
set -euo pipefail

# CrewAI "governance in three minutes" video — preflight + smoke test.
#
#   ./shoot-quickstart.sh            # check everything, run one real crew
#   ./shoot-quickstart.sh --check    # check only, spend nothing
#
# Fails fast with the exact fix for whatever is missing, and runs a single
# cheap crew before any recording starts — so a take never dies halfway on a
# bad key. Spend guard first: this calls a real LLM and bills a real account.

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

CHECK_ONLY=0
[ "${1:-}" = "--check" ] && CHECK_ONLY=1

bold() { printf '\n\033[1m%s\033[0m\n' "$*"; }
red()  { printf '\033[31m%s\033[0m\n' "$*"; }

bold "1/4  Tooling"
for c in uv python3; do
  if command -v "$c" >/dev/null 2>&1; then printf '  ✓ %s\n' "$c"
  else red "  ✗ $c missing — brew install uv"; exit 1; fi
done

bold "2/4  Credentials"
[ -f .env ] || { cp .env.example .env; red "  created .env from the example — fill it in and re-run"; }

# shellcheck disable=SC1091
set -a; . ./.env; set +a

fail=0
case "${ACP_USER_TOKEN:-}" in
  gsk_*replace-me|""|gsk_your-slug_replace-me)
    red "  ✗ ACP_USER_TOKEN not set"
    echo "      cloud.agenticcontrolplane.com → Settings → API Keys → create one"
    echo "      (format: gsk_<workspace-slug>_<random>) → paste into .env"
    fail=1 ;;
  gsk_*) echo "  ✓ ACP_USER_TOKEN (${ACP_USER_TOKEN:0:12}…)" ;;
  *) red "  ✗ ACP_USER_TOKEN doesn't look like a gsk_ key"; fail=1 ;;
esac

case "${OPENAI_API_KEY:-}" in
  sk-*replace-me|""|sk-proj-replace-me)
    red "  ✗ OPENAI_API_KEY not set"
    echo "      CrewAI drives the agent with OpenAI by default. Any working key."
    echo "      The crew below is one tiny task — cents, not dollars."
    fail=1 ;;
  sk-*) echo "  ✓ OPENAI_API_KEY (${OPENAI_API_KEY:0:8}…)" ;;
  *) red "  ✗ OPENAI_API_KEY doesn't look like an OpenAI key"; fail=1 ;;
esac
[ "$fail" -eq 0 ] || { red ""; red "Fill the gaps in .env and re-run."; exit 1; }

bold "3/4  Gateway reachable"
GW="${ACP_GATEWAY_URL:-https://api.agenticcontrolplane.com}"
if curl -sf -o /dev/null -w '' --max-time 10 "$GW/healthz" 2>/dev/null \
   || curl -sf -o /dev/null --max-time 10 "$GW" 2>/dev/null; then
  echo "  ✓ $GW"
else
  red "  ⚠ couldn't reach $GW — the crew will still run, but governed calls"
  red "    fail open and the audit row you want to film may never appear."
fi

if [ "$CHECK_ONLY" -eq 1 ]; then bold "Check-only: everything above is what a take needs."; exit 0; fi

bold "4/4  Smoke test — one real crew, one governed tool call"
echo "  This bills your OpenAI key (a few cents) and writes one audit row."
printf '  Continue? [Enter to run, Ctrl-C to stop] '
read -r _
./run.sh

bold "If that printed a result and no traceback, you're ready to record."
cat <<'EOF'

  Then check the audit row actually landed — it is the payoff shot:

      cloud.agenticcontrolplane.com/activity

  Two beats worth filming, in this order:

    1. @governed on the tool → the call is intercepted, policy-checked, logged
    2. comment out set_context(...) → the hooks SILENTLY NO-OP. No error, no
       row. Same failure shape as Codex's untrusted hook: installed is not on.

  Beat 2 is the one people will remember. It is also the honest one — the SDK
  says so in the starter's own comments.
EOF
