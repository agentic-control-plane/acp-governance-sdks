"""Keyless verification for the Strands + ACP starter.

Drives a real strands.Agent event loop with a scripted fake Model (no LLM
API calls) against the local ACP stub gateway. Proves:

(a) an allowed tool call executes and is logged (tool-use + tool-output);
(b) a call whose input contains "should-be-denied" is cancelled by
    ACPHookProvider BEFORE the tool function runs (side-effect marker),
    and the model-visible tool result carries the deny reason.
"""

from __future__ import annotations

import json
from typing import Any

from acp_governance import configure, set_context
from strands import Agent, tool
from strands.models.model import Model

from acp_hooks import ACPHookProvider

configure(base_url="http://127.0.0.1:8934", client_header="acp-strands-verify/0.1.0")
set_context(user_token="stub", agent_name="strands-verify", agent_tier="background")

EXECUTED: list[str] = []  # side-effect marker


@tool
def lookup_record(id: str) -> str:
    """Look up a record by ID."""
    EXECUTED.append(id)
    return json.dumps({"id": id, "status": "found"})


class ScriptedModel(Model):
    """Fake Strands model provider: replays scripted turns, no network."""

    def __init__(self, turns: list[list[dict[str, Any]]]) -> None:
        self._turns = list(turns)

    def update_config(self, **model_config: Any) -> None:  # pragma: no cover
        pass

    def get_config(self) -> Any:
        return {"model_id": "scripted"}

    async def structured_output(self, output_model, prompt, system_prompt=None, **kwargs):  # pragma: no cover
        raise NotImplementedError
        yield {}

    async def stream(self, messages, tool_specs=None, system_prompt=None, **kwargs):
        for event in self._turns.pop(0):
            yield event


def tool_use_turn(tool_use_id: str, name: str, tool_input: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {"messageStart": {"role": "assistant"}},
        {"contentBlockStart": {"contentBlockIndex": 0, "start": {"toolUse": {"toolUseId": tool_use_id, "name": name}}}},
        {"contentBlockDelta": {"contentBlockIndex": 0, "delta": {"toolUse": {"input": json.dumps(tool_input)}}}},
        {"contentBlockStop": {"contentBlockIndex": 0}},
        {"messageStop": {"stopReason": "tool_use"}},
    ]


def text_turn(text: str) -> list[dict[str, Any]]:
    return [
        {"messageStart": {"role": "assistant"}},
        {"contentBlockStart": {"contentBlockIndex": 0, "start": {}}},
        {"contentBlockDelta": {"contentBlockIndex": 0, "delta": {"text": text}}},
        {"contentBlockStop": {"contentBlockIndex": 0}},
        {"messageStop": {"stopReason": "end_turn"}},
    ]


def tool_results(agent: Agent) -> list[dict[str, Any]]:
    return [
        block["toolResult"]
        for msg in agent.messages
        for block in msg["content"]
        if "toolResult" in block
    ]


def main() -> None:
    # ── (a) allowed call: model requests lookup_record(id="abc-123")
    agent = Agent(
        model=ScriptedModel([tool_use_turn("t1", "lookup_record", {"id": "abc-123"}), text_turn("done")]),
        tools=[lookup_record],
        hooks=[ACPHookProvider()],
    )
    agent("look up abc-123")
    assert EXECUTED == ["abc-123"], f"allowed tool did not execute: {EXECUTED}"
    [res_a] = tool_results(agent)
    assert res_a["status"] == "success", res_a
    assert "found" in res_a["content"][0]["text"], res_a
    print("PASS (a): allowed tool executed; result:", res_a["content"][0]["text"])

    # ── (b) denied call: input contains the stub gateway's deny marker
    agent2 = Agent(
        model=ScriptedModel([tool_use_turn("t2", "lookup_record", {"id": "should-be-denied"}), text_turn("ok")]),
        tools=[lookup_record],
        hooks=[ACPHookProvider()],
    )
    agent2("look up the forbidden record")
    assert EXECUTED == ["abc-123"], f"DENIED TOOL EXECUTED — marker: {EXECUTED}"
    [res_b] = tool_results(agent2)
    assert res_b["status"] == "error", res_b
    text = res_b["content"][0]["text"]
    assert "[ACP] Denied" in text and "denylist" in text, text
    print("PASS (b): denied before execution; model-visible result:", text)

    print("ALL CHECKS PASSED")


if __name__ == "__main__":
    main()
