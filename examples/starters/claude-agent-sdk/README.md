# ACP Starter — Claude Agent SDK (TypeScript)

Minimal template for wiring ACP governance into an agent built on Anthropic's Messages API. Copy this folder, swap the placeholder tool, ship.

## Setup

```bash
cp .env.example .env
# edit .env: set ACP_USER_TOKEN (gsk_...) and ANTHROPIC_API_KEY

# from the monorepo root
npm install
npm run build --workspace=@agenticcontrolplane/governance
npm run build --workspace=@agenticcontrolplane/governance-anthropic

bash examples/starters/claude-agent-sdk/run.sh
```

You should see text output from the agent and one governance event pair (`lookup_record` pre + post) in your [Activity dashboard](https://cloud.agenticcontrolplane.com/activity).

## What to change

- `lookup_record` handler in `starter.ts` — replace the placeholder with your real tool logic (DB query, API call, whatever)
- Matching `tools[]` schema so Claude knows when to call it
- `agentName: "my-agent"` — give it a meaningful name for dashboard attribution

Add more tools: add keys to the `governHandlers({...})` map and entries to the `tools` array.

## References

- [Claude Agent SDK scout](../../framework-scout/claude-agent-sdk/) — full working example using this same pattern to scan Hacker News for new agent frameworks
- [Governance model](https://agenticcontrolplane.com/docs/governance-model)
- [`@agenticcontrolplane/governance-anthropic`](../../../packages/governance-anthropic/)

## Get an API key

[cloud.agenticcontrolplane.com](https://cloud.agenticcontrolplane.com/) → create a workspace → Settings → API Keys → New key.
