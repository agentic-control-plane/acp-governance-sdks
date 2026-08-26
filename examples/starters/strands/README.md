# ACP Starter — Strands Agents (Python)

Minimal template for wiring ACP policy + audit into an AWS [Strands Agents](https://strandsagents.com) agent.

## Setup

```bash
cp .env.example .env
# edit .env: set ACP_USER_TOKEN (gsk_...) and ANTHROPIC_API_KEY
#   (or swap AnthropicModel for BedrockModel and use AWS credentials)

bash run.sh
```

`run.sh` creates a local `.venv` via `uv`, installs `strands-agents` + `acp-governance` from the monorepo, and runs `starter.py`.

## What to change

- `lookup_record(id)` / `send_email(...)` — replace the bodies with your real tool logic
- The `@tool` docstrings — Strands derives each tool's schema and description from your function signature + docstring
- `agent_name: "my-strands-agent"` in `set_context` — rename for dashboard attribution
- `AnthropicModel(model_id="claude-sonnet-4-6", ...)` — swap for `BedrockModel` (Strands' default), `OpenAIModel`, `OllamaModel`, etc.; the hooks are model-agnostic

Add more tools: just add them to `tools=[...]`. No per-tool decorators — `ACPHookProvider` covers everything registered on the agent.

## How the integration is wired

Strands has a first-class hook system, and it is the cleanest seam in the framework category. `ACPHookProvider` (in `acp_hooks.py`) is a standard Strands `HookProvider`:

- **`BeforeToolCallEvent`** → ACP `/govern/tool-use`. On deny, the provider sets `event.cancel_tool = "[ACP] Denied: <reason>"`. Strands skips the tool function entirely and returns an error `ToolResult` carrying the reason — the model sees why and adapts.
- **`AfterToolCallEvent`** → ACP `/govern/tool-output`. On `redact`, `event.result` is replaced with the modified output; on `block`, with `"[ACP] Blocked: <reason>"`. `event.result` is one of the few writable fields on Strands' otherwise-frozen hook events.

AWS markets `cancel_tool` as the way to enforce "rules the LLM cannot bypass" — and it is exactly that: a hard stop in the executor, not a prompt-level suggestion. What Strands doesn't ship is the decision brain. ACP supplies it: workspace policy, per-user identity, human approvals, an off-machine audit ledger, and the same rules applied consistently across Claude Code, LangChain, CrewAI, Pydantic AI, and everything else in your fleet.

LLM calls go direct to your provider with your own key. ACP is tool-layer, not LLM-layer.

## Verify without keys

`verify.py` drives the real Strands event loop with a scripted fake `Model` (no LLM calls) against a local stub gateway, proving allowed calls execute + get audited and denied calls are cancelled before the tool function runs.

## References

- [Strands Agents docs — hooks](https://strandsagents.com/latest/documentation/docs/user-guide/concepts/agents/hooks/)
- [Strands Agents SDK (GitHub)](https://github.com/strands-agents/sdk-python)
- [ACP governance model](https://agenticcontrolplane.com/docs/governance-model)

## Get an API key

[cloud.agenticcontrolplane.com](https://cloud.agenticcontrolplane.com/) → create a workspace → Settings → API Keys → New key.
