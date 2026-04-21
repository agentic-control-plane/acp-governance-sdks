# acp-langchain

[Agentic Control Plane](https://agenticcontrolplane.com) governance for [LangChain](https://langchain.com) and [LangGraph](https://langchain-ai.github.io/langgraph/) agents.

Wrap any tool with `@governed`. Before it runs, ACP decides allow / deny / redact based on your workspace's policy, the end user's scopes, rate limits, and PII detection.

Same governance model as Claude Code. If you have workspace policies set up for Claude Code, they apply to LangChain tools automatically.

## Install

```bash
pip install acp-langchain
```

## Usage (LangGraph ReAct agent)

```python
from fastapi import FastAPI, Header
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent
from acp_langchain import governed, set_context

app = FastAPI()

# Stack @governed under @tool — the governance check runs inside the
# tool's dispatch.
@tool
@governed("web_search")
def web_search(query: str) -> str:
    """Search the web."""
    return my_search(query)  # your code, your credentials

@tool
@governed("send_email")
def send_email(to: str, subject: str, body: str) -> str:
    """Send an email on behalf of the user."""
    return sendmail(to, subject, body)

@app.post("/run")
def run(prompt: str, authorization: str = Header(...)):
    # Bind the end user's JWT to this request's context. Every @governed
    # call below carries the user's identity to ACP.
    set_context(user_token=authorization.removeprefix("Bearer ").strip())

    agent = create_react_agent(
        model=ChatOpenAI(model="gpt-4o-mini"),
        tools=[web_search, send_email],
    )
    result = agent.invoke({"messages": [("user", prompt)]})
    return {"result": result["messages"][-1].content}
```

## What happens per tool call

1. **Pre-check** — POSTs to ACP `/govern/tool-use` with `{ tool_name, tool_input, session_id }` + the user's Bearer JWT.
2. **Decide** — ACP evaluates workspace policy, the user's scopes, rate limits, and PII.
3. **Deny** → wrapped function returns `"tool_error: <reason>"` — LangChain treats this as the tool's output, the model sees it and adapts.
4. **Allow** → your tool runs.
5. **Post-audit** — POSTs to `/govern/tool-output` with the result. PII scan runs. If ACP returns `redact`, the redacted version replaces the output.

## View activity

Every tool call shows up in the [ACP Activity view](https://cloud.agenticcontrolplane.com/activity), rooted in the end user's identity. Sessions group related calls — one request from one user = one session.

## Fail-open

Network errors, timeouts (5s default), gateway errors → the tool proceeds with reason `"fail-open"`. Matches Claude Code behavior. Governance is never a single point of failure for the agent.

## Works with plain LangChain too

Not using LangGraph? `@governed` is framework-agnostic — it just wraps a Python function. Stack under any LangChain tool decorator:

```python
from langchain_core.tools import tool
from langchain.agents import create_tool_calling_agent, AgentExecutor

@tool
@governed("web_search")
def web_search(query: str) -> str: ...

# same @governed, works with AgentExecutor, create_tool_calling_agent,
# create_react_agent, or any custom graph
```

## API

`acp-langchain` re-exports the full `acp-governance` API for convenience:

```python
governed(name_or_fn=None)                 # decorator
set_context(user_token, *, session_id=None, agent_tier=None, agent_name=None)
get_context()
clear_context()
configure(base_url=..., timeout_s=..., client_header=...)
```

## Related

- [`acp-governance`](https://pypi.org/project/acp-governance) — core SDK (this package wraps it)
- [`acp-crewai`](https://pypi.org/project/acp-crewai) — same story for CrewAI
- [LangChain integration guide](https://agenticcontrolplane.com/integrations/langchain)

## License

MIT
