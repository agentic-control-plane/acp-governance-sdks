# Framework Scout — Codex CLI (hook-based governance + `--full-auto`)

Reference agent #4 of 17. Same scout job, same hook pattern as #2 Claude Code — but a different host runtime with a much thinner native tool surface.

## Governance pattern

**Hook-based (transparent).** The installed ACP Codex plugin at `~/.codex/hooks.json` registers `PreToolUse` and `PostToolUse` hooks that run `~/.acp/govern.mjs` for every tool call. Same `govern.mjs` script Claude Code uses; only the `ACP_CLIENT=codex` env var differs.

```
Codex exec tool call
        │
        ▼
Sandbox policy (--full-auto = --sandbox workspace-write) ─ approve / deny
        │
        ▼
PreToolUse hook → ~/.acp/govern.mjs (ACP_CLIENT=codex) → POST /govern/tool-use
        │ (if allowed)
        ▼
Tool executes (usually `shell` with a curl command)
        │
        ▼
PostToolUse hook → ~/.acp/govern.mjs → POST /govern/tool-output
```

## Why `--full-auto` instead of `--dangerously-bypass-approvals-and-sandbox`

The obvious headless flag is `--dangerously-bypass-approvals-and-sandbox`. OpenAI's own docs label it *"Elevated Risk / not recommended"* — reserved for environments that are already externally sandboxed (container/VM).

`codex exec --full-auto` is the officially recommended headless path. It's a convenience alias for `--sandbox workspace-write`: the agent can write inside the workspace and make network calls, but can't roam the broader filesystem. `exec` is non-interactive by default, so no approval prompts stall the run.

**Codex version note:** Codex 0.124+ adds a separate `--ask-for-approval never` flag for finer control over what prompts through. Our scout was built against 0.121 where `--full-auto` alone is sufficient. If you're on 0.124+, consider `codex exec --full-auto --ask-for-approval never` for explicitness.

## Contrast with #2 Claude Code

Both are hook-pattern clients. Where they differ:

| | Claude Code | Codex CLI |
|---|---|---|
| Native tools | `WebSearch`, `WebFetch`, `Bash`, `Read`, `Write`, `Edit` | `shell` (everything else is MCP or nothing) |
| Research approach | `WebSearch` with agent-formatted results | `shell` running `curl` against public APIs |
| Email sending | `Bash` with curl | `shell` with curl |
| Headless flag | `--print --permission-mode=auto` | `exec --full-auto` |
| Plugin config | `~/.claude/settings.json` | `~/.codex/hooks.json` |

Codex's thin tool surface means the scout is more prompt-heavy (we tell it exactly which curl to run) and produces fewer distinct tool-call types in the governance log — every event reads `tool: shell` with the command in the input payload.

## What's in this folder

| File | Purpose |
|---|---|
| [`scout.prompt.md`](./scout.prompt.md) | Instructions Codex follows |
| [`run.sh`](./run.sh) | Wrapper: sources creds, invokes `codex exec --full-auto` |

Reuse [`../claude-code/com.acp.framework-scout.plist.example`](../claude-code/com.acp.framework-scout.plist.example) for macOS launchd scheduling — just swap the `ProgramArguments` path.

## Prereqs

- Codex CLI ≥ 0.121 (`codex --version`)
- ACP Codex plugin installed (`~/.codex/hooks.json` with PreToolUse calling `~/.acp/govern.mjs`)
- `codex login` done
- Shared creds at `~/.framework-scout/creds.env`

## Run

```bash
bash run.sh
```

## Known gaps

1. **Codex `PreToolUse` hooks don't fire for all tool types.** Today they reliably fire for `shell` (Bash) calls, but `apply_patch` file edits and many MCP tool calls don't trigger them — tracked upstream at [openai/codex#16732](https://github.com/openai/codex/issues/16732). For this scout the gap doesn't matter (it only uses `shell`). For an agent that uses `apply_patch` heavily, hook-only governance has real coverage holes until that issue ships.

2. **The ACP Codex plugin hook sends `agent_tier` but not `agent_name`.** Same gap as the Claude Code plugin. Events land under `client=codex` with no agent label. Batch-fix candidate.
