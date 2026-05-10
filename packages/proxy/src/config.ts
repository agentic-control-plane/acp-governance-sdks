import type { Config, FailMode } from "./types.js";

const DEFAULT_BASE_URL = "https://api.agenticcontrolplane.com";
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_TOKEN_TTL = 300; // 5 minutes
const DEFAULT_CACHE_MAX = 256;
const DEFAULT_CACHE_BUFFER_MS = 30_000; // shave 30s off server TTL when checking cache

let current: Config = {
  baseUrl: process.env.ACP_BASE_URL ?? DEFAULT_BASE_URL,
  timeoutMs: DEFAULT_TIMEOUT_MS,
  clientHeader: "@agenticcontrolplane/proxy/0.1.0",
  defaultTokenTtlSeconds: DEFAULT_TOKEN_TTL,
  failMode: (process.env.ACP_FAIL_MODE as FailMode) === "closed" ? "closed" : "open",
  apiKey: process.env.ACP_API_KEY,
  cacheMaxEntries: DEFAULT_CACHE_MAX,
  cacheExpiryBufferMs: DEFAULT_CACHE_BUFFER_MS,
};

export function getConfig(): Config {
  return current;
}

/**
 * Override module-level config. Safe to call once at process startup, or
 * repeatedly (subsequent calls merge over the existing config).
 */
export function configure(partial: Partial<Config>): void {
  current = { ...current, ...partial };
}

/** Test-only: reset config back to environment-derived defaults. */
export function _resetConfigForTests(): void {
  current = {
    baseUrl: process.env.ACP_BASE_URL ?? DEFAULT_BASE_URL,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    clientHeader: "@agenticcontrolplane/proxy/0.1.0",
    defaultTokenTtlSeconds: DEFAULT_TOKEN_TTL,
    failMode: (process.env.ACP_FAIL_MODE as FailMode) === "closed" ? "closed" : "open",
    apiKey: process.env.ACP_API_KEY,
    cacheMaxEntries: DEFAULT_CACHE_MAX,
    cacheExpiryBufferMs: DEFAULT_CACHE_BUFFER_MS,
  };
}
