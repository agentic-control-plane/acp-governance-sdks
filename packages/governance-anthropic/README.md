# @agenticcontrolplane/governance-anthropic

[Agentic Control Plane](https://agenticcontrolplane.com) adapter for the Anthropic Messages API and Claude Agent SDK. One call wraps your tool handlers with ACP governance. You keep full control of the tool-use loop.

Same governance model as Claude Code: before any tool runs, ACP is consulted via `/govern/tool-use`; after it runs, the output is sent to `/govern/tool-output` for audit and PII scan.

## Install

```bash
npm install @agenticcontrolplane/governance-anthropic @anthropic-ai/sdk
```

## Usage

```ts
import Anthropic from "@anthropic-ai/sdk";
import express from "express";
import { governHandlers, withContext } from "@agenticcontrolplane/governance-anthropic";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const app = express();
app.use(express.json());

// Your tools. Plain async handlers — your code, your credentials.
const baseHandlers = {
  web_search: async ({ query }: { query: string }) => doSearch(query),
  send_email: async ({ to, subject, body }: { to: string; subject: string; body: string }) => sendMail(to, subject, body),
};

// Wrap once. Every dispatch through `handlers` is now ACP-governed.
const handlers = governHandlers(baseHandlers);

const tools: Anthropic.Tool[] = [
  { name: "web_search", description: "Search the web", input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "send_email", description: "Send email",     input_schema: { type: "object", properties: { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" } }, required: ["to", "subject", "body"] } },
];

app.post("/run", async (req, res) => {
  const token = req.header("authorization")!.slice("Bearer ".length);
  await withContext({ userToken: token }, async () => {
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: req.body.prompt }];
    for (let i = 0; i < 10; i++) {
      const msg = await anthropic.messages.create({ model: "claude-sonnet-4-6", max_tokens: 1024, tools, messages });
      messages.push({ role: "assistant", content: msg.content });
      if (msg.stop_reason !== "tool_use") {
        const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map(b => b.text).join("\n");
        return res.json({ result: text });
      }
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of msg.content) {
        if (block.type !== "tool_use") continue;
        const output = await handlers[block.name](block.input);  // governed
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: typeof output === "string" ? output : JSON.stringify(output) });
      }
      messages.push({ role: "user", content: toolResults });
    }
    res.status(500).json({ error: "max iterations" });
  });
});
```

## What `governHandlers` does

Takes `Record<string, AsyncHandler>`. Returns a handler map of the same shape where each function:

1. POSTs to ACP `/govern/tool-use` with the tool name + input + user JWT.
2. If ACP denies, returns `"tool_error: <reason>"` (Claude sees it and adapts).
3. If ACP allows, runs your handler.
4. POSTs to `/govern/tool-output` for audit + post-output PII scan.
5. If ACP redacts, returns the redacted version; if ACP blocks, returns `"tool_error"`.

## API

```ts
governHandlers(handlers: Record<string, AsyncHandler>): Record<string, AsyncHandler>
governed(toolName: string, handler: AsyncHandler): AsyncHandler         // from core
withContext({ userToken, sessionId? }, fn): Promise<T>                   // from core
```

## Fail-open

Network errors, timeouts (5s), non-2xx responses → tool proceeds with reason `"fail-open"`. Matches Claude Code hook behavior. Governance is never a single point of failure for the agent.

## Related

- [`@agenticcontrolplane/governance`](https://www.npmjs.com/package/@agenticcontrolplane/governance) — core SDK (uses this underneath)
- [Anthropic Agent SDK integration guide](https://agenticcontrolplane.com/integrations/anthropic-agent-sdk)

## License

MIT
