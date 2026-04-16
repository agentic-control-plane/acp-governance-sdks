/**
 * @agenticcontrolplane/governance-anthropic
 *
 * Adapter for Anthropic's SDK and Claude Agent SDK. Two integration shapes:
 *
 * 1. `withGovernance(handlers, acp, agent)` — wrap a map of tool handlers.
 *    Each handler is intercepted with PreToolUse / PostToolUse governance.
 *    Drop-in replacement for your existing tool registry.
 *
 * 2. `runMessagesWithTools(...)` — full Anthropic Messages API tool-use
 *    loop with governance applied at every iteration. Use this when you
 *    want the SDK to drive the conversation and tool execution end-to-end.
 *
 * Both shapes carry the agent's `agentName` through to the audit log so
 * each Skill / sub-agent / role appears as a distinct row in the ACP
 * dashboard's Detected Agents view, and so delegation chains are
 * attributed correctly when one agent invokes another.
 */

export { withGovernance } from "./with-governance.js";
export { runMessagesWithTools } from "./messages-loop.js";
export type { ToolHandler, ToolHandlerMap, RunOptions, RunResult } from "./types.js";
