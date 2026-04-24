"""
ACP Starter — LangGraph (Python)

The minimum code to wire ACP governance into a LangGraph agent. Copy this
folder, swap the placeholder tool for your real one, ship.

Governance pattern: decorator. `@governed("tool_name")` is stacked under
LangChain's `@tool`, so every tool call flows through ACP's pre/post hooks.
Denials return a tool_error string that the agent sees as tool output and
adapts to.

Run:  bash run.sh
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from dotenv import load_dotenv

from acp_langchain import configure, governed, set_context
from langchain.agents import create_agent
from langchain.tools import tool

# ── 1. Load ACP credentials from ./.env next to this file.
load_dotenv(Path(__file__).parent / ".env")
for v in ("OPENAI_API_KEY", "ACP_USER_TOKEN"):
    if not os.environ.get(v):
        raise SystemExit(f"Missing {v} — copy .env.example → .env")

# ── 2. Point the governance SDK at your ACP gateway. Once per process.
configure(
    base_url=os.environ.get("ACP_GATEWAY_URL", "https://api.agenticcontrolplane.com"),
    client_header="acp-langgraph-starter/0.1.0",
)


# ── 3. Your tool. `@tool` registers it with LangChain; `@governed`
# wraps the call in ACP's pre/post hooks. Order matters — @governed
# must be INSIDE @tool so LangChain hands off to the wrapped version.
# REPLACE the body with your real logic (DB lookup, API call, etc.).
@tool
@governed("lookup_record")
def lookup_record(id: str) -> str:
    """Look up a record by ID. Replace with your real tool description."""
    return json.dumps({"id": id, "status": "placeholder", "note": "replace me"})


def main() -> None:
    # ── 4. Bind identity for every governance call inside. Without this
    # set_context call, ACP pre/post hooks silently no-op.
    set_context(
        user_token=os.environ["ACP_USER_TOKEN"],
        agent_name="my-langgraph-agent",  # Rename for your agent.
        agent_tier="background",
    )

    # ── 5. Build the agent. `create_agent` is the 2026 idiom (replaces
    # the legacy `langgraph.prebuilt.create_react_agent`). Passes the
    # model string + tools; LangGraph handles the tool-use loop.
    agent = create_agent(
        model="openai:gpt-4o-mini",
        tools=[lookup_record],
    )

    result = agent.invoke(
        {"messages": [{"role": "user", "content": "Look up record id=abc-123 and tell me what you find."}]}
    )
    # The agent returns a dict with `messages`; the last message is the
    # model's final answer.
    print(result["messages"][-1].content)


if __name__ == "__main__":
    main()
