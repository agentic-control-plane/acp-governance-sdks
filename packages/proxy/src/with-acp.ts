import { getConfig } from "./config.js";
import {
  AcpPolicyDeniedError,
  AcpUnauthorizedError,
} from "./errors.js";
import { getScopedToken } from "./scoped-token-client.js";
import { matchVendor } from "./vendor-patterns.js";

/**
 * Minimal duck type for the subset of an axios instance we use. Avoids
 * taking a hard dependency on axios.
 */
interface AxiosLikeRequestConfig {
  url?: string;
  baseURL?: string;
  method?: string;
  headers?: Record<string, unknown>;
}

interface AxiosLikeError {
  response?: {
    status: number;
    data: unknown;
    config?: AxiosLikeRequestConfig;
  };
  config?: AxiosLikeRequestConfig;
}

interface AxiosLikeInstance {
  interceptors: {
    request: { use(onFulfilled: (config: AxiosLikeRequestConfig) => Promise<AxiosLikeRequestConfig> | AxiosLikeRequestConfig): number };
    response: {
      use(
        onFulfilled: (resp: unknown) => unknown,
        onRejected: (err: AxiosLikeError) => unknown,
      ): number;
    };
  };
  defaults?: { baseURL?: string };
}

/**
 * Install ACP credential-brokering on an axios instance. Returns the same
 * instance so callers can chain or discard the return value.
 *
 *   import axios from "axios";
 *   import { withAcp } from "@agenticcontrolplane/proxy";
 *
 *   const gh = withAcp(axios.create({ baseURL: "https://api.github.com" }));
 *   const r = await gh.get("/user/repos");
 *
 * Adds a request interceptor that:
 *   - matches URLs against vendor patterns
 *   - mints scoped tokens
 *   - rewrites URL + Authorization to ACP's egress proxy
 *
 * Adds a response interceptor that:
 *   - translates ACP error envelopes (403 policy_denied, 401 token_*) into
 *     the typed error classes from @agenticcontrolplane/proxy
 *   - leaves all other errors / responses untouched
 *
 * Limitations: 5xx fail-mode is *not* applied here (axios surfaces 5xx as
 * errors and we let it through unchanged). For fail-mode behavior on 5xx,
 * use `acpFetch` instead.
 */
export function withAcp<T extends AxiosLikeInstance>(client: T): T {
  if (!client?.interceptors?.request?.use || !client?.interceptors?.response?.use) {
    throw new Error(
      "@agenticcontrolplane/proxy: withAcp expected an axios-shaped client with .interceptors.request and .interceptors.response. Got: " +
        typeof client,
    );
  }

  client.interceptors.request.use(async (config) => {
    const cfg = getConfig();
    const url = resolveAxiosUrl(config, client.defaults?.baseURL);
    if (!url) return config;

    const vendor = matchVendor(url);
    if (!vendor) return config;

    const minted = await getScopedToken(vendor.provider);
    const rewritten = vendor.rewrite(url, cfg.baseUrl);

    config.url = rewritten.toString();
    // We rewrote to an absolute URL; clear any baseURL so axios doesn't
    // double-prefix.
    config.baseURL = "";
    config.headers = {
      ...(config.headers ?? {}),
      Authorization: `Bearer ${minted.token}`,
      "X-GS-Client": cfg.clientHeader,
    };
    return config;
  });

  client.interceptors.response.use(
    (resp) => resp,
    (err: AxiosLikeError) => {
      const resp = err.response;
      if (!resp) {
        // Network error / no response — let axios's default rejection through.
        throw err;
      }
      const data = resp.data;
      const errorCode = extractErrorCode(data);

      if (resp.status === 403 && errorCode === "denied_by_pattern_policy") {
        const op = extractStringField(data, "operation");
        const path = extractStringField(data, "path");
        throw new AcpPolicyDeniedError({
          operation: op ?? "unknown",
          method: (err.config?.method ?? resp.config?.method ?? "GET").toUpperCase(),
          path: path ?? resolveAxiosUrl(err.config ?? resp.config ?? {}, client.defaults?.baseURL)?.pathname ?? "",
          body: data,
        });
      }

      if (resp.status === 401 && errorCode?.startsWith("token_")) {
        throw new AcpUnauthorizedError({ reason: errorCode, status: 401, body: data });
      }

      // Not an ACP-typed error — pass axios's original error through.
      throw err;
    },
  );

  return client;
}

function resolveAxiosUrl(
  config: AxiosLikeRequestConfig,
  instanceBaseUrl: string | undefined,
): URL | null {
  const raw = config.url;
  if (!raw) return null;
  const base = config.baseURL || instanceBaseUrl;
  try {
    return base ? new URL(raw, base) : new URL(raw);
  } catch {
    return null;
  }
}

function extractErrorCode(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const err = (body as { error?: unknown }).error;
  return typeof err === "string" ? err : null;
}

function extractStringField(body: unknown, field: string): string | null {
  if (!body || typeof body !== "object") return null;
  const v = (body as Record<string, unknown>)[field];
  return typeof v === "string" ? v : null;
}
