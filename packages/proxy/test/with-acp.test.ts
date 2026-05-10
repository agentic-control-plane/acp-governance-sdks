import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Axios with `adapter: "fetch"` calls `fetch(new Request(url, init))`. Extract the URL. */
function calledUrl(call: [unknown, ...unknown[]]): string {
  const arg = call[0];
  if (arg instanceof Request) return arg.url;
  if (arg instanceof URL) return arg.toString();
  return String(arg);
}
import { _resetConfigForTests, configure } from "../src/config.js";
import {
  AcpPolicyDeniedError,
  AcpUnauthorizedError,
} from "../src/errors.js";
import { _clearTokenCacheForTests } from "../src/scoped-token-client.js";
import { withAcp } from "../src/with-acp.js";

const ACP_BASE = "https://acp.test";

function mintResponse(token = "acp_st_test_xyz"): Response {
  return new Response(
    JSON.stringify({
      token,
      tokenId: "tok_1",
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      issuanceId: "iss_1",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("withAcp(axios)", () => {
  beforeEach(() => {
    _resetConfigForTests();
    _clearTokenCacheForTests();
    configure({ apiKey: "gsk_test_abc", baseUrl: ACP_BASE });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rewrites vendor URLs and swaps Authorization header", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as URL).toString();
      if (url.includes("/api/v1/scoped-tokens")) return mintResponse();
      return new Response(JSON.stringify([{ name: "repo1" }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const client = withAcp(axios.create({ baseURL: "https://api.github.com", adapter: "fetch" }));

    const r = await client.get("/user/repos");
    expect(r.status).toBe(200);

    // First call mints token, second call is the rewritten egress.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const forwardCall = fetchSpy.mock.calls[1]!;
    expect(calledUrl(forwardCall)).toContain("https://acp.test/api/v3/user/repos");
  });

  it("passes through non-vendor URLs unchanged", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("ok", { status: 200 }),
    );

    const client = withAcp(axios.create({ adapter: "fetch" }));
    await client.get("https://example.com/health");

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(calledUrl(fetchSpy.mock.calls[0]!)).toBe("https://example.com/health");
  });

  it("translates 403 denied_by_pattern_policy into AcpPolicyDeniedError", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as URL).toString();
      if (url.includes("/api/v1/scoped-tokens")) return mintResponse();
      return new Response(
        JSON.stringify({
          error: "denied_by_pattern_policy",
          operation: "repos.delete",
          path: "/repos/x/y",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    });

    const client = withAcp(axios.create({ baseURL: "https://api.github.com", adapter: "fetch" }));
    await expect(client.delete("/repos/x/y")).rejects.toBeInstanceOf(AcpPolicyDeniedError);
  });

  it("translates 401 token_expired into AcpUnauthorizedError", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as URL).toString();
      if (url.includes("/api/v1/scoped-tokens")) return mintResponse();
      return new Response(JSON.stringify({ error: "token_expired" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    });

    const client = withAcp(axios.create({ baseURL: "https://api.github.com", adapter: "fetch" }));
    await expect(client.get("/user/repos")).rejects.toBeInstanceOf(AcpUnauthorizedError);
  });

  it("rejects non-axios-shaped clients with a clear error", () => {
    expect(() => withAcp({} as never)).toThrow(/expected an axios-shaped client/);
  });
});
