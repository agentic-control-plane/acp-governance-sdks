# Refresh report — acp-langchain 0.2.0 (LangChain 1.x middleware)

Date: 2026-08-26. Keyless verification against the stub gateway; no git, no paid LLM calls.

## Versions (installed and verified in `.venv-lc`)

| package | version |
|---|---|
| python | 3.12.12 |
| langchain | 1.3.17 |
| langchain-core | 1.6.0 |
| langgraph | 1.2.11 |
| acp-langchain | 0.2.0 (editable, this repo) |
| acp-governance | 0.1.0 (editable, this repo) |

## Real API (verified by inspection of the installed package, not docs alone)

- `create_agent` from `langchain.agents` takes `middleware=[...]`; each entry is an `AgentMiddleware` (or a decorator-produced instance).
- Tool-execution wrap hook, class form:
  `wrap_tool_call(self, request: ToolCallRequest, handler: Callable[[ToolCallRequest], ToolMessage | Command]) -> ToolMessage | Command`
  and async twin `awrap_tool_call(...)` (handler is awaitable). `ToolCallRequest` (from `langchain.tools.tool_node`) fields: `tool_call: ToolCall`, `tool: BaseTool | None`, `state`, `runtime`. Name/args/id come from `request.tool_call["name" | "args" | "id"]`.
- Short-circuit = return a synthetic `ToolMessage` (with the original `tool_call_id`) without invoking `handler`. That is exactly how ACPMiddleware implements deny.
- Decorator form `@wrap_tool_call` exists; we ship the class form so sync + async live on one object.
- `HumanInTheLoopMiddleware` config `InterruptOnConfig = {allowed_decisions, description, args_schema, when}` — the conditional `when: Callable[[ToolCallRequest], bool]` predicate is present in 1.3.17 (docs say it landed in 1.3.3). HITL runs in `after_model`; wrap_tool_call runs at execution, so an approved call still hits the ACP check.
- Wrap hooks nest first-in-list = outermost.

## API surprises

1. **Fake chat models can't be used with `create_agent` as-is.** Both `GenericFakeChatModel` and `FakeMessagesListChatModel` inherit `bind_tools` from `BaseChatModel`, which raises `NotImplementedError` — and `create_agent` always binds tools. Fix (used in verification): subclass and override `bind_tools` to `return self`. `FakeMessagesListChatModel(responses=[AIMessage(tool_calls=[...]), ...])` then drives the full agent loop with scripted tool calls, keyless.
2. `langgraph.prebuilt.create_react_agent` is legacy; the old guide text already anticipated `create_agent`. Legacy chains/agents moved to `langchain-classic`; the `@governed` decorator remains the path there.
3. `ToolMessage.status` accepts `"error"` — the denial message is stamped with it; the DENY transcript below shows `status='error'` delivered to the model, which still completed the run.

## Verification transcript

Stub gateway: `GW_PORT=8936 node .../rig/stub-gateway.mjs` (denies when serialized tool_input contains `should-be-denied`; `/govern/tool-output` returns pass). `configure(base_url="http://127.0.0.1:8936")`; `set_context(user_token="stub")`. Model: scripted `FakeMessagesListChatModel` subclass — no LLM key.

Test output (`.verify-langchain.py`):

```
--- ALLOW: tool_result='{"id": "abc-123", "status": "found"}' status='success' final='[ALLOW] final answer after tool round'
--- DENY: tool_result='tool_error: marker command is on the denylist (stub)' status='error' final='[DENY] final answer after tool round'
--- ASYNC-DENY: tool_result='tool_error: marker command is on the denylist (stub)'
ALL ASSERTIONS PASSED
```

Gateway log:

```
[gw] up on 8936
[gw] tool-use tool=lookup_record tier=background decision=allow cmd={"id":"abc-123"}
[gw] tool-output tool=lookup_record bytes=36
[gw] tool-use tool=lookup_record tier=background decision=deny cmd={"id":"should-be-denied"}
[gw] tool-use tool=lookup_record tier=background decision=deny cmd={"id":"should-be-denied"}
```

Assertions proved:
- (a) allowed call executed the real tool (side-effect marker recorded once), gateway logged `tool-use ... decision=allow` then `tool-output`;
- (b) `should-be-denied` input → the tool function never ran (marker list unchanged), the model received `tool_error: <reason>` as the tool result — sync and async paths both;
- (c) every run completed normally to a final answer (no exception, no crashed graph).

Gateway killed after the run.
