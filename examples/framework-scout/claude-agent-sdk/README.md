# Framework Scout — Claude Agent SDK (TypeScript)

Reference agent #1 of 18. Finds newly-announced agent frameworks on Hacker News and emails the user a summary. Uses Anthropic's Messages API + the `@agenticcontrolplane/governance-anthropic` adapter.

## Governance pattern

**Decorator / wrapper.** Tool handlers are wrapped with `governHandlers({...})` so every invocation goes `preToolUse → handler → postToolOutput`. If ACP denies a call, the wrapped handler returns `"tool_error: <reason>"` which the loop forwards to Claude as a tool_result — Claude sees the denial and adapts.

`withContext({ userToken })` binds the caller's identity via `AsyncLocalStorage` so governance calls carry `Authorization: Bearer <token>`. Without the `withContext` wrapper, governance calls silently no-op — worth knowing.

## Tools

| Name | Description | Source |
|---|---|---|
| `search_hn` | Search Hacker News via Algolia API | Public, no key needed |
| `send_email` | Send the scout report | [Resend](https://resend.com) |

## Prereqs

Shared creds file at `~/.framework-scout/creds.env` with:

```
ANTHROPIC_API_KEY=sk-ant-...
RESEND_API_KEY=re_...
ACP_USER_TOKEN=gsk_...
ACP_GATEWAY_URL=https://api.agenticcontrolplane.com
EMAIL_FROM=noreply@<verified-resend-domain>
EMAIL_TO=you@example.com
```

Install deps (from the monorepo root):

```bash
cd /path/to/acp-governance-sdks
npm install
npm run build --workspace=@agenticcontrolplane/governance
npm run build --workspace=@agenticcontrolplane/governance-anthropic
```

## Run

From the monorepo root:

```bash
node_modules/.bin/tsx examples/framework-scout/claude-agent-sdk/scout.ts
```

Expected:

- ~5-10 iterations of `search_hn` with different queries
- Console log of each tool invocation + ACP decision
- One `send_email` call at the end
- Email in your inbox with 3-8 findings

## What to look for in the ACP dashboard

Open [cloud.agenticcontrolplane.com/activity](https://cloud.agenticcontrolplane.com/activity). The scout shows up as `framework-scout` with:
- One `preToolUse` + one `postToolOutput` per tool call
- The final `send_email` decision (allow/redact/block) will show the outgoing email content
- Tier is `background` — useful filter in the dashboard

## Known rough edges

- Model is hardcoded to `claude-sonnet-4-6`. Upgrade to opus if you want deeper scoring at 5-10x cost.
- Email `from` must be a Resend-verified domain. Production ACP uses `noreply@reducibl.com` — that's what's in shared creds.
- HN Algolia has a strict rate limit (~10,000 req/hour per IP, overkill for our use but worth knowing).
