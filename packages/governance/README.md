# @agenticcontrolplane/governance

Core SDK for the [Agentic Control Plane](https://agenticcontrolplane.com). Govern any tool call from any agent framework with one consistent API: PreToolUse → execute → PostToolUse.

## Install

```bash
npm install @agenticcontrolplane/governance
```

## Quick start

```typescript
import { GovernanceClient } from "@agenticcontrolplane/governance";

const acp = new GovernanceClient({
  apiKey: process.env.ACP_API_KEY!, // gsk_yourslug_xxxxxxxxxxxx
});

// Wrap any tool call. ACP runs PreToolUse before, PostToolUse after.
const result = await acp.governTool({
  tool: "github.repos.create",
  input: { name: "new-repo", private: true },
  agent: { agentName: "pr-reviewer", agentTier: "api" },
  execute: async () => {
    // your actual tool execution
    return await github.repos.create({ name: "new-repo", private: true });
  },
});

console.log(result.output);     // the tool's output (or redacted version)
console.log(result.redacted);   // true if ACP redacted the output
console.log(result.findings);   // PII / injection findings, if any
```

## What you get

- **PreToolUse enforcement**: deny decisions throw `GovernanceDeniedError` before your tool runs.
- **PostToolUse scanning**: PII detection, prompt injection scanning, secret redaction.
- **Audit log entry per call** in your ACP dashboard, tagged with `agent_name`.
- **Delegation chain attribution**: when this agent invokes another, the chain link is created automatically.
- **Fail-closed by default**: if ACP is unreachable, tool calls are denied for safety. Switch to `failureMode: "open"` only if you explicitly accept ungoverned calls during outages.

## API

### `new GovernanceClient(options)`

```typescript
interface GovernanceClientOptions {
  apiKey: string;             // gsk_… key from cloud.agenticcontrolplane.com
  baseUrl?: string;           // default: https://api.agenticcontrolplane.com
  timeoutMs?: number;         // default: 5000
  failureMode?: "open" | "closed"; // default: "closed"
}
```

### `acp.governTool({ tool, input, agent, execute })`

Wraps a tool execution end-to-end. Returns `Promise<GovernResult<T>>`.

### `acp.preToolUse(req)` / `acp.postToolUse(req)`

Manual control for framework adapters that need to interleave governance with framework-specific control flow.

## Framework adapters

Use these instead of writing your own integration:

- [`@agenticcontrolplane/governance-anthropic`](../governance-anthropic) — Anthropic SDK + Agent SDK
- `@agenticcontrolplane/governance-openai` (planned) — OpenAI SDK + Agents SDK
- `acp-governance-crewai` (PyPI, planned) — CrewAI Python adapter
- `acp-governance-langchain` (PyPI, planned) — LangChain / LangGraph adapter

## License

MIT
