# ACP Starters

Minimal, customer-facing templates for wiring ACP governance into each supported framework / client. Copy the folder that matches your stack, swap the placeholder tool (or config) for your real one, ship.

## You're writing the agent (SDK starters)

Runnable code — one placeholder tool, all the governance wiring pre-written, `.env.example` + `run.sh` boilerplate.

| Folder | Language | Governance pattern | Notes |
|---|---|---|---|
| [`claude-agent-sdk/`](./claude-agent-sdk/) | TypeScript | Decorator (`governHandlers` + `withContext`) | Anthropic Messages API, custom tool-use loop |
| [`openai-agents-sdk/`](./openai-agents-sdk/) | Python | Native tool guardrails (v0.14+) | `tool_input_guardrails` / `tool_output_guardrails` |
| [`crewai/`](./crewai/) | Python | Decorator stack (`@tool` → `@governed`) | Inter-agent handoffs via `install_crew_hooks` |
| [`langgraph/`](./langgraph/) | Python | Decorator stack (`@tool` → `@governed`) | Uses `create_agent` (2026 idiom) |
| [`pydantic-ai/`](./pydantic-ai/) | Python | Decorator stack (`@agent.tool_plain` → `@governed`) | Anthropic default via model string |
| [`vercel-ai-sdk/`](./vercel-ai-sdk/) | TypeScript | Inline `governed()` in tool `execute` | `ai` v6, `stopWhen: stepCountIs(n)` |
| [`mastra/`](./mastra/) | TypeScript | Inline `governed()` in `createTool` | Mastra model router (e.g. `openai/gpt-4o-mini`) |
| [`autogen/`](./autogen/) | Python | `@governed` on plain async tool | AutoGen v0.7+, `AssistantAgent` API |
| [`google-adk/`](./google-adk/) | Python | `@governed` on plain tool | Direct Gemini via `GOOGLE_API_KEY` |

## You're configuring a client (client starters)

No code — a config snippet + steps to install ACP into an existing AI client. Each follows that client's native integration surface.

| Folder | Pattern | What you edit |
|---|---|---|
| [`claude-code/`](./claude-code/) | Hook (ACP plugin) | One-line installer, `.claude/settings.json` for overrides |
| [`codex-cli/`](./codex-cli/) | Hook (ACP plugin) | One-line installer, `~/.codex/hooks.json` |
| [`cursor/`](./cursor/) | Hook (ACP plugin) | One-line installer, `~/.cursor/hooks.json` |
| [`claude-desktop/`](./claude-desktop/) | MCP via `mcp-remote` | `claude_desktop_config.json` |
| [`cline/`](./cline/) | Native MCP | Cline's MCP server panel in VS Code |
| [`zed/`](./zed/) | LLM proxy | Zed's `settings.json` → `language_models.anthropic.api_url` |

## Common shape

All SDK starters share the same skeleton:

```
<framework>/
├── .env.example         # template — copy to .env, fill in keys
├── starter.{ts,py}      # minimal working agent, one placeholder tool
├── run.sh               # source .env, invoke the runtime
├── README.md            # 5-min setup + what-to-change
└── (framework-specific config)
```

The only required secret is `ACP_USER_TOKEN` (format: `gsk_<tenant-slug>_<random>`) plus your LLM provider's key. Client starters need only the `gsk_` token (the client handles its own LLM auth).

Get both at [cloud.agenticcontrolplane.com](https://cloud.agenticcontrolplane.com/) → Settings → API Keys → New key.

## Full working examples

Each SDK starter has a corresponding full-fat demo in [`../framework-scout/`](../framework-scout/) that uses the same governance wiring to build a Hacker News framework scout. Use the starter to ship; use the scout to see how a real agent is structured end-to-end.

## Picking the right starter

- **TypeScript + Anthropic direct?** → `claude-agent-sdk/`
- **Python + OpenAI?** → `openai-agents-sdk/`
- **Python + CrewAI / LangGraph / Pydantic AI / AutoGen / Google ADK?** → pick the matching folder
- **TypeScript + Vercel / Mastra?** → pick the matching folder
- **Using Claude Code / Codex / Cursor / Cline / Claude Desktop / Zed?** → the matching client starter
