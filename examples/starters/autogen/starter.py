"""
ACP Starter — AutoGen (Python, v0.7+)

The minimum code to wire ACP governance into a Microsoft AutoGen agent.
Copy this folder, swap the placeholder tool for your real one, ship.

Governance pattern: decorator. `@governed("tool_name")` wraps each tool
function — AutoGen introspects the decorated function via `inspect.signature`
(following `__wrapped__` set by `functools.wraps`), so signature + type
hints + docstring are preserved for schema building. Denials return a
tool_error string that AutoGen delivers to the agent as tool output.

Run:  bash run.sh
"""

from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path

from dotenv import load_dotenv

from acp_governance import configure, governed, set_context
from autogen_agentchat.agents import AssistantAgent
from autogen_ext.models.openai import OpenAIChatCompletionClient

# ── 1. Load ACP credentials from ./.env next to this file.
load_dotenv(Path(__file__).parent / ".env")
for v in ("OPENAI_API_KEY", "ACP_USER_TOKEN"):
    if not os.environ.get(v):
        raise SystemExit(f"Missing {v} — copy .env.example → .env")

# ── 2. Point the governance SDK at your ACP gateway. Once per process.
configure(
    base_url=os.environ.get("ACP_GATEWAY_URL", "https://api.agenticcontrolplane.com"),
    client_header="acp-autogen-starter/0.1.0",
)


# ── 3. Your tool. `@governed` wraps the function with ACP's pre/post
# hooks. AutoGen's signature introspection sees the wrapped callable.
# REPLACE the body with your real logic (DB lookup, API call, etc.).
@governed("lookup_record")
async def lookup_record(id: str) -> str:
    """Look up a record by ID. Replace with your real tool description."""
    return json.dumps({"id": id, "status": "placeholder", "note": "replace me"})


async def main() -> None:
    # ── 4. Bind identity for every governance call inside. Without this
    # set_context call, ACP pre/post hooks silently no-op.
    set_context(
        user_token=os.environ["ACP_USER_TOKEN"],
        agent_name="my-autogen-agent",  # Rename for your agent.
        agent_tier="background",
    )

    # ── 5. Build the agent. AutoGen v0.7+ pattern: a ChatCompletion
    # client + an AssistantAgent with tools as plain Python callables.
    model_client = OpenAIChatCompletionClient(model="gpt-4o-mini")
    agent = AssistantAgent(
        name="my_autogen_agent",
        model_client=model_client,
        tools=[lookup_record],
        system_message="You are an ACP-governed agent. Use the tools available.",
    )

    try:
        result = await agent.run(task="Look up record id=abc-123 and tell me what you find.")
        print(result.messages[-1].content)
    finally:
        await model_client.close()


if __name__ == "__main__":
    asyncio.run(main())
