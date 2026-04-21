import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export interface GovernanceContext {
  /** Bearer token identifying the end user (JWT, Firebase ID token, or gsk_ key). */
  userToken: string;
  /** Groups related tool calls in the audit log. Auto-generated if not provided. */
  sessionId: string;
  /** Optional: tier override (interactive, subagent, background, api). */
  agentTier?: "interactive" | "subagent" | "background" | "api";
  /** Optional: agent name shown in the dashboard's Detected Agents view. */
  agentName?: string;
}

const storage = new AsyncLocalStorage<GovernanceContext>();

/**
 * Run `fn` with a governance context bound. All `preToolUse` / `postToolOutput`
 * calls inside this async scope use the bound context's token.
 *
 * Typical usage: wrap the per-request handler body with this so the user's
 * JWT is in scope for every tool call their agent run makes.
 */
export function withContext<T>(
  ctx: { userToken: string; sessionId?: string; agentTier?: GovernanceContext["agentTier"]; agentName?: string },
  fn: () => Promise<T>,
): Promise<T> {
  const full: GovernanceContext = {
    userToken: ctx.userToken,
    sessionId: ctx.sessionId ?? randomUUID(),
    ...(ctx.agentTier !== undefined && { agentTier: ctx.agentTier }),
    ...(ctx.agentName !== undefined && { agentName: ctx.agentName }),
  };
  return storage.run(full, fn);
}

/** Read the current context. Returns undefined if not inside `withContext`. */
export function getContext(): GovernanceContext | undefined {
  return storage.getStore();
}
