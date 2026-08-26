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

## Both planes in one call

`@governed` covers what your agent *does*. The ACP proxy covers what it
*spends*. `init()` wires both — call it before you construct a model client,
since the SDKs read their config from the environment at construction time:

```python
import acp_governance as acp
from anthropic import Anthropic

acp.init()                # governance + proxy
client = Anthropic()      # now priced and metered by ACP
```

Constructing clients explicitly instead? Skip `init()` and pass the config:

```python
from acp_governance import model_client_kwargs

client = Anthropic(**model_client_kwargs("anthropic"))
```

Set `ACP_API_KEY=gsk_...` from [the console](https://cloud.agenticcontrolplane.com).

**Routing is all-or-nothing per provider.** `init()` either sets both the base
URL and the key, or leaves that provider completely alone and warns — a
half-applied provider (ACP's URL against your real vendor key) is just a 401.
So if `OPENAI_BASE_URL` already points at your own gateway, ACP won't silently
reroute you; it tells you those calls aren't being priced.

Three API shapes, each on its own mount — `"anthropic"`, `"openai"` (chat
completions), and `"openai-responses"`. The last two are **not**
interchangeable: `/v1` serves chat completions, `/openai/v1` serves responses.

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

# proxy plane — price and meter model calls
init(proxy=True, shapes=("anthropic", "openai"), **configure_kwargs)  # both planes
model_base_url(shape="anthropic") -> str
model_client_kwargs(shape="anthropic") -> dict   # {"base_url": ..., "api_key": ...}
api_key() -> str                                 # reads ACP_API_KEY
```

Supports both sync and async tool functions — `@governed` detects via `inspect.iscoroutinefunction` and dispatches accordingly.

## License

MIT
