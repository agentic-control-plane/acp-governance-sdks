# acp-langchain

[Agentic Control Plane](https://agenticcontrolplane.com) policy & audit for [LangChain](https://langchain.com), [LangGraph](https://langchain-ai.github.io/langgraph/), and [Deep Agents](https://github.com/langchain-ai/deepagents).

Register `ACPMiddleware()` once on `create_agent`. Before any tool runs, ACP decides allow / deny / redact based on your workspace's policy, the end user's scopes, rate limits, and PII detection — for every tool the agent has, with zero per-function decorators.

Same control model as Claude Code. If you have workspace policies set up for Claude Code, they apply to LangChain tools automatically.

## Install

```bash
pip install acp-langchain "langchain>=1.3.3"
```

`ACPMiddleware` requires `langchain >= 1.3.3` (the 1.x `create_agent` middleware stack with tool-call wrap hooks). The legacy `@governed` decorator works on any version.

## Usage

```python
from fastapi import FastAPI, Header
from langchain.agents import create_agent
from langchain.tools import tool
from acp_langchain import ACPMiddleware, configure, set_context

configure(base_url="https://api.agenticcontrolplane.com")
app = FastAPI()

@tool
def web_search(query: str) -> str:
    """Search the web."""
    return my_search(query)             # your code, your credentials

@tool
def send_email(to: str, subject: str, body: str) -> str:
    """Send an email on behalf of the user."""
    return sendmail(to, subject, body)

# One registration. Every tool on this agent is governed — the ones
# above, prebuilt tools, MCP tools, and any you add later.
agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[web_search, send_email],
    middleware=[ACPMiddleware()],
)

@app.post("/run")
def run(prompt: str, authorization: str = Header(...)):
    # Bind the end user's JWT to this request's context. Every tool call
    # in the run below carries the user's identity to ACP.
    set_context(user_token=authorization.removeprefix("Bearer ").strip())
    result = agent.invoke({"messages": [{"role": "user", "content": prompt}]})
    return {"result": result["messages"][-1].content}
```

## What happens per tool call

1. **Pre-check** — POSTs to ACP `/govern/tool-use` with `{ tool_name, tool_input, session_id }` + the user's Bearer JWT.
2. **Decide** — ACP evaluates workspace policy, the user's scopes, rate limits, and PII.
3. **Deny** → the tool function is **never called**. The middleware short-circuits with a synthetic `ToolMessage("tool_error: <reason>", status="error")`; the model sees the denial as the tool's result and adapts.
4. **Allow** → your tool runs.
5. **Post-audit** — POSTs to `/govern/tool-output` with the result. PII scan runs. `redact` → the redacted version replaces the output; `block` → the model sees `"[ACP] Blocked: <reason>"`.

## How it hooks in

LangChain 1.x made middleware the first-class seam around `create_agent`: middleware can wrap model calls and tool execution. `ACPMiddleware` is an `AgentMiddleware` implementing the tool-execution wrap hooks (`wrap_tool_call` / `awrap_tool_call` — sync and async agents both covered). On deny it returns the synthetic `ToolMessage` without invoking the handler, so the tool never executes.

It composes with LangChain's own middleware — including `HumanInTheLoopMiddleware`. The HITL interrupt runs after the model proposes tool calls; `wrap_tool_call` runs at execution. A human-approved call still passes through the ACP policy check:

```python
agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[send_email, web_search],
    middleware=[
        HumanInTheLoopMiddleware(interrupt_on={"send_email": True}),  # the pause
        ACPMiddleware(),                                              # the policy + ledger
    ],
)
```

Scope it if you need to:

```python
ACPMiddleware(tools=["send_email", "delete_record"])   # govern only these
ACPMiddleware(exclude=["get_time"])                    # govern all but these
```

## Deep Agents

[Deep Agents](https://github.com/langchain-ai/deepagents) is LangChain's harness on top of `create_agent` (planning, filesystem, subagents, skills, memory, HITL). It takes the same `middleware=` list, so `ACPMiddleware()` already governs the main agent's tools. It does **not** reach the subagents: `create_deep_agent` builds each declarative subagent with its own middleware stack and does not inherit user-supplied middleware, and the auto-added `general-purpose` subagent inherits only middleware matching its default slots. Net effect with plain `middleware=[ACPMiddleware()]`: one `task` row, then every tool call inside the subagent runs unchecked and unaudited. Verified on `deepagents` 0.7.13 (`tests/test_deepagents.py`).

Use this instead:

```python
from acp_langchain.deepagents import create_deep_agent   # same signature as deepagents'

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    tools=[lookup_record, send_email],
    subagents=[{"name": "researcher", "description": "...", "system_prompt": "..."}],
)
```

ACP is on the main agent, on every declarative subagent, and on a governed `general-purpose` spec that replaces the stock one (same name, description, and prompt, so the model's view of `task` is unchanged). Pass `acp=ACPMiddleware(exclude=[...])` to scope it.

Already calling `deepagents.create_deep_agent` directly? Wrap the subagents list:

```python
from deepagents import create_deep_agent
from acp_langchain import ACPMiddleware
from acp_langchain.deepagents import govern_subagents

agent = create_deep_agent(model=..., tools=[...],
                          middleware=[ACPMiddleware()],
                          subagents=govern_subagents(my_subagents))
```

Compiled subagents (`runnable=`) and remote ones (`graph_id=`) are built elsewhere, so ACP cannot be injected here; they pass through unchanged and a `UserWarning` names each one. Register `ACPMiddleware` where you build those graphs. Subagent tool calls share the parent request's `session_id` (contextvars carry through the `task` call), so they group under the same session in Activity.

Install: `pip install "acp-langchain[deepagents]"`.

## Decorator pattern (v0.1-era, still works)

Before LangChain 1.x middleware, this package's story was stacking `@governed` under the tool decorator:

```python
from acp_langchain import governed

@tool
@governed("web_search")
def web_search(query: str) -> str: ...
```

That still works — on legacy `AgentExecutor`, `create_tool_calling_agent`, `langgraph.prebuilt.create_react_agent` (now in `langchain-classic` / legacy), and custom `StateGraph`s — and is still re-exported here. Prefer `ACPMiddleware()` on 1.x — one registration, nothing to forget on the next tool, and it also covers tools you didn't write (prebuilt, MCP). Don't combine both on the same tool, or the call is checked (and audited) twice.

## View activity

Every tool call shows up in the [ACP Activity view](https://cloud.agenticcontrolplane.com/activity), rooted in the end user's identity. Sessions group related calls — one request from one user = one session.

## Fail-open

Network errors, timeouts (5s default), gateway errors → the tool proceeds with reason `"fail-open"`. Matches Claude Code behavior. Policy checks are never a single point of failure for the agent.

## API

`acp-langchain` re-exports the full `acp-governance` API for convenience:

```python
ACPMiddleware(tools=None, exclude=None)   # → langchain AgentMiddleware
governed(name_or_fn=None)                 # v0.1-era decorator, still supported
set_context(user_token, *, session_id=None, agent_tier=None, agent_name=None)
get_context()
clear_context()
configure(base_url=..., timeout_s=..., client_header=...)
```

## Related

- [`acp-governance`](https://pypi.org/project/acp-governance) — core SDK (this package wraps it)
- [`acp-pydantic-ai`](https://pypi.org/project/acp-pydantic-ai) — same story for Pydantic AI
- [`acp-crewai`](https://pypi.org/project/acp-crewai) — same story for CrewAI
- [LangChain integration guide](https://agenticcontrolplane.com/integrations/langgraph)
- [Deep Agents integration guide](https://agenticcontrolplane.com/integrations/deepagents)

## License

MIT
