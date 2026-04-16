# @agenticcontrolplane/governance-anthropic

[Agentic Control Plane](https://agenticcontrolplane.com) adapter for the Anthropic SDK and Claude Agent SDK. Govern every `tool_use` block from Claude with PreToolUse / PostToolUse, audit log entries tagged by Skill/agent name, and full delegation chain attribution.

## Install

```bash
npm install @agenticcontrolplane/governance @agenticcontrolplane/governance-anthropic @anthropic-ai/sdk
```

## Two ways to use it

### 1. Wrap your tool handlers (`withGovernance`)

Drop-in replacement for your existing tool registry. Each call passes through ACP automatically.

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { GovernanceClient } from "@agenticcontrolplane/governance";
import { withGovernance } from "@agenticcontrolplane/governance-anthropic";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const acp = new GovernanceClient({ apiKey: process.env.ACP_API_KEY! });

const myToolHandlers = {
  github_create_repo: async (input: { name: string }) => github.repos.create(input),
  slack_post:         async (input: { channel: string; text: string }) => slack.chat.postMessage(input),
};

// Each handler is now wrapped with PreToolUse + PostToolUse + audit logging.
// "pr-reviewer" appears as a distinct agent in your ACP dashboard.
const tools = withGovernance(myToolHandlers, acp, {
  agentName: "pr-reviewer",
  agentTier: "api",
});

// Drive your own Anthropic message loop, calling the wrapped handlers.
const result = await tools.github_create_repo({ name: "new-repo" });
```

### 2. Run the whole loop (`runMessagesWithTools`)

For when you want one call that drives the model + tool execution end-to-end with governance applied at every iteration.

```typescript
import { runMessagesWithTools } from "@agenticcontrolplane/governance-anthropic";

const result = await runMessagesWithTools({
  client: anthropic,
  acp,
  agent: { agentName: "pr-reviewer", agentTier: "api" },
  model: "claude-sonnet-4-6",
  system: "You review pull requests. Use tools to gather data.",
  messages: [
    { role: "user", content: "Review https://github.com/acme/repo/pull/42" },
  ],
  tools: [
    { name: "github_create_repo", description: "Create a repo", input_schema: { type: "object" } },
    { name: "slack_post",         description: "Post to Slack", input_schema: { type: "object" } },
  ],
  toolHandlers: myToolHandlers,
  maxIterations: 20,
});

console.log(result.finalContent);   // assistant's final message
console.log(result.iterations);     // number of tool-use rounds
console.log(result.truncated);      // true if maxIterations was hit
```

When ACP denies a tool call, `runMessagesWithTools` surfaces the denial as a `tool_result` block with `is_error: true` so Claude can adapt — try a different approach, report partial results — instead of the whole run throwing mid-conversation.

## What you get in the dashboard

- **Detected agents page** ([cloud.agenticcontrolplane.com/agents](https://cloud.agenticcontrolplane.com/agents)): each `agentName` you pass becomes a distinct row.
- **Activity log**: every tool call is recorded with the agent name, identity, decision, latency, and any PII / prompt-injection findings.
- **Delegation chains**: when one governed agent invokes another (via the SDK), the chain is reconstructed automatically — `originSub` → parent agent → child agent → tool call — visible on the Agent Monitor → Run Details panel.

## Anthropic Agent SDK / Skills

The same pattern works for the higher-level [Anthropic Agent SDK](https://docs.claude.com/agent-sdk). Register each Skill as a distinct `agentName` and wrap its tool handlers with `withGovernance`. Sub-skill invocations register as delegation chain links.

```typescript
const researcherTools = withGovernance(researchHandlers, acp, { agentName: "skill.researcher" });
const writerTools     = withGovernance(writerHandlers,     acp, { agentName: "skill.writer" });
```

## Limitations

- **`runMessagesWithTools` doesn't stream by default.** Streaming support is on the roadmap. For now, the loop accumulates the full response per turn.
- **Tool input/output is logged, not mutated.** ACP surfaces redact decisions for the audit log; mutating the actual tool input before execution requires a deeper integration with the SDK's middleware.
- **Pre-release**: `0.1.x` is the initial release. API may evolve based on real usage feedback. Pin exact versions in production.

## Related

- [`@agenticcontrolplane/governance`](https://github.com/davidcrowe/acp-governance-sdks/tree/main/packages/governance) — core SDK
- [Anthropic Agent SDK integration guide](https://agenticcontrolplane.com/integrations/anthropic-agent-sdk)
- [PR Reviewer demo](https://github.com/davidcrowe/acp-pr-reviewer-demo) — three-agent delegation chain example

## License

MIT
