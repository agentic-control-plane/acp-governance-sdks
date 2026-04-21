"""Async-aware context binding for the current request's user identity."""
from __future__ import annotations

import uuid
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Literal

Tier = Literal["interactive", "subagent", "background", "api"]


@dataclass
class GovernanceContext:
    user_token: str
    session_id: str
    agent_tier: Tier | None = None
    agent_name: str | None = None


_ctx: ContextVar[GovernanceContext | None] = ContextVar("_acp_ctx", default=None)


def set_context(
    user_token: str,
    *,
    session_id: str | None = None,
    agent_tier: Tier | None = None,
    agent_name: str | None = None,
) -> GovernanceContext:
    """Bind the current user's JWT to this request's async context.

    Call once per inbound request (typically in a FastAPI dependency or
    middleware) before the agent runs. Every `@governed` tool call inside
    this scope will carry the bound identity to ACP.

    Returns the bound context (so you can grab the auto-generated session_id).
    """
    ctx = GovernanceContext(
        user_token=user_token,
        session_id=session_id or str(uuid.uuid4()),
        agent_tier=agent_tier,
        agent_name=agent_name,
    )
    _ctx.set(ctx)
    return ctx


def get_context() -> GovernanceContext | None:
    """Return the currently bound context, or None if none has been set."""
    return _ctx.get()


def clear_context() -> None:
    """Clear the context for this async scope. Useful at the end of a
    request handler to avoid token leakage across unrelated flows."""
    _ctx.set(None)
