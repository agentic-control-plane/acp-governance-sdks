"""acp-governance — thin Python SDK for the ACP governance hook protocol.

Wraps the two endpoints ACP exposes for agent tool calls:

    POST /govern/tool-use     — pre-tool check (allow/deny/ask)
    POST /govern/tool-output  — post-tool audit + PII scan

Usage:

    from acp_governance import governed, set_context

    @governed("web_search")
    def web_search(query: str) -> str:
        return my_search(query)  # your code, your credentials

    @app.post("/run")
    def run(req, authorization: str = Header(...)):
        token = authorization.removeprefix("Bearer ").strip()
        set_context(user_token=token)
        # every @governed call in this request is now governed by ACP
        ...

Both planes in one call — governance for what the agent *does*, the ACP
proxy for what it *spends*:

    import acp_governance as acp

    acp.init()               # call before constructing any model client
    client = Anthropic()     # now priced and metered by ACP

Framework adapters with the same API:

    acp-crewai       — CrewAI
    acp-langchain    — LangChain / LangGraph
"""
from ._config import Config, configure, get_config
from ._context import GovernanceContext, clear_context, get_context, set_context
from ._governed import governed
from ._hook import post_tool_output, pre_tool_use
from ._model import (
    ModelConfigError,
    api_key,
    init,
    model_base_url,
    model_client_kwargs,
)
from ._spawn import ChildKey, SpawnError, child_context, spawn_subagent

__version__ = "0.1.0"
__all__ = [
    "ChildKey",
    "Config",
    "GovernanceContext",
    "ModelConfigError",
    "SpawnError",
    "__version__",
    "api_key",
    "child_context",
    "clear_context",
    "configure",
    "get_config",
    "get_context",
    "governed",
    "init",
    "model_base_url",
    "model_client_kwargs",
    "post_tool_output",
    "pre_tool_use",
    "set_context",
    "spawn_subagent",
]
