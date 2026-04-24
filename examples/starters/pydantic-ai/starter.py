"""
ACP Starter — Pydantic AI (Python)

The minimum code to wire ACP governance into a Pydantic AI agent. Copy
this folder, swap the placeholder tool for your real one, ship.

Governance pattern: decorator. `@governed("tool_name")` is stacked under
Pydantic AI's `@agent.tool_plain`, so every tool call flows through ACP's
pre/post hooks. Denials return a tool_error string that Pydantic AI
delivers to the agent as tool output; the agent adapts.

Run:  bash run.sh
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from dotenv import load_dotenv

from acp_governance import configure, governed, set_context
from pydantic_ai import Agent

# ── 1. Load ACP credentials from ./.env next to this file.
load_dotenv(Path(__file__).parent / ".env")
for v in ("ANTHROPIC_API_KEY", "ACP_USER_TOKEN"):
    if not os.environ.get(v):
        raise SystemExit(f"Missing {v} — copy .env.example → .env")

# ── 2. Point the governance SDK at your ACP gateway. Once per process.
configure(
    base_url=os.environ.get("ACP_GATEWAY_URL", "https://api.agenticcontrolplane.com"),
    client_header="acp-pydantic-ai-starter/0.1.0",
)

# ── 3. Build the agent. `Agent(model_string, ...)` resolves the provider
# from the prefix; ANTHROPIC_API_KEY is picked up by the Anthropic model.
# Swap `"anthropic:claude-sonnet-4-6"` for any provider-prefixed string
# (e.g. "openai:gpt-4o-mini") — see Pydantic AI docs.
agent = Agent(
    "anthropic:claude-sonnet-4-6",
    instructions="You are an ACP-governed agent. Use the tools available.",
)


# ── 4. Your tool. `@agent.tool_plain` registers it with Pydantic AI;
# `@governed` wraps the call in ACP's pre/post hooks. Order matters —
# @governed must be INSIDE @agent.tool_plain so Pydantic AI's signature
# introspection and the tool registration both see the wrapped function.
# REPLACE the body with your real logic (DB lookup, API call, etc.).
@agent.tool_plain
@governed("lookup_record")
def lookup_record(id: str) -> str:
    """Look up a record by ID. Replace with your real tool description."""
    return json.dumps({"id": id, "status": "placeholder", "note": "replace me"})


def main() -> None:
    # ── 5. Bind identity for every governance call inside. Without this
    # set_context call, ACP pre/post hooks silently no-op.
    set_context(
        user_token=os.environ["ACP_USER_TOKEN"],
        agent_name="my-pydantic-agent",  # Rename for your agent.
        agent_tier="background",
    )

    result = agent.run_sync("Look up record id=abc-123 and tell me what you find.")
    print(result.output)


if __name__ == "__main__":
    main()
