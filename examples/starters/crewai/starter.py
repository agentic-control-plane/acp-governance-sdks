"""
ACP Starter — CrewAI (Python)

The minimum code to wire ACP governance into a CrewAI agent. Copy this
folder, swap the placeholder tool for your real one, ship.

Governance pattern: decorator. `@governed("tool_name")` is stacked under
CrewAI's `@tool`, so every tool call flows through ACP's pre/post hooks
before / after the tool runs. Denials return a tool_error string that
the agent sees as tool output and adapts to.

`install_crew_hooks(crew)` additionally captures inter-agent handoffs
(delegation, sequential task passes) as audit events — useful if your
crew has multiple agents that hand work to each other.

Run:  bash run.sh
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from dotenv import load_dotenv

from acp_crewai import configure, governed, install_crew_hooks, set_context
from crewai import Agent, Crew, Task
from crewai.tools import tool

# ── 1. Load ACP credentials from ./.env next to this file.
load_dotenv(Path(__file__).parent / ".env")
for v in ("OPENAI_API_KEY", "ACP_USER_TOKEN"):
    if not os.environ.get(v):
        raise SystemExit(f"Missing {v} — copy .env.example → .env")

# ── 2. Point the governance SDK at your ACP gateway. Once per process.
configure(
    base_url=os.environ.get("ACP_GATEWAY_URL", "https://api.agenticcontrolplane.com"),
    client_header="acp-crewai-starter/0.1.0",
)


# ── 3. Your tool. `@tool` registers it with CrewAI; `@governed` wraps
# the call in ACP's pre/post hooks. Order matters — @governed must be
# INSIDE @tool so CrewAI hands off to the wrapped version.
# REPLACE the body with your real logic (DB lookup, API call, etc.).
@tool("lookup_record")
@governed("lookup_record")
def lookup_record(id: str) -> str:
    """Look up a record by ID. Replace with your real tool description."""
    return json.dumps({"id": id, "status": "placeholder", "note": "replace me"})


def main() -> None:
    # ── 4. Bind identity for every governance call inside. Without this
    # set_context call, ACP pre/post hooks silently no-op.
    set_context(
        user_token=os.environ["ACP_USER_TOKEN"],
        agent_name="my-crew",  # Rename for your crew.
        agent_tier="background",
    )

    # ── 5. Define agent + task. Standard CrewAI — nothing bespoke.
    researcher = Agent(
        role="Record Researcher",
        goal="Look up records and summarize what you find",
        backstory="You are a diligent researcher who always cites sources.",
        tools=[lookup_record],
        llm="gpt-4o-mini",
        verbose=False,
    )

    task = Task(
        description="Look up record id=abc-123 and tell me what you find.",
        expected_output="One short sentence describing the record.",
        agent=researcher,
    )

    # ── 6. install_crew_hooks captures inter-agent handoffs. Safe to
    # call on a single-agent crew — it's a no-op when there's no
    # delegation. Remove if you're sure you don't need it.
    crew = Crew(agents=[researcher], tasks=[task])
    install_crew_hooks(crew)

    result = crew.kickoff()
    print(result)


if __name__ == "__main__":
    main()
