# acp-crewai

[Agentic Control Plane](https://agenticcontrolplane.com) governance for [CrewAI](https://crewai.com) agents.

Wrap any tool with `@governed`. Before it runs, ACP decides allow / deny / redact based on your workspace's policy, the end user's scopes, rate limits, and PII detection.

Same governance model as Claude Code. If you have workspace policies set up for Claude Code, they apply to CrewAI tools automatically.

## Install

```bash
pip install acp-crewai
```

## Usage

```python
from crewai import Agent, Crew, Task
from crewai.tools import tool
from fastapi import FastAPI, Header
from acp_crewai import governed, install_crew_hooks, set_context

app = FastAPI()

# Define tools however you like. Stack @governed under @tool — the
# governance check runs inside CrewAI's tool dispatch.
@tool("web_search")
@governed("web_search")
def web_search(query: str) -> str:
    """Search the web."""
    return my_search(query)  # your code, your credentials

@tool("send_email")
@governed("send_email")
def send_email(to: str, subject: str, body: str) -> str:
    """Send an email on behalf of the user."""
    return sendmail(to, subject, body)  # your code

@app.post("/run")
def run(topic: str, authorization: str = Header(...)):
    # Bind the end user's JWT to this request's context. Every @governed
    # call below carries the user's identity to ACP.
    set_context(user_token=authorization.removeprefix("Bearer ").strip())

    researcher = Agent(
        role="researcher",
        goal=f"Research {topic}",
        tools=[web_search, send_email],
    )
    task = Task(description=f"Research {topic} and email a summary.", agent=researcher)
    crew = Crew(agents=[researcher], tasks=[task])

    # Capture inter-agent handoffs (sequential task passes + coworker
    # delegation) as synthetic Agent.Handoff audit events.
    install_crew_hooks(crew)

    return {"result": str(crew.kickoff())}
```

## What happens per tool call

1. **Pre-check** — POSTs to ACP `/govern/tool-use` with `{ tool_name, tool_input, session_id }` + the user's Bearer JWT.
2. **Decide** — ACP evaluates workspace policy, the user's scopes, rate limits, and PII.
3. **Deny** → wrapped function returns `"tool_error: <reason>"` — CrewAI treats this as the tool's output, the model sees it and adapts.
4. **Allow** → your tool runs.
5. **Post-audit** — POSTs to `/govern/tool-output` with the result. PII scan runs. If ACP returns `redact`, the redacted version replaces the output.

## Inter-agent handoffs (`install_crew_hooks`)

CrewAI has two delegation paths that don't cross a tool boundary, and
`@governed` alone doesn't see them:

1. **Sequential task handoffs** — Task N's output feeds Task N+1's context.
2. **Hierarchical delegation** — the built-in `Delegate work to coworker` /
   `Ask question to coworker` tools a manager uses to route work.

`install_crew_hooks(crew)` attaches `task_callback` and `step_callback` to
a Crew so inter-agent messages emit synthetic `Agent.Handoff` events.
Those flow through the same PII scan and audit pipeline as tool I/O,
rooted in the end user's identity.

Existing callbacks are chained, not overwritten.

## View activity

Every tool call shows up in the [ACP Activity view](https://cloud.agenticcontrolplane.com/activity), rooted in the end user's identity. Sessions group related calls — one request from one user = one session.

## Fail-open

Network errors, timeouts (5s default), gateway errors → the tool proceeds with reason `"fail-open"`. Matches Claude Code behavior. Governance is never a single point of failure for the agent.

## API

`acp-crewai` re-exports the full `acp-governance` API for convenience:

```python
governed(name_or_fn=None)                 # decorator
set_context(user_token, *, session_id=None, agent_tier=None, agent_name=None)
get_context()
clear_context()
configure(base_url=..., timeout_s=..., client_header=...)
```

## Related

- [`acp-governance`](https://pypi.org/project/acp-governance) — core SDK (this package wraps it)
- [`acp-langchain`](https://pypi.org/project/acp-langchain) — same story for LangChain / LangGraph
- [CrewAI integration guide](https://agenticcontrolplane.com/integrations/crewai)

## License

MIT
