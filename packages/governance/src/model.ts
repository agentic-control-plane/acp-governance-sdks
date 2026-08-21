/**
 * Proxy plane — point model clients at ACP so calls are priced and metered.
 *
 * `governed()` covers the *interception* plane: what the agent actually
 * executes. This module covers the *proxy* plane: what it spends. Both run
 * against the same gateway, so every URL here derives from the single
 * `baseUrl` in `config.ts` rather than hardcoding the host again.
 */
import { getConfig, configure } from "./config.js";
import type { Config } from "./types.js";

/**
 * The three model API shapes the gateway speaks, each on a *different* mount:
 *
 *   anthropic         POST {base}/anthropic/v1/messages
 *   openai            POST {base}/v1/chat/completions
 *   openai-responses  POST {base}/openai/v1/responses
 *
 * `openai` and `openai-responses` are NOT interchangeable: /v1 serves chat
 * completions only, /openai/v1 serves responses only. Picking the wrong one
 * gives a 404, not a fallback — which is most of why this helper exists.
 */
export type ModelShape = "anthropic" | "openai" | "openai-responses";

const SHAPE_PATHS: Record<ModelShape, string> = {
  anthropic: "/anthropic",
  openai: "/v1",
  "openai-responses": "/openai/v1",
};

/**
 * Which env vars each shape's official SDK reads. Both the Anthropic and
 * OpenAI SDKs resolve base URL and key from the environment at construction
 * time, which is what lets `init()` wire the proxy plane in one call.
 */
const SHAPE_ENV: Record<ModelShape, { urlEnv: string; keyEnv: string }> = {
  anthropic: { urlEnv: "ANTHROPIC_BASE_URL", keyEnv: "ANTHROPIC_API_KEY" },
  openai: { urlEnv: "OPENAI_BASE_URL", keyEnv: "OPENAI_API_KEY" },
  "openai-responses": { urlEnv: "OPENAI_BASE_URL", keyEnv: "OPENAI_API_KEY" },
};

const API_KEY_ENV = "ACP_API_KEY";

/** Thrown when the proxy plane can't be configured (bad shape, missing key). */
export class ModelConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelConfigError";
  }
}

function checkShape(shape: ModelShape): ModelShape {
  if (!(shape in SHAPE_PATHS)) {
    const valid = Object.keys(SHAPE_PATHS).sort().join(", ");
    throw new ModelConfigError(`unknown model shape "${shape}" — expected one of: ${valid}`);
  }
  return shape;
}

/**
 * The ACP proxy base URL for one model API shape. Pass it as `baseURL` to the
 * matching official SDK client.
 */
export function modelBaseUrl(shape: ModelShape = "anthropic"): string {
  checkShape(shape);
  return getConfig().baseUrl.replace(/\/+$/, "") + SHAPE_PATHS[shape];
}

/** The ACP workspace key (`gsk_...`) used to authenticate proxied calls. */
export function apiKey(): string {
  const key = process.env[API_KEY_ENV];
  if (!key) {
    throw new ModelConfigError(
      `${API_KEY_ENV} is not set — create a workspace key at ` +
        `https://cloud.agenticcontrolplane.com and export it as ${API_KEY_ENV}=gsk_...`,
    );
  }
  return key;
}

/**
 * Constructor options that point an official SDK client at the ACP proxy.
 *
 *   import Anthropic from "@anthropic-ai/sdk";
 *   import { modelClientOptions } from "@agenticcontrolplane/governance";
 *
 *   const client = new Anthropic(modelClientOptions("anthropic"));
 *
 * The gateway accepts the ACP key as `x-api-key`, which is the header both
 * SDKs send for `apiKey`, so no auth override is needed.
 */
export function modelClientOptions(shape: ModelShape = "anthropic"): {
  baseURL: string;
  apiKey: string;
} {
  checkShape(shape);
  return { baseURL: modelBaseUrl(shape), apiKey: apiKey() };
}

export interface InitOptions {
  /** Set false to configure the interception plane only. Default true. */
  proxy?: boolean;
  /** Which shapes to route. Default `["anthropic", "openai"]`. */
  shapes?: ModelShape[];
  /** Gateway base URL override, forwarded to `configure`. */
  baseUrl?: string;
  timeoutMs?: number;
  clientHeader?: string;
}

/**
 * Wire both planes in one call.
 *
 * Configures the governance hook, then points the model SDKs at the ACP proxy
 * by setting their environment variables. Call it **before** constructing any
 * model client — the SDKs read the environment at construction time.
 *
 *   import { init } from "@agenticcontrolplane/governance";
 *
 *   init();
 *   const client = new Anthropic();  // now priced and metered by ACP
 *
 * Routing per provider is all-or-nothing. If a provider's base URL is already
 * set to something other than ACP, that provider is left completely alone
 * (base URL *and* key) and a warning names it — a half-applied provider, ACP's
 * URL against a real vendor key, is just a 401.
 *
 * Returns a map of what happened, keyed by shape: the URL applied, or a
 * "skipped: ..." reason.
 */
export function init(options: InitOptions = {}): Record<string, string> {
  const { proxy = true, shapes = ["anthropic", "openai"] as ModelShape[] } = options;

  const partial: Partial<Config> = {};
  if (options.baseUrl !== undefined) partial.baseUrl = options.baseUrl;
  if (options.timeoutMs !== undefined) partial.timeoutMs = options.timeoutMs;
  if (options.clientHeader !== undefined) partial.clientHeader = options.clientHeader;
  configure(partial);

  const result: Record<string, string> = {};
  if (!proxy) return result;

  const key = apiKey();
  for (const shape of shapes) {
    checkShape(shape);
    const { urlEnv, keyEnv } = SHAPE_ENV[shape];
    const target = modelBaseUrl(shape);
    const current = process.env[urlEnv];

    if (current && current.replace(/\/+$/, "") !== target.replace(/\/+$/, "")) {
      result[shape] = `skipped: ${urlEnv} already set to ${current}`;
      console.warn(
        `acp init(): ${urlEnv} is already set to "${current}", so ${shape} calls are ` +
          `NOT routed through ACP and won't be priced. Unset it, or pass the proxy ` +
          `config explicitly with modelClientOptions("${shape}").`,
      );
      continue;
    }

    process.env[urlEnv] = target;
    process.env[keyEnv] = key;
    result[shape] = target;
  }

  return result;
}
