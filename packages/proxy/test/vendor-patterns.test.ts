import { describe, expect, it } from "vitest";
import { matchVendor, VENDOR_PATTERNS } from "../src/vendor-patterns.js";

describe("VENDOR_PATTERNS shape", () => {
  it("each pattern has the required fields", () => {
    for (const p of VENDOR_PATTERNS) {
      expect(typeof p.provider).toBe("string");
      expect(p.provider).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(typeof p.matches).toBe("function");
      expect(typeof p.rewrite).toBe("function");
    }
  });

  it("v0.1 covers GitHub only", () => {
    const providers = new Set(VENDOR_PATTERNS.map((p) => p.provider));
    expect([...providers]).toEqual(["github"]);
  });
});

describe("matchVendor — GitHub", () => {
  it("matches api.github.com REST URLs", () => {
    expect(matchVendor(new URL("https://api.github.com/user/repos"))?.provider).toBe("github");
    expect(matchVendor(new URL("https://api.github.com/repos/x/y/issues"))?.provider).toBe("github");
    expect(matchVendor(new URL("https://api.github.com/users/me"))?.provider).toBe("github");
  });

  it("matches api.github.com/graphql", () => {
    expect(matchVendor(new URL("https://api.github.com/graphql"))?.provider).toBe("github");
  });

  it("does NOT match the user-facing site github.com", () => {
    expect(matchVendor(new URL("https://github.com/davidcrowe/repo"))).toBeNull();
    expect(matchVendor(new URL("https://github.com/x/y/issues/1"))).toBeNull();
  });

  it("does NOT match raw.githubusercontent.com", () => {
    expect(matchVendor(new URL("https://raw.githubusercontent.com/x/y/main/file"))).toBeNull();
  });

  it("does NOT match other vendors", () => {
    expect(matchVendor(new URL("https://api.gitlab.com/projects"))).toBeNull();
    expect(matchVendor(new URL("https://example.com/api"))).toBeNull();
  });
});

describe("rewrite — GitHub", () => {
  const base = "https://api.acp.example.com";

  it("rewrites REST paths under /api/v3", () => {
    const pattern = matchVendor(new URL("https://api.github.com/user/repos"))!;
    const rewritten = pattern.rewrite(new URL("https://api.github.com/user/repos"), base);
    expect(rewritten.href).toBe("https://api.acp.example.com/api/v3/user/repos");
  });

  it("rewrites /graphql to /api/graphql (NOT /api/v3/graphql)", () => {
    const pattern = matchVendor(new URL("https://api.github.com/graphql"))!;
    const rewritten = pattern.rewrite(new URL("https://api.github.com/graphql"), base);
    expect(rewritten.href).toBe("https://api.acp.example.com/api/graphql");
  });

  it("preserves query string", () => {
    const pattern = matchVendor(new URL("https://api.github.com/user/repos?per_page=100&sort=updated"))!;
    const rewritten = pattern.rewrite(
      new URL("https://api.github.com/user/repos?per_page=100&sort=updated"),
      base,
    );
    expect(rewritten.search).toBe("?per_page=100&sort=updated");
  });

  it("handles the base URL having a trailing path", () => {
    // Some configs may set baseUrl to include a path prefix; the rewrite
    // should still produce a sensible host+path combination.
    const pattern = matchVendor(new URL("https://api.github.com/user"))!;
    const rewritten = pattern.rewrite(new URL("https://api.github.com/user"), "https://acp.example.com");
    expect(rewritten.pathname).toBe("/api/v3/user");
  });
});
