# ACP Starter — Claude Code (hook-based governance)

Minimal template for running an ACP-governed Claude Code agent headless. No SDK, no code — just a prompt, a scheduler, and Claude Code's installed ACP plugin doing the governance work.

## Setup

```bash
# 1. Install the ACP Claude Code plugin (one-time, if not already done).
#    This adds PreToolUse/PostToolUse hooks to ~/.claude/settings.json that
#    route every tool call through the ACP gateway.
curl -sS https://cloud.agenticcontrolplane.com/install/claude-code | bash

# 2. Configure this starter's creds.
cp .env.example .env
# edit .env: set ACP_USER_TOKEN (gsk_...)

# 3. Run the placeholder agent.
bash run.sh
```

Expected: Claude Code runs the placeholder prompt, hits Bash once, prints a confirmation line. One governance event pair shows up in your [Activity dashboard](https://cloud.agenticcontrolplane.com/activity) under client=`claude-code-plugin`.

## What to change

- **`starter.prompt.md`** — replace the placeholder with your real agent instructions
- **`.claude/settings.json`** — tighten `permissions.allow` if you want a deterministic allowlist instead of auto-mode ML classifier
- **`run.sh`** — schedule via launchd / cron / GitHub Actions for recurring execution

## Why `--permission-mode=auto`

Anthropic's [officially recommended](https://www.anthropic.com/engineering/claude-code-auto-mode) headless path. ML classifiers approve/deny each tool call — better than `--dangerously-skip-permissions` which disables all built-in safety.

For deterministic policy (compliance-grade, predictable tool needs), swap to `--permission-mode=dontAsk` and add a `permissions.allow` list in `.claude/settings.json`. See the [Claude Code scout](../../framework-scout/claude-code/) for that variant.

## References

- [Claude Code scout](../../framework-scout/claude-code/) — full working example
- [Auto mode announcement](https://www.anthropic.com/engineering/claude-code-auto-mode)
- [ACP Claude Code integration page](https://agenticcontrolplane.com/integrations/claude-code)

## Get an API key

[cloud.agenticcontrolplane.com](https://cloud.agenticcontrolplane.com/) → create a workspace → Settings → API Keys → New key.
