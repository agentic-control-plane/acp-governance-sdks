import { getConfig } from "./config.js";
import {
  AcpPolicyDeniedError,
  AcpUnauthorizedError,
  AcpUnreachableError,
  AcpError,
} from "./errors.js";
import { getScopedToken, invalidateToken } from "./scoped-token-client.js";
import { matchVendor } from "./vendor-patterns.js";
import type { AcpFetchInit, FailMode, VendorPattern } from "./types.js";

/**
 * Drop-in replacement for `fetch` that routes calls to known vendors through
 * the ACP egress proxy. Calls to non-vendor URLs pass through unchanged.
 *
 * Wire flow for a vendor URL:
 *   1. Match vendor via `vendor-patterns.ts`
 *   2. Mint (or reuse) a scoped token via `scoped-token-client.ts`
 *   3. Rewrite URL to the ACP gateway (e.g. /api/v3/* for GitHub REST)
 *   4. Replace `Authorization` with the scoped token
 *   5. Forward via native `fetch`
 *   6. Translate ACP error responses to typed errors; honor fail-mode on 5xx
 */
export async function acpFetch(
  input: string | URL | Request,
  init?: AcpFetchInit,
): Promise<Response> {
  const cfg = getConfig();
  const failMode: FailMode = init?.failMode ?? cfg.failMode;
  const url = inputToUrl(input);
  const vendor = matchVendor(url);

  if (!vendor) {
    return fetch(input as RequestInfo, sanitizeInit(init));
  }

  // Try once. On 401 token_*, invalidate cache and retry once.
  try {
    return await forwardThroughAcp({ url, init, vendor, failMode, retried: false });
  } catch (err) {
    if (err instanceof AcpUnauthorizedError && !err.reason.startsWith("no_auth_provided")) {
      // Cached token may have been revoked / expired between cache hit and use.
      // Invalidate and try one more time with a fresh mint.
      const minted = await getScopedToken(vendor.provider, { ...(init?.apiKey !== undefined && { apiKey: init.apiKey }) });
      invalidateToken(minted.identityKey, vendor.provider);
      return await forwardThroughAcp({ url, init, vendor, failMode, retried: true });
    }
    throw err;
  }
}

interface ForwardArgs {
  url: URL;
  init: AcpFetchInit | undefined;
  vendor: VendorPattern;
  failMode: FailMode;
  retried: boolean;
}

async function forwardThroughAcp(args: ForwardArgs): Promise<Response> {
  const cfg = getConfig();
  const { url, init, vendor, failMode } = args;

  let minted;
  try {
    minted = await getScopedToken(vendor.provider, {
      ...(init?.apiKey !== undefined && { apiKey: init.apiKey }),
    });
  } catch (err) {
    return handleFailMode({ err, url, init, failMode });
  }

  const rewritten = vendor.rewrite(url, cfg.baseUrl);
  const headers = mergeHeaders(init?.headers);
  headers.set("Authorization", `Bearer ${minted.token}`);
  headers.set("X-GS-Client", cfg.clientHeader);

  const forwardInit: RequestInit = {
    ...sanitizeInit(init),
    headers,
  };

  let resp: Response;
  try {
    resp = await fetch(rewritten.toString(), forwardInit);
  } catch (err) {
    return handleFailMode({
      err: new AcpUnreachableError({
        reason: err instanceof Error ? err.message : "fetch_failed",
        cause: err,
      }),
      url,
      init,
      failMode,
    });
  }

  if (resp.status === 401) {
    const body = await peekJson(resp.clone());
    const reason = extractError(body) ?? "unauthorized";
    if (reason.startsWith("token_")) {
      throw new AcpUnauthorizedError({ reason, status: 401, body });
    }
    throw new AcpUnauthorizedError({ reason, status: 401, body });
  }

  if (resp.status === 403) {
    const body = await peekJson(resp.clone());
    if (extractError(body) === "denied_by_pattern_policy") {
      const op = (body as { operation?: unknown })?.operation;
      const path = (body as { path?: unknown })?.path;
      throw new AcpPolicyDeniedError({
        operation: typeof op === "string" ? op : "unknown",
        method: (init?.method ?? "GET").toUpperCase(),
        path: typeof path === "string" ? path : url.pathname,
        body,
      });
    }
  }

  if (resp.status >= 500) {
    return handleFailMode({
      err: new AcpUnreachableError({
        reason: `http_${resp.status}`,
        status: resp.status,
      }),
      url,
      init,
      failMode,
    });
  }

  return resp;
}

interface FailModeArgs {
  err: unknown;
  url: URL;
  init: AcpFetchInit | undefined;
  failMode: FailMode;
}

function handleFailMode(args: FailModeArgs): Promise<Response> {
  if (args.failMode === "closed") {
    throw args.err;
  }
  // Open mode: log + pass through to original vendor URL with whatever
  // credentials the caller provided. Auditability is degraded for this call,
  // but the agent doesn't break.
  const meta = args.err instanceof AcpError
    ? { code: args.err.code, status: args.err.status }
    : { error: args.err instanceof Error ? args.err.message : String(args.err) };
  console.warn(`@agenticcontrolplane/proxy: fail-open fallback for ${args.url.href}`, meta);
  return fetch(args.url.toString(), sanitizeInit(args.init));
}

function inputToUrl(input: string | URL | Request): URL {
  if (typeof input === "string") return new URL(input);
  if (input instanceof URL) return input;
  return new URL(input.url);
}

function sanitizeInit(init: AcpFetchInit | undefined): RequestInit | undefined {
  if (!init) return undefined;
  // Strip our extra fields so they don't reach native fetch.
  const { failMode: _failMode, apiKey: _apiKey, ...rest } = init;
  return rest as RequestInit;
}

function mergeHeaders(input: HeadersInit | undefined): Headers {
  if (input instanceof Headers) return new Headers(input);
  return new Headers(input ?? {});
}

async function peekJson(resp: Response): Promise<unknown> {
  try {
    return await resp.json();
  } catch {
    return null;
  }
}

function extractError(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const err = (body as { error?: unknown }).error;
  return typeof err === "string" ? err : null;
}
