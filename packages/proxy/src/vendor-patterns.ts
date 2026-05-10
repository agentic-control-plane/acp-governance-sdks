import type { VendorPattern } from "./types.js";

/**
 * URL-keyed vendor detection. v0.1 covers GitHub (REST + GraphQL).
 *
 * Each pattern decides:
 *   - whether an inbound URL belongs to this vendor's API
 *   - how to rewrite that URL to the ACP gateway's egress proxy path
 *
 * The rewrite mirrors `apps/tenant-gateway/src/proxy/github/handler.ts:rewriteGithubPath`
 * in the gatewaystack-connect repo, in inverse.
 */
export const VENDOR_PATTERNS: VendorPattern[] = [
  {
    provider: "github",
    matches: (u) => u.hostname === "api.github.com",
    rewrite: (u, base) => {
      const isGraphQL = u.pathname === "/graphql";
      const dest = new URL(base);
      dest.pathname = isGraphQL ? "/api/graphql" : `/api/v3${u.pathname}`;
      dest.search = u.search;
      return dest;
    },
  },
];

/**
 * Find the vendor pattern (if any) that matches a given URL.
 * Returns the first match — patterns must be mutually exclusive by hostname.
 */
export function matchVendor(url: URL): VendorPattern | null {
  for (const pattern of VENDOR_PATTERNS) {
    if (pattern.matches(url)) return pattern;
  }
  return null;
}
