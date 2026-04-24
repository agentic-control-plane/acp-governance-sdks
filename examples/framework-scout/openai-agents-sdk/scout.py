"""
Framework Scout — OpenAI Agents SDK (Python), native-guardrails governance.

Tool calls route through ACP's pre/post hooks via the SDK's native
`tool_input_guardrails` / `tool_output_guardrails` parameters — the
idiomatic integration path introduced in openai-agents v0.14. Rejected
calls flow through the SDK's built-in tool-error machinery; the model
sees the rejection as a tool result and adapts.

LLM calls go direct to OpenAI with the agent's own key. Decorator-era
governance (stacking `@governed` under `@function_tool`) still works,
but the native guardrail parameter is the shape OpenAI's docs now
recommend.

Run:
    bash run.sh
"""

from __future__ import annotations

import json
import os
import time
from datetime import datetime
from pathlib import Path

import requests
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

load_dotenv(Path.home() / ".framework-scout" / "creds.env")

REQUIRED_VARS = (
    "OPENAI_API_KEY",
    "RESEND_API_KEY",
    "ACP_USER_TOKEN",
    "ACP_GATEWAY_URL",
    "EMAIL_FROM",
    "EMAIL_TO",
)
for v in REQUIRED_VARS:
    if not os.environ.get(v):
        raise SystemExit(f"Missing env var: {v}")

configure(
    base_url=os.environ["ACP_GATEWAY_URL"],
    client_header="openai-agents-py/0.2.0",
)
set_tracing_disabled(True)


# ── ACP governance expressed as SDK-native guardrails ────────────────
# The guardrail pattern is: a function that inspects the tool call and
# returns either `.allow()` (proceed) or `.reject_content(message=...)`
# (abort the call; the model sees `message` as the tool result).

@tool_input_guardrail(name="acp_pre_tool_use")
def acp_input_guardrail(data: ToolInputGuardrailData) -> ToolGuardrailFunctionOutput:
    """Call ACP's preToolUse. If denied, reject the tool call with the
    reason — the model sees it as a tool result and can adapt."""
    allowed, reason = pre_tool_use(data.context.tool_name, data.context.tool_arguments)
    if not allowed:
        return ToolGuardrailFunctionOutput.reject_content(
            message=f"tool_error: {reason or 'denied by ACP policy'}",
        )
    return ToolGuardrailFunctionOutput.allow()


@tool_output_guardrail(name="acp_post_tool_output")
def acp_output_guardrail(data: ToolOutputGuardrailData) -> ToolGuardrailFunctionOutput:
    """Call ACP's postToolOutput for audit + PII/injection scan. If the
    gateway returns a redacted version, substitute it; if it blocks,
    reject."""
    result = post_tool_output(
        data.context.tool_name, data.context.tool_arguments, data.output
    )
    if not result:
        return ToolGuardrailFunctionOutput.allow()
    if result.get("action") == "redact" and "modified_output" in result:
        return ToolGuardrailFunctionOutput.reject_content(
            message=str(result["modified_output"]),
        )
    if result.get("action") == "block":
        return ToolGuardrailFunctionOutput.reject_content(
            message=f"tool_error: {result.get('reason', 'output blocked by ACP policy')}",
        )
    return ToolGuardrailFunctionOutput.allow()


ACP_GUARDRAILS = {
    "tool_input_guardrails": [acp_input_guardrail],
    "tool_output_guardrails": [acp_output_guardrail],
}


# ── Tools. `@function_tool(tool_input_guardrails=..., tool_output_guardrails=...)`
# is the native path for per-tool governance in v0.14+. ──────────────

@function_tool(**ACP_GUARDRAILS)
def search_hn(query: str, days_back: int = 14) -> str:
    """Search Hacker News stories via the Algolia API.

    Args:
        query: Keywords (e.g. 'agent framework', 'llm agents').
        days_back: How many days back to search. Defaults to 14.

    Returns:
        JSON string with up to 20 hits: title, url, points, hn_discussion.
    """
    since = int(time.time()) - days_back * 86400
    r = requests.get(
        "https://hn.algolia.com/api/v1/search",
        params={
            "query": query,
            "tags": "story",
            "numericFilters": f"created_at_i>{since}",
            "hitsPerPage": 20,
        },
        timeout=15,
    )
    r.raise_for_status()
    data = r.json()
    hits = [
        {
            "title": h.get("title"),
            "url": h.get("url") or h.get("story_url"),
            "points": h.get("points"),
            "num_comments": h.get("num_comments"),
            "created_at": h.get("created_at"),
            "hn_discussion": f"https://news.ycombinator.com/item?id={h.get('objectID')}",
        }
        for h in data.get("hits", [])
    ]
    return json.dumps({"hits": hits})


@function_tool(**ACP_GUARDRAILS)
def send_email(subject: str, html: str) -> str:
    """Send the final scout report to the user via Resend.

    Args:
        subject: Subject line including today's date.
        html: HTML body — scannable, 3-8 findings with name + link + why-it-matters.

    Returns:
        JSON string with the Resend message id and status.
    """
    r = requests.post(
        "https://api.resend.com/emails",
        headers={
            "Authorization": f"Bearer {os.environ['RESEND_API_KEY']}",
            "Content-Type": "application/json",
        },
        json={
            "from": os.environ["EMAIL_FROM"],
            "to": os.environ["EMAIL_TO"],
            "subject": subject,
            "html": html,
        },
        timeout=15,
    )
    r.raise_for_status()
    body = r.json()
    return json.dumps({"id": body.get("id"), "status": "sent"})


SYSTEM_PROMPT = """\
You are the Framework Scout for Agentic Control Plane (ACP).

Job: find newly-announced or recently-updated agent frameworks, agent SDKs, or
agent-related developer tooling that ACP should consider integrating with.
Hacker News is your primary source via the search_hn tool.

Run 3-6 varied queries to triangulate.

For each candidate consider: library for building agents (good) vs. end-user
product (skip); language (Python / TypeScript preferred); recently shipped or
actively discussed; differentiated.

After gathering, call send_email ONCE with an HTML-formatted summary of 3-8
findings. Then stop."""


def main() -> None:
    set_context(
        user_token=os.environ["ACP_USER_TOKEN"],
        agent_name="framework-scout",
        agent_tier="background",
    )

    agent = Agent(
        name="framework-scout",
        instructions=SYSTEM_PROMPT,
        model="gpt-4o-mini",
        tools=[search_hn, send_email],
    )

    today = datetime.now().strftime("%Y-%m-%d")
    # max_turns guards against runaway loops in headless runs — a belt-
    # and-suspenders safety net independent of any governance policy.
    result = Runner.run_sync(
        agent,
        f"Run a scout pass. Today: {today}. Search HN for new agent "
        f"frameworks from the last ~14 days and email me a summary.",
        max_turns=12,
    )
    print(result.final_output)


if __name__ == "__main__":
    main()
