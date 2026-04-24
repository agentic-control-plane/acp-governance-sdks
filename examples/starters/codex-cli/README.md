# ACP Starter — Codex CLI (hook-based governance)

Minimal template for running an ACP-governed OpenAI Codex CLI agent headless. Governance via the installed ACP Codex plugin — no SDK, no code, just a prompt + a runner.

## Setup

```bash
# 1. Install the ACP Codex plugin (one-time, if not already done).
curl -sS https://cloud.agenticcontrolplane.com/install/codex | bash

# 2. Log into Codex (one-time).
codex login

# 3. Configure this starter's creds.
cp .env.example .env
# edit .env: set ACP_USER_TOKEN (gsk_...)

# 4. Run the placeholder agent.
bash run.sh
```

Expected: Codex runs the placeholder prompt, executes one shell call, prints a confirmation line. Governance events appear in your [Activity dashboard](https://cloud.agenticcontrolplane.com/activity) under client=`codex`.

## What to change

- **`starter.prompt.md`** — replace with your real agent instructions. Codex's only native tool is `shell`, so express your agent's work as shell commands
- **`run.sh`** — schedule via launchd / cron for recurring execution

## Why `--full-auto` + `network_access=true`

`codex exec --full-auto` is OpenAI's recommended headless flag (= `--sandbox workspace-write`). Strictly preferable to `--dangerously-bypass-approvals-and-sandbox`, which OpenAI's docs label *"Elevated Risk / not recommended."*

`--full-auto` blocks network by default. The `-c sandbox_workspace_write.network_access=true` override re-enables outbound HTTP (needed for any agent that calls external APIs via curl) while keeping filesystem isolation intact.

## Known gap

Codex `PreToolUse` hooks currently fire for `shell` calls but NOT for `apply_patch` edits or most MCP tool calls (upstream issue [openai/codex#16732](https://github.com/openai/codex/issues/16732)). If your agent relies on `apply_patch`, hook-based governance has coverage holes today. Workaround: express edits via `shell` commands (e.g. `sed`, `cat > file`) instead of `apply_patch`.

## References

- [Codex CLI scout](../../framework-scout/codex-cli/) — full working example
- [OpenAI Codex agent approvals & security](https://developers.openai.com/codex/agent-approvals-security)
- [ACP governance model](https://agenticcontrolplane.com/docs/governance-model)

## Get an API key

[cloud.agenticcontrolplane.com](https://cloud.agenticcontrolplane.com/) → create a workspace → Settings → API Keys → New key.
