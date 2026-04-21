/**
 * @agenticcontrolplane/governance
 *
 * Thin Node SDK for the ACP governance hook protocol. Wraps the two
 * endpoints ACP exposes for agent tool calls:
 *
 *   POST /govern/tool-use     — pre-tool check (allow/deny/ask)
 *   POST /govern/tool-output  — post-tool audit + PII scan
 *
 * Usage in a server handler:
 *
 *   import { withContext, governed } from "@agenticcontrolplane/governance";
 *
 *   const search = governed("web_search", async ({ query }) => doSearch(query));
 *
 *   app.post("/run", async (req) => {
 *     const token = req.header("authorization")!.slice("Bearer ".length);
 *     await withContext({ userToken: token }, async () => {
 *       const result = await search({ query: "..." });
 *       // result is either the tool output, or "tool_error: <reason>" if denied
 *     });
 *   });
 */

export { configure, getConfig } from "./config.js";
export { getContext, withContext } from "./context.js";
export { postToolOutput, preToolUse } from "./hook.js";
export { governed } from "./governed.js";
export type {
  Config,
  Decision,
  PostAction,
  PostToolOutputRequest,
  PostToolOutputResponse,
  PreToolUseRequest,
  PreToolUseResponse,
} from "./types.js";
export type { GovernanceContext } from "./context.js";
export type { AsyncHandler } from "./governed.js";
