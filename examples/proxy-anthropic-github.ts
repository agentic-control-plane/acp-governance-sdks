/**
 * Anthropic SDK + ACP credential brokering — minimal end-to-end demo.
 *
 * Run:
 *   ACP_API_KEY=gsk_... ANTHROPIC_API_KEY=sk-ant-... \
 *     node --import=tsx examples/proxy-anthropic-github.ts
 *
 * Prereqs:
 *   - The ACP user owning the API key has connected GitHub via the
 *     ACP dashboard.
 *   - The tenant has `proxyGithubEnabled` and `scopedTokensEnabled` true.
 *
 * What this demonstrates:
 *   - The Anthropic SDK is given `acpFetch` as its `fetch` override.
 *   - Inside the tool handler, we call `https://api.github.com/user/repos`
 *     via `acpFetch`. The SDK rewrites that to the ACP egress proxy and
 *     swaps in a short-lived scoped token. The agent's process never
 *     receives the real GitHub OAuth token.
 *
 * Strip the Anthropic agent loop and you have the same pattern for any
 * SDK that accepts a `fetch` override.
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  acpFetch,
  AcpProviderNotConnectedError,
  configure,
} from "@agenticcontrolplane/proxy";

configure({ apiKey: process.env.ACP_API_KEY });

async function listRepos(): Promise<string> {
  try {
    const r = await acpFetch("https://api.github.com/user/repos?per_page=10&sort=updated", {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!r.ok) return `GitHub returned ${r.status}: ${await r.text()}`;
    const data = (await r.json()) as Array<{ full_name: string }>;
    return data.map((r) => `- ${r.full_name}`).join("\n");
  } catch (err) {
    if (err instanceof AcpProviderNotConnectedError) {
      return `GitHub not connected. Connect at: ${err.connectUrl}`;
    }
    throw err;
  }
}

const anthropic = new Anthropic({ fetch: acpFetch });

async function main(): Promise<void> {
  // Anthropic SDK's own LLM API call also goes through acpFetch. Since
  // api.anthropic.com isn't a vendor pattern in v0.1, it passes through
  // unchanged. (LLM-call routing is a future, separate proxy class.)
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: "List the user's 5 most recently updated GitHub repos.",
      },
    ],
  });

  // For brevity, skip the tool-use loop — the proxy demo is the GitHub call:
  console.log("LLM response (first block):", msg.content[0]);
  console.log("---");
  console.log("Direct GitHub call via ACP proxy:\n");
  console.log(await listRepos());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
