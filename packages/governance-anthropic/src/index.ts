/**
 * @agenticcontrolplane/governance-anthropic
 *
 * Adapter for Anthropic's Messages API and Claude Agent SDK. Wrap your
 * tool handlers with ACP governance in one call; keep full control of the
 * tool-use loop.
 *
 * @example
 *   import Anthropic from "@anthropic-ai/sdk";
 *   import { governHandlers, withContext } from "@agenticcontrolplane/governance-anthropic";
 *
 *   const handlers = governHandlers({
 *     web_search: async ({ query }) => doSearch(query),
 *     send_email: async ({ to, subject, body }) => sendMail(to, subject, body),
 *   });
 *
 *   app.post("/run", async (req, res) => {
 *     const token = req.header("authorization")!.slice("Bearer ".length);
 *     await withContext({ userToken: token }, async () => {
 *       // run your normal tool-use loop; dispatch through handlers[name]
 *       // every dispatch is now governed by ACP
 *     });
 *   });
 */

import { governed } from "@agenticcontrolplane/governance";

export type ToolHandler = (input: any) => Promise<any>;
export type ToolHandlerMap = Record<string, ToolHandler>;

/**
 * Wrap a map of tool handlers with ACP governance. Each handler is replaced
 * with a governed version that runs PreToolUse → handler → PostToolUse.
 * Preserves the handler map shape — drop-in replacement.
 */
export function governHandlers<H extends ToolHandlerMap>(handlers: H): H {
  const wrapped = {} as H;
  for (const [name, handler] of Object.entries(handlers)) {
    wrapped[name as keyof H] = governed(name, handler as ToolHandler) as H[keyof H];
  }
  return wrapped;
}

// Re-exports so users only need one import.
export { governed, withContext, configure, getContext } from "@agenticcontrolplane/governance";
export type {
  Config,
  Decision,
  GovernanceContext,
  PostAction,
  PostToolOutputResponse,
  PreToolUseResponse,
} from "@agenticcontrolplane/governance";
