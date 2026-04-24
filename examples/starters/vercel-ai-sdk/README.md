# ACP Starter — Vercel AI SDK (TypeScript)

Minimal template for wiring ACP governance into an agent built with the Vercel AI SDK (`ai` v6).

## Setup

```bash
cp .env.example .env
# edit .env: set ACP_USER_TOKEN (gsk_...) and ANTHROPIC_API_KEY

# from the monorepo root
npm install
npm run build --workspace=@agenticcontrolplane/governance

bash examples/starters/vercel-ai-sdk/run.sh
```

`run.sh` invokes `tsx` from the monorepo's hoisted `node_modules`. A standalone customer project would add `ai`, `@ai-sdk/anthropic`, `zod`, `dotenv`, `tsx`, and `@agenticcontrolplane/governance` as their own dependencies.

## What to change

- `lookupRecord` — replace the body with your real tool logic
- The tool's `description` + `inputSchema` — the model reads these to decide when to call
- `agentName: "my-vercel-agent"` — rename for dashboard attribution
- `anthropic("claude-sonnet-4-6")` — swap to any `@ai-sdk/*` provider

Add more tools: create more `governed()` wrappers, pass them in via `tools: { name: tool({...}) }`.

## How governance is wired

No framework-specific adapter package needed. The base `@agenticcontrolplane/governance` exports `governed(name, fn)` that wraps any async function with ACP's pre/post hook protocol. Vercel AI SDK's `tool({ execute })` receives the wrapped function — governance is invisible to the SDK, runs on every call.

LLM calls go direct to your provider with your own key. Governance is tool-layer, not LLM-layer.

## 2026 idiom notes

The research that seeded this starter confirmed several v5/v6 API changes. If you're copy-pasting from older Vercel AI SDK tutorials, update:

- `parameters` → `inputSchema` on `tool({...})`
- `maxSteps: n` → `stopWhen: stepCountIs(n)`
- `maxTokens` → `maxOutputTokens`
- `CoreMessage` → `ModelMessage`
- `args` / `result` on tool calls → `input` / `output`
- `ai/react` → `@ai-sdk/react`

For fleet-wide telemetry (logging every tool call across many agents in one place), consider the SDK's `experimental_onToolCallStart` / `experimental_onToolCallFinish` callbacks on `generateText` — complementary to the per-tool `governed()` wrapper.

## References

- [Vercel AI SDK — tools](https://ai-sdk.dev/docs/foundations/tools)
- [Vercel AI SDK — agents](https://ai-sdk.dev/docs/foundations/agents)
- [Vercel AI SDK — middleware](https://ai-sdk.dev/docs/ai-sdk-core/middleware)
- [ACP governance model](https://agenticcontrolplane.com/docs/governance-model)

## Get an API key

[cloud.agenticcontrolplane.com](https://cloud.agenticcontrolplane.com/) → create a workspace → Settings → API Keys → New key.
