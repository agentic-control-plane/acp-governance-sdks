#!/usr/bin/env bash
set -euo pipefail
curl -sS -X POST https://api.resend.com/emails \
  -H "Authorization: Bearer $RESEND_API_KEY" \
  -H "Content-Type: application/json" \
  --data @/Users/dev/dev/acp-governance-sdks/examples/framework-scout/out/scout-email-payload.json
