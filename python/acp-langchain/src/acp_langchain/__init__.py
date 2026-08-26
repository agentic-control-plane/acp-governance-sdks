"""acp-langchain — Agentic Control Plane policy & audit for LangChain / LangGraph.

One registration governs every tool. ACPMiddleware is a LangChain 1.x
AgentMiddleware whose tool-call wrap hooks run ACP's pre/post protocol
around each tool execution — allow / deny / redact — with zero
per-function decorators.

Usage:

    from fastapi import FastAPI, Header
    from langchain.agents import create_agent
    from langchain.tools import tool
    from acp_langchain import ACPMiddleware, configure, set_context

    configure(base_url="https://api.agenticcontrolplane.com")
    app = FastAPI()

    @tool
    def web_search(query: str) -> str:
        '''Search the web.'''
        return my_search(query)          # your code, your credentials

    agent = create_agent(
        model="openai:gpt-4o-mini",
        tools=[web_search],
        middleware=[ACPMiddleware()],    # ← one line; every tool governed
    )

    @app.post("/run")
    def run(prompt: str, authorization: str = Header(...)):
        set_context(user_token=authorization.removeprefix("Bearer ").strip())
        result = agent.invoke({"messages": [{"role": "user", "content": prompt}]})
        return {"result": result["messages"][-1].content}

The v0.1-era decorator pattern (`@tool` over `@governed("name")`) still
works on any LangChain version and is re-exported here for compatibility;
ACPMiddleware is the recommended path on langchain >= 1.3.3. Don't combine
both on the same tool, or the call is checked (and audited) twice.
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

__version__ = "0.2.0"
__all__ = [
    "ACPMiddleware",
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


def __getattr__(name: str):
    # Lazy import so the decorator API keeps working without langchain
    # installed (acp-langchain only hard-depends on acp-governance).
    if name == "ACPMiddleware":
        try:
            from ._middleware import ACPMiddleware
        except ImportError as e:  # pragma: no cover
            raise ImportError(
                "ACPMiddleware requires langchain >= 1.3.3 "
                "(pip install 'langchain>=1.3.3'). "
                "On older stacks use the @governed decorator instead."
            ) from e
        return ACPMiddleware
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
