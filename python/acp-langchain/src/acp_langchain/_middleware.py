"""ACPMiddleware — a LangChain 1.x AgentMiddleware that governs every tool call.

LangChain 1.0 made middleware the first-class seam around `create_agent`:
middleware can wrap model calls and tool execution. ACPMiddleware
implements the tool-execution wrap hooks (`wrap_tool_call` /
`awrap_tool_call`) so ACP's pre/post protocol surrounds every tool the
agent has — prebuilt, MCP-provided, or your own — with one registration:

  1. Pre-check  — POST /govern/tool-use with the tool call's args.
     Deny → the tool is NEVER executed; the hook short-circuits by
     returning a synthetic ToolMessage("tool_error: <reason>") without
     calling the handler, so the model receives the denial as the tool's
     result and can adapt.
  2. Allow → `handler(request)` executes the real tool.
  3. Post-audit — POST /govern/tool-output with the result.
     action="redact" → the redacted output replaces the original;
     action="block"  → the model sees "[ACP] Blocked: <reason>".

Wrap hooks nest like function calls (first middleware in the list is
outermost), so ACPMiddleware composes with LangChain's own middleware —
including HumanInTheLoopMiddleware, whose interrupt runs in `after_model`,
i.e. before any wrap_tool_call fires: a human approval still passes
through the ACP check on execution.

Blocking HTTP note: the governance calls use `requests` (sync). The sync
hook calls them inline; the async hook pushes them to a worker thread via
`asyncio.to_thread`, which copies the current `contextvars` context — the
identity bound by `set_context(...)` is visible inside.
"""
from __future__ import annotations

import asyncio
from typing import Any, Awaitable, Callable, Iterable

from langchain.agents.middleware import AgentMiddleware
from langchain.messages import ToolMessage
from langchain.tools.tool_node import ToolCallRequest
from langgraph.types import Command

from acp_governance import post_tool_output, pre_tool_use

__all__ = ["ACPMiddleware"]


class ACPMiddleware(AgentMiddleware):
    """Route every tool call of a LangChain 1.x agent through ACP.

    Register it once on the agent — no per-tool decorators:

        from langchain.agents import create_agent
        from acp_langchain import ACPMiddleware, configure, set_context

        configure(base_url="https://api.agenticcontrolplane.com")
        agent = create_agent(
            model="openai:gpt-4o-mini",
            tools=[lookup_record, send_email],
            middleware=[ACPMiddleware()],
        )

    Args:
        tools:   if given, only these tool names are governed.
        exclude: tool names to pass through ungoverned.

    Requires langchain >= 1.3.3 (`create_agent` middleware with tool-call
    wrap hooks). On older stacks use the `@governed` decorator instead.
    """

    def __init__(
        self,
        *,
        tools: Iterable[str] | None = None,
        exclude: Iterable[str] | None = None,
    ) -> None:
        super().__init__()
        self._include = frozenset(tools) if tools is not None else None
        self._exclude = frozenset(exclude) if exclude is not None else frozenset()

    # ── shared pieces ────────────────────────────────────────────────

    def _skip(self, tool_name: str) -> bool:
        return (self._include is not None and tool_name not in self._include) or (
            tool_name in self._exclude
        )

    @staticmethod
    def _denial(request: ToolCallRequest, reason: str) -> ToolMessage:
        """Synthetic tool result for a denial — the tool never ran."""
        return ToolMessage(
            content=f"tool_error: {reason or 'denied by ACP policy'}",
            tool_call_id=request.tool_call["id"],
            name=request.tool_call["name"],
            status="error",
        )

    @staticmethod
    def _apply_post(result: ToolMessage | Command, post: dict[str, Any] | None):
        if not isinstance(result, ToolMessage) or not post:
            return result
        action = post.get("action")
        if action == "redact" and "modified_output" in post:
            return result.model_copy(update={"content": post["modified_output"]})
        if action == "block":
            reason = post.get("reason", "output blocked by ACP policy")
            return result.model_copy(
                update={"content": f"[ACP] Blocked: {reason}", "status": "error"}
            )
        return result

    # ── sync hook ────────────────────────────────────────────────────

    def wrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[[ToolCallRequest], ToolMessage | Command],
    ) -> ToolMessage | Command:
        tool_name = request.tool_call["name"]
        if self._skip(tool_name):
            return handler(request)
        tool_input = request.tool_call.get("args") or {}

        allowed, reason = pre_tool_use(tool_name, tool_input)
        if not allowed:
            return self._denial(request, reason)

        result = handler(request)

        output = result.content if isinstance(result, ToolMessage) else None
        if output is not None:
            post = post_tool_output(tool_name, tool_input, output)
            result = self._apply_post(result, post)
        return result

    # ── async hook (agent.ainvoke / astream) ─────────────────────────

    async def awrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[[ToolCallRequest], Awaitable[ToolMessage | Command]],
    ) -> ToolMessage | Command:
        tool_name = request.tool_call["name"]
        if self._skip(tool_name):
            return await handler(request)
        tool_input = request.tool_call.get("args") or {}

        # requests is sync → worker thread (asyncio.to_thread copies
        # contextvars, so set_context is visible).
        allowed, reason = await asyncio.to_thread(pre_tool_use, tool_name, tool_input)
        if not allowed:
            return self._denial(request, reason)

        result = await handler(request)

        output = result.content if isinstance(result, ToolMessage) else None
        if output is not None:
            post = await asyncio.to_thread(post_tool_output, tool_name, tool_input, output)
            result = self._apply_post(result, post)
        return result
