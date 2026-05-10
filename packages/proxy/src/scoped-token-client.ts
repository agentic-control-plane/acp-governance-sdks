import { createHash } from "node:crypto";
import { getConfig } from "./config.js";
import {
  AcpFeatureDisabledError,
  AcpProviderNotConnectedError,
  AcpUnauthorizedError,
  AcpUnreachableError,
} from "./errors.js";
import type { ScopedTokenResponse } from "./types.js";

/**
 * Resolve the auth header to send to ACP — either a user JWT (from the
 * governance package's AsyncLocalStorage context, if installed) or the
 * configured API key.
 *
 * The governance package is an OPTIONAL peer dep — we dynamic-import it
 * inside a try/catch so the proxy package works fine without it.
 */
async function resolveAuth(perCallApiKey?: string): Promise<{ header: string; identityKey: string }> {
  // 1. Try to read userToken from @agenticcontrolplane/governance's context.
  try {
    const mod = await import("@agenticcontrolplane/governance");
    const ctx = mod.getContext?.();
    if (ctx?.userToken) {
      return {
        header: `Bearer ${ctx.userToken}`,
        identityKey: hashAuth(ctx.userToken),
      };
    }
  } catch {
    // Package not installed — fall through to API-key mode.
  }

  // 2. Fall back to API key (per-call override, then global config, then env).
  const cfg = getConfig();
  const apiKey = perCallApiKey ?? cfg.apiKey ?? process.env.ACP_API_KEY;
  if (!apiKey) {
    throw new AcpUnauthorizedError({
      reason: "no_auth_provided — set ACP_API_KEY, call configure({ apiKey }), or use withContext({ userToken }) from @agenticcontrolplane/governance",
    });
  }
  return {
    header: `Bearer ${apiKey}`,
    identityKey: hashAuth(apiKey),
  };
}

/** SHA-256 hash truncated to 16 bytes — opaque cache key, not reversible. */
function hashAuth(secret: string): string {
  return createHash("sha256").update(secret).digest("hex").slice(0, 32);
}

/* --------------------------------------------------------------- */
/* In-process LRU cache for scoped tokens                          */
/* --------------------------------------------------------------- */

interface CachedToken {
  token: string;
  expiresAtMs: number;
}

const tokenCache = new Map<string, CachedToken>();

function cacheKey(identityKey: string, provider: string): string {
  return `${identityKey}:${provider}`;
}

function getCached(key: string): string | null {
  const entry = tokenCache.get(key);
  if (!entry) return null;
  const cfg = getConfig();
  if (Date.now() + cfg.cacheExpiryBufferMs >= entry.expiresAtMs) {
    tokenCache.delete(key);
    return null;
  }
  // LRU touch
  tokenCache.delete(key);
  tokenCache.set(key, entry);
  return entry.token;
}

function putCached(key: string, token: string, expiresAtMs: number): void {
  const cfg = getConfig();
  tokenCache.set(key, { token, expiresAtMs });
  while (tokenCache.size > cfg.cacheMaxEntries) {
    const oldest = tokenCache.keys().next().value;
    if (oldest === undefined) break;
    tokenCache.delete(oldest);
  }
}

/** Test-only: drop all cached tokens. */
export function _clearTokenCacheForTests(): void {
  tokenCache.clear();
}

/** Invalidate any cached token for this identity + provider. */
export function invalidateToken(identityKey: string, provider: string): void {
  tokenCache.delete(cacheKey(identityKey, provider));
}

/* --------------------------------------------------------------- */
/* Scoped-token mint + error translation                           */
/* --------------------------------------------------------------- */

export interface MintedToken {
  token: string;
  identityKey: string;
}

/**
 * Get a scoped token for the given provider. Returns a cached token if one
 * is still valid, otherwise mints a new one via POST /api/v1/scoped-tokens.
 *
 * Throws typed errors for the well-known failure modes (not connected,
 * feature disabled, unauthorized, unreachable). The caller decides what to
 * do — `acp-fetch.ts` translates 5xx into fail-mode behavior.
 */
export async function getScopedToken(
  provider: string,
  opts: { ttlSeconds?: number; apiKey?: string } = {},
): Promise<MintedToken> {
  const cfg = getConfig();
  const auth = await resolveAuth(opts.apiKey);
  const key = cacheKey(auth.identityKey, provider);

  const cached = getCached(key);
  if (cached) return { token: cached, identityKey: auth.identityKey };

  const ttlSeconds = opts.ttlSeconds ?? cfg.defaultTokenTtlSeconds;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);

  let resp: Response;
  try {
    resp = await fetch(`${cfg.baseUrl}/api/v1/scoped-tokens`, {
      method: "POST",
      headers: {
        "Authorization": auth.header,
        "Content-Type": "application/json",
        "X-GS-Client": cfg.clientHeader,
      },
      body: JSON.stringify({ provider, ttlSeconds }),
      signal: controller.signal,
    });
  } catch (err: unknown) {
    throw new AcpUnreachableError({
      reason: err instanceof Error ? err.message : "fetch_failed",
      cause: err,
    });
  } finally {
    clearTimeout(timer);
  }

  if (resp.ok) {
    const body = (await resp.json()) as ScopedTokenResponse;
    const expiresAtMs = new Date(body.expiresAt).getTime();
    putCached(key, body.token, expiresAtMs);
    return { token: body.token, identityKey: auth.identityKey };
  }

  // Translate known error responses to typed errors.
  const body = await safeJson(resp);
  if (resp.status === 409 && isProviderNotConnected(body)) {
    throw new AcpProviderNotConnectedError({
      provider,
      connectUrl: String((body as { connectUrl?: unknown }).connectUrl ?? ""),
      body,
    });
  }
  if (resp.status === 404 && isFeatureDisabled(body)) {
    throw new AcpFeatureDisabledError({ feature: "scoped_tokens", body });
  }
  if (resp.status === 401 || resp.status === 403) {
    throw new AcpUnauthorizedError({
      reason: extractErrorString(body) ?? `http_${resp.status}`,
      status: resp.status,
      body,
    });
  }
  // 5xx + unknown — let the caller decide via fail-mode.
  throw new AcpUnreachableError({
    reason: `http_${resp.status}`,
    status: resp.status,
    body,
  });
}

async function safeJson(resp: Response): Promise<unknown> {
  try {
    return await resp.json();
  } catch {
    return null;
  }
}

function isProviderNotConnected(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  return (body as { error?: string }).error === "provider_not_connected";
}

function isFeatureDisabled(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  return (body as { error?: string }).error === "feature_disabled";
}

function extractErrorString(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const err = (body as { error?: unknown }).error;
  return typeof err === "string" ? err : null;
}
