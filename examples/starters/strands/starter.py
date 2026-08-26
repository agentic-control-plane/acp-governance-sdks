"""
ACP Starter — Strands Agents (Python)

The minimum code to wire ACP policy + audit into an AWS Strands agent.
Copy this folder, swap the placeholder tools for your real ones, ship.

Pattern: native hooks. Strands' hook system fires BeforeToolCallEvent /
AfterToolCallEvent around every tool call, with `event.cancel_tool` as a
hard, model-proof cancel. `ACPHookProvider` (see acp_hooks.py) plugs
ACP's pre/post checks into those events — one provider, every tool
covered, no per-tool decorators.

Run:  bash run.sh
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from dotenv import load_dotenv

from acp_governance import configure, set_context
from strands import Agent, tool
from strands.models.anthropic import AnthropicModel

from acp_hooks import ACPHookProvider

# ── 1. Load ACP credentials from ./.env next to this file.
load_dotenv(Path(__file__).parent / ".env")
for v in ("ANTHROPIC_API_KEY", "ACP_USER_TOKEN"):
    if not os.environ.get(v):
        raise SystemExit(f"Missing {v} — copy .env.example → .env")

# ── 2. Point the ACP SDK at your gateway. Once per process.
configure(
    base_url=os.environ.get("ACP_GATEWAY_URL", "https://api.agenticcontrolplane.com"),
    client_header="acp-strands-starter/0.1.0",
)


# ── 3. Your tools. Plain Strands @tool functions — no ACP code in them.
# REPLACE the bodies with your real logic (DB lookup, API call, etc.).
@tool
def lookup_record(id: str) -> str:
    """Look up a record by ID. Replace with your real tool description."""
    return json.dumps({"id": id, "status": "placeholder", "note": "replace me"})


@tool
def send_email(to: str, subject: str, body: str) -> str:
    """Send an email. Replace with your real tool description."""
    return f"placeholder: pretended to email {to}"


# ── 4. Build the agent. `hooks=[ACPHookProvider()]` is the whole
# integration — every tool registered on this agent is checked with ACP
# before it runs and audited after. Swap AnthropicModel for BedrockModel
# (Strands' default) or any other provider; the hooks are model-agnostic.
agent = Agent(
    model=AnthropicModel(model_id="claude-sonnet-4-6", max_tokens=1024),
    system_prompt="You are an ACP-governed agent. Use the tools available.",
    tools=[lookup_record, send_email],
    hooks=[ACPHookProvider()],
)


def main() -> None:
    # ── 5. Bind identity for every ACP call inside. Without set_context,
    # the pre/post hooks silently no-op.
    set_context(
        user_token=os.environ["ACP_USER_TOKEN"],
        agent_name="my-strands-agent",  # Rename for your agent.
        agent_tier="background",
    )

    result = agent("Look up record id=abc-123 and tell me what you find.")
    print(result)


if __name__ == "__main__":
    main()
