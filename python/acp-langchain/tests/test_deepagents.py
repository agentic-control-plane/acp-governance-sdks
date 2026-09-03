"""Deep Agents coverage: stock create_deep_agent leaves subagent tool calls
ungoverned; acp_langchain.deepagents.create_deep_agent governs them.

Runs with no model key: a scripted fake chat model drives the loop and
the ACP calls are stubbed, so what's asserted is purely *which tool calls
reached the ACP check*.
"""
from __future__ import annotations

from collections import deque
from typing import Any

import pytest

pytest.importorskip("deepagents")

from langchain.tools import tool
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage
from langchain_core.outputs import ChatGeneration, ChatResult

import acp_langchain._middleware as mw
from acp_langchain import ACPMiddleware
from acp_langchain.deepagents import create_deep_agent, govern_subagents


class ScriptedModel(BaseChatModel):
    """Returns pre-scripted AIMessages in order; ignores the prompt."""

    script: deque

    @property
    def _llm_type(self) -> str:
        return "scripted"

    def bind_tools(self, tools, **kwargs):  # noqa: D401 - deepagents calls this
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs) -> ChatResult:
        return ChatResult(generations=[ChatGeneration(message=self.script.popleft())])


def _script() -> deque:
    """main: delegate → sub: call tool → sub: answer → main: answer."""
    return deque(
        [
            AIMessage(
                content="",
                tool_calls=[{"id": "t1", "name": "task", "args": {
                    "description": "look up abc-123",
                    "subagent_type": "general-purpose",
                }}],
            ),
            AIMessage(
                content="",
                tool_calls=[{"id": "t2", "name": "lookup_record", "args": {"id": "abc-123"}}],
            ),
            AIMessage(content="sub done"),
            AIMessage(content="main done"),
        ]
    )


@tool
def lookup_record(id: str) -> str:
    """Look up a record by ID."""
    return f"record {id}"


@pytest.fixture
def acp_calls(monkeypatch):
    seen: list[str] = []
    monkeypatch.setattr(mw, "pre_tool_use", lambda name, inp: (seen.append(name), (True, ""))[1])
    monkeypatch.setattr(mw, "post_tool_output", lambda name, inp, out: None)
    return seen


def _run(agent):
    out = agent.invoke({"messages": [{"role": "user", "content": "go"}]})
    assert out["messages"][-1].content == "main done"


def test_stock_deep_agent_does_not_govern_subagent_tools(acp_calls):
    """Characterises upstream: ACPMiddleware on the main agent sees `task`
    but NOT the tool the general-purpose subagent calls. If this starts
    failing, deepagents began propagating user middleware — good news;
    update the docs and drop the workaround."""
    from deepagents import create_deep_agent as upstream

    agent = upstream(model=ScriptedModel(script=_script()), tools=[lookup_record],
                     middleware=[ACPMiddleware()])
    _run(agent)
    assert acp_calls == ["task"]


def test_acp_deep_agent_governs_subagent_tools(acp_calls):
    agent = create_deep_agent(model=ScriptedModel(script=_script()), tools=[lookup_record])
    _run(agent)
    assert acp_calls == ["task", "lookup_record"]


def test_acp_deep_agent_governs_declarative_subagent(acp_calls):
    script = _script()
    script[0].tool_calls[0]["args"]["subagent_type"] = "researcher"
    agent = create_deep_agent(
        model=ScriptedModel(script=script), tools=[lookup_record],
        subagents=[{"name": "researcher", "description": "researches", "system_prompt": "research."}],
    )
    _run(agent)
    assert acp_calls == ["task", "lookup_record"]


def test_govern_subagents_shapes():
    acp = ACPMiddleware()
    specs = [
        {"name": "a", "description": "a"},
        {"name": "b", "description": "b", "middleware": [acp]},
    ]
    out = govern_subagents(specs, acp=acp)
    assert [s["name"] for s in out] == ["general-purpose", "a", "b"]
    assert all(any(isinstance(m, ACPMiddleware) for m in s["middleware"]) for s in out)
    assert out[2]["middleware"] == [acp]  # no double injection
    assert specs[0].get("middleware") is None  # input not mutated

    out = govern_subagents([{"name": "general-purpose", "description": "mine"}], acp=acp)
    assert [s["name"] for s in out] == ["general-purpose"]  # user's GP kept, governed


def test_govern_subagents_warns_on_compiled_and_remote():
    with pytest.warns(UserWarning, match="'compiled'"):
        govern_subagents([{"name": "compiled", "description": "x", "runnable": object()}])
    with pytest.warns(UserWarning, match="'remote'"):
        govern_subagents([{"name": "remote", "description": "x", "graph_id": "g"}])
