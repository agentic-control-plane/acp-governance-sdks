# ACP Starter — Cursor (hook)

Minimal setup for wiring ACP governance into Cursor. No code, no SDK — install the ACP hook once and Cursor's Composer agent routes every tool call (file edits, Bash, MCP invocations) through your ACP workspace.

## Setup (one command)

```bash
curl -sf https://agenticcontrolplane.com/install.sh | bash
```

The installer:
1. Detects Cursor (`~/.cursor` present or `cursor` on PATH)
2. Writes `~/.acp/govern.mjs` — the hook script
3. Registers it in `~/.cursor/hooks.json` under `preToolUse` and `postToolUse`
4. Opens a browser to provision your ACP workspace

Restart Cursor. Every Composer tool call now flows through ACP.

## What to verify

- `~/.cursor/hooks.json` has a `preToolUse` and `postToolUse` entry pointing at `~/.acp/govern.mjs`
- `~/.acp/govern.mjs` exists and `env` contains `ACP_GATEWAY_URL` + a `gsk_` key
- Open [cloud.agenticcontrolplane.com/activity](https://cloud.agenticcontrolplane.com/activity) and ask Cursor to do anything that fires a tool (run a Bash command, read a file) — events appear within seconds with `client: "cursor"`

## What governance looks like in Cursor

- Every Cursor Composer tool call: file edits, shell runs, MCP tool invocations — logged in the ACP Activity view
- Denial: policy-denied tool calls return a `tool_error` message that Cursor shows to the agent, same UX as any other tool failure. The Composer adapts and tries a different approach.
- Audit fields: user (from the installer's provisioning flow), tool name, input/output previews, PII detection, decision + reason

## Known gap (same as Claude Code, Codex)

The ACP Cursor hook sends `agent_tier` but not `agent_name` — events land under `client: "cursor"` without an agent-name breakdown. Batch-fix candidate with the other hook-based clients. Won't affect per-tool policy but limits per-agent attribution for multiple Cursor agents in the same workspace.

## References

- [ACP Cursor integration page](https://agenticcontrolplane.com/integrations/cursor)
- [Cursor Composer docs](https://docs.cursor.com/agent)
- [ACP governance model](https://agenticcontrolplane.com/docs/governance-model)

## Get an API key

[cloud.agenticcontrolplane.com](https://cloud.agenticcontrolplane.com/) → create a workspace → Settings → API Keys → New key. The installer will prompt you to authenticate.
