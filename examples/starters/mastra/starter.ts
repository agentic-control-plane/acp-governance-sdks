/**
 * ACP Starter — Mastra (TypeScript)
 *
 * The minimum code to wire ACP governance into a Mastra agent. Copy this
 * folder, swap the placeholder tool for your real one, ship.
 *
 * Governance pattern: decorator. `governed("tool_name", fn)` from the
 * base `@agenticcontrolplane/governance` package wraps the tool's
 * `execute` function with ACP's pre/post hooks. Mastra calls the wrapped
 * version; denials return a tool_error string that the agent sees as
 * tool output and adapts to.
 *
 * No framework-specific ACP adapter package is needed — base
 * `governed()` composes cleanly with Mastra's `createTool()`.
 *
 * Run:  bash run.sh
 */

import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Mastra } from "@mastra/core";
import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import {
  configure,
  governed,
  withContext,
} from "@agenticcontrolplane/governance";

// ── 1. Load ACP credentials from ./.env next to this file.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const { OPENAI_API_KEY, ACP_USER_TOKEN, ACP_GATEWAY_URL = "https://api.agenticcontrolplane.com" } = process.env;
if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");
if (!ACP_USER_TOKEN) throw new Error("Missing ACP_USER_TOKEN (gsk_...)");

// ── 2. Point the governance SDK at your ACP gateway. Once per process.
configure({ baseUrl: ACP_GATEWAY_URL });

// ── 3. Your tool. `governed(name, fn)` wraps the execute function with
// ACP's pre/post hook protocol. Mastra's `createTool({ execute })` is
// passed the wrapped function — governance is invisible to Mastra.
// REPLACE the body with your real logic.
const lookupRecord = createTool({
  id: "lookup_record",
  description: "Look up a record by ID. Replace with your real tool description.",
  inputSchema: z.object({
    id: z.string().describe("The record ID to look up."),
  }),
  outputSchema: z.object({
    id: z.string(),
    status: z.string(),
    note: z.string(),
  }),
  execute: governed("lookup_record", async ({ context }) => {
    return { id: context.id, status: "placeholder", note: "replace me with real logic" };
  }),
});

// ── 4. Define the agent. Mastra's model router parses the prefix —
// "openai/..." uses OPENAI_API_KEY; swap to "anthropic/claude-sonnet-4-6"
// + ANTHROPIC_API_KEY if you'd rather.
const agent = new Agent({
  id: "my-mastra-agent",
  name: "My Mastra Agent",
  instructions: "You are an ACP-governed agent. Use the tools available.",
  model: "openai/gpt-4o-mini",
  tools: { lookupRecord },
});

const mastra = new Mastra({ agents: { agent } });

// ── 5. `withContext` binds user identity for every governance call
// inside. Without it, pre/post hooks silently no-op.
async function main() {
  await withContext(
    {
      userToken: ACP_USER_TOKEN!,
      agentName: "my-mastra-agent",
      agentTier: "background",
    },
    async () => {
      const res = await mastra.getAgentById("my-mastra-agent")!.generate(
        "Look up record id=abc-123 and tell me what you find."
      );
      console.log(res.text);
    },
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
