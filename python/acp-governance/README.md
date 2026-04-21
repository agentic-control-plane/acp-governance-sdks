# acp-governance

Thin Python SDK for the [Agentic Control Plane](https://agenticcontrolplane.com) governance hook protocol.

Wraps the two endpoints ACP exposes:
- `POST /govern/tool-use` — pre-tool check (allow / deny / ask)
- `POST /govern/tool-output` — post-tool audit + PII scan

Same protocol Claude Code uses. Works with any Python agent runtime.

## Install

```bash
pip install acp-governance
```

## Usage

```python
from fastapi import FastAPI, Header
from acp_governance import governed, set_context

app = FastAPI()

@governed("web_search")
def web_search(query: str) -> str:
    """Search the web."""
    return my_search(query)  # your code, your credentials

@app.post("/run")
def run(topic: str, authorization: str = Header(...)):
    token = authorization.removeprefix("Bearer ").strip()
    set_context(user_token=token)
    return {"result": web_search(topic)}
```

## What happens per call

1. `pre_tool_use` POSTs to `/govern/tool-use` with `{ tool_name, tool_input, session_id }` + `Authorization: Bearer <user-jwt>`.
2. Gateway evaluates policy, rate limits, scope, PII → returns `{ decision, reason }`.
3. On `deny`, the wrapped function short-circuits with `"tool_error: <reason>"` (the model sees it and adapts).
4. On `allow`, the function runs. Result is sent to `/govern/tool-output` for audit.
5. If gateway returns `action: "redact"`, the redacted output is returned to the caller.

## Fail-open

Network errors, timeouts (5s), non-2xx responses → tool proceeds with reason `"fail-open"`. Governance is never a single point of failure for the agent.

## Framework adapters

This package is the core. For framework-native usage:

- [`acp-crewai`](https://pypi.org/project/acp-crewai) — CrewAI (adds `@tool` stacking docs)
- [`acp-langchain`](https://pypi.org/project/acp-langchain) — LangChain / LangGraph
- [`@agenticcontrolplane/governance-anthropic`](https://www.npmjs.com/package/@agenticcontrolplane/governance-anthropic) (Node) — Anthropic Messages API

## API

```python
# decorator
governed(name_or_fn=None)                    # @governed or @governed("tool_name")

# context binding
set_context(user_token, *, session_id=None, agent_tier=None, agent_name=None)
get_context()
clear_context()

# manual (if you need to hook somewhere other than a function boundary)
pre_tool_use(tool_name, tool_input) -> (allowed, reason)
post_tool_output(tool_name, tool_input, tool_output) -> response_dict | None

# config
configure(base_url=..., timeout_s=..., client_header=...)
get_config()
```

Supports both sync and async tool functions — `@governed` detects via `inspect.iscoroutinefunction` and dispatches accordingly.

## License

MIT
