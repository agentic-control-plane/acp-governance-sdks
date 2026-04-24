# ACP Starter — Pydantic AI (Python)

Minimal template for wiring ACP governance into a Pydantic AI agent.

## Setup

```bash
cp .env.example .env
# edit .env: set ACP_USER_TOKEN (gsk_...) and ANTHROPIC_API_KEY
#   (swap to OPENAI_API_KEY if you change the model prefix to openai:*)

bash run.sh
```

`run.sh` creates a local `.venv` via `uv`, installs `pydantic-ai` + `acp-governance` from the monorepo, and runs `starter.py`.

## What to change

- `lookup_record(id)` — replace the body with your real tool logic
- The `@agent.tool_plain` docstring — Pydantic AI derives the tool's schema and description from your function signature + docstring
- `agent_name: "my-pydantic-agent"` in `set_context` — rename for dashboard attribution
- `Agent("anthropic:claude-sonnet-4-6", ...)` — swap the model string for any provider Pydantic AI supports (`openai:*`, `google-gla:*`, `groq:*`, etc.) and adjust `.env` accordingly

Add more tools: decorate more functions with `@agent.tool_plain` + `@governed(...)` (governance decorator INSIDE the tool decorator). If the tool needs the agent's run context, use `@agent.tool` instead of `@agent.tool_plain` and keep `RunContext[Deps]` as the first parameter.

## How governance is wired

`@governed("tool_name")` from `acp-governance` wraps the raw Python function. Pydantic AI's introspection sees the wrapped callable; tool calls flow through ACP's `/govern/tool-use` before execution and `/govern/tool-output` after.

LLM calls go direct to your provider with your own key. Governance is tool-layer, not LLM-layer.

## Future migration note (Hooks API)

Pydantic AI ships a first-class `Hooks` capability (`before_tool_execute`, `after_tool_execute`, `wrap_tool_execute`) that's a cleaner integration point than per-function decorator stacking — it governs every tool registered with the agent without requiring users to decorate each one. A future `acp-pydantic-ai` v0.2 package will expose an `ACPHooks()` helper using this surface. The decorator stacking in this starter will keep working; migration is an ergonomic upgrade, not a correctness requirement.

## References

- [Pydantic AI docs — agents](https://ai.pydantic.dev/agents/)
- [Pydantic AI docs — tools](https://ai.pydantic.dev/tools/)
- [Pydantic AI docs — hooks](https://ai.pydantic.dev/hooks/)
- [ACP governance model](https://agenticcontrolplane.com/docs/governance-model)

## Get an API key

[cloud.agenticcontrolplane.com](https://cloud.agenticcontrolplane.com/) → create a workspace → Settings → API Keys → New key.
