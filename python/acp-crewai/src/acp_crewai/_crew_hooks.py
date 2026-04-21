"""CrewAI-specific governance: capture inter-agent handoffs as audit events.

Tool-level governance is handled by @governed (from acp-governance). But
CrewAI has two delegation paths that don't cross a tool boundary:

  1. Sequential task handoffs — Task N's output feeds into Task N+1's
     context. Captured via `task_callback`.
  2. Hierarchical delegation — CrewAI's built-in "Delegate work to
     coworker" / "Ask question to coworker" tools route through an agent.
     Captured via `step_callback` by sniffing the tool name.

Both paths emit a synthetic `Agent.Handoff` tool-use event so the inter-
agent message is scanned for PII and recorded in the audit log alongside
real tool calls.
"""
from __future__ import annotations

from typing import Any

from acp_governance import post_tool_output, pre_tool_use


def _handoff(from_agent: str, to_agent: str | None, message: str) -> None:
    """Emit a synthetic Agent.Handoff event so an inter-agent message
    flows through the same PII scan + audit pipeline as tool I/O."""
    trimmed = message[:200_000]
    payload = {"from_agent": from_agent, "to_agent": to_agent, "message": trimmed}
    pre_tool_use("Agent.Handoff", payload)
    post_tool_output("Agent.Handoff", payload, trimmed)


def install_crew_hooks(crew: Any) -> None:
    """Attach ACP inter-agent message capture to a CrewAI Crew.

    Covers two delegation paths that don't cross a tool boundary:
      - sequential task handoffs (Task N output → Task N+1 context) via
        ``task_callback``
      - hierarchical delegation via CrewAI's built-in 'Delegate work to
        coworker' / 'Ask question to coworker' tools via ``step_callback``

    Existing callbacks on the crew are chained, not overwritten.
    """
    prev_task_cb = getattr(crew, "task_callback", None)
    prev_step_cb = getattr(crew, "step_callback", None)
    tasks = list(getattr(crew, "tasks", []) or [])

    def task_cb(output: Any) -> Any:
        try:
            from_role = (
                getattr(getattr(output, "agent", None), "role", None)
                or getattr(output, "agent", None)
                or "unknown"
            )
            desc = getattr(output, "description", None)
            to_role = None
            for i, t in enumerate(tasks):
                if getattr(t, "description", None) == desc and i + 1 < len(tasks):
                    to_role = getattr(getattr(tasks[i + 1], "agent", None), "role", None)
                    break
            message = getattr(output, "raw", None) or str(output)
            _handoff(str(from_role), to_role, str(message))
        except Exception:
            pass
        return prev_task_cb(output) if prev_task_cb else None

    def step_cb(step: Any) -> Any:
        try:
            tool = (getattr(step, "tool", "") or "").lower()
            if "coworker" in tool or "delegate" in tool:
                _handoff("manager", None, str(getattr(step, "tool_input", "")))
        except Exception:
            pass
        return prev_step_cb(step) if prev_step_cb else None

    crew.task_callback = task_cb
    crew.step_callback = step_cb
