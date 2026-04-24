# ACP Starter — Mastra (TypeScript)

Minimal template for wiring ACP governance into a Mastra agent.

## Setup

```bash
cp .env.example .env
# edit .env: set ACP_USER_TOKEN (gsk_...) and OPENAI_API_KEY

# from the monorepo root
npm install
npm run build --workspace=@agenticcontrolplane/governance

bash examples/starters/mastra/run.sh
```

## What to change

- `execute` body inside `createTool(...)` — replace with your real tool logic
- The tool's `description` + `inputSchema` / `outputSchema` — Mastra uses these for model grounding
- `agentName: "my-mastra-agent"` — rename for dashboard attribution
- `model: "openai/gpt-4o-mini"` — swap to `"anthropic/claude-sonnet-4-6"` or `"google/gemini-*"`; Mastra's model router resolves the prefix using the matching env var

Add more tools: create more `createTool({...})` definitions, wrap each `execute` with `governed("tool_name", ...)`, and pass them in `new Agent({ tools: { ... } })`.

## How governance is wired

No framework-specific adapter needed. `governed(name, fn)` from `@agenticcontrolplane/governance` wraps the tool's `execute` callback with ACP's pre/post hook protocol. Every tool call flows through `/govern/tool-use` and `/govern/tool-output`. Denials return a `tool_error: <reason>` string that Mastra delivers to the model as tool output; the model adapts.

LLM calls go direct to your provider with your own key. Governance is tool-layer, not LLM-layer.

## Mastra-specific notes

- **No before/after-tool-call hook.** Mastra doesn't expose a generic middleware slot around tool dispatch (as of `@mastra/core` 1.28). Inline `governed(execute)` is the documented way to add per-tool governance.
- **`requireApproval: true`** on a tool gates it with a stream-level approval event — orthogonal to ACP. Use for human-in-the-loop on sensitive tools; complementary to per-call policy from ACP.
- **Processors (`inputProcessors`, `outputProcessors`)** handle message-content guardrails (PII detection, prompt-injection scanning, moderation) — complementary to tool-layer governance, not a replacement.

## References

- [Mastra docs — agents](https://mastra.ai/docs/agents/overview)
- [Mastra docs — tools](https://mastra.ai/docs/agents/using-tools)
- [Mastra docs — guardrails](https://mastra.ai/docs/agents/guardrails)
- [ACP governance model](https://agenticcontrolplane.com/docs/governance-model)

## Get an API key

[cloud.agenticcontrolplane.com](https://cloud.agenticcontrolplane.com/) → create a workspace → Settings → API Keys → New key.
