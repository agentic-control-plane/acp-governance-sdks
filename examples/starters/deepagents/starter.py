"""
ACP Starter — Deep Agents (Python)

The minimum code to put a LangChain Deep Agent under ACP policy & audit,
subagents included. Copy this folder, swap the placeholder tool for your
real one, ship.

Pattern: `acp_langchain.deepagents.create_deep_agent` — same signature as
`deepagents.create_deep_agent`, with `ACPMiddleware()` on the main agent
and on every subagent (including the auto-added `general-purpose` one).
Stock `create_deep_agent` does not pass user middleware down to subagents,
so their tool calls would run unchecked.

Run:  bash run.sh
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from dotenv import load_dotenv

from acp_langchain import configure, set_context
from acp_langchain.deepagents import create_deep_agent
from langchain.tools import tool

# ── 1. Load ACP credentials from ./.env next to this file.
load_dotenv(Path(__file__).parent / ".env")
for v in ("OPENAI_API_KEY", "ACP_USER_TOKEN"):
    if not os.environ.get(v):
        raise SystemExit(f"Missing {v} — copy .env.example → .env")

# ── 2. Point the SDK at your ACP gateway. Once per process.
configure(
    base_url=os.environ.get("ACP_GATEWAY_URL", "https://api.agenticcontrolplane.com"),
    client_header="acp-deepagents-starter/0.0.1",
)


# ── 3. Your tool. Just `@tool` — ACP already covers it, on the main agent
# and inside any subagent that calls it.
@tool
def lookup_record(id: str) -> str:
    """Look up a record by ID. Replace with your real tool description."""
    return json.dumps({"id": id, "status": "placeholder", "note": "replace me"})


def main() -> None:
    # ── 4. Bind identity for every policy call inside, subagents included
    # (contextvars carry through the `task` call).
    set_context(
        user_token=os.environ["ACP_USER_TOKEN"],
        agent_name="my-deep-agent",  # Rename for your agent.
        agent_tier="background",
    )

    # ── 5. Build the agent. Drop-in for `deepagents.create_deep_agent`.
    agent = create_deep_agent(
        model="openai:gpt-4o-mini",
        tools=[lookup_record],
        subagents=[{
            "name": "researcher",
            "description": "Looks up records and reports what it finds.",
            "system_prompt": "Use lookup_record, then report the result.",
        }],
    )

    result = agent.invoke({"messages": [{
        "role": "user",
        "content": "Delegate to the researcher subagent: look up record id=abc-123 and tell me what it found.",
    }]})
    print(result["messages"][-1].content)


if __name__ == "__main__":
    main()
