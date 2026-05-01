"""Spawn a subagent with a scope-narrowed child API key.

This is the keystone helper for the agents-building-agents pattern: when
a parent agent (running with its own gsk_ token) wants to spawn a
subagent, it calls `spawn_subagent(...)` to mint a child key. ACP
intersects the parent's effective scopes with the agent profile's
scopes, propagates the originating human (`originSub`), enforces a
shorter TTL than the parent's, and persists the chain so audit logs
trace the full delegation back to the human.

The spawned subagent uses the child token for its own `/govern/tool-use`
calls. From the gateway's perspective, every tool call the subagent
makes carries the chain in audit emission — same code path as
in-process delegation.

Usage:

    from acp_governance import spawn_subagent, child_context

    parent_token = os.environ["ACP_TOKEN"]

    # Mint a child key bound to a saved agent profile in this tenant.
    # Profile must have `delegatable: true`. Scopes default to the
    # profile's own scopes intersected with the parent's; pass `scopes=`
    # to narrow further.
    child = spawn_subagent(
        parent_token=parent_token,
        profile_id="lead-research-bot",
        scopes=["github.repos.read"],
        ttl_seconds=600,
        reason="qualifying inbound lead xyz",
    )

    # Run the subagent with the child token bound as ACP context.
    with child_context(child):
        # Any @governed tool call here is governed by ACP under the
        # child key — chain links back to the human via originSub.
        run_my_subagent()
"""
from __future__ import annotations

import contextlib
from dataclasses import dataclass
from typing import Iterator

import requests

from ._config import get_config
from ._context import GovernanceContext, get_context, set_context


@dataclass
class ChildKey:
    """Result of `spawn_subagent`. The plaintext `api_key` is shown
    exactly once — store/use, do not persist beyond the subagent's
    lifetime. After expiry, the gateway rejects this key automatically."""

    api_key: str
    key_id: str
    expires_at: str
    effective_scopes: list[str]
    effective_tools: list[str]
    remaining_budget_cents: int
    chain: dict


class SpawnError(Exception):
    """Raised when /api/v1/keys/child returns a non-2xx response. The
    underlying status code and error body are attached to help callers
    distinguish "profile not delegatable" (a config issue the user
    should fix) from "delegation cycle" (an agent-logic bug)."""

    def __init__(self, status_code: int, body: dict) -> None:
        self.status_code = status_code
        self.body = body
        msg = body.get("error") or f"http {status_code}"
        super().__init__(msg)


def spawn_subagent(
    *,
    profile_id: str,
    parent_token: str | None = None,
    scopes: list[str] | None = None,
    max_budget_cents: int | None = None,
    ttl_seconds: int | None = None,
    reason: str | None = None,
) -> ChildKey:
    """Mint a scope-narrowed child API key bound to an agent profile.

    Calls `POST /api/v1/keys/child` on the configured gateway. The
    resulting key inherits the parent's `originSub` (audit trail back
    to the human), with `effectiveScopes = intersect(parent, profile,
    scopes)` and `remainingBudgetCents = min(parent.remaining,
    profile.maxBudgetCents, max_budget_cents)`.

    `parent_token` defaults to the currently-bound governance context's
    token, so SDK adapters that already call `set_context(...)` per
    request don't need to pass it explicitly.

    Raises `SpawnError` for any non-2xx response — callers should treat
    `403 profile_not_delegatable` and `409 delegation_cycle` as their
    own bugs to fix, not as transient errors to retry.
    """
    cfg = get_config()
    token = parent_token
    if token is None:
        ctx = get_context()
        if ctx is None:
            raise RuntimeError(
                "spawn_subagent called with no parent_token and no bound context — "
                "either pass parent_token=... or call set_context(user_token=...) first"
            )
        token = ctx.user_token

    body: dict = {"profileId": profile_id}
    if scopes is not None:
        body["scopes"] = scopes
    if max_budget_cents is not None:
        body["maxBudgetCents"] = max_budget_cents
    if ttl_seconds is not None:
        body["ttlSeconds"] = ttl_seconds
    if reason is not None:
        body["reason"] = reason

    r = requests.post(
        f"{cfg.base_url}/api/v1/keys/child",
        headers={
            "Authorization": f"Bearer {token}",
            "X-GS-Client": cfg.client_header,
            "Content-Type": "application/json",
        },
        json=body,
        timeout=cfg.timeout_s,
    )
    try:
        payload = r.json() if r.content else {}
    except ValueError:
        payload = {}

    if not r.ok:
        raise SpawnError(r.status_code, payload)

    return ChildKey(
        api_key=payload["apiKey"],
        key_id=payload["keyId"],
        expires_at=payload["expiresAt"],
        effective_scopes=payload.get("effectiveScopes", []),
        effective_tools=payload.get("effectiveTools", []),
        remaining_budget_cents=payload.get("remainingBudgetCents", 0),
        chain=payload.get("chain", {}),
    )


@contextlib.contextmanager
def child_context(
    child: ChildKey,
    *,
    session_id: str | None = None,
    agent_name: str | None = None,
) -> Iterator[GovernanceContext]:
    """Bind a child key as the active governance context for the body of
    a `with` block. On exit, restore whatever context was bound before
    (or clear it). Use this around the subagent's main loop so every
    `@governed` tool call inside is reported under the child token.

        child = spawn_subagent(profile_id="researcher")
        with child_context(child, agent_name="researcher"):
            run_subagent_loop()

    `agent_tier` defaults to "subagent" — the gateway uses tier to
    select per-tier policy and rate limits.
    """
    prior = get_context()
    bound = set_context(
        user_token=child.api_key,
        session_id=session_id,
        agent_tier="subagent",
        agent_name=agent_name,
    )
    try:
        yield bound
    finally:
        if prior is None:
            from ._context import clear_context
            clear_context()
        else:
            set_context(
                user_token=prior.user_token,
                session_id=prior.session_id,
                agent_tier=prior.agent_tier,
                agent_name=prior.agent_name,
            )
