import type { AgentIdentity, GovernanceClient } from "@agenticcontrolplane/governance";
import type { ToolHandlerMap } from "./types.js";

/**
 * Wrap a map of tool handlers with ACP governance. Every call to a wrapped
 * handler runs PreToolUse → handler → PostToolUse, with the agent identity
 * propagated to every audit log entry.
 *
 * @example
 * const tools = withGovernance(
 *   {
 *     github_create_repo: async (input) => github.repos.create(input),
 *     slack_post:         async (input) => slack.chat.postMessage(input),
 *   },
 *   acp,
 *   { agentName: "pr-reviewer", agentTier: "api" },
 * );
 *
 * await tools.github_create_repo({ name: "new-repo", private: true });
 * // PreToolUse fires, handler runs, PostToolUse fires.
 */
export function withGovernance<H extends ToolHandlerMap>(
  handlers: H,
  acp: GovernanceClient,
  agent: AgentIdentity,
): H {
  const wrapped = {} as H;
  for (const [toolName, handler] of Object.entries(handlers)) {
    wrapped[toolName as keyof H] = (async (input: unknown) => {
      const result = await acp.governTool({
        tool: toolName,
        input,
        agent,
        execute: () => Promise.resolve(handler(input)),
      });
      return result.output;
    }) as H[keyof H];
  }
  return wrapped;
}
