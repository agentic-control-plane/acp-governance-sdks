# ACP Starter — Claude Desktop (MCP via `mcp-remote`)

Minimal setup for wiring ACP governance into Claude Desktop. No code — edit Claude Desktop's config file to add ACP as an MCP server and every tool call Claude routes through ACP is logged, scoped, and auditable.

## Setup

Edit `claude_desktop_config.json`:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

Add (merge with any existing `mcpServers`):

```json
{
  "mcpServers": {
    "acp": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://mcp.agenticcontrolplane.com/mcp",
        "--header",
        "Authorization: Bearer gsk_your-slug_replace-me"
      ]
    }
  }
}
```

Replace the `gsk_...` token with your real ACP API key. Restart Claude Desktop.

ACP appears in the MCP server menu (hammer icon). Tool calls routed through ACP show up in your [Activity dashboard](https://cloud.agenticcontrolplane.com/activity) with `client.name: "claude-desktop"`.

## How it works

Claude Desktop launches MCP servers as subprocesses (stdio transport). ACP's endpoint is remote HTTPS — `mcp-remote` is a small wrapper that bridges Claude Desktop's stdio expectations to HTTPS-based MCP servers. The `--header` flag injects the bearer token.

## Limitations

- **MCP-only governance.** Claude Desktop has no PreToolUse hook like Claude Code. ACP sees only tool calls routed through MCP servers — not Claude's internal model calls or other native tools.
- **Restart required.** Claude Desktop reads `claude_desktop_config.json` on launch. Config changes need a full app restart.
- **Per-user config.** No team-shared config in Claude Desktop. Each user adds the MCP server block locally.
- **Token in plain text.** The bearer token sits in the config file. Use a scoped, rotatable `gsk_` key — not a long-lived admin key.

## References

- [ACP Claude Desktop integration page](https://agenticcontrolplane.com/integrations/claude-desktop)
- [mcp-remote on npm](https://www.npmjs.com/package/mcp-remote)
- [ACP governance model](https://agenticcontrolplane.com/docs/governance-model)

## Get an API key

[cloud.agenticcontrolplane.com](https://cloud.agenticcontrolplane.com/) → create a workspace → Settings → API Keys → New key.
