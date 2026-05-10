/**
 * Typed errors thrown by the ACP proxy package.
 *
 * All errors extend `AcpError`, so callers can `catch (e: AcpError)` for
 * a coarse handler and discriminate on `.code` / `instanceof` for the
 * specific case they want to handle (e.g. surface a connect URL).
 */

export type AcpErrorCode =
  | "provider_not_connected"
  | "feature_disabled"
  | "unauthorized"
  | "policy_denied"
  | "unreachable";

export class AcpError extends Error {
  readonly code: AcpErrorCode;
  readonly status?: number;
  readonly body?: unknown;

  constructor(code: AcpErrorCode, message: string, opts: { status?: number; body?: unknown } = {}) {
    super(message);
    this.name = "AcpError";
    this.code = code;
    if (opts.status !== undefined) this.status = opts.status;
    if (opts.body !== undefined) this.body = opts.body;
  }
}

/** Caller hasn't connected the vendor yet. Surface `connectUrl` to the user. */
export class AcpProviderNotConnectedError extends AcpError {
  readonly provider: string;
  readonly connectUrl: string;

  constructor(opts: { provider: string; connectUrl: string; body?: unknown }) {
    super("provider_not_connected", `ACP: ${opts.provider} is not connected for this user. Connect at ${opts.connectUrl}`, {
      status: 409,
      body: opts.body,
    });
    this.name = "AcpProviderNotConnectedError";
    this.provider = opts.provider;
    this.connectUrl = opts.connectUrl;
  }
}

/** Tenant has the proxy / scoped-tokens feature disabled. */
export class AcpFeatureDisabledError extends AcpError {
  constructor(opts: { feature: string; body?: unknown }) {
    super("feature_disabled", `ACP: feature "${opts.feature}" is disabled for this tenant`, {
      status: 404,
      body: opts.body,
    });
    this.name = "AcpFeatureDisabledError";
  }
}

/** ACP rejected the credentials (bad API key, expired token, revoked token). */
export class AcpUnauthorizedError extends AcpError {
  readonly reason: string;
  constructor(opts: { reason: string; status?: number; body?: unknown }) {
    super("unauthorized", `ACP: unauthorized (${opts.reason})`, {
      status: opts.status ?? 401,
      body: opts.body,
    });
    this.name = "AcpUnauthorizedError";
    this.reason = opts.reason;
  }
}

/** A pattern policy on the ACP gateway denied this call. */
export class AcpPolicyDeniedError extends AcpError {
  readonly operation: string;
  readonly httpMethod: string;
  readonly path: string;

  constructor(opts: { operation: string; method: string; path: string; body?: unknown }) {
    super("policy_denied", `ACP: ${opts.method} ${opts.path} denied by policy (${opts.operation})`, {
      status: 403,
      body: opts.body,
    });
    this.name = "AcpPolicyDeniedError";
    this.operation = opts.operation;
    this.httpMethod = opts.method;
    this.path = opts.path;
  }
}

/** ACP gateway unreachable / 5xx and fail-mode is "closed". */
export class AcpUnreachableError extends AcpError {
  override readonly cause?: unknown;

  constructor(opts: { reason: string; status?: number; cause?: unknown; body?: unknown }) {
    super("unreachable", `ACP: gateway unreachable (${opts.reason})`, {
      ...(opts.status !== undefined && { status: opts.status }),
      ...(opts.body !== undefined && { body: opts.body }),
    });
    this.name = "AcpUnreachableError";
    if (opts.cause !== undefined) this.cause = opts.cause;
  }
}
