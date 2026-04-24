"""
ACP Starter — Google Agent Development Kit (ADK, Python)

The minimum code to wire ACP governance into a Google ADK agent. Copy
this folder, swap the placeholder tool for your real one, ship.

Governance pattern: decorator. `@governed("tool_name")` wraps each tool
function — ADK introspects the decorated function via `inspect.signature`
(following `__wrapped__` from `functools.wraps`), so signature + type
hints + docstring are preserved for schema building.

Run:  bash run.sh
"""

from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path

from dotenv import load_dotenv

from acp_governance import configure, governed, set_context
from google.adk.agents import Agent
from google.adk.runners import InMemoryRunner
from google.genai import types

# ── 1. Load ACP credentials from ./.env next to this file.
load_dotenv(Path(__file__).parent / ".env")
for v in ("GOOGLE_API_KEY", "ACP_USER_TOKEN"):
    if not os.environ.get(v):
        raise SystemExit(f"Missing {v} — copy .env.example → .env")

# Ensure ADK's direct-Gemini path is used unless Vertex is explicitly on.
os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "False")

# ── 2. Point the governance SDK at your ACP gateway. Once per process.
configure(
    base_url=os.environ.get("ACP_GATEWAY_URL", "https://api.agenticcontrolplane.com"),
    client_header="acp-google-adk-starter/0.1.0",
)


# ── 3. Your tool. `@governed` wraps the function with ACP's pre/post
# hooks. ADK registers it as a tool by introspecting the signature.
# REPLACE the body with your real logic (DB lookup, API call, etc.).
@governed("lookup_record")
def lookup_record(id: str) -> dict:
    """Look up a record by ID. Replace with your real tool description."""
    return {"id": id, "status": "placeholder", "note": "replace me"}


async def main() -> None:
    # ── 4. Bind identity for every governance call inside. Without this
    # set_context call, ACP pre/post hooks silently no-op.
    set_context(
        user_token=os.environ["ACP_USER_TOKEN"],
        agent_name="my-adk-agent",  # Rename for your agent.
        agent_tier="background",
    )

    # ── 5. Build the agent. `Agent` is an alias for `LlmAgent` in ADK.
    # Tools go in as plain Python callables; ADK builds the tool schema
    # from each callable's signature + docstring.
    agent = Agent(
        name="my_adk_agent",
        model="gemini-flash-latest",
        instruction="You are an ACP-governed agent. Use the tools available.",
        tools=[lookup_record],
    )

    # ── 6. Run via InMemoryRunner. ADK's single-shot requires a
    # session service + explicit user/session IDs — heavier than
    # CrewAI/LangGraph but that's the canonical pattern.
    runner = InMemoryRunner(agent=agent, app_name="acp-starter")
    await runner.session_service.create_session(
        app_name="acp-starter", user_id="starter-user", session_id="starter-session"
    )

    msg = types.Content(
        role="user",
        parts=[types.Part(text="Look up record id=abc-123 and tell me what you find.")],
    )
    async for event in runner.run_async(
        user_id="starter-user", session_id="starter-session", new_message=msg
    ):
        if event.is_final_response():
            print(event.content.parts[0].text)
            return


if __name__ == "__main__":
    asyncio.run(main())
