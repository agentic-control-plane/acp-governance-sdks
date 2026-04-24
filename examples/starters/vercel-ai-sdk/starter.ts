/**
 * ACP Starter — Vercel AI SDK (TypeScript)
 *
 * The minimum code to wire ACP governance into an agent built with the
 * Vercel AI SDK (`ai` npm package, v6). Copy this folder, swap the
 * placeholder tool for your real one, ship.
 *
 * Governance pattern: decorator. `governed("tool_name", fn)` from the
 * base `@agenticcontrolplane/governance` package wraps each tool's
 * `execute` function with ACP's pre/post hooks. Vercel AI SDK calls the
 * wrapped version; denials return a tool_error string that the model
 * sees as tool output and adapts to.
 *
 * No framework-specific ACP adapter package is needed — the base
 * `governed()` helper composes cleanly with Vercel AI SDK's `tool()`.
 *
 * Run:  bash run.sh
 */

import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";

import {
  configure,
  governed,
  withContext,
} from "@agenticcontrolplane/governance";

// ── 1. Load ACP credentials from ./.env next to this file.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const { ANTHROPIC_API_KEY, ACP_USER_TOKEN, ACP_GATEWAY_URL = "https://api.agenticcontrolplane.com" } = process.env;
if (!ANTHROPIC_API_KEY) throw new Error("Missing ANTHROPIC_API_KEY");
if (!ACP_USER_TOKEN) throw new Error("Missing ACP_USER_TOKEN (gsk_...)");

// ── 2. Point the governance SDK at your ACP gateway. Once per process.
configure({ baseUrl: ACP_GATEWAY_URL });

// ── 3. Define your tool with governance baked in. `governed(name, fn)`
// wraps your async function; Vercel AI SDK's `tool({...execute})`
// receives the wrapped version. Order and name matter — the name passed
// to `governed()` is what shows up in the ACP activity log.
// REPLACE the body with your real logic (DB lookup, API call, etc.).
const lookupRecord = governed(
  "lookup_record",
  async ({ id }: { id: string }) => {
    return { id, status: "placeholder", note: "replace me with real logic" };
  },
);

// ── 4. Agent loop via `generateText`. `stopWhen: stepCountIs(5)` caps
// the tool-use iterations (replaces the deprecated `maxSteps`).
async function run(prompt: string) {
  const result = await generateText({
    model: anthropic("claude-sonnet-4-6"),
    tools: {
      lookup_record: tool({
        description: "Look up a record by ID. Replace with your real tool description.",
        inputSchema: z.object({
          id: z.string().describe("The record ID to look up."),
        }),
        execute: lookupRecord,
      }),
    },
    stopWhen: stepCountIs(5),
    prompt,
  });
  console.log(result.text);
}

// ── 5. `withContext` binds the user's identity for every governance
// call inside. Without this wrapper, pre/post hooks silently no-op.
async function main() {
  await withContext(
    {
      userToken: ACP_USER_TOKEN!,
      agentName: "my-vercel-agent", // Rename for your agent.
      agentTier: "background",
    },
    () => run("Look up record id=abc-123 and tell me what you find."),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
