"""HTTP client for /govern/tool-use and /govern/tool-output.

Matches the Claude Code hook protocol. Fails open on network errors.
"""
from __future__ import annotations

from typing import Any

import requests

from ._config import get_config
from ._context import get_context


def _post(path: str, body: dict[str, Any]) -> dict[str, Any] | None:
    ctx = get_context()
    if ctx is None:
        return None
    cfg = get_config()
    enriched = {**body, "session_id": ctx.session_id}
    if ctx.agent_tier:
        enriched["agent_tier"] = ctx.agent_tier
    if ctx.agent_name:
        enriched["agent_name"] = ctx.agent_name
    try:
        r = requests.post(
            f"{cfg.base_url}{path}",
            headers={
                "Authorization": f"Bearer {ctx.user_token}",
                "X-GS-Client": cfg.client_header,
            },
            json=enriched,
            timeout=cfg.timeout_s,
        )
        if r.ok:
            return r.json()
    except requests.RequestException:
        pass
    return None


def pre_tool_use(tool_name: str, tool_input: Any) -> tuple[bool, str]:
    """Ask ACP whether a tool call should proceed.

    Returns (allowed, reason). Fails open: returns (True, "fail-open") if
    the gateway is unreachable.
    """
    body = _post("/govern/tool-use", {
        "tool_name": tool_name,
        "tool_input": tool_input,
        "hook_event_name": "PreToolUse",
    })
    if body is None:
        return True, "fail-open"
    decision = body.get("decision", "allow")
    reason = body.get("reason", "") or ""
    return decision == "allow", reason


def post_tool_output(
    tool_name: str,
    tool_input: Any,
    tool_output: Any,
) -> dict[str, Any] | None:
    """Report the result of a tool call to ACP for audit + PII scan.

    Returns the gateway response (possibly containing action="redact" or
    "block" plus modified_output / reason). Returns None on network error.
    """
    out: Any
    if isinstance(tool_output, str):
        out = tool_output[:200_000]
    else:
        out = tool_output
    return _post("/govern/tool-output", {
        "tool_name": tool_name,
        "tool_input": tool_input,
        "tool_output": out,
        "hook_event_name": "PostToolUse",
    })
