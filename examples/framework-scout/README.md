# ACP Framework Scout — reference agent across N frameworks

The same reference agent, re-implemented in every framework and client that Agentic Control Plane advertises. Same job in every folder: search Hacker News for newly-announced agent frameworks, compile a short list, email the user. All traffic routes through ACP governance in the pattern most idiomatic to each framework.

## Matrix

| # | Folder | Category | Language | Governance pattern | Status |
|---|---|---|---|---|---|
| 1 | [`claude-agent-sdk/`](./claude-agent-sdk/) | Framework | TS | Decorator (`governHandlers`) | ✅ |
| 2 | `claude-code/` | Client | — | Hook + MCP | |
| 3 | `openai-agents-sdk/` | Framework | Py | Proxy | |
| 4 | `codex-cli/` | Client | — | Hook | |
| 5 | `cursor/` | Client | — | MCP server | |
| 6 | `claude-desktop/` | Client | — | MCP server | |
| 7 | `crewai/` | Framework | Py | Decorator (`@governed`) | |
| 8 | `langgraph/` | Framework | Py | Decorator (`@governed`) | |
| 9 | `vercel-ai-sdk/` | Framework | TS | New adapter — decorator | |
| 10 | `pydantic-ai/` | Framework | Py | New adapter — decorator | |
| 11 | `mastra/` | Framework | TS | New adapter — decorator | |
| 12 | `cline/` | Client | — | MCP server | |
| 13 | `zed/` | Client | — | MCP server | |
| 14 | `autogen/` | Framework | Py | New adapter — decorator | |
| 15 | `google-adk/` | Framework | Py | New adapter — decorator | |
| 16 | `chatgpt-workspace-agents/` | Client | — | MCP server | |
| 17 | `google-agents-cli/` | Client | — | MCP / proxy | |

Aider dropped — proxy-only, and the proxy pattern is deprecated from ACP positioning.

## Shared credentials

All implementations read from `~/.framework-scout/creds.env` (mode 600, outside any git repo). Contains: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `RESEND_API_KEY`, `ACP_USER_TOKEN` (gsk_), `ACP_GATEWAY_URL`, `EMAIL_FROM`, `EMAIL_TO`.

## What each folder contains

- `scout.{ts,py}` — the agent, written in the framework's idiomatic style
- `README.md` — what the governance pattern is, how to run, known rough edges
- `package.json` / `pyproject.toml` — deps (TS folders) or install notes (Py folders)

