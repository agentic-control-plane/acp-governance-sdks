/**
 * Smoke tests for GovernanceClient. Mocks fetch — no network calls.
 *
 * Run with: node --test --import=./test-loader.mjs packages/governance/src/client.test.ts
 * (or use vitest if added later — kept node:test-only to avoid extra deps for v0)
 */
import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { GovernanceClient } from "./client.js";
import { GovernanceBlockedError, GovernanceDeniedError } from "./errors.js";

const ORIGINAL_FETCH = globalThis.fetch;

function mockFetch(handler: (url: string, init: RequestInit) => Promise<Response>) {
  globalThis.fetch = ((url: string, init: RequestInit) => handler(url, init)) as typeof fetch;
}

describe("GovernanceClient", () => {
  beforeEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
  });

  it("requires an apiKey", () => {
    assert.throws(() => new GovernanceClient({ apiKey: "" }), /apiKey is required/);
  });

  it("allow + pass: returns the tool's output unchanged", async () => {
    const calls: string[] = [];
    mockFetch(async (url) => {
      calls.push(url);
      const path = new URL(url).pathname;
      if (path.endsWith("/tool-use"))   return new Response(JSON.stringify({ decision: "allow" }));
      if (path.endsWith("/tool-output")) return new Response(JSON.stringify({ action: "pass" }));
      return new Response("nope", { status: 500 });
    });

    const acp = new GovernanceClient({ apiKey: "gsk_test_xxx" });
    const r = await acp.governTool({
      tool: "github.create",
      input: { name: "x" },
      agent: { agentName: "pr-reviewer" },
      execute: async () => ({ id: 42 }),
    });

    assert.deepEqual(r.output, { id: 42 });
    assert.equal(r.redacted, false);
    assert.equal(calls.length, 2);
  });

  it("deny throws GovernanceDeniedError before execute runs", async () => {
    let executed = false;
    mockFetch(async (url) => {
      const path = new URL(url).pathname;
      if (path.endsWith("/tool-use")) {
        return new Response(JSON.stringify({ decision: "deny", reason: "scope missing" }));
      }
      return new Response("{}");
    });

    const acp = new GovernanceClient({ apiKey: "gsk_test_xxx" });
    await assert.rejects(
      acp.governTool({
        tool: "github.delete",
        input: {},
        agent: { agentName: "pr-reviewer" },
        execute: async () => { executed = true; return null; },
      }),
      (err: unknown) =>
        err instanceof GovernanceDeniedError && err.reason === "scope missing",
    );
    assert.equal(executed, false, "execute must NOT run when denied");
  });

  it("PostToolUse block throws GovernanceBlockedError", async () => {
    mockFetch(async (url) => {
      const path = new URL(url).pathname;
      if (path.endsWith("/tool-use")) return new Response(JSON.stringify({ decision: "allow" }));
      if (path.endsWith("/tool-output")) {
        return new Response(JSON.stringify({ action: "block", reason: "secret leaked" }));
      }
      return new Response("{}");
    });

    const acp = new GovernanceClient({ apiKey: "gsk_test_xxx" });
    await assert.rejects(
      acp.governTool({
        tool: "fs.read",
        input: { path: "/etc/passwd" },
        agent: { agentName: "pr-reviewer" },
        execute: async () => "user:x:0:0:root:/root:/bin/bash",
      }),
      (err: unknown) =>
        err instanceof GovernanceBlockedError && err.reason === "secret leaked",
    );
  });

  it("PostToolUse redact returns modified_output and flags redacted=true", async () => {
    mockFetch(async (url) => {
      const path = new URL(url).pathname;
      if (path.endsWith("/tool-use")) return new Response(JSON.stringify({ decision: "allow" }));
      if (path.endsWith("/tool-output")) {
        return new Response(JSON.stringify({
          action: "redact",
          modified_output: "user contact: <REDACTED:email>",
          findings: { pii: [{ type: "email" }] },
        }));
      }
      return new Response("{}");
    });

    const acp = new GovernanceClient({ apiKey: "gsk_test_xxx" });
    const r = await acp.governTool({
      tool: "salesforce.contact",
      input: { id: "001" },
      agent: { agentName: "researcher" },
      execute: async () => "user contact: alice@example.com",
    });
    assert.equal(r.output, "user contact: <REDACTED:email>");
    assert.equal(r.redacted, true);
    assert.deepEqual(r.findings, { pii: [{ type: "email" }] });
  });

  it("fail-closed: PreToolUse on network error denies", async () => {
    mockFetch(async () => { throw new Error("ECONNREFUSED"); });
    const acp = new GovernanceClient({ apiKey: "gsk_test_xxx", failureMode: "closed" });
    await assert.rejects(
      acp.governTool({
        tool: "x", input: {}, agent: { agentName: "a" }, execute: async () => 1,
      }),
      (err: unknown) => err instanceof GovernanceDeniedError,
    );
  });

  it("fail-open: PreToolUse on network error allows", async () => {
    let executed = false;
    let postCalled = false;
    mockFetch(async (url) => {
      const path = new URL(url).pathname;
      if (path.endsWith("/tool-use")) throw new Error("ECONNREFUSED");
      if (path.endsWith("/tool-output")) { postCalled = true; return new Response(JSON.stringify({ action: "pass" })); }
      throw new Error("unexpected");
    });
    const acp = new GovernanceClient({ apiKey: "gsk_test_xxx", failureMode: "open" });
    const r = await acp.governTool({
      tool: "x", input: {}, agent: { agentName: "a" },
      execute: async () => { executed = true; return 1; },
    });
    assert.equal(executed, true);
    assert.equal(postCalled, true);
    assert.equal(r.output, 1);
  });

  // Suppress unused-var warning on `mock` import — node:test exposes it but we use beforeEach instead.
  void mock;
});
