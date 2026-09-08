"""HTTP client for /govern/tool-use and /govern/tool-output.

Matches the Claude Code hook protocol. Fails open on network errors — and
fails open LOUDLY (#6): an ungoverned call is announced once per cause per
process, names the cause, and leaves a local lapse line, so a missing token
or a dead gateway can never look like a healthy allow.
"""
from __future__ import annotations

import logging
import os
import threading
import warnings
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

from ._config import get_config
from ._context import get_context

log = logging.getLogger("acp_governance")


class UngovernedWarning(RuntimeWarning):
    """A @governed call ran WITHOUT a governance decision from ACP.

    Raised (as a warning, never an exception) the first time each cause is
    seen in a process:

      not-configured  — no context bound; call set_context(user_token=...)
      unreachable     — the gateway could not be reached (network / timeout)
      gateway-error   — the gateway answered without a decision (5xx, 401…)

    Fail-open is deliberate: governance must never be the single point of
    failure for an agent. Fail-open *silently* is the failure mode this SDK
    exists to eliminate, so the silence is what changed.
    """


# ── Lapse ledger ───────────────────────────────────────────────────────
#
# One line per ungoverned call, appended to ~/.acp/lapse.log (ACP_LAPSE_LOG
# overrides; "off" disables) — the same file the Claude Code hook writes on
# an interactive fail-open, so an operator reading it sees every ungoverned
# call on the machine in one place, whichever client let it through.
# Best-effort: a ledger failure must never touch the call path.

_LAPSE_LOG_ENV = "ACP_LAPSE_LOG"


def _lapse_log_path() -> Path | None:
    override = os.environ.get(_LAPSE_LOG_ENV)
    if override is not None:
        if override.strip().lower() in ("off", "0", "false", ""):
            return None
        return Path(override).expanduser()
    return Path.home() / ".acp" / "lapse.log"


def _record_lapse(cause: str, tool_name: str, detail: str) -> None:
    path = _lapse_log_path()
    if path is None:
        return
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
        with path.open("a", encoding="utf-8") as f:
            f.write(f"{stamp} UNGOVERNED acp-governance-py {cause} tool={tool_name} {detail}\n")
    except OSError:
        pass


# ── Once-per-cause warning ─────────────────────────────────────────────

_warned: set[str] = set()
_warned_lock = threading.Lock()


def _warn_once(cause: str, message: str) -> None:
    with _warned_lock:
        if cause in _warned:
            return
        _warned.add(cause)
    log.warning(message)
    warnings.warn(message, UngovernedWarning, stacklevel=4)


def _reset_warnings_for_tests() -> None:
    with _warned_lock:
        _warned.clear()


# ── Transport ──────────────────────────────────────────────────────────


@dataclass
class _Outcome:
    """What the gateway said, or why it did not."""

    body: dict[str, Any] | None
    #: None when `body` is a real answer; otherwise the cause of the lapse.
    cause: str | None = None
    detail: str = ""


def _post(path: str, body: dict[str, Any]) -> _Outcome:
    ctx = get_context()
    if ctx is None:
        return _Outcome(None, "not-configured", "no governance context bound in this scope")
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
    except requests.RequestException as e:
        return _Outcome(None, "unreachable", f"{type(e).__name__} against {cfg.base_url}")
    data: Any = None
    try:
        data = r.json()
    except ValueError:
        data = None
    if r.ok and isinstance(data, dict):
        return _Outcome(data)
    # A 4xx that carries a decision IS the verdict, not an outage: the
    # gateway answers rate-limit denies (429) and invalid-tool denies (400)
    # with {decision, reason}. Treating those as fail-open would let exactly
    # the calls the gateway refused run.
    if isinstance(data, dict) and data.get("decision") in ("deny", "ask"):
        return _Outcome(data)
    return _Outcome(None, "gateway-error", f"HTTP {r.status_code} from {cfg.base_url}{path}")


_HOW_TO_FIX = {
    "not-configured": "bind an identity with set_context(user_token=...) before the agent runs",
    "unreachable": "check ACP_BASE_URL / network; the gateway did not answer",
    "gateway-error": "the gateway answered without a decision; check the token and the gateway status",
}


def _lapse(outcome: _Outcome, tool_name: str) -> str:
    cause = outcome.cause or "unknown"
    fix = _HOW_TO_FIX.get(cause, "")
    message = (
        f"[ACP] UNGOVERNED: {tool_name} ran without a governance decision "
        f"({cause}: {outcome.detail}). Fail-open by design — {fix}. "
        f"Every further ungoverned call is recorded in {_lapse_log_path() or 'no lapse log (disabled)'}; "
        f"this warning is shown once per cause."
    )
    _warn_once(cause, message)
    _record_lapse(cause, tool_name, outcome.detail)
    return f"fail-open ({cause}): {outcome.detail}"


def pre_tool_use(tool_name: str, tool_input: Any) -> tuple[bool, str]:
    """Ask ACP whether a tool call should proceed.

    Returns (allowed, reason). Fails open: returns (True, "fail-open (<cause>): …")
    when no decision could be obtained — and says so, once per cause, via
    warnings + logging, with a line in the lapse log for every such call.
    """
    outcome = _post("/govern/tool-use", {
        "tool_name": tool_name,
        "tool_input": tool_input,
        "hook_event_name": "PreToolUse",
    })
    if outcome.body is None:
        return True, _lapse(outcome, tool_name)
    decision = outcome.body.get("decision", "allow")
    reason = outcome.body.get("reason", "") or ""
    return decision == "allow", reason


def post_tool_output(
    tool_name: str,
    tool_input: Any,
    tool_output: Any,
) -> dict[str, Any] | None:
    """Report the result of a tool call to ACP for audit + PII scan.

    Returns the gateway response (possibly containing action="redact" or
    "block" plus modified_output / reason). Returns None when no answer
    could be obtained — the pre-call already announced the lapse, so this
    side stays quiet.
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
    }).body
