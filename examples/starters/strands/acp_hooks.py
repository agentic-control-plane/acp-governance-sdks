"""ACPHookProvider — ACP policy + audit for Strands Agents, via native hooks.

One provider governs every tool registered on the agent. Register it once:

    agent = Agent(model=..., tools=[...], hooks=[ACPHookProvider()])

Wiring (verified against strands-agents 1.53.0):

- BeforeToolCallEvent → ACP /govern/tool-use. On deny we set
  `event.cancel_tool = "<reason>"`. Strands skips the tool function
  entirely and synthesizes a ToolResult with status="error" whose text is
  the reason — the model sees WHY it was blocked and adapts. This is the
  same cancel primitive AWS documents as "rules the LLM cannot bypass".

- AfterToolCallEvent → ACP /govern/tool-output. If policy answers
  action="redact" we replace `event.result` with the modified output; if
  "block", with "[ACP] Blocked: <reason>". `event.result` is one of the
  few writable fields on the (otherwise frozen) event dataclass.
"""

from __future__ import annotations

import json
from typing import Any

from strands.hooks import AfterToolCallEvent, BeforeToolCallEvent, HookProvider, HookRegistry

from acp_governance import post_tool_output, pre_tool_use


def _result_text(result: dict[str, Any]) -> str:
    """Flatten a Strands ToolResult content list to text for the audit scan."""
    parts: list[str] = []
    for block in result.get("content", []):
        if "text" in block:
            parts.append(block["text"])
        elif "json" in block:
            parts.append(json.dumps(block["json"]))
    return "\n".join(parts)


class ACPHookProvider(HookProvider):
    """Route every Strands tool call through ACP's pre/post hooks."""

    def register_hooks(self, registry: HookRegistry, **kwargs: Any) -> None:
        registry.add_callback(BeforeToolCallEvent, self._before_tool_call)
        registry.add_callback(AfterToolCallEvent, self._after_tool_call)

    def _before_tool_call(self, event: BeforeToolCallEvent) -> None:
        tool_name = event.tool_use["name"]
        allowed, reason = pre_tool_use(tool_name, event.tool_use.get("input") or {})
        if not allowed:
            # Strands cancels the call BEFORE the tool function runs and
            # returns this string to the model as an error ToolResult.
            event.cancel_tool = f"[ACP] Denied: {reason or 'blocked by workspace policy'}"

    def _after_tool_call(self, event: AfterToolCallEvent) -> None:
        if event.cancel_message is not None:
            return  # cancelled pre-execution — nothing ran, nothing to audit
        tool_name = event.tool_use["name"]
        verdict = post_tool_output(
            tool_name,
            event.tool_use.get("input") or {},
            _result_text(event.result),
        )
        if not verdict:
            return
        action = verdict.get("action")
        if action == "redact":
            event.result = {
                "toolUseId": event.result["toolUseId"],
                "status": "success",
                "content": [{"text": str(verdict.get("modified_output", ""))}],
            }
        elif action == "block":
            event.result = {
                "toolUseId": event.result["toolUseId"],
                "status": "error",
                "content": [{"text": f"[ACP] Blocked: {verdict.get('reason', 'output blocked by policy')}"}],
            }
