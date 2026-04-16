/**
 * Thrown when the PreToolUse governance check returns `decision: "deny"` or
 * when the SDK is configured `failureMode: "closed"` and the governance
 * plane is unreachable.
 */
export class GovernanceDeniedError extends Error {
  override readonly name = "GovernanceDeniedError";
  constructor(
    message: string,
    public readonly toolName: string,
    public readonly reason: string,
  ) {
    super(message);
  }
}

/**
 * Thrown when the PostToolUse governance check returns `action: "block"` —
 * the tool ran but the output was deemed unsafe to return. Caller should
 * surface a stub instead of using the output.
 */
export class GovernanceBlockedError extends Error {
  override readonly name = "GovernanceBlockedError";
  constructor(
    message: string,
    public readonly toolName: string,
    public readonly reason: string,
  ) {
    super(message);
  }
}
