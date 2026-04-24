# ACP Starter — Zed (LLM proxy)

Minimal setup for wiring ACP governance into Zed's AI Assistant. Unlike Claude Code / Cursor / Cline (hook or MCP), Zed integrates via the **LLM-proxy pattern** — point Zed's Anthropic API base URL at ACP, and every LLM round-trip (and the tool calls within it) flows through ACP's proxy.

## Setup

Open Zed settings (command palette → "Open Settings" → `settings.json`) and add:

```json
{
  "language_models": {
    "anthropic": {
      "api_url": "https://api.agenticcontrolplane.com/anthropic"
    }
  }
}
```

Zed's default `api_url` is `https://api.anthropic.com`. Zed appends `/v1/messages` itself, so ACP responds at `https://api.agenticcontrolplane.com/anthropic/v1/messages`.

You'll also need an ACP `gsk_` API key bound to Zed. How Zed passes the key depends on your Zed version — currently either (a) as your Anthropic API key in Zed's credential store or (b) via a custom header set in Zed's language-model config. See the [integration page](https://agenticcontrolplane.com/integrations/zed) for current specifics.

## How it works

Zed's Assistant panel constructs Anthropic-shaped Messages API requests. With `api_url` redirected, those requests land at ACP's proxy. ACP verifies the caller's identity, evaluates policy against the full request (system prompt, tools, messages), forwards to the real Anthropic API, and logs the round-trip.

## Tradeoffs vs. hook / MCP patterns

- **Proxy pattern sees more.** Full prompt, tool declarations, handoff metadata — everything serialized as JSON for the API call.
- **But** the proxy sits in the LLM hot path. Every round-trip crosses ACP's network. LLM traffic is large; the proxy is more operationally sensitive than a tool-call-only hook.
- **Good fit** for IDE-embedded assistants like Zed where there's no tool-call hook surface.

## Limitations

- **Anthropic-only today.** Zed's LLM config is per-provider; this setup proxies Anthropic traffic. OpenAI / Gemini traffic through Zed would need a parallel config (and ACP's OpenAI-compatible proxy, if used separately).
- **Version-dependent config shape.** Zed's `language_models` schema has iterated; check the integration page for the latest config shape.

## References

- [ACP Zed integration page](https://agenticcontrolplane.com/integrations/zed)
- [Zed Assistant docs](https://zed.dev/docs/assistant/assistant)
- [ACP governance model](https://agenticcontrolplane.com/docs/governance-model)

## Get an API key

[cloud.agenticcontrolplane.com](https://cloud.agenticcontrolplane.com/) → create a workspace → Settings → API Keys → New key.
