# ACP Starter — LangGraph (Python)

Minimal template for wiring ACP governance into a LangGraph / LangChain agent.

## Setup

```bash
cp .env.example .env
# edit .env: set ACP_USER_TOKEN (gsk_...) and OPENAI_API_KEY

bash run.sh
```

`run.sh` creates a local `.venv` via `uv`, installs `langchain` + `langgraph` + `acp-langchain` from the monorepo, and runs `starter.py`.

## What to change

- `lookup_record(id)` — replace the body with your real tool logic
- The `@tool` docstring — LangChain uses it to decide when to call the tool
- `agent_name: "my-langgraph-agent"` in `set_context` — rename for dashboard attribution
- `model="openai:gpt-4o-mini"` — swap to any LangChain-supported model

Add more tools: decorate more functions with `@tool` + `@governed(...)` (governance decorator INSIDE `@tool`) and pass them in `create_agent(tools=[...])`.

## How governance is wired

`@governed("tool_name")` from `acp-langchain` wraps each tool with ACP's pre/post hook protocol. Every tool call flows through `/govern/tool-use` before execution and `/govern/tool-output` after. Denials return a `tool_error: <reason>` string that LangChain delivers to the agent as tool output; the agent adapts.

LLM calls go direct to your provider with your own key. Governance is tool-layer, not LLM-layer.

## 2026 idiom note

This starter uses `create_agent` from `langchain.agents` — the current canonical way to build a ReAct-style agent. The older `langgraph.prebuilt.create_react_agent` still works but is considered legacy in LangChain 1.x.

LangChain 1.x also shipped a proper middleware API (`@wrap_tool_call`, `@before_model`, etc. in `langchain.agents.middleware`) and PIIMiddleware / HumanInTheLoopMiddleware primitives. A future `acp-langchain` v0.2 will expose ACP governance as a middleware entry alongside the decorator — giving broader coverage (every tool including prebuilt / MCP) without changing this starter's user-facing shape.

## References

- [`acp-langchain` package source](../../../python/acp-langchain/)
- [LangChain agents docs](https://docs.langchain.com/oss/python/langchain/agents)
- [LangChain middleware docs](https://docs.langchain.com/oss/python/langchain/middleware/custom)
- [ACP governance model](https://agenticcontrolplane.com/docs/governance-model)

## Get an API key

[cloud.agenticcontrolplane.com](https://cloud.agenticcontrolplane.com/) → create a workspace → Settings → API Keys → New key.
