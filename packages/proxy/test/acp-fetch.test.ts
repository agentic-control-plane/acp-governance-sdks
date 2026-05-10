import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acpFetch } from "../src/acp-fetch.js";
import { _resetConfigForTests, configure } from "../src/config.js";
import {
  AcpPolicyDeniedError,
  AcpProviderNotConnectedError,
  AcpUnauthorizedError,
  AcpUnreachableError,
} from "../src/errors.js";
import { _clearTokenCacheForTests } from "../src/scoped-token-client.js";

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

describe("acpFetch", () => {
  beforeEach(() => {
    _resetConfigForTests();
    _clearTokenCacheForTests();
    configure({ apiKey: "gsk_test_abc", baseUrl: ACP_BASE });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes through unchanged for non-vendor URLs", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }));

    await acpFetch("https://example.com/some/path", { method: "GET" });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe("https://example.com/some/path");
  });

  it("rewrites GitHub REST URLs and swaps the Authorization header", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as URL).toString();
      if (url.includes("/api/v1/scoped-tokens")) return mintResponse();
      // Return a fake GitHub-like response
      return new Response(JSON.stringify([{ name: "repo1" }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const r = await acpFetch("https://api.github.com/user/repos", {
      headers: { "Authorization": "token user_pat_should_be_replaced" },
    });
    expect(r.status).toBe(200);

    // Two fetches: one to mint, one to forward
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const forwardCall = fetchSpy.mock.calls[1]!;
    expect(String(forwardCall[0])).toBe("https://acp.test/api/v3/user/repos");
    const headers = forwardCall[1]?.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer acp_st_test_xyz");
  });

  it("rewrites GraphQL to /api/graphql", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as URL).toString();
      if (url.includes("/api/v1/scoped-tokens")) return mintResponse();
      return new Response(JSON.stringify({ data: { viewer: { login: "x" } } }), {
        status: 200,
      });
    });

    await acpFetch("https://api.github.com/graphql", { method: "POST", body: "{}" });
    const forwardCall = fetchSpy.mock.calls[1]!;
    expect(String(forwardCall[0])).toBe("https://acp.test/api/graphql");
  });

  it("translates 409 from token mint into AcpProviderNotConnectedError", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "provider_not_connected",
          connectUrl: "https://acp.test/t/integrations/github/start?state=abc",
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      ),
    );

    // fail-mode closed so the error propagates
    await expect(
      acpFetch("https://api.github.com/user/repos", { failMode: "closed" }),
    ).rejects.toBeInstanceOf(AcpProviderNotConnectedError);
  });

  it("translates 403 denied_by_pattern_policy into AcpPolicyDeniedError", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as URL).toString();
      if (url.includes("/api/v1/scoped-tokens")) return mintResponse();
      return new Response(
        JSON.stringify({
          error: "denied_by_pattern_policy",
          operation: "repos.delete",
          method: "DELETE",
          path: "/repos/x/y",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    });

    await expect(
      acpFetch("https://api.github.com/repos/x/y", { method: "DELETE" }),
    ).rejects.toBeInstanceOf(AcpPolicyDeniedError);
  });

  it("translates 401 token_expired into AcpUnauthorizedError after retry", async () => {
    let mintCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as URL).toString();
      if (url.includes("/api/v1/scoped-tokens")) {
        mintCalls += 1;
        return mintResponse(`acp_st_test_${mintCalls}`);
      }
      return new Response(JSON.stringify({ error: "token_expired" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    });

    await expect(
      acpFetch("https://api.github.com/user/repos", { failMode: "closed" }),
    ).rejects.toBeInstanceOf(AcpUnauthorizedError);
    // Should have minted twice (initial + retry)
    expect(mintCalls).toBeGreaterThanOrEqual(2);
  });

  it("fail-mode open: falls back to original vendor URL on token-mint 5xx", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let mintFailures = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as URL).toString();
      if (url.includes("/api/v1/scoped-tokens")) {
        mintFailures += 1;
        return new Response("upstream down", { status: 502 });
      }
      // We expect this to be the direct vendor URL (no rewrite)
      expect(url).toBe("https://api.github.com/user/repos");
      return new Response(JSON.stringify([{ name: "repo1" }]), { status: 200 });
    });

    const r = await acpFetch("https://api.github.com/user/repos", { failMode: "open" });
    expect(r.status).toBe(200);
    expect(mintFailures).toBe(1);
  });

  it("fail-mode closed: throws AcpUnreachableError on 5xx token-mint", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("upstream down", { status: 502 }),
    );

    await expect(
      acpFetch("https://api.github.com/user/repos", { failMode: "closed" }),
    ).rejects.toBeInstanceOf(AcpUnreachableError);
  });
});
