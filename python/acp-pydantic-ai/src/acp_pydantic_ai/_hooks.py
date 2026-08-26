"""ACPHooks — a Pydantic AI Hooks capability that governs every tool call.

Pydantic AI v2 ships a first-class `Hooks` capability (registered via
`Agent(..., capabilities=[hooks])`). ACPHooks() builds one with a single
`tool_execute` wrap hook (`wrap_tool_execute` in AbstractCapability terms)
that surrounds every tool execution with ACP's pre/post protocol:

  1. Pre-check  — POST /govern/tool-use with the validated tool args.
     Deny → the tool function is NEVER called; the wrap hook returns
     "tool_error: <reason>" without invoking the handler, so the model
     receives the denial as the tool's result and can adapt.
  2. Allow → `await handler(args)` runs the real tool.
  3. Post-audit — POST /govern/tool-output with the result.
     action="redact" → the redacted output replaces the original;
     action="block"  → the model sees "[ACP] Blocked: <reason>".

Why the wrap hook (and not before_tool_execute + after_tool_execute):
`before_tool_execute` must return ValidatedToolArgs — the sanctioned way
to abort from there is raising SkipToolExecution(result), which works,
but a single wrap hook keeps pre-check, execution, and post-audit in one
frame (one place to reason about, one place to time). Both shapes are
supported by Pydantic AI; we use the wrap.

Blocking HTTP note: the governance calls use `requests` (sync). The hook
is async, so they are pushed to a worker thread via `asyncio.to_thread`,
which copies the current `contextvars` context — the identity bound by
`set_context(...)` is visible inside.
"""
from __future__ import annotations

import asyncio
from typing import Any, Iterable

from pydantic_ai.capabilities import Hooks

from acp_governance import post_tool_output, pre_tool_use


def ACPHooks(
    *,
    tools: Iterable[str] | None = None,
    exclude: Iterable[str] | None = None,
) -> Hooks:
    """Build a Pydantic AI `Hooks` capability that routes every tool
    execution through ACP.

    Register it once on the agent — no per-tool decorators:

        from pydantic_ai import Agent
        from acp_pydantic_ai import ACPHooks, configure, set_context

        configure(base_url="https://api.agenticcontrolplane.com")
        agent = Agent("anthropic:claude-sonnet-4-6", capabilities=[ACPHooks()])

        @agent.tool_plain
        def lookup_record(id: str) -> str: ...   # governed automatically

    Args:
        tools:   if given, only these tool names are governed.
        exclude: tool names to pass through ungoverned.

    Returns a `Hooks` instance — pass it in `Agent(capabilities=[...])`
    or `agent.run(..., capabilities=[...])`. It composes with your other
    capabilities and hooks; ACP does not replace them.
    """
    include_set = frozenset(tools) if tools is not None else None
    exclude_set = frozenset(exclude) if exclude is not None else frozenset()

    async def _acp_tool_execute(
        ctx: Any, *, call: Any, tool_def: Any, args: Any, handler: Any
    ) -> Any:
        tool_name = getattr(tool_def, "name", None) or call.tool_name
        if (include_set is not None and tool_name not in include_set) or (
            tool_name in exclude_set
        ):
            return await handler(args)

        tool_input = dict(args) if isinstance(args, dict) else args

        # Pre-check: deny → the real tool never runs; the model sees the
        # denial as the tool result. requests is sync → worker thread
        # (asyncio.to_thread copies contextvars, so set_context is visible).
        allowed, reason = await asyncio.to_thread(pre_tool_use, tool_name, tool_input)
        if not allowed:
            return f"tool_error: {reason or 'denied by ACP policy'}"

        result = await handler(args)

        post = await asyncio.to_thread(post_tool_output, tool_name, tool_input, result)
        if post and post.get("action") == "redact" and "modified_output" in post:
            return post["modified_output"]
        if post and post.get("action") == "block":
            return f"[ACP] Blocked: {post.get('reason', 'output blocked by ACP policy')}"
        return result

    return Hooks(tool_execute=_acp_tool_execute, id="acp-governance")
