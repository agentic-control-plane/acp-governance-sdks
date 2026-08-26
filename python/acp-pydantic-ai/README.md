# acp-pydantic-ai

[Agentic Control Plane](https://agenticcontrolplane.com) governance for [Pydantic AI](https://ai.pydantic.dev) agents.

Register `ACPHooks()` once on your agent. Before any tool runs, ACP decides allow / deny / redact based on your workspace's policy, the end user's scopes, rate limits, and PII detection — for every tool the agent has, with zero per-function decorators.

Same governance model as Claude Code. If you have workspace policies set up for Claude Code, they apply to Pydantic AI tools automatically.

## Install

```bash
pip install acp-pydantic-ai
```

Requires `pydantic-ai >= 2` (the package builds on Pydantic AI's first-class `Hooks` capability).

## Usage

```python
from fastapi import FastAPI, Header
from pydantic_ai import Agent
from acp_pydantic_ai import ACPHooks, configure, set_context

configure(base_url="https://api.agenticcontrolplane.com")
app = FastAPI()

# One registration. Every tool on this agent is governed — the ones
# below, and any you add later.
agent = Agent(
    "anthropic:claude-sonnet-4-6",
    instructions="You are an ACP-governed agent. Use the tools available.",
    capabilities=[ACPHooks()],
)

@agent.tool_plain
def lookup_record(id: str) -> str:
    """Look up a record by ID."""
    return db.lookup(id)            # your code, your credentials

@agent.tool_plain
def send_email(to: str, subject: str, body: str) -> str:
    """Send an email on behalf of the user."""
    return sendmail(to, subject, body)

@app.post("/run")
def run(prompt: str, authorization: str = Header(...)):
    # Bind the end user's JWT to this request's context. Every tool call
    # in the run below carries the user's identity to ACP.
    set_context(user_token=authorization.removeprefix("Bearer ").strip())
    return {"result": agent.run_sync(prompt).output}
```

## What happens per tool call

1. **Pre-check** — POSTs to ACP `/govern/tool-use` with `{ tool_name, tool_input, session_id }` + the user's Bearer JWT.
2. **Decide** — ACP evaluates workspace policy, the user's scopes, rate limits, and PII.
3. **Deny** → the tool function is **never called**. The model receives `"tool_error: <reason>"` as the tool result and adapts.
4. **Allow** → your tool runs.
5. **Post-audit** — POSTs to `/govern/tool-output` with the result. PII scan runs. `redact` → the redacted version replaces the output; `block` → the model sees `"[ACP] Blocked: <reason>"`.

## How it hooks in

`ACPHooks()` returns a Pydantic AI `Hooks` capability carrying a single `tool_execute` wrap hook (`wrap_tool_execute`). Pydantic AI invokes it around every tool execution; the hook runs the pre-check, calls `await handler(args)` only on allow, then runs the post-audit. It composes with your other capabilities and hooks — first-registered wraps outermost.

Scope it if you need to:

```python
ACPHooks(tools=["send_email", "delete_record"])   # govern only these
ACPHooks(exclude=["get_time"])                    # govern all but these
```

## Decorator pattern (v1-era, still works)

Before Pydantic AI 2, this package's story was stacking `@governed` under the tool decorator:

```python
from acp_pydantic_ai import governed

@agent.tool_plain
@governed("lookup_record")
def lookup_record(id: str) -> str: ...
```

That still works on v2 and is still re-exported here. Prefer `ACPHooks()` — one registration, nothing to forget on the next tool. Don't combine both on the same tool, or the call is checked (and audited) twice.

## View activity

Every tool call shows up in the [ACP Activity view](https://cloud.agenticcontrolplane.com/activity), rooted in the end user's identity. Sessions group related calls — one request from one user = one session.

## Fail-open

Network errors, timeouts (5s default), gateway errors → the tool proceeds with reason `"fail-open"`. Matches Claude Code behavior. Governance is never a single point of failure for the agent.

## API

`acp-pydantic-ai` re-exports the full `acp-governance` API for convenience:

```python
ACPHooks(tools=None, exclude=None)        # → pydantic_ai.capabilities.Hooks
governed(name_or_fn=None)                 # v1-era decorator, still supported
set_context(user_token, *, session_id=None, agent_tier=None, agent_name=None)
get_context()
clear_context()
configure(base_url=..., timeout_s=..., client_header=...)
```

## Related

- [`acp-governance`](https://pypi.org/project/acp-governance) — core SDK (this package wraps it)
- [`acp-crewai`](https://pypi.org/project/acp-crewai) — same story for CrewAI
- [`acp-langchain`](https://pypi.org/project/acp-langchain) — same story for LangChain / LangGraph
- [Pydantic AI integration guide](https://agenticcontrolplane.com/integrations/pydantic-ai)

## License

MIT
