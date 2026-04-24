/**
 * ACP Starter — Claude Agent SDK (TypeScript)
 *
 * The minimum code needed to run a Claude-powered agent with ACP governance
 * on every tool call. Copy this folder, swap the placeholder tool for your
 * real one, and ship.
 *
 * Governance pattern: decorator. `governHandlers({...})` wraps each tool so
 * every call runs `preToolUse → handler → postToolOutput`. Denials return
 * a `"tool_error: <reason>"` string — the model sees it as a tool result
 * and adapts.
 *
 * Run:   bash run.sh
 */

import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Anthropic from "@anthropic-ai/sdk";
import {
  configure,
  governHandlers,
  withContext,
} from "@agenticcontrolplane/governance-anthropic";

// ── 1. Load ACP credentials from ./.env next to this file.
//   Copy .env.example → .env and fill in your keys.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const { ANTHROPIC_API_KEY, ACP_USER_TOKEN, ACP_GATEWAY_URL = "https://api.agenticcontrolplane.com" } = process.env;
if (!ANTHROPIC_API_KEY) throw new Error("Missing ANTHROPIC_API_KEY");
if (!ACP_USER_TOKEN) throw new Error("Missing ACP_USER_TOKEN (gsk_...)");

// ── 2. Point the governance SDK at your ACP gateway. Once per process.
configure({ baseUrl: ACP_GATEWAY_URL });

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// ── 3. Your tool handlers. `governHandlers` wraps each one with the ACP
// pre/post hook protocol — every call is checked before it runs and audited
// after. Replace the body of `lookup_record` with your actual tool logic.
// Add more handlers to the map as needed.
const handlers = governHandlers({
  lookup_record: async ({ id }: { id: string }) => {
    // REPLACE THIS with your real tool (DB lookup, API call, file read, etc.).
    return { id, status: "placeholder", note: "replace me with real logic" };
  },
});

// ── 4. Tool definitions passed to the Messages API.
const tools: Anthropic.Tool[] = [
  {
    name: "lookup_record",
    description: "Look up a record by ID. Replace with your real tool description.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string", description: "The record ID to look up." } },
      required: ["id"],
    },
  },
];

// ── 5. Agent loop. Standard Anthropic tool-use pattern — nothing bespoke.
async function run(userMessage: string) {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userMessage }];

  for (let i = 0; i < 10; i++) {
    const resp = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      tools,
      messages,
    });
    messages.push({ role: "assistant", content: resp.content });

    if (resp.stop_reason === "end_turn") {
      for (const b of resp.content) if (b.type === "text") console.log(b.text);
      return;
    }
    if (resp.stop_reason !== "tool_use") return;

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of resp.content) {
      if (block.type !== "tool_use") continue;
      const fn = handlers[block.name as keyof typeof handlers];
      const out = fn ? await fn(block.input as any) : `tool_error: unknown tool ${block.name}`;
      results.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: typeof out === "string" ? out : JSON.stringify(out),
      });
    }
    messages.push({ role: "user", content: results });
  }
}

// ── 6. `withContext` binds the user's identity for every governance call
// inside. Without it, pre/post hooks silently no-op — the agent runs but
// nothing is governed. Always wrap your request handler body with this.
async function main() {
  await withContext(
    {
      userToken: ACP_USER_TOKEN!,
      agentName: "my-agent", // Rename to match your agent.
      agentTier: "background", // or "interactive" / "subagent" / "api"
    },
    () => run("Look up record id=abc-123 and tell me what you find."),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
