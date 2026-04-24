# Framework Scout — Claude Code (hook-based governance + auto mode)

Reference agent #2 of 17. Same scout job, but the *agent runtime* is Claude Code — not code we wrote. Claude Code runs headless, uses its native `WebSearch` tool for research, `Bash` + curl for email, exits. Governance fires via the installed ACP Claude Code plugin hooks.

## Governance pattern

**Two layers:**

1. **Claude Code's built-in permission system** — `--permission-mode=auto`. Model-based classifiers (prompt-injection probe + transcript classifier) approve/deny each tool call in real time. This is Anthropic's [officially recommended](https://www.anthropic.com/engineering/claude-code-auto-mode) path for autonomous Claude Code operation.

2. **ACP hooks** — the installed ACP Claude Code plugin at `~/.claude/settings.json` registers `PreToolUse` and `PostToolUse` hooks that run `~/.acp/govern.mjs`. Every tool call the classifier allows still flows through ACP governance for dynamic policy + audit logging.

```
Claude Code tool call
        │
        ▼
auto-mode classifier ─┬─ approved → proceed
                      └─ denied → tool error, session can abort
        │
        ▼
PreToolUse hook → ~/.acp/govern.mjs → POST /govern/tool-use (allow/deny/redact)
        │
        ▼
Tool executes
        │
        ▼
PostToolUse hook → ~/.acp/govern.mjs → POST /govern/tool-output
```

## Why `auto` instead of `--dangerously-skip-permissions`

The obvious headless flag is `--dangerously-skip-permissions`. It's heavily used in tutorials. Anthropic's own docs flag it as **"recommended only for sandboxes with no internet access,"** and Anthropic's engineering post cites real incidents from it: deleted git branches, auth tokens uploaded to compute clusters, attempted production database migrations.

`--permission-mode=auto` is Anthropic's replacement for that path. Built-in classifiers decide each action. No manual allowlist required. Session still goes through Claude Code's safety checks and any `settings.json` rules you've set.

Honest number from Anthropic: **auto mode has a ~17% false-negative rate on dangerous actions.** Substantially safer than zero guardrails, but not a replacement for careful policy on high-stakes infrastructure. That 17% is exactly why an ACP hook on top matters — dynamic policy catches what the classifier missed, and the audit log captures everything regardless of the classifier's verdict.

## Alternative: `dontAsk` + static allowlist

If your agent has tightly bounded tool needs and you want **deterministic** policy (no classifier, no ML), use `--permission-mode=dontAsk` with a `permissions.allow` list in `.claude/settings.json`. Tools on the list run; anything else auto-denies. Trade-off:

| | `auto` | `dontAsk` + allowlist |
|---|---|---|
| Tool coverage | General-purpose, handles unpredictable tool use | Narrow — only what you explicitly allowed |
| Failure mode | 17% of dangerous actions slip through | 0% slip through, but any unlisted tool aborts the session |
| Setup cost | Zero | You write the allowlist up front |
| Compliance fit | Probabilistic | Deterministic, auditable |

For this scout (bounded tool needs), either works. We use `auto` to match Anthropic's mainstream recommendation.

## What's in this folder

| File | Purpose |
|---|---|
| [`scout.prompt.md`](./scout.prompt.md) | Instructions Claude Code follows |
| [`.claude/settings.json`](./.claude/settings.json) | Permission allowlist (only active if you swap `run.sh` to `--permission-mode=dontAsk`) |
| [`run.sh`](./run.sh) | `cd` into this dir, invoke Claude Code headless with `--permission-mode=auto` + `--add-dir /tmp` |
| [`com.acp.framework-scout.plist.example`](./com.acp.framework-scout.plist.example) | macOS launchd daily trigger |
| This `README.md` | You are here |

## Prereqs

- Claude Code ≥ 2.1 (`claude --version`)
- ACP Claude Code plugin installed (check `~/.claude/settings.json` has a `hooks.PreToolUse` entry)
- Shared creds at `~/.framework-scout/creds.env`

## Run once

```bash
bash run.sh
```

## Run daily (macOS)

```bash
cp com.acp.framework-scout.plist.example ~/Library/LaunchAgents/com.acp.framework-scout.plist
launchctl load ~/Library/LaunchAgents/com.acp.framework-scout.plist
```

## Known gaps

- **The ACP Claude Code plugin hook doesn't forward `agent_name`.** Events land under `client=claude-code-plugin` with no agent label. Same gap as other hook-based clients (Codex, Cursor). Batch-fix candidate — parallel to gatewaystack-connect PR #88.
- **`--print` mode is silent until completion.** For debugging, add `--output-format=stream-json --verbose` to run.sh to see tool calls as they happen. Remove for production.
- **Pattern-scoped Bash allowlists (`Bash(curl *)`) are brittle in `dontAsk` mode.** Compound shell commands (pipes, heredocs) don't cleanly match. If you go the `dontAsk` route, use bare `Bash` and rely on the ACP hook to catch dangerous commands dynamically.
