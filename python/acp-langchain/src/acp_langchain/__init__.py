"""acp-langchain — Agentic Control Plane governance for LangChain / LangGraph.

Wrap tools with @governed. ACP decides allow/deny/redact on every call.

Usage:

    from langchain_core.tools import tool
    from langchain_openai import ChatOpenAI
    from langgraph.prebuilt import create_react_agent
    from fastapi import FastAPI, Header
    from acp_langchain import governed, set_context

    app = FastAPI()

    @tool
    @governed("web_search")       # ← governance
    def web_search(query: str) -> str:
        return my_search(query)

    @app.post("/run")
    def run(prompt: str, authorization: str = Header(...)):
        set_context(user_token=authorization.removeprefix("Bearer ").strip())
        agent = create_react_agent(ChatOpenAI(model="gpt-4o-mini"), tools=[web_search])
        return agent.invoke({"messages": [("user", prompt)]})

See acp_governance for the underlying protocol — acp-langchain is a thin
ergonomics layer over it.
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
    "post_tool_output",
    "pre_tool_use",
    "set_context",
]
