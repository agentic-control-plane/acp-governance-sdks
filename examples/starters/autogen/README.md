# ACP Starter — AutoGen (Python)

Minimal template for wiring ACP governance into a Microsoft AutoGen agent (v0.7+, the post-rewrite API).

## Setup

```bash
cp .env.example .env
# edit .env: set ACP_USER_TOKEN (gsk_...) and OPENAI_API_KEY

bash run.sh
```

`run.sh` creates a local `.venv` via `uv`, installs `autogen-agentchat` + `autogen-ext[openai]` + `acp-governance`, and runs `starter.py`.

## What to change

- `lookup_record(id)` body — replace with your real tool logic
- The docstring — AutoGen builds the tool schema from signature + type hints + docstring
- `agent_name: "my-autogen-agent"` in `set_context` — rename for dashboard attribution
- `OpenAIChatCompletionClient(model="gpt-4o-mini")` — swap for `AnthropicChatCompletionClient` (from `autogen_ext.models.anthropic`, add `anthropic` extra) or any other supported provider

Add more tools: define more `@governed(...)` async functions, pass them in `AssistantAgent(tools=[...])`.

## How governance is wired

No framework-specific adapter. `@governed("tool_name")` from `acp-governance` wraps the tool coroutine with ACP's pre/post hook protocol. AutoGen introspects the wrapped callable via `inspect.signature`, which follows the `__wrapped__` attribute that `functools.wraps` sets — so the tool's schema is built correctly from the original function's type hints.

LLM calls go direct to your provider via AutoGen's model client with your own key. Governance is tool-layer, not LLM-layer.

## AutoGen-specific notes

- **No tool-level hooks in AssistantAgent** (as of v0.7.5). The framework has no `on_tool_call` / `before_tool` / `middleware` seam — inline-wrapping the function is the documented path to add per-tool behavior.
- **Post-v0.2 API.** AutoGen v0.4 was a full rewrite (Jan 2025). Older tutorials showing `ConversableAgent`, `config_list`, or `initiate_chat` are pre-rewrite and won't work with current packages. This starter targets v0.7.5+.
- **Guardrails tracking issue [#6017](https://github.com/microsoft/autogen/issues/6017)** is still open. Safety primitives (guardrails, pre/post-LLM hooks) landed in the adjacent Microsoft Agent Framework, not in AutoGen 0.7.x. ACP fills the tool-layer gap via `@governed`.

## References

- [AutoGen quickstart](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/quickstart.html)
- [AutoGen AssistantAgent reference](https://microsoft.github.io/autogen/stable/reference/python/autogen_agentchat.agents.html)
- [ACP governance model](https://agenticcontrolplane.com/docs/governance-model)

## Get an API key

[cloud.agenticcontrolplane.com](https://cloud.agenticcontrolplane.com/) → create a workspace → Settings → API Keys → New key.
