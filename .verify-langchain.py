"""Keyless verification of ACPMiddleware against the stub gateway.

Uses FakeMessagesListChatModel (langchain_core fake chat model that
returns scripted AIMessages, including tool_calls) to drive the real
create_agent loop — no LLM key, real tool dispatch, real middleware.
"""
import json
from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from langchain_core.messages import AIMessage


class ToolScriptedModel(FakeMessagesListChatModel):
    """FakeMessagesListChatModel returns scripted AIMessages (incl.
    tool_calls) but its base bind_tools raises NotImplementedError;
    create_agent always binds tools, so accept and ignore them."""

    def bind_tools(self, tools, **kwargs):
        return self
from langchain.agents import create_agent
from langchain.tools import tool
from acp_langchain import ACPMiddleware, configure, set_context

configure(base_url="http://127.0.0.1:8936", client_header="verify-langchain/0.2.0")
set_context(user_token="stub", agent_name="verify-langchain", agent_tier="background")

EXECUTED = []

@tool
def lookup_record(id: str) -> str:
    """Look up a record by ID."""
    EXECUTED.append(id)
    return json.dumps({"id": id, "status": "found"})

def run(scenario, record_id):
    model = ToolScriptedModel(responses=[
        AIMessage(content="", tool_calls=[{"name": "lookup_record", "args": {"id": record_id}, "id": "call_1"}]),
        AIMessage(content=f"[{scenario}] final answer after tool round"),
    ])
    agent = create_agent(model=model, tools=[lookup_record], middleware=[ACPMiddleware()])
    result = agent.invoke({"messages": [{"role": "user", "content": f"look up {record_id}"}]})
    msgs = result["messages"]
    tool_msgs = [m for m in msgs if m.type == "tool"]
    print(f"--- {scenario}: tool_result={tool_msgs[-1].content!r} status={getattr(tool_msgs[-1],'status',None)!r} final={msgs[-1].content!r}")
    return tool_msgs[-1], msgs[-1]

# (a) allowed
tm, final = run("ALLOW", "abc-123")
assert EXECUTED == ["abc-123"], EXECUTED
assert '"status": "found"' in tm.content
assert final.content.endswith("final answer after tool round")

# (b) denied — tool function must never run
tm, final = run("DENY", "should-be-denied")
assert EXECUTED == ["abc-123"], f"tool ran on denied input! {EXECUTED}"
assert tm.content.startswith("tool_error: "), tm.content
assert "denylist" in tm.content
# (c) run completed normally
assert final.content.endswith("final answer after tool round")

# async path
import asyncio
async def arun():
    model = ToolScriptedModel(responses=[
        AIMessage(content="", tool_calls=[{"name": "lookup_record", "args": {"id": "should-be-denied"}, "id": "call_1"}]),
        AIMessage(content="[ASYNC-DENY] final answer after tool round"),
    ])
    agent = create_agent(model=model, tools=[lookup_record], middleware=[ACPMiddleware()])
    r = await agent.ainvoke({"messages": [{"role": "user", "content": "x"}]})
    tm = [m for m in r["messages"] if m.type == "tool"][-1]
    print(f"--- ASYNC-DENY: tool_result={tm.content!r}")
    assert tm.content.startswith("tool_error: ") and EXECUTED == ["abc-123"]
asyncio.run(arun())
print("ALL ASSERTIONS PASSED")
