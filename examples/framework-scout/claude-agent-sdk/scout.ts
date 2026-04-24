/**
 * ACP Framework Scout — Claude Agent SDK (TypeScript) variant
 *
 * Same reference agent, re-implemented across 18 frameworks/clients. This one
 * uses Anthropic's Messages API + the @agenticcontrolplane/governance-anthropic
 * adapter (the decorator / tool-wrapping governance pattern).
 *
 * Run:
 *   node --env-file ~/.framework-scout/creds.env \
 *     node_modules/.bin/tsx examples/framework-scout/claude-agent-sdk/scout.ts
 *
 * Or the helper: see README.md next to this file.
 */

import "dotenv/config";
import dotenv from "dotenv";
import { homedir } from "node:os";
import path from "node:path";

import Anthropic from "@anthropic-ai/sdk";
import { Resend } from "resend";
import {
  governHandlers,
  withContext,
  configure,
} from "@agenticcontrolplane/governance-anthropic";

// Shared creds live outside any git repo so they can't be committed by accident.
dotenv.config({ path: path.join(homedir(), ".framework-scout", "creds.env") });

const {
  ANTHROPIC_API_KEY,
  RESEND_API_KEY,
  ACP_USER_TOKEN,
  ACP_GATEWAY_URL,
  EMAIL_FROM,
  EMAIL_TO,
} = process.env;

for (const [k, v] of Object.entries({
  ANTHROPIC_API_KEY, RESEND_API_KEY, ACP_USER_TOKEN, EMAIL_FROM, EMAIL_TO,
})) {
  if (!v) throw new Error(`Missing env var: ${k}`);
}

// Point the governance SDK at the ACP gateway. Defaults to production.
configure({ baseUrl: ACP_GATEWAY_URL });

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const resend = new Resend(RESEND_API_KEY);

// --------------------------------------------------------------------------
// Tools. governHandlers wraps each with: preToolUse → handler → postToolOutput.
// A deny from ACP makes the call return "tool_error: <reason>" — we pass that
// straight back as the Messages API tool_result so Claude can adapt.
// --------------------------------------------------------------------------

const handlers = governHandlers({
  search_hn: async ({ query, days_back = 14 }: { query: string; days_back?: number }) => {
    const since = Math.floor(Date.now() / 1000) - days_back * 86400;
    const url =
      `https://hn.algolia.com/api/v1/search` +
      `?query=${encodeURIComponent(query)}` +
      `&tags=story&numericFilters=created_at_i>${since}&hitsPerPage=20`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HN Algolia ${r.status}`);
    const data = (await r.json()) as { hits: any[] };
    return {
      hits: data.hits.map((h) => ({
        title: h.title,
        url: h.url || h.story_url,
        points: h.points,
        num_comments: h.num_comments,
        created_at: h.created_at,
        hn_discussion: `https://news.ycombinator.com/item?id=${h.objectID}`,
      })),
    };
  },

  send_email: async ({ subject, html }: { subject: string; html: string }) => {
    const res = await resend.emails.send({
      from: EMAIL_FROM!,
      to: EMAIL_TO!,
      subject,
      html,
    });
    if (res.error) throw new Error(`Resend: ${res.error.message}`);
    return { id: res.data?.id ?? null, status: "sent" };
  },
});

const tools: Anthropic.Tool[] = [
  {
    name: "search_hn",
    description:
      "Search Hacker News stories via Algolia for recent posts. Use for finding agent-framework launches, SDK releases, and AI dev-tool news. Returns up to 20 hits.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Keywords (e.g. 'agent framework', 'llm agent', 'autonomous agent').",
        },
        days_back: {
          type: "number",
          description: "How many days back to search (default 14).",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "send_email",
    description: "Send the final scout report to the user. Call ONCE at the end.",
    input_schema: {
      type: "object",
      properties: {
        subject: { type: "string", description: "Subject line (include today's date)." },
        html: {
          type: "string",
          description:
            "HTML body. Scannable: short intro, then 3-8 findings with name + link + 1-line why-it-matters-to-ACP.",
        },
      },
      required: ["subject", "html"],
    },
  },
];

const system = `You are the Agent Framework Scout for Agentic Control Plane (ACP).

Job: find newly-announced or recently-updated agent frameworks, agent SDKs, or agent-related developer tooling that ACP should consider integrating with. Hacker News is your primary source.

Run several searches with different queries to triangulate. Examples:
- "agent framework"
- "llm agents"
- "autonomous agent"
- "AI agent SDK"
- specific names worth checking ("mastra", "pydantic ai", "langgraph", etc.)

For each candidate, consider:
- Is it a library for *building* agents, or an end-user product?
- Language — Python / TypeScript matter most for ACP adapters.
- Has it been actively developed or discussed recently?
- Is it differentiated enough to be worth an integration?

After 3-6 searches, compile the 3-8 most interesting findings and email the user via send_email. HTML-formatted, scannable: short intro, then a list/table where each item has name + link + 1-line why-it-matters-to-ACP.

Call send_email exactly once. Then stop.`;

async function run() {
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Run a scout pass. Today: ${new Date().toISOString().slice(0, 10)}. Search HN for new agent frameworks from the last ~14 days and email me the summary.`,
    },
  ];

  for (let iter = 0; iter < 12; iter++) {
    const resp = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system,
      tools,
      messages,
    });

    console.log(`[iter ${iter}] stop_reason=${resp.stop_reason} usage=${JSON.stringify(resp.usage)}`);

    messages.push({ role: "assistant", content: resp.content });

    if (resp.stop_reason === "end_turn") {
      for (const b of resp.content) if (b.type === "text") console.log(b.text);
      console.log("\nScout complete.");
      return;
    }

    if (resp.stop_reason !== "tool_use") {
      console.log("unexpected stop_reason; exiting");
      return;
    }

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of resp.content) {
      if (block.type !== "tool_use") continue;
      const fn = handlers[block.name as keyof typeof handlers];
      const out = fn
        ? await fn(block.input as any)
        : `tool_error: unknown tool ${block.name}`;
      const preview =
        typeof out === "string" ? out.slice(0, 120) : JSON.stringify(out).slice(0, 120);
      console.log(`  -> ${block.name}(${JSON.stringify(block.input).slice(0, 100)}) => ${preview}`);
      const content =
        typeof out === "string" ? out : JSON.stringify(out).slice(0, 30000);
      results.push({ type: "tool_result", tool_use_id: block.id, content });
    }

    messages.push({ role: "user", content: results });
  }

  console.log("hit max iterations (12) without end_turn");
}

// withContext binds the user token for every preToolUse/postToolOutput call
// inside (via AsyncLocalStorage). Without this, governance calls no-op.
async function main() {
  await withContext(
    { userToken: ACP_USER_TOKEN!, agentName: "framework-scout", agentTier: "background" },
    run,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
