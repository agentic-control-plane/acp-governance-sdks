/**
 * Fail-open must be loud (acp-governance-sdks#6).
 *
 * Before this, preToolUse() returned { allowed: true, reason: "fail-open" }
 * for a missing context AND for a dead gateway, warned nowhere and wrote
 * nothing. Misconfiguration was indistinguishable from success. These pin
 * the three things that changed: the reason names the cause, the process is
 * told once per cause, and every ungoverned call leaves a lapse line.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { configure } from "./config.js";
import { withContext } from "./context.js";
import { _resetUngovernedWarningsForTests, preToolUse } from "./hook.js";

const GATEWAY = "https://gateway.test";
let dir: string;
let lapseLog: string;
let warns: string[];
const realFetch = globalThis.fetch;

function respond(status: number, body?: unknown) {
  globalThis.fetch = (async () =>
    new Response(body === undefined ? "" : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
}

function lapseLines(): string[] {
  return existsSync(lapseLog) ? readFileSync(lapseLog, "utf8").split("\n").filter((l) => l.trim()) : [];
}

describe("preToolUse — fail-open is loud", () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "acp-hook-test-"));
    lapseLog = join(dir, "lapse.log");
    process.env.ACP_LAPSE_LOG = lapseLog;
    configure({ baseUrl: GATEWAY });
    warns = [];
    mock.method(console, "warn", (m: unknown) => { warns.push(String(m)); });
    _resetUngovernedWarningsForTests();
  });
  afterEach(() => {
    mock.restoreAll();
    globalThis.fetch = realFetch;
    delete process.env.ACP_LAPSE_LOG;
    _resetUngovernedWarningsForTests();
    rmSync(dir, { recursive: true, force: true });
  });

  it("no context: allows, names the cause, warns once, records every call", async () => {
    const a = await preToolUse("web_search", { q: "x" });
    const b = await preToolUse("web_search", { q: "y" });
    assert.equal(a.allowed, true);
    assert.equal(a.decision, "allow");
    assert.ok(a.reason.startsWith("fail-open (not-configured)"), a.reason);
    assert.ok(b.reason.startsWith("fail-open (not-configured)"));
    assert.equal(warns.length, 1);
    assert.match(warns[0], /withContext/);
    const lines = lapseLines();
    assert.equal(lines.length, 2);
    assert.match(lines[0], /UNGOVERNED acp-governance-node not-configured tool=web_search/);
  });

  it("unreachable gateway: a different cause with its own warning", async () => {
    globalThis.fetch = (async () => { throw new TypeError("fetch failed"); }) as typeof fetch;
    const r = await withContext({ userToken: "tok" }, () => preToolUse("web_search", {}));
    assert.equal(r.allowed, true);
    assert.ok(r.reason.startsWith("fail-open (unreachable): TypeError"), r.reason);
    assert.equal(warns.length, 1);
    assert.match(lapseLines()[0], /unreachable tool=web_search TypeError/);
  });

  it("each cause warns independently; repeats are silent; every call is on the ledger", async () => {
    await preToolUse("t", {});                                   // not-configured
    await withContext({ userToken: "tok" }, async () => {
      globalThis.fetch = (async () => { throw new TypeError("x"); }) as typeof fetch;
      await preToolUse("t", {});                                 // unreachable
      respond(500);
      await preToolUse("t", {});                                 // gateway-error
      await preToolUse("t", {});                                 // gateway-error again → silent
    });
    const causes = warns.map((w) => /\((not-configured|unreachable|gateway-error):/.exec(w)?.[1]);
    assert.deepEqual(causes, ["not-configured", "unreachable", "gateway-error"]);
    assert.equal(lapseLines().length, 4);
  });

  it("a 4xx carrying a verdict IS the verdict, not an outage", async () => {
    respond(429, { decision: "deny", reason: "rate-limited: retry in 2s" });
    const r = await withContext({ userToken: "tok" }, () => preToolUse("web_search", {}));
    assert.deepEqual(r, { allowed: false, reason: "rate-limited: retry in 2s", decision: "deny" });
    assert.equal(warns.length, 0);
    assert.deepEqual(lapseLines(), []);
  });

  it("a bodyless 5xx is fail-open with the status in the reason", async () => {
    respond(503);
    const r = await withContext({ userToken: "tok" }, () => preToolUse("web_search", {}));
    assert.equal(r.allowed, true);
    assert.equal(r.reason, `fail-open (gateway-error): HTTP 503 from ${GATEWAY}/govern/tool-use`);
  });

  it("a real allow is unchanged and silent", async () => {
    respond(200, { decision: "allow", reason: "" });
    const r = await withContext({ userToken: "tok" }, () => preToolUse("web_search", {}));
    assert.deepEqual(r, { allowed: true, reason: "", decision: "allow" });
    assert.equal(warns.length, 0);
    assert.deepEqual(lapseLines(), []);
  });

  it("the lapse log can be disabled", async () => {
    process.env.ACP_LAPSE_LOG = "off";
    await preToolUse("t", {});
    assert.deepEqual(lapseLines(), []);
    assert.match(warns[0], /no lapse log \(disabled\)/);
  });
});
