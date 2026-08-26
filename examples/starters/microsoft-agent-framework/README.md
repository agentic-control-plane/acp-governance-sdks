# ACP Starter — Microsoft Agent Framework (Python)

Minimal template for wiring ACP governance into a Microsoft Agent Framework (MAF) agent.

## Setup

```bash
cp .env.example .env
# edit .env: set ACP_USER_TOKEN (gsk_...) and ANTHROPIC_API_KEY
#   (swap to OPENAI_API_KEY if you change the chat client to OpenAIChatClient)

bash run.sh
```

`run.sh` creates a local `.venv` via `uv`, installs `agent-framework-core` + `agent-framework-anthropic` + `acp-governance` from the monorepo, and runs `starter.py`.

## What to change

- `lookup_record(id)` / `send_email(...)` — replace the bodies with your real tool logic
- The function docstrings — MAF derives each tool's schema and description from your function signature + docstring
- `agent_name: "my-maf-agent"` in `set_context` — rename for dashboard attribution
- `AnthropicClient(model_id="claude-sonnet-4-6")` — swap for any MAF chat client (`agent_framework.openai.OpenAIChatClient`, `agent_framework.azure.*`, `agent_framework.ollama.*`, etc.) and adjust `.env` accordingly

Add more tools: append plain functions to `tools=[...]`. That's it — **no per-tool decoration**. The single `ACPFunctionMiddleware()` passed to `Agent(middleware=...)` governs every tool the agent owns, including ones you add later. (Use MAF's `@tool(name=..., description=...)` decorator only if you want to customize a tool's schema.)

## How governance is wired

MAF has three middleware scopes — agent run, chat, and function. `ACPFunctionMiddleware` subclasses MAF's `FunctionMiddleware` and implements `process(context, call_next)`:

1. **Pre-hook** — `pre_tool_use(tool_name, tool_input)` POSTs to ACP's `/govern/tool-use`. On deny, the middleware sets `context.result = "tool_error: <reason>"` and **does not call `call_next()`** — the tool function never executes, and MAF returns the error string to the model as the tool's output so it can adapt.
2. **Execution** — `await call_next()` runs the real function (or the next middleware).
3. **Post-hook** — `post_tool_output(...)` POSTs the result to `/govern/tool-output` for audit + PII scan. `action: "redact"` replaces `context.result` with the redacted output; `action: "block"` replaces it with `[ACP] Blocked: <reason>`.

LLM calls go direct to your provider with your own key. Governance is tool-layer, not LLM-layer.

Compared with the decorator pattern in the Pydantic AI starter, the middleware pattern is strictly more ergonomic here: one object at agent construction covers all tools, present and future — nothing to forget on the Nth tool.

## Verify without an LLM key

`verify.py` drives MAF's real function-invocation pipeline with a scripted chat client (no model call) against a local stub gateway — proves the deny path blocks execution before the tool body runs.

## MAF-specific notes

- **`agent-framework` vs `agent-framework-core`** — the meta-package pulls every connector; `agent-framework-core` (used here) is the core loop, tools, and middleware only. Provider chat clients are separate packages (`agent-framework-anthropic`, `agent-framework-openai`, `agent-framework-azure-ai`, ...) exposed under `agent_framework.<provider>` namespaces.
- **Native approvals compose.** MAF ships `approval_mode` on tools and a `ToolApprovalMiddleware` for in-process human approval. ACP's middleware composes with both: MAF approvals gate in one process, ACP policy is enforced and audited workspace-wide across frameworks.
- **Exception semantics.** An ordinary exception raised from function middleware becomes a tool-error result and the loop keeps running; `MiddlewareFailure` aborts the run fail-closed. This starter prefers the `context.result` override (no exception) so the model always sees a legible denial string.

## References

- [MAF docs — middleware](https://learn.microsoft.com/en-us/agent-framework/agents/middleware/)
- [MAF docs — function tools](https://learn.microsoft.com/en-us/agent-framework/agents/tools/function-tools)
- [`agent_framework.FunctionMiddleware` API](https://learn.microsoft.com/en-us/python/api/agent-framework-core/agent_framework.functionmiddleware)
- [ACP governance model](https://agenticcontrolplane.com/docs/governance-model)

## Get an API key

[cloud.agenticcontrolplane.com](https://cloud.agenticcontrolplane.com/) → create a workspace → Settings → API Keys → New key.
