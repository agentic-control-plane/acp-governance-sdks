# ACP Starter — OpenAI Agents SDK (Python)

Minimal template for wiring ACP governance into an agent built with the OpenAI Agents SDK.

## Setup

```bash
cp .env.example .env
# edit .env: set ACP_USER_TOKEN (gsk_...) and OPENAI_API_KEY

bash run.sh
```

`run.sh` creates a local venv via `uv`, installs deps (including `acp-governance` from the monorepo), and runs `starter.py`.

## What to change

- `lookup_record(id)` — replace the body with your real tool logic
- Its docstring — Claude uses it to decide when to call the tool
- `agent_name: "my-agent"` — rename for dashboard attribution

Add more tools: define more `@function_tool(**ACP_GUARDRAILS)` functions and add them to the `Agent(tools=[...])` list.

## How governance is wired

ACP integrates via the SDK's **native tool guardrails** (v0.14+). `acp_input_guardrail` runs before every tool call (maps to ACP's PreToolUse); `acp_output_guardrail` runs after (maps to PostToolOutput). Denials flow through the SDK's `tool_error_formatter` so they appear cleanly in traces.

LLM calls go direct to OpenAI with your own key. Governance is tool-layer, not LLM-layer.

## References

- [OpenAI Agents SDK scout](../../framework-scout/openai-agents-sdk/) — full working example
- [OpenAI Agents SDK guardrails docs](https://openai.github.io/openai-agents-python/guardrails/)
- [ACP governance model](https://agenticcontrolplane.com/docs/governance-model)

## Get an API key

[cloud.agenticcontrolplane.com](https://cloud.agenticcontrolplane.com/) → create a workspace → Settings → API Keys → New key.
