"""
ACP Starter — OpenAI Agents SDK (Python)

The minimum code to wire ACP governance into an agent built with the OpenAI
Agents SDK. Copy this folder, swap the placeholder tool for your real one,
ship.

Governance pattern: native tool guardrails (openai-agents v0.14+).
`acp_input_guardrail` and `acp_output_guardrail` call ACP's pre/post hooks
and return `ToolGuardrailFunctionOutput.allow() | .reject_content(...)`.
Attached to each tool via `tool_input_guardrails=[...]` on `@function_tool`.

Run:  bash run.sh
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

from acp_governance import configure, post_tool_output, pre_tool_use, set_context
from agents import (
    Agent,
    Runner,
    ToolGuardrailFunctionOutput,
    ToolInputGuardrailData,
    ToolOutputGuardrailData,
    function_tool,
    set_tracing_disabled,
    tool_input_guardrail,
    tool_output_guardrail,
)

# ── 1. Load ACP credentials from ./.env next to this file.
load_dotenv(Path(__file__).parent / ".env")
for v in ("OPENAI_API_KEY", "ACP_USER_TOKEN"):
    if not os.environ.get(v):
        raise SystemExit(f"Missing {v} — copy .env.example → .env")

# ── 2. Point the governance SDK at your ACP gateway. Once per process.
configure(
    base_url=os.environ.get("ACP_GATEWAY_URL", "https://api.agenticcontrolplane.com"),
    client_header="openai-agents-py-starter/0.1.0",
)
set_tracing_disabled(True)


# ── 3. ACP governance expressed as SDK-native tool guardrails.
@tool_input_guardrail(name="acp_pre_tool_use")
def acp_input_guardrail(data: ToolInputGuardrailData) -> ToolGuardrailFunctionOutput:
    allowed, reason = pre_tool_use(data.context.tool_name, data.context.tool_arguments)
    if not allowed:
        return ToolGuardrailFunctionOutput.reject_content(
            message=f"tool_error: {reason or 'denied by ACP policy'}",
        )
    return ToolGuardrailFunctionOutput.allow()


@tool_output_guardrail(name="acp_post_tool_output")
def acp_output_guardrail(data: ToolOutputGuardrailData) -> ToolGuardrailFunctionOutput:
    result = post_tool_output(
        data.context.tool_name, data.context.tool_arguments, data.output
    )
    if result and result.get("action") == "redact" and "modified_output" in result:
        return ToolGuardrailFunctionOutput.reject_content(
            message=str(result["modified_output"]),
        )
    if result and result.get("action") == "block":
        return ToolGuardrailFunctionOutput.reject_content(
            message=f"tool_error: {result.get('reason', 'blocked by ACP policy')}",
        )
    return ToolGuardrailFunctionOutput.allow()


ACP_GUARDRAILS = {
    "tool_input_guardrails": [acp_input_guardrail],
    "tool_output_guardrails": [acp_output_guardrail],
}


# ── 4. Your tool. REPLACE the body with your real logic (DB lookup, API
# call, file read, etc.). Add more tools by defining more @function_tool
# functions and passing them in the Agent's `tools=[]` list.
@function_tool(**ACP_GUARDRAILS)
def lookup_record(id: str) -> dict:
    """Look up a record by ID. Replace with your real tool description.

    Args:
        id: The record ID to look up.
    """
    return {"id": id, "status": "placeholder", "note": "replace me with real logic"}


def main() -> None:
    # ── 5. Bind identity for every governance call inside this scope.
    # Without this, governance silently no-ops.
    set_context(
        user_token=os.environ["ACP_USER_TOKEN"],
        agent_name="my-agent",  # Rename for your agent.
        agent_tier="background",
    )

    agent = Agent(
        name="my-agent",
        instructions="You are an ACP-governed agent. Use the tools available.",
        model="gpt-4o-mini",
        tools=[lookup_record],
    )

    result = Runner.run_sync(
        agent,
        "Look up record id=abc-123 and tell me what you find.",
        max_turns=6,
    )
    print(result.final_output)


if __name__ == "__main__":
    main()
