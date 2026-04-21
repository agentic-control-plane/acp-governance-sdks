"""acp-crewai — Agentic Control Plane governance for CrewAI agents.

Wrap tools with @governed. ACP decides allow/deny/redact on every call.
Inter-agent handoffs (sequential task passes and manager/coworker delegation)
are captured too via install_crew_hooks().

Usage:

    from crewai import Agent, Crew, Task
    from crewai.tools import tool
    from fastapi import FastAPI, Header
    from acp_crewai import governed, install_crew_hooks, set_context

    app = FastAPI()

    @tool("web_search")
    @governed("web_search")     # ← governance on tool call
    def web_search(query: str) -> str:
        return my_search(query)

    @app.post("/run")
    def run(topic: str, authorization: str = Header(...)):
        set_context(user_token=authorization.removeprefix("Bearer ").strip())
        researcher = Agent(role="researcher", goal=topic, tools=[web_search])
        task = Task(description=f"Research {topic}", agent=researcher)
        crew = Crew(agents=[researcher], tasks=[task])
        install_crew_hooks(crew)    # ← governance on inter-agent messages
        return {"result": str(crew.kickoff())}
"""
from acp_governance import (
    Config,
    GovernanceContext,
    clear_context,
    configure,
    get_config,
    get_context,
    governed,
    post_tool_output,
    pre_tool_use,
    set_context,
)

from ._crew_hooks import install_crew_hooks

__version__ = "0.1.0"
__all__ = [
    "Config",
    "GovernanceContext",
    "__version__",
    "clear_context",
    "configure",
    "get_config",
    "get_context",
    "governed",
    "install_crew_hooks",
    "post_tool_output",
    "pre_tool_use",
    "set_context",
]
