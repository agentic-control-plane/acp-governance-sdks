# Agentic Control Plane SDKs

Embed [ACP governance](https://agenticcontrolplane.com) directly in your agent code — wrap any tool call with PreToolUse / PostToolUse, get audit log entries tagged by agent name, and turn framework-native multi-agent patterns into proper delegation chains.

This monorepo houses the TypeScript packages. Python adapters (CrewAI, LangChain) live in a sibling repo.

## Packages

| Package | Purpose | Status |
|---|---|---|
| [`@agenticcontrolplane/governance`](packages/governance) | Core SDK — framework-agnostic. Wraps any tool execution. | `0.1.0` (pre-release) |
| [`@agenticcontrolplane/governance-anthropic`](packages/governance-anthropic) | Adapter for Anthropic SDK + Claude Agent SDK + Skills | `0.1.0` (pre-release) |
| `@agenticcontrolplane/governance-openai` | Adapter for OpenAI SDK + Agents SDK | planned |
| `@agenticcontrolplane/governance-mastra` | Adapter for Mastra | planned |

## Quick start

```typescript
import { GovernanceClient } from "@agenticcontrolplane/governance";

const acp = new GovernanceClient({
  apiKey: process.env.ACP_API_KEY!, // gsk_yourslug_xxxxxxxxxxxx
});

const result = await acp.governTool({
  tool: "github.repos.create",
  input: { name: "new-repo", private: true },
  agent: { agentName: "pr-reviewer", agentTier: "api" },
  execute: async () => {
    return await github.repos.create({ name: "new-repo", private: true });
  },
});
```

## Why use the SDK over the OAI proxy?

| Capability | OAI proxy (base_url) | SDK (these packages) |
|---|---|---|
| Audit every LLM call | ✅ | ✅ |
| Apply policy to tool calls | partial | ✅ full |
| Per-agent attribution in dashboard | no | ✅ via `agentName` |
| Delegation chain reconstruction | partial | ✅ native — handoffs become chain links |
| Per-agent budget caps + scope intersection | workspace-level only | ✅ per agent |
| PostToolUse output redaction | ❌ | ✅ |

The OAI proxy is universal — works with anything that speaks OpenAI's API. The SDK is precise — it tells the gateway *which agent* made the call so multi-agent systems get proper governance.

## Development

```bash
npm install
npm run build       # build all packages
npm run typecheck   # tsc --noEmit across the workspace
npm run test        # run smoke tests (when present)
```

Workspace layout:

```
packages/
  governance/                       # @agenticcontrolplane/governance
    src/{index,client,errors,types}.ts
  governance-anthropic/             # @agenticcontrolplane/governance-anthropic
    src/{index,with-governance,messages-loop,types}.ts
```

## Publishing

Pre-release. Until `1.0`, expect API changes. Pin exact versions in production.

When publishing:

```bash
cd packages/governance && npm publish --access public --provenance
cd packages/governance-anthropic && npm publish --access public --provenance
```

`--provenance` per the gatewaystack supply-chain policy.

## License

MIT — see [LICENSE](LICENSE).
