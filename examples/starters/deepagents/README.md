# ACP Starter — Deep Agents (Python)

Minimal template for putting a [LangChain Deep Agent](https://github.com/langchain-ai/deepagents) under ACP policy & audit, subagents included.

## Setup

```bash
cp .env.example .env
# edit .env: set ACP_USER_TOKEN (gsk_...) and OPENAI_API_KEY

bash run.sh
```

`run.sh` creates a local `.venv` via `uv`, installs `deepagents` + `langchain` (1.x) + `acp-langchain` from the monorepo, and runs `starter.py`.

## What to change

- `lookup_record(id)` — replace the body with your real tool logic
- The `researcher` subagent spec — or drop it and let the model use the built-in `general-purpose` one, which is governed too
- `agent_name: "my-deep-agent"` in `set_context` — rename for dashboard attribution
- `model="openai:gpt-4o-mini"` — swap to any LangChain-supported model string

## How the policy layer is wired

`acp_langchain.deepagents.create_deep_agent` has the same signature as `deepagents.create_deep_agent`. It appends `ACPMiddleware()` to the main agent, to every declarative subagent, and supplies a governed `general-purpose` spec in place of the stock one.

Why not just `middleware=[ACPMiddleware()]`? Because Deep Agents builds each subagent with its own middleware stack and does not inherit the parent's user-supplied middleware. With the plain registration you get one `task` row in Activity, then the subagent's tool calls run with no policy check and no audit row. The wrapper closes that. `tests/test_deepagents.py` in `python/acp-langchain` proves both halves against a scripted model, no keys needed.

Per tool call, on the main agent and inside subagents:

1. Pre-check → ACP `/govern/tool-use`. **Deny** → the tool never runs; the model receives `tool_error: <reason>` and adapts.
2. Allow → your tool runs.
3. Post-audit → `/govern/tool-output`. **Redact** replaces the output before the model sees it; **block** yields `"[ACP] Blocked: <reason>"`.

Filesystem tools (`read_file`, `write_file`, `edit_file`, `ls`, `glob`, `grep`), skill reads, and the `task` delegation call are tool calls too, so they show up the same way. Model calls go direct to your provider unless you opt into the proxy plane with `acp_governance.init()`.

Compiled (`runnable=`) and remote (`graph_id=`) subagents are built elsewhere; they pass through with a `UserWarning` naming each one. Register `ACPMiddleware` on those graphs where you build them.
