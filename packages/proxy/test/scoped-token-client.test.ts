import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AcpFeatureDisabledError,
  AcpProviderNotConnectedError,
  AcpUnauthorizedError,
  AcpUnreachableError,
} from "../src/errors.js";
import { _resetConfigForTests, configure } from "../src/config.js";
import {
  _clearTokenCacheForTests,
  getScopedToken,
} from "../src/scoped-token-client.js";

describe("getScopedToken", () => {
  beforeEach(() => {
    _resetConfigForTests();
    _clearTokenCacheForTests();
    configure({ apiKey: "gsk_test_abc123", baseUrl: "https://acp.test" });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("mints a token via POST /api/v1/scoped-tokens", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          token: "acp_st_test_xyz",
          tokenId: "tok_1",
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
          issuanceId: "iss_1",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const minted = await getScopedToken("github");
    expect(minted.token).toBe("acp_st_test_xyz");

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe("https://acp.test/api/v1/scoped-tokens");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["Authorization"]).toBe("Bearer gsk_test_abc123");
    const body = JSON.parse(String(init?.body));
    expect(body).toEqual({ provider: "github", ttlSeconds: 300 });
  });

  it("returns the cached token on a second call within TTL", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          token: "acp_st_test_one",
          tokenId: "tok_1",
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
          issuanceId: "iss_1",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const a = await getScopedToken("github");
    const b = await getScopedToken("github");
    expect(a.token).toBe(b.token);
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it("re-mints when the cached token is within the expiry buffer", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          token: `acp_st_test_${Date.now()}`,
          tokenId: "tok_1",
          // expires *inside* the 30s buffer — should be treated as expired on read
          expiresAt: new Date(Date.now() + 5_000).toISOString(),
          issuanceId: "iss_1",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await getScopedToken("github");
    await getScopedToken("github");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("throws AcpProviderNotConnectedError on 409", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          error: "provider_not_connected",
          connectUrl: "https://acp.test/tenant/integrations/github/start?state=abc",
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(getScopedToken("github")).rejects.toBeInstanceOf(AcpProviderNotConnectedError);
    try {
      await getScopedToken("github");
    } catch (err) {
      expect(err).toBeInstanceOf(AcpProviderNotConnectedError);
      const e = err as AcpProviderNotConnectedError;
      expect(e.provider).toBe("github");
      expect(e.connectUrl).toBe("https://acp.test/tenant/integrations/github/start?state=abc");
    }
  });

  it("throws AcpFeatureDisabledError on 404 feature_disabled", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "feature_disabled" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(getScopedToken("github")).rejects.toBeInstanceOf(AcpFeatureDisabledError);
  });

  it("throws AcpUnauthorizedError on 401", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "invalid_api_key" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(getScopedToken("github")).rejects.toBeInstanceOf(AcpUnauthorizedError);
  });

  it("throws AcpUnreachableError when the gateway is unreachable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(getScopedToken("github")).rejects.toBeInstanceOf(AcpUnreachableError);
  });

  it("throws AcpUnreachableError on 5xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("internal error", { status: 502 }),
    );
    await expect(getScopedToken("github")).rejects.toBeInstanceOf(AcpUnreachableError);
  });

  it("throws AcpUnauthorizedError when no auth is configured", async () => {
    configure({ apiKey: undefined });
    delete process.env.ACP_API_KEY;
    await expect(getScopedToken("github")).rejects.toBeInstanceOf(AcpUnauthorizedError);
  });

  it("respects per-call apiKey override", async () => {
    configure({ apiKey: undefined });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          token: "acp_st_override",
          tokenId: "tok_x",
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
          issuanceId: "iss_x",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await getScopedToken("github", { apiKey: "gsk_override_xyz" });
    const [, init] = fetchSpy.mock.calls[0]!;
    expect((init?.headers as Record<string, string>)["Authorization"]).toBe("Bearer gsk_override_xyz");
  });
});
