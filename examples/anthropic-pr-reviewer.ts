/**
 * Example: governed PR reviewer using @agenticcontrolplane/governance-anthropic.
 *
 * Drives Anthropic's Messages API end-to-end with two tools (security_scan
 * and run_tests). Every tool_use block from Claude is intercepted by ACP
 * before execution. Denials surface back to Claude as error tool_results
 * so the model adapts gracefully.
 *
 * Run with:
 *   ANTHROPIC_API_KEY=... ACP_API_KEY=gsk_... \
 *     tsx examples/anthropic-pr-reviewer.ts
 *
 * The agent shows up in your ACP dashboard's Detected Agents view as
 * "pr-reviewer" with a per-call audit log.
 */
import Anthropic from "@anthropic-ai/sdk";
import { GovernanceClient } from "@agenticcontrolplane/governance";
import { runMessagesWithTools } from "@agenticcontrolplane/governance-anthropic";

const ANTHROPIC_API_KEY = process.env["ANTHROPIC_API_KEY"];
const ACP_API_KEY = process.env["ACP_API_KEY"];

if (!ANTHROPIC_API_KEY) throw new Error("Set ANTHROPIC_API_KEY");
if (!ACP_API_KEY) throw new Error("Set ACP_API_KEY (gsk_yourslug_xxxx)");

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const acp = new GovernanceClient({ apiKey: ACP_API_KEY });

// Stub tool handlers — replace with real Trufflehog / Semgrep / pytest calls.
const toolHandlers = {
  security_scan: async (input: unknown) => {
    const { repo } = input as { repo: string };
    return { findings: [], scanned: repo, status: "clean" };
  },
  run_tests: async (input: unknown) => {
    const { branch } = input as { branch: string };
    return { passed: 47, failed: 0, branch };
  },
};

const tools = [
  {
    name: "security_scan",
    description: "Scan a repository diff for secrets and SAST issues.",
    input_schema: {
      type: "object",
      properties: { repo: { type: "string" } },
      required: ["repo"],
    },
  },
  {
    name: "run_tests",
    description: "Run the test suite against a branch and report pass/fail.",
    input_schema: {
      type: "object",
      properties: { branch: { type: "string" } },
      required: ["branch"],
    },
  },
];

const result = await runMessagesWithTools({
  client: anthropic,
  acp,
  agent: { agentName: "pr-reviewer", agentTier: "api" },
  model: "claude-sonnet-4-6",
  system:
    "You review pull requests. Use security_scan to look for issues and run_tests to verify the suite passes. Then write a short summary.",
  messages: [
    {
      role: "user",
      content:
        "Review PR #42 in acme/repo on branch feature/billing. Run a security scan and the test suite, then summarize.",
    },
  ],
  tools,
  toolHandlers,
  maxIterations: 10,
});

console.log("\n=== Final assistant message ===");
for (const block of result.finalContent) {
  if (block.type === "text") console.log(block.text);
}
console.log(`\nIterations: ${result.iterations} | truncated: ${result.truncated}`);
console.log(
  "\nView the audit trail at https://cloud.agenticcontrolplane.com/activity",
);
