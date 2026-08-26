"""acp-pydantic-ai — Agentic Control Plane governance for Pydantic AI agents.

One registration governs every tool. ACPHooks() returns a Pydantic AI
`Hooks` capability whose `tool_execute` wrap hook runs ACP's pre/post
protocol around each tool call — allow / deny / redact — with zero
per-function decorators.

Usage:

    from fastapi import FastAPI, Header
    from pydantic_ai import Agent
    from acp_pydantic_ai import ACPHooks, configure, set_context

    configure(base_url="https://api.agenticcontrolplane.com")
    app = FastAPI()

    agent = Agent(
        "anthropic:claude-sonnet-4-6",
        instructions="You are an ACP-governed agent.",
        capabilities=[ACPHooks()],      # ← one line; every tool governed
    )

    @agent.tool_plain
    def lookup_record(id: str) -> str:
        '''Look up a record by ID.'''
        return db.lookup(id)            # your code, your credentials

    @app.post("/run")
    def run(prompt: str, authorization: str = Header(...)):
        set_context(user_token=authorization.removeprefix("Bearer ").strip())
        return {"result": agent.run_sync(prompt).output}

The v1-era decorator pattern (`@agent.tool_plain` over `@governed("name")`)
still works and is re-exported here for compatibility; ACPHooks is the
recommended path on pydantic-ai >= 2. Don't combine both on the same tool
or the call is checked (and audited) twice.
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

from ._hooks import ACPHooks

__version__ = "0.2.0"
__all__ = [
    "ACPHooks",
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
