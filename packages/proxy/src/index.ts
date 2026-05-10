/**
 * @agenticcontrolplane/proxy
 *
 * Credential-brokering SDK for the Agentic Control Plane. Wrap `fetch` (or
 * an axios instance) so outbound calls to known vendors (GitHub today;
 * more coming) are routed through ACP's egress proxy with short-lived
 * scoped tokens. Your real OAuth credentials never leave the gateway.
 *
 * Two usage shapes — pick whichever fits your codebase:
 *
 *   // 1. Drop-in fetch
 *   import { acpFetch } from "@agenticcontrolplane/proxy";
 *   const r = await acpFetch("https://api.github.com/user/repos");
 *
 *   // 2. Wrap an axios instance
 *   import { withAcp } from "@agenticcontrolplane/proxy";
 *   import axios from "axios";
 *   const gh = withAcp(axios.create({ baseURL: "https://api.github.com" }));
 *
 * Identity model: every call traces back to a human accountable owner.
 * Either supply a user JWT via `withContext({ userToken })` from
 * @agenticcontrolplane/governance, or set `ACP_API_KEY` (gsk_...). The
 * gateway resolves originSub from whichever you provide and looks up that
 * user's connected credential server-side.
 *
 * Connection lifecycle: the OAuth dance happens out-of-band, in the ACP
 * dashboard, by whoever owns the credential. The SDK never runs OAuth.
 * If the user hasn't connected the vendor yet, calls throw
 * `AcpProviderNotConnectedError` carrying a `connectUrl` your app can
 * surface to the user.
 */

export { acpFetch } from "./acp-fetch.js";
export { withAcp } from "./with-acp.js";
export { configure, getConfig } from "./config.js";
export {
  AcpError,
  AcpFeatureDisabledError,
  AcpPolicyDeniedError,
  AcpProviderNotConnectedError,
  AcpUnauthorizedError,
  AcpUnreachableError,
} from "./errors.js";
export { matchVendor, VENDOR_PATTERNS } from "./vendor-patterns.js";
export type { AcpErrorCode } from "./errors.js";
export type {
  AcpFetchInit,
  Config,
  FailMode,
  ScopedTokenResponse,
  VendorPattern,
} from "./types.js";
