/**
 * Proxy-plane tests. Node's built-in runner via tsx — no new dependencies.
 *
 * Run: npm test   (from packages/governance)
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";

import { configure } from "./config.js";
import { ModelConfigError, apiKey, init, modelBaseUrl, modelClientOptions } from "./model.js";

const GATEWAY = "https://api.agenticcontrolplane.com";
const TOUCHED = [
  "ACP_API_KEY",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_API_KEY",
];

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(TOUCHED.map((k) => [k, process.env[k]]));
  for (const k of TOUCHED) delete process.env[k];
  configure({ baseUrl: GATEWAY });
  mock.method(console, "warn", () => {});
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  configure({ baseUrl: GATEWAY });
  mock.restoreAll();
});

describe("modelBaseUrl", () => {
  it("gives each shape its own mount", () => {
    assert.equal(modelBaseUrl("anthropic"), `${GATEWAY}/anthropic`);
    assert.equal(modelBaseUrl("openai"), `${GATEWAY}/v1`);
    assert.equal(modelBaseUrl("openai-responses"), `${GATEWAY}/openai/v1`);
  });

  it("keeps the two OpenAI shapes distinct", () => {
    // /v1 serves chat completions, /openai/v1 serves responses. Conflating
    // them is a silent 404, so these must never resolve to the same base.
    assert.notEqual(modelBaseUrl("openai"), modelBaseUrl("openai-responses"));
  });

  it("derives from the configured gateway", () => {
    configure({ baseUrl: "https://acp.internal.example" });
    assert.equal(modelBaseUrl("anthropic"), "https://acp.internal.example/anthropic");
  });

  it("does not double up a trailing slash", () => {
    configure({ baseUrl: `${GATEWAY}/` });
    assert.equal(modelBaseUrl("openai"), `${GATEWAY}/v1`);
  });

  it("rejects an unknown shape", () => {
    assert.throws(() => modelBaseUrl("bedrock" as never), ModelConfigError);
  });
});

describe("keys", () => {
  it("fails with an actionable message when the key is missing", () => {
    assert.throws(() => apiKey(), /ACP_API_KEY/);
  });

  it("returns SDK-constructor-shaped options", () => {
    process.env.ACP_API_KEY = "gsk_test";
    assert.deepEqual(modelClientOptions("anthropic"), {
      baseURL: `${GATEWAY}/anthropic`,
      apiKey: "gsk_test",
    });
  });
});

describe("init", () => {
  it("routes both providers", () => {
    process.env.ACP_API_KEY = "gsk_test";
    const result = init();
    assert.equal(process.env.ANTHROPIC_BASE_URL, `${GATEWAY}/anthropic`);
    assert.equal(process.env.ANTHROPIC_API_KEY, "gsk_test");
    assert.equal(process.env.OPENAI_BASE_URL, `${GATEWAY}/v1`);
    assert.equal(process.env.OPENAI_API_KEY, "gsk_test");
    assert.equal(result.anthropic, `${GATEWAY}/anthropic`);
  });

  it("respects an existing operator choice, all-or-nothing", () => {
    process.env.ACP_API_KEY = "gsk_test";
    process.env.ANTHROPIC_BASE_URL = "https://my-gateway.example";
    process.env.ANTHROPIC_API_KEY = "sk-ant-real";
    const result = init({ shapes: ["anthropic"] });
    // An untouched base URL must keep its original key.
    assert.equal(process.env.ANTHROPIC_BASE_URL, "https://my-gateway.example");
    assert.equal(process.env.ANTHROPIC_API_KEY, "sk-ant-real");
    assert.match(result.anthropic, /skipped/);
  });

  it("warns when it skips a provider", () => {
    process.env.ACP_API_KEY = "gsk_test";
    process.env.OPENAI_BASE_URL = "https://other.example";
    init({ shapes: ["openai"] });
    assert.equal((console.warn as unknown as ReturnType<typeof mock.fn>).mock.callCount(), 1);
  });

  it("is idempotent and does not warn on its own URL", () => {
    process.env.ACP_API_KEY = "gsk_test";
    const first = init();
    const second = init();
    assert.deepEqual(first, second);
    assert.equal((console.warn as unknown as ReturnType<typeof mock.fn>).mock.callCount(), 0);
  });

  it("can select the responses shape", () => {
    process.env.ACP_API_KEY = "gsk_test";
    init({ shapes: ["openai-responses"] });
    assert.equal(process.env.OPENAI_BASE_URL, `${GATEWAY}/openai/v1`);
  });

  it("leaves the environment untouched when proxy is false", () => {
    process.env.ACP_API_KEY = "gsk_test";
    assert.deepEqual(init({ proxy: false }), {});
    assert.equal(process.env.ANTHROPIC_BASE_URL, undefined);
  });

  it("fails before mutating anything when the key is missing", () => {
    assert.throws(() => init(), ModelConfigError);
    assert.equal(process.env.ANTHROPIC_BASE_URL, undefined);
  });
});
