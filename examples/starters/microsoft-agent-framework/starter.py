"""
ACP Starter — Microsoft Agent Framework (Python)

The minimum code to wire ACP governance into a Microsoft Agent Framework
(MAF) agent. Copy this folder, swap the placeholder tools for your real
ones, ship.

Governance pattern: FUNCTION MIDDLEWARE. MAF has three middleware scopes
(agent run, chat, function); ACP plugs into the function scope, so ONE
middleware instance passed to `Agent(middleware=...)` governs EVERY tool
call — no per-tool decoration required. Denials set the tool result to a
tool_error string that MAF delivers to the model as tool output; the
model sees the denial and adapts.

Run:  bash run.sh
"""

from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
from typing import Any, Awaitable, Callable

from dotenv import load_dotenv
from pydantic import BaseModel

from acp_governance import configure, post_tool_output, pre_tool_use, set_context
from agent_framework import Agent, FunctionInvocationContext, FunctionMiddleware

# ── 1. Load ACP credentials from ./.env next to this file.
load_dotenv(Path(__file__).parent / ".env")


# ── 2. The seam: one FunctionMiddleware governs every tool the agent
# owns. MAF calls `process()` around each function invocation; the ACP
# pre-hook runs before `call_next()` (deny → the real function is never
# invoked), the post-hook runs after (redact/block rewrites the output).
class ACPFunctionMiddleware(FunctionMiddleware):
    """Route every MAF function/tool call through ACP's pre/post hooks."""

    async def process(
        self,
        context: FunctionInvocationContext,
        call_next: Callable[[], Awaitable[None]],
    ) -> None:
        tool_name = context.function.name
        args = context.arguments
        tool_input: dict[str, Any] = (
            args.model_dump() if isinstance(args, BaseModel) else dict(args or {})
        )

        # Pre-hook: allow/deny before the function runs.
        allowed, reason = pre_tool_use(tool_name, tool_input)
        if not allowed:
            # Do NOT call call_next(): the tool function never executes.
            # Setting context.result overrides the invocation; MAF returns
            # it to the model as the tool's output, so the model can adapt.
            context.result = f"tool_error: {reason or 'denied by policy'}"
            return

        await call_next()

        # Post-hook: audit + PII scan on the real output.
        output = context.result
        serialized = output if isinstance(output, str) else json.dumps(output, default=str)
        verdict = post_tool_output(tool_name, tool_input, serialized)
        if verdict:
            action = verdict.get("action")
            if action == "redact":
                context.result = verdict.get("modified_output", "[ACP] Redacted")
            elif action == "block":
                context.result = f"[ACP] Blocked: {verdict.get('reason', 'policy')}"


# ── 3. Your tools. Plain Python functions — MAF derives each tool's
# schema and description from the signature, type hints, and docstring.
# No ACP decoration needed: the middleware above covers all of them.
# REPLACE the bodies with your real logic (DB lookup, API call, etc.).
def lookup_record(id: str) -> str:
    """Look up a record by ID. Replace with your real tool description."""
    return json.dumps({"id": id, "status": "placeholder", "note": "replace me"})


def send_email(to: str, subject: str, body: str) -> str:
    """Send an email. Replace with your real mailer."""
    return f"queued email to {to!r} subject={subject!r} ({len(body)} chars)"


async def main() -> None:
    for v in ("ANTHROPIC_API_KEY", "ACP_USER_TOKEN"):
        if not os.environ.get(v):
            raise SystemExit(f"Missing {v} — copy .env.example → .env")

    # ── 4. Point the governance SDK at your ACP gateway. Once per process.
    configure(
        base_url=os.environ.get("ACP_GATEWAY_URL", "https://api.agenticcontrolplane.com"),
        client_header="acp-maf-starter/0.1.0",
    )

    # ── 5. Bind identity for every governance call inside. Without this
    # set_context call, ACP pre/post hooks silently no-op.
    set_context(
        user_token=os.environ["ACP_USER_TOKEN"],
        agent_name="my-maf-agent",  # Rename for your agent.
        agent_tier="background",
    )

    # ── 6. Build the agent. Swap AnthropicClient for any MAF chat client
    # (agent_framework.openai.OpenAIChatClient, agent_framework.azure, ...)
    # — the middleware is client-agnostic.
    from agent_framework.anthropic import AnthropicClient

    agent = Agent(
        client=AnthropicClient(model_id="claude-sonnet-4-6"),
        instructions="You are an ACP-governed agent. Use the tools available.",
        name="my-maf-agent",
        tools=[lookup_record, send_email],
        middleware=ACPFunctionMiddleware(),
    )

    response = await agent.run("Look up record id=abc-123 and tell me what you find.")
    print(response.text)


if __name__ == "__main__":
    asyncio.run(main())
