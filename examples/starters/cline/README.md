# ACP Starter — Cline (MCP, VS Code)

Minimal setup for wiring ACP governance into Cline. Cline supports MCP natively — add ACP as a remote MCP server in Cline's settings and every tool call Cline routes through it is governed.

## Setup

Open Cline's MCP server panel in VS Code (sidebar → Cline → MCP Servers → Edit config) and add:

```json
{
  "mcpServers": {
    "acp": {
      "url": "https://mcp.agenticcontrolplane.com/mcp",
      "transport": "streamable-http",
      "auth": {
        "type": "bearer",
        "token": "gsk_your-slug_replace-me"
      }
    }
  }
}
```

Replace the `gsk_...` token with your real ACP API key. Reload the VS Code window.

Cline discovers ACP's tools on connection; tool calls appear in the [Activity dashboard](https://cloud.agenticcontrolplane.com/activity) with `client.name: "cline"`.

## How it works

Unlike Claude Code or Cursor, Cline doesn't expose a Claude-style PreToolUse hook — but it does speak MCP natively. ACP's MCP endpoint is a standard `streamable-http` server; Cline's MCP client authenticates with the bearer token and proxies tool calls directly.

## Limitations

- **MCP-only governance.** Cline's internal Composer tools (file edit, terminal) aren't routed through MCP, so they're outside ACP's visibility unless separately wrapped. The MCP pattern here governs external integrations (GitHub, Salesforce, custom APIs) Cline calls via MCP.
- **Token in plain text.** Bearer token sits in Cline's config file. Use a scoped, rotatable `gsk_` key.

## References

- [ACP Cline integration page](https://agenticcontrolplane.com/integrations/cline)
- [Cline docs](https://docs.cline.bot)
- [ACP governance model](https://agenticcontrolplane.com/docs/governance-model)

## Get an API key

[cloud.agenticcontrolplane.com](https://cloud.agenticcontrolplane.com/) → create a workspace → Settings → API Keys → New key.
