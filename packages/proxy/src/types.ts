/**
 * Wire types for the ACP credential-brokering protocol.
 *
 * These mirror the shapes used by the live gatewaystack-connect endpoints:
 *   POST /api/v1/scoped-tokens         — mint a scoped token
 *   GET/POST/PATCH/DELETE /api/v3/*    — GitHub REST egress proxy
 *   POST /api/graphql                  — GitHub GraphQL egress proxy
 *
 * The agent only ever holds the opaque scoped token (`acp_st_<slug>_<random>`).
 * The real OAuth credential never leaves the gateway.
 */

export type FailMode = "open" | "closed";

export interface Config {
  /** Gateway base URL. Defaults to https://api.agenticcontrolplane.com. */
  baseUrl: string;
  /** Per-request timeout for ACP API calls (token mint, error parse). */
  timeoutMs: number;
  /** Identifier sent as `X-GS-Client` so the gateway can attribute traffic. */
  clientHeader: string;
  /** Default scoped-token TTL requested from the gateway, in seconds. */
  defaultTokenTtlSeconds: number;
  /** Behavior when ACP is unreachable or returns 5xx — "open" (fall through to vendor with caller's creds, audit degraded) or "closed" (throw). */
  failMode: FailMode;
  /** API key (`gsk_...`) used in API-key mode. Falls back to ACP_API_KEY env. */
  apiKey?: string;
  /** Max scoped-token cache entries per process. */
  cacheMaxEntries: number;
  /** Buffer subtracted from server-issued TTL before treating cache entry as expired. */
  cacheExpiryBufferMs: number;
}

/** Successful response from POST /api/v1/scoped-tokens. */
export interface ScopedTokenResponse {
  token: string;
  tokenId: string;
  expiresAt: string;
  issuanceId: string;
  grantedScopes?: string[];
}

/** Per-call options accepted by `acpFetch` (extends standard `RequestInit`). */
export interface AcpFetchInit extends Omit<RequestInit, "signal"> {
  /** Override the global fail-mode for this call. */
  failMode?: FailMode;
  /** Override the global API key for this call. */
  apiKey?: string;
  /** Optional abort signal. */
  signal?: AbortSignal | null;
}

/** Internal: identifies a vendor-matching URL and how to rewrite it for ACP. */
export interface VendorPattern {
  /** Canonical lowercase provider id. Matches the slug used by ACP server-side. */
  provider: string;
  /** Returns true if the URL belongs to this vendor's API surface. */
  matches: (url: URL) => boolean;
  /** Produces the ACP-side URL given the inbound vendor URL and the configured base. */
  rewrite: (url: URL, baseUrl: string) => URL;
}
