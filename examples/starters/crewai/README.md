# ACP Starter — CrewAI (Python)

Minimal template for wiring ACP governance into a CrewAI agent or crew.

## Setup

```bash
cp .env.example .env
# edit .env: set ACP_USER_TOKEN (gsk_...) and OPENAI_API_KEY

bash run.sh
```

`run.sh` creates a local `.venv` via `uv`, installs `crewai` + `acp-crewai` from the monorepo, and runs `starter.py`.

## What to change

- `lookup_record(id)` — replace the body with your real tool logic
- The `@tool` description + the `Task.description` — CrewAI uses these to decide when to call tools and what the task outcome should be
- `agent_name: "my-crew"` in `set_context` — rename for dashboard attribution

Add more tools: decorate more functions with `@tool(...)` + `@governed(...)` (governance decorator INSIDE tool decorator) and pass them in the `Agent(tools=[...])` list.

## How governance is wired

Two layers, both via `acp-crewai`:

1. **Tool-level:** `@governed("tool_name")` under `@tool(...)` — every call to that tool runs `preToolUse → handler → postToolOutput`. Denials return a `tool_error: <reason>` string that CrewAI's agent sees as tool output and adapts to.
2. **Delegation-level:** `install_crew_hooks(crew)` captures inter-agent handoffs (sequential task passes, manager/coworker delegation) as audit events so your dashboard shows the full agent-to-agent chain, not just individual tool calls.

LLM calls go direct to OpenAI with your own key. Governance is tool-layer, not LLM-layer.

## References

- [`acp-crewai` package source](../../../python/acp-crewai/)
- [CrewAI docs — tools](https://docs.crewai.com/concepts/tools)
- [CrewAI docs — tool hooks](https://docs.crewai.com/learn/tool-hooks) (v2-ready: future versions of `acp-crewai` will switch to these for broader interception)
- [ACP governance model](https://agenticcontrolplane.com/docs/governance-model)

## Get an API key

[cloud.agenticcontrolplane.com](https://cloud.agenticcontrolplane.com/) → create a workspace → Settings → API Keys → New key.
