"""Keyless verification driver for the MAF + ACP starter.

Proves the middleware seam WITHOUT any LLM call: a scripted chat client
fakes the model side by emitting function calls, so MAF's real
function-invocation pipeline (tool dispatch + middleware chain) runs
exactly as it would in production.

Run against the stub gateway:

    GW_PORT=8933 node ../../../rig/stub-gateway.mjs &   # from repo scratch rig
    .venv/bin/python verify.py

Checks:
  (a) allowed tool call executes; gateway logs tool-use allow + tool-output
  (b) input containing "should-be-denied" is blocked BEFORE the tool body
      runs (side-effect marker proves non-execution) and the tool_error
      string surfaces in the conversation where the model would see it
"""

from __future__ import annotations

import asyncio
import json
import sys
from collections.abc import Mapping, Sequence
from typing import Any

from acp_governance import configure, set_context
from agent_framework import (
    Agent,
    BaseChatClient,
    ChatResponse,
    Content,
    FunctionInvocationLayer,
    Message,
)

from starter import ACPFunctionMiddleware

EXECUTED: list[str] = []  # side-effect marker: which tool bodies actually ran


def lookup_record(id: str) -> str:
    """Look up a record by ID."""
    EXECUTED.append(f"lookup_record:{id}")
    return json.dumps({"id": id, "status": "found"})


class ScriptedChatClient(FunctionInvocationLayer, BaseChatClient):
    """Fake model: replays a fixed sequence of function calls, then stops.

    FunctionInvocationLayer is the mixin that gives a chat client the
    function-calling loop (tool dispatch + function middleware pipeline);
    without it, MAF warns that the client "does not support function
    invoking" and tools never run.
    """

    def __init__(self, calls: list[tuple[str, dict[str, Any]]]) -> None:
        super().__init__()
        self._queue = list(calls)
        self._n = 0

    async def _inner_get_response(
        self, *, messages: Sequence[Message], stream: bool, options: Mapping[str, Any], **kwargs: Any
    ) -> ChatResponse:
        assert not stream
        if self._queue:
            name, args = self._queue.pop(0)
            self._n += 1
            call = Content.from_function_call(
                call_id=f"call_{self._n}", name=name, arguments=args
            )
            return ChatResponse(
                messages=Message(role="assistant", contents=[call]),
                finish_reason="tool_calls",
            )
        return ChatResponse(
            messages=Message(role="assistant", contents=[Content.from_text("done")]),
            finish_reason="stop",
        )


async def main() -> None:
    configure(base_url="http://127.0.0.1:8933", client_header="acp-maf-verify/0.1.0")
    set_context(user_token="stub", agent_name="maf-verify", agent_tier="background")

    agent = Agent(
        client=ScriptedChatClient(
            [
                ("lookup_record", {"id": "abc-123"}),           # → allow
                ("lookup_record", {"id": "should-be-denied"}),  # → deny
            ]
        ),
        instructions="verification driver",
        name="maf-verify",
        tools=[lookup_record],
        middleware=ACPFunctionMiddleware(),
    )

    response = await agent.run("go")

    # Collect every function_result the model-side would see.
    results: list[tuple[str, str]] = []
    for msg in response.messages:
        for content in msg.contents:
            if content.type == "function_result":
                results.append((content.call_id or "?", str(content.result)))

    print("tool results seen by the model:")
    for call_id, res in results:
        print(f"  {call_id}: {res}")
    print(f"tool bodies that actually executed: {EXECUTED}")

    ok = True

    allowed = [r for cid, r in results if cid == "call_1"]
    if not (allowed and '"status": "found"' in allowed[0]):
        print("FAIL: allowed call did not return real output")
        ok = False

    denied = [r for cid, r in results if cid == "call_2"]
    if not (denied and denied[0].startswith("tool_error:")):
        print("FAIL: denied call did not surface tool_error to the model")
        ok = False

    if EXECUTED != ["lookup_record:abc-123"]:
        print("FAIL: side-effect marker shows wrong execution set")
        ok = False

    print("VERIFY " + ("PASS" if ok else "FAIL"))
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    asyncio.run(main())
