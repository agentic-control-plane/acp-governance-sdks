"""The @governed decorator — wraps a tool function with ACP pre/post hooks."""
from __future__ import annotations

import functools
import inspect
from typing import Any, Callable, TypeVar, overload

from ._hook import post_tool_output, pre_tool_use

F = TypeVar("F", bound=Callable[..., Any])


@overload
def governed(fn: F) -> F: ...
@overload
def governed(name: str | None = None) -> Callable[[F], F]: ...


def governed(name_or_fn: Any = None) -> Any:
    """Wrap a tool function with ACP governance.

    Before the function runs, POST /govern/tool-use decides allow/deny.
    If denied, the wrapper returns "tool_error: <reason>" — the model
    sees this as a tool result and can adapt.

    After the function runs, POST /govern/tool-output is fired for audit
    and PII scanning. If the gateway returns action="redact", the redacted
    version replaces the tool's output; action="block" yields a tool_error.

    Fail-open: if the gateway is unreachable, the tool proceeds.

    Usage — bare:

        @governed
        def web_search(query: str) -> str: ...

    Usage — explicit tool name (recommended for CrewAI/LangChain where the
    decorator stacks under @tool("name")):

        @tool("web_search")
        @governed("web_search")
        def web_search(query: str) -> str: ...
    """
    if callable(name_or_fn):
        # @governed (bare, no parens)
        fn: Callable[..., Any] = name_or_fn
        return _wrap(fn, fn.__name__)

    # @governed("name") or @governed()
    explicit_name: str | None = name_or_fn

    def decorator(fn: Callable[..., Any]) -> Callable[..., Any]:
        return _wrap(fn, explicit_name or fn.__name__)

    return decorator


def _tool_input(args: tuple[Any, ...], kwargs: dict[str, Any]) -> Any:
    """Build the `tool_input` payload from the wrapped function's call.

    Prefer kwargs when present (matches how agent frameworks dispatch tools);
    fall back to a list of positional args, unwrapping single-arg case.
    """
    if kwargs:
        return kwargs
    if len(args) == 1:
        return args[0]
    if len(args) == 0:
        return {}
    return list(args)


def _wrap(fn: Callable[..., Any], tool_name: str) -> Callable[..., Any]:
    if inspect.iscoroutinefunction(fn):
        @functools.wraps(fn)
        async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
            tool_input = _tool_input(args, kwargs)
            allowed, reason = pre_tool_use(tool_name, tool_input)
            if not allowed:
                return f"tool_error: {reason or 'denied by ACP policy'}"
            result = await fn(*args, **kwargs)
            post = post_tool_output(tool_name, tool_input, result)
            if post and post.get("action") == "redact" and "modified_output" in post:
                return post["modified_output"]
            if post and post.get("action") == "block":
                return f"tool_error: {post.get('reason', 'output blocked by ACP policy')}"
            return result

        return async_wrapper

    @functools.wraps(fn)
    def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
        tool_input = _tool_input(args, kwargs)
        allowed, reason = pre_tool_use(tool_name, tool_input)
        if not allowed:
            return f"tool_error: {reason or 'denied by ACP policy'}"
        result = fn(*args, **kwargs)
        post = post_tool_output(tool_name, tool_input, result)
        if post and post.get("action") == "redact" and "modified_output" in post:
            return post["modified_output"]
        if post and post.get("action") == "block":
            return f"tool_error: {post.get('reason', 'output blocked by ACP policy')}"
        return result

    return sync_wrapper
