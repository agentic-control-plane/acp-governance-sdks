import type { Config } from "./types.js";

const DEFAULT_BASE_URL = "https://api.agenticcontrolplane.com";
const DEFAULT_TIMEOUT_MS = 5000;

let current: Config = {
  baseUrl: process.env.ACP_BASE_URL ?? DEFAULT_BASE_URL,
  timeoutMs: DEFAULT_TIMEOUT_MS,
  clientHeader: "acp-governance-js/0.2.0",
};

export function getConfig(): Config {
  return current;
}

/**
 * Override global governance config. Safe to call once at process startup.
 * Call again to update; affects all subsequent pre/post calls.
 */
export function configure(partial: Partial<Config>): void {
  current = { ...current, ...partial };
}
