/**
 * Error handling reference for `@agenticcontrolplane/proxy`.
 *
 * Run:
 *   ACP_API_KEY=gsk_... node --import=tsx examples/proxy-error-handling.ts
 *
 * Demonstrates the typed errors the SDK throws and what your app should
 * do with each. Try this:
 *   1. Without GitHub connected — see AcpProviderNotConnectedError.
 *   2. With a deliberately bad API key — see AcpUnauthorizedError.
 *   3. With ACP_BASE_URL pointed at an unreachable host + failMode "closed"
 *      — see AcpUnreachableError.
 */

import {
  acpFetch,
  AcpError,
  AcpFeatureDisabledError,
  AcpPolicyDeniedError,
  AcpProviderNotConnectedError,
  AcpUnauthorizedError,
  AcpUnreachableError,
  configure,
} from "@agenticcontrolplane/proxy";

configure({ apiKey: process.env.ACP_API_KEY, failMode: "closed" });

async function callGithub(): Promise<unknown> {
  const r = await acpFetch("https://api.github.com/user/repos");
  return r.json();
}

async function main(): Promise<void> {
  try {
    const repos = await callGithub();
    console.log("✓ got repos:", repos);
  } catch (err) {
    if (err instanceof AcpProviderNotConnectedError) {
      console.log("⚠ GitHub not connected for this user.");
      console.log("  Connect at:", err.connectUrl);
      console.log("  → Surface this URL to the user, then retry.");
      return;
    }
    if (err instanceof AcpFeatureDisabledError) {
      console.log("⚠ Tenant has the credential-brokering feature off.");
      console.log("  → Contact the tenant admin to enable it.");
      return;
    }
    if (err instanceof AcpUnauthorizedError) {
      console.log("✗ ACP rejected our credentials:", err.reason);
      console.log("  → Check ACP_API_KEY or rotate it.");
      return;
    }
    if (err instanceof AcpPolicyDeniedError) {
      console.log(`✗ ${err.httpMethod} ${err.path} denied by tenant policy (${err.operation}).`);
      console.log("  → This call is intentionally blocked by the gateway. Don't retry.");
      return;
    }
    if (err instanceof AcpUnreachableError) {
      console.log("✗ ACP gateway unreachable:", err.message);
      console.log("  → Check ACP_BASE_URL and network. Consider failMode: 'open' for non-critical paths.");
      return;
    }
    if (err instanceof AcpError) {
      console.log("✗ Unexpected ACP error:", err.code, err.message);
      return;
    }
    throw err;
  }
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
