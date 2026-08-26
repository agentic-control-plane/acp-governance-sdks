# ACP Starter — Pydantic AI (Python)

Minimal template for wiring ACP governance into a Pydantic AI agent.

## Setup

```bash
cp .env.example .env
# edit .env: set ACP_USER_TOKEN (gsk_...) and ANTHROPIC_API_KEY
#   (swap to OPENAI_API_KEY if you change the model prefix to openai:*)

bash run.sh
```

`run.sh` creates a local `.venv` via `uv`, installs `pydantic-ai` (v2) + `acp-governance` + `acp-pydantic-ai` from the monorepo, and runs `starter.py`.

## What to change

- `lookup_record(id)` — replace the body with your real tool logic
- The `@agent.tool_plain` docstring — Pydantic AI derives the tool's schema and description from your function signature + docstring
- `agent_name: "my-pydantic-agent"` in `set_context` — rename for dashboard attribution
- `Agent("anthropic:claude-sonnet-4-6", ...)` — swap the model string for any provider Pydantic AI supports (`openai:*`, `google-gla:*`, `groq:*`, etc.) and adjust `.env` accordingly

Add more tools: just decorate more functions with `@agent.tool_plain` — `ACPHooks()` already governs them; there is nothing extra to add per tool. If the tool needs the agent's run context, use `@agent.tool` instead of `@agent.tool_plain` and keep `RunContext[Deps]` as the first parameter.

## How governance is wired

`ACPHooks()` (from `acp-pydantic-ai`) returns a Pydantic AI `Hooks` capability registered once via `Agent(..., capabilities=[ACPHooks()])`. Its `tool_execute` wrap hook surrounds every tool execution:

1. Pre-check → ACP `/govern/tool-use`. **Deny** → the tool function never runs; the model receives `"tool_error: <reason>"` as the tool result and adapts.
2. Allow → your tool runs.
3. Post-audit → `/govern/tool-output`. **Redact** replaces the output before the model sees it; **block** yields `"[ACP] Blocked: <reason>"`.

LLM calls go direct to your provider with your own key. Governance is tool-layer, not LLM-layer.

Scope it if you need to: `ACPHooks(tools=[...])` governs only those names; `ACPHooks(exclude=[...])` passes those through.

## Decorator pattern (v1-era, still works)

Before Pydantic AI 2, the integration stacked a decorator per tool:

```python
from acp_governance import governed

@agent.tool_plain
@governed("lookup_record")   # governance decorator INSIDE the tool decorator
def lookup_record(id: str) -> str: ...
```

This still works on pydantic-ai v2 (verified) — `functools.wraps` preserves `__wrapped__`, so Pydantic AI's introspection still reads the original signature for the tool schema. Use it only if you're pinned below v2 or need per-tool wiring for another reason. Don't combine it with `ACPHooks()` on the same tool, or the call is checked (and audited) twice.

## Migration note (Hooks API) — shipped

The hooks migration this README used to describe as future landed: Pydantic AI's first-class `Hooks` capability (`before_tool_execute`, `after_tool_execute`, `wrap_tool_execute`, registered via `Agent(capabilities=[...])`) is stable in v2, and `acp-pydantic-ai` 0.2.0 exposes `ACPHooks()` on that surface. This starter now uses it as the primary path. Migrating from the decorator pattern: add `capabilities=[ACPHooks()]` to the `Agent(...)` call, delete every `@governed(...)` line, done.

## References

- [Pydantic AI docs — agents](https://pydantic.dev/docs/ai/core-concepts/agents/)
- [Pydantic AI docs — tools](https://pydantic.dev/docs/ai/core-concepts/tools/)
- [Pydantic AI docs — hooks](https://pydantic.dev/docs/ai/core-concepts/hooks/)
- [ACP governance model](https://agenticcontrolplane.com/docs/governance-model)

## Get an API key

[cloud.agenticcontrolplane.com](https://cloud.agenticcontrolplane.com/) → create a workspace → Settings → API Keys → New key.
