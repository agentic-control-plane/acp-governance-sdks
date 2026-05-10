#!/usr/bin/env node
// Live end-to-end test for @agenticcontrolplane/proxy against api.agenticcontrolplane.com.
//
// Run:
//   ACP_API_KEY=gsk_... node packages/proxy/scripts/live-test.mjs
//
// Optional:
//   ACP_BASE_URL=https://localhost:8080      override gateway
//   ACP_PROXY_LIVE_TEST_TENANT=<slug>        for diagnostic logging only
//
// Prereqs:
//   - The user owning the gsk_ key has GitHub connected via the ACP dashboard
//   - The tenant has scopedTokensEnabled + proxyGithubEnabled true
//
// Exits non-zero on any failure. Each step prints PASS/FAIL with detail.

import {
  acpFetch,
  AcpError,
  AcpProviderNotConnectedError,
  AcpUnauthorizedError,
  configure,
  getConfig,
  withAcp,
} from "@agenticcontrolplane/proxy";

const apiKey = process.env.ACP_API_KEY;
if (!apiKey) {
  console.error("ACP_API_KEY required. Set it to a gsk_... key for a tenant with GitHub connected.");
  process.exit(2);
}
configure({ apiKey, failMode: "closed" });
console.log("Gateway:", getConfig().baseUrl);
console.log();

let passed = 0;
let failed = 0;

async function step(name, fn) {
  process.stdout.write(`→ ${name} ... `);
  try {
    const result = await fn();
    passed += 1;
    console.log(`PASS${result ? `  (${result})` : ""}`);
  } catch (err) {
    failed += 1;
    const detail = err instanceof AcpError
      ? `${err.constructor.name}: ${err.message}${err.body ? "\n     body=" + JSON.stringify(err.body) : ""}`
      : err?.stack ?? String(err);
    console.log("FAIL");
    console.log("    " + detail.replace(/\n/g, "\n    "));
  }
}

/* ---- 1. acpFetch: list repos through the GitHub REST proxy ---- */
await step("acpFetch GET https://api.github.com/user/repos returns repos", async () => {
  const r = await acpFetch("https://api.github.com/user/repos?per_page=3", {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const repos = await r.json();
  if (!Array.isArray(repos)) throw new Error("expected array, got: " + JSON.stringify(repos).slice(0, 200));
  return `${repos.length} repos returned, first: ${repos[0]?.full_name ?? "(empty)"}`;
});

/* ---- 2. acpFetch: viewer query through the GitHub GraphQL proxy ---- */
await step("acpFetch POST https://api.github.com/graphql viewer query", async () => {
  const r = await acpFetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "{ viewer { login } }" }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const json = await r.json();
  const login = json?.data?.viewer?.login;
  if (!login) throw new Error("no viewer.login in response: " + JSON.stringify(json));
  return `viewer = ${login}`;
});

/* ---- 3. withAcp(axios): same call via axios ---- */
await step("withAcp(axios) GET /user/repos via axios", async () => {
  const { default: axios } = await import("axios");
  const gh = withAcp(axios.create({
    baseURL: "https://api.github.com",
    headers: { Accept: "application/vnd.github+json" },
    adapter: "fetch",
  }));
  const r = await gh.get("/user/repos", { params: { per_page: 1 } });
  if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
  if (!Array.isArray(r.data)) throw new Error("expected array");
  return `${r.data.length} repo(s), first: ${r.data[0]?.full_name ?? "(empty)"}`;
});

/* ---- 4. Token caching: second call should not re-mint ---- */
await step("token cache: second acpFetch within TTL reuses scoped token", async () => {
  // We can't directly observe cache hits without extra instrumentation, but
  // we can do two back-to-back calls and verify both succeed quickly. The
  // cache test in the unit suite already verifies the LRU semantics; this
  // is a sanity check that the live flow doesn't error.
  const r1 = await acpFetch("https://api.github.com/user", { headers: { Accept: "application/vnd.github+json" } });
  const r2 = await acpFetch("https://api.github.com/user", { headers: { Accept: "application/vnd.github+json" } });
  if (!r1.ok || !r2.ok) throw new Error(`HTTP ${r1.status}/${r2.status}`);
  return "two calls OK";
});

/* ---- 5. Pass-through for non-vendor URLs ---- */
await step("non-vendor URL passes through (httpbin.org/uuid)", async () => {
  const r = await acpFetch("https://httpbin.org/uuid");
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const json = await r.json();
  if (!json?.uuid) throw new Error("no uuid in response");
  return `uuid=${json.uuid}`;
});

/* ---- 6. AcpUnauthorizedError on a deliberately bad key ---- */
await step("bad API key throws AcpUnauthorizedError", async () => {
  configure({ apiKey: "gsk_definitely_invalid_key_xxx" });
  try {
    await acpFetch("https://api.github.com/user/repos", { failMode: "closed" });
    throw new Error("expected throw, got success");
  } catch (err) {
    configure({ apiKey });
    if (err instanceof AcpUnauthorizedError) {
      return `code=${err.code} reason=${err.reason}`;
    }
    throw new Error(`expected AcpUnauthorizedError, got ${err?.constructor?.name}: ${err?.message}`);
  }
});

/* ---- 7. AcpProviderNotConnectedError shape (only runs if NOT connected) ---- */
// Skipping by default — only useful if the tenant has *not* connected GitHub,
// which would invalidate steps 1-4. To exercise this, run on a fresh tenant.

console.log();
console.log(`Done. ${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
