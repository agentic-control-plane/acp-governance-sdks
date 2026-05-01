"""Example: a parent agent spawns a subagent with a scope-narrowed
child key minted by ACP.

This is the agents-building-agents primitive. The parent agent has a
`gsk_` token that's already attributed to a human via originSub. When
the parent decides to delegate work to a subagent, it:

  1. Calls `spawn_subagent(...)` to get a child token from ACP.
     ACP intersects scopes, propagates originSub, sets a short TTL,
     and persists the chain.
  2. Runs the subagent inside `child_context(...)` so every tool call
     the subagent makes is governed under the child token.

From the gateway's perspective, the subagent's tool calls produce
audit logs that include the full chain back to the human — even
though the subagent itself has no idea who the human is. That's the
point: governance is inherited, not configured.

Setup:

    pip install acp-governance anthropic

    export ACP_GATEWAY_URL=https://api.agenticcontrolplane.com
    export ACP_PARENT_TOKEN=gsk_yourtenant_...   # the parent's key
    export ANTHROPIC_API_KEY=sk-ant-...

    # The agent profile must exist in your tenant with delegatable: true.
    # Create via dashboard or POST /api/v1/agents.
"""
from __future__ import annotations

import os

from anthropic import Anthropic

from acp_governance import (
    child_context,
    configure,
    governed,
    set_context,
    spawn_subagent,
)


# ---------------------------------------------------------------------------
# 1. Configure ACP once at startup.
# ---------------------------------------------------------------------------

configure(
    base_url=os.environ.get("ACP_GATEWAY_URL", "https://api.agenticcontrolplane.com"),
    client_header="acp-governance-py/spawn-subagent-example",
)

PARENT_TOKEN = os.environ["ACP_PARENT_TOKEN"]


# ---------------------------------------------------------------------------
# 2. Define a tool the subagent will call. @governed routes through ACP.
# ---------------------------------------------------------------------------

@governed("github.repos.read")
def fetch_readme(owner: str, repo: str) -> str:
    """Fetch a repo's README. The @governed decorator routes the call
    through ACP, which checks the bound context's token against the
    workspace's policy before allowing the call to proceed."""
    # Your real implementation here. For the example we return a stub.
    return f"# {owner}/{repo}\n\n(README content)"


# ---------------------------------------------------------------------------
# 3. Subagent body — runs under the child key's context.
# ---------------------------------------------------------------------------

def run_research_subagent(repo_full_name: str) -> str:
    """The subagent's body. By the time this runs, the child token is
    already bound as the ACP context, so every @governed tool call
    inside this function is reported under the child key."""
    owner, repo = repo_full_name.split("/", 1)
    client = Anthropic()

    # Tool dispatch loop omitted for brevity — what matters is that
    # `fetch_readme(...)` calls through ACP under the child key.
    readme = fetch_readme(owner=owner, repo=repo)

    msg = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=400,
        messages=[
            {"role": "user", "content": f"Summarize this repo:\n\n{readme}"},
        ],
    )
    return msg.content[0].text


# ---------------------------------------------------------------------------
# 4. Parent agent — bind parent token, then spawn + run the subagent.
# ---------------------------------------------------------------------------

def main() -> None:
    # Parent's own context. In a real app this would be set per inbound
    # request from a verified user JWT, not from an env var.
    set_context(user_token=PARENT_TOKEN, agent_name="lead-researcher")

    # Mint a child key for a saved agent profile in the tenant. The
    # profile must have `delegatable: true`. Scopes default to the
    # profile's own scopes intersected with the parent's; pass an
    # explicit list to narrow further.
    child = spawn_subagent(
        profile_id="research-summarizer",
        scopes=["github.repos.read"],
        ttl_seconds=600,
        max_budget_cents=50,
        reason="summarizing repo for inbound lead xyz",
    )

    print(f"Spawned child key {child.key_id} (expires {child.expires_at})")
    print(f"Effective scopes: {child.effective_scopes}")
    print(f"Chain depth: {child.chain.get('depth')}, originSub: {child.chain.get('originSub')}")

    # Run the subagent under the child token. Every governed tool call
    # in run_research_subagent() is now reported as a delegation chain
    # call — audit logs preserve the originating human.
    with child_context(child, agent_name="research-summarizer"):
        summary = run_research_subagent("anthropics/anthropic-sdk-python")

    print("\n--- summary ---")
    print(summary)


if __name__ == "__main__":
    main()
