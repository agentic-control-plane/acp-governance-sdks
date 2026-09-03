"""ACP for LangChain Deep Agents — govern the main agent AND every subagent.

Deep Agents (``pip install deepagents``) is a harness on top of LangChain
1.x ``create_agent``. It takes the same ``middleware=`` list, so
``ACPMiddleware()`` already governs the main agent's tools — filesystem
tools, skills reads, the ``task`` delegation call, and your own.

What it does NOT do is reach the subagents. ``create_deep_agent`` builds
each declarative subagent with its own middleware stack and does not
inherit the parent's user-supplied middleware (only ``mode="fork"``
subagents do). The auto-added ``general-purpose`` subagent inherits only
middleware whose name matches one of its default slots, which
``ACPMiddleware`` never does. Net effect: one governed ``task`` row in
Activity, then every tool call the subagent makes runs with no policy
check and no audit row.

This module closes that gap:

    from acp_langchain.deepagents import create_deep_agent

    agent = create_deep_agent(
        model="anthropic:claude-sonnet-4-6",
        tools=[lookup_record, send_email],
        subagents=[{"name": "researcher", "description": "...", "system_prompt": "..."}],
    )

Same signature as ``deepagents.create_deep_agent``. It appends
``ACPMiddleware()`` to the main agent, to every declarative subagent, and
supplies a governed ``general-purpose`` spec so the stock ungoverned one
is not added.

Already calling ``deepagents.create_deep_agent`` yourself? Wrap the
subagents list instead:

    from deepagents import create_deep_agent
    from acp_langchain import ACPMiddleware
    from acp_langchain.deepagents import govern_subagents

    agent = create_deep_agent(
        model=..., tools=[...],
        middleware=[ACPMiddleware()],
        subagents=govern_subagents(my_subagents),
    )

Compiled subagents (``runnable=``) and remote async subagents
(``graph_id=``) are built elsewhere; ACP cannot be injected into them
here. They are left untouched and a ``UserWarning`` names each one so
the gap is loud, not silent. Register ``ACPMiddleware`` on those graphs
where you build them.
"""
from __future__ import annotations

import warnings
from typing import Any, Iterable, Sequence

from ._middleware import ACPMiddleware

__all__ = ["create_deep_agent", "govern_subagents", "GENERAL_PURPOSE_NAME"]

GENERAL_PURPOSE_NAME = "general-purpose"


def _has_acp(middleware: Iterable[Any]) -> bool:
    return any(isinstance(m, ACPMiddleware) for m in middleware)


def _governed_general_purpose(acp: ACPMiddleware) -> dict[str, Any]:
    # Same name / description / prompt as the stock spec, so the model's
    # view of the `task` tool is unchanged. Model and tools are inherited
    # from the parent exactly as the stock general-purpose spec gets them.
    from deepagents.middleware.subagents import GENERAL_PURPOSE_SUBAGENT

    return {**GENERAL_PURPOSE_SUBAGENT, "middleware": [acp]}


def govern_subagents(
    subagents: Sequence[Any] | None,
    *,
    acp: ACPMiddleware | None = None,
    general_purpose: bool = True,
) -> list[Any]:
    """Return ``subagents`` with ``ACPMiddleware`` on every declarative spec.

    Args:
        subagents: the list you would pass to ``create_deep_agent``.
        acp: the middleware instance to inject (default ``ACPMiddleware()``;
            pass your own to scope with ``tools=`` / ``exclude=``).
        general_purpose: if no spec named ``general-purpose`` is present,
            add a governed one so Deep Agents does not add its stock,
            ungoverned one. Set False if you disable that subagent via a
            profile.

    Compiled (``runnable``) and remote (``graph_id``) subagents cannot be
    governed from here; they are passed through unchanged with a warning.
    """
    acp = acp or ACPMiddleware()
    out: list[Any] = []
    seen_gp = False
    for spec in subagents or []:
        if not isinstance(spec, dict) or "runnable" in spec or "graph_id" in spec:
            name = spec.get("name", "?") if isinstance(spec, dict) else getattr(spec, "name", "?")
            warnings.warn(
                f"acp-langchain: subagent {name!r} is compiled or remote; ACP "
                "cannot be injected here. Its tool calls are NOT governed "
                "unless ACPMiddleware is registered where that graph is built.",
                UserWarning,
                stacklevel=3,
            )
            out.append(spec)
            continue
        spec = dict(spec)
        if spec.get("name") == GENERAL_PURPOSE_NAME:
            seen_gp = True
        mw = list(spec.get("middleware") or [])
        if not _has_acp(mw):
            mw.append(acp)
        spec["middleware"] = mw
        out.append(spec)
    if general_purpose and not seen_gp:
        out.insert(0, _governed_general_purpose(acp))
    return out


def create_deep_agent(*args: Any, acp: ACPMiddleware | None = None, **kwargs: Any):
    """``deepagents.create_deep_agent`` with ACP on the main agent and every subagent.

    Accepts exactly the upstream arguments plus ``acp=`` (an
    ``ACPMiddleware`` instance to use instead of the default). Requires
    ``deepagents`` to be installed.
    """
    try:
        from deepagents import create_deep_agent as _upstream
    except ImportError as e:  # pragma: no cover
        raise ImportError(
            "acp_langchain.deepagents requires the deepagents package "
            "(pip install deepagents)."
        ) from e

    acp = acp or ACPMiddleware()
    middleware = list(kwargs.get("middleware") or [])
    if not _has_acp(middleware):
        middleware.append(acp)
    kwargs["middleware"] = middleware
    kwargs["subagents"] = govern_subagents(kwargs.get("subagents"), acp=acp)
    return _upstream(*args, **kwargs)
