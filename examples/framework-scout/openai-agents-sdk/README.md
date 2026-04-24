# Framework Scout — OpenAI Agents SDK (Python)

Reference agent #3 of 17. Governance via the OpenAI Agents SDK's **native tool-guardrail primitives** — the idiomatic path introduced in `openai-agents` v0.14.

## Governance pattern

**Native tool guardrails.** Two guardrail functions (`acp_input_guardrail`, `acp_output_guardrail`) call ACP's pre/post hooks and return `ToolGuardrailFunctionOutput.allow()` or `.reject_content(message=...)`. They're attached to each tool via the `tool_input_guardrails` / `tool_output_guardrails` parameters on `@function_tool`.

```python
@function_tool(
    tool_input_guardrails=[acp_input_guardrail],
    tool_output_guardrails=[acp_output_guardrail],
)
def search_hn(query: str) -> str:
    ...
```

Rejections flow through the SDK's built-in tool-error machinery — the model sees the rejection as a tool result and adapts, the same way it would for any other tool error.

LLM calls go direct to OpenAI with `OPENAI_API_KEY`. Decorator pattern governs tool calls; LLM-layer traffic isn't governed here (and shouldn't need to be — the value is at the tool boundary).

`set_context(user_token=..., agent_name=..., agent_tier=...)` binds identity once for the whole run via `contextvars`.

## Why native guardrails instead of stacked `@governed`

Early iterations stacked `@governed` under `@function_tool`:

```python
@function_tool
@governed("search_hn")
def search_hn(query: str) -> str: ...
```

This still works. But `openai-agents` v0.14 added dedicated tool-guardrail parameters, and OpenAI's docs now point to them as the supported extension path. Rejections returned through `ToolGuardrailFunctionOutput` flow through the SDK's `tool_error_formatter` and show up cleanly in traces/logs; a raw decorator-returned error string bypasses that infrastructure.

Net: same governance semantics, idiomatic placement, better survival against future SDK changes.

## What's in this folder

| File | Purpose |
|---|---|
| [`scout.py`](./scout.py) | Scout agent with native guardrails wired to ACP |
| [`pyproject.toml`](./pyproject.toml) | Deps via uv, including `acp-governance` as a local file source |
| [`run.sh`](./run.sh) | Create venv if missing, install, run |

## Run

Shared creds at `~/.framework-scout/creds.env`. Then:

```bash
bash run.sh
```

## What to look for in the ACP dashboard

Filter client=`openai-agents-py`. You'll see PreToolUse + PostToolUse event pairs for `search_hn` and `send_email`, agent=`framework-scout`, tier=`background`. No LLM events (they go direct to OpenAI).

## Additional safety that's worth adding for production

- **`@input_guardrail` at the agent level** — a PII/scope/prompt-injection check that runs before the model sees the input. The scout is tightly bounded so we skipped it, but a real customer starter should include one.
- **`max_turns=12` on `Runner.run_sync`** — already set. Guards against runaway loops independent of governance policy.
- **`error_handlers={"max_turns": ...}`** — optional callback when max_turns trips, for structured failure reporting.

## Known rough edges

- Uses `requests` (blocking) rather than `httpx.AsyncClient`. Simpler; fine for a one-shot scout. Async tools still work with ACP's `@governed` path.
- OpenAI Agents SDK's default OpenTelemetry tracing is disabled to avoid traffic to an unconfigured endpoint.
