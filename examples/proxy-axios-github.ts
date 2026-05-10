/**
 * Axios + ACP credential brokering.
 *
 * Run:
 *   ACP_API_KEY=gsk_... node --import=tsx examples/proxy-axios-github.ts
 *
 * `withAcp(axiosInstance)` installs request + response interceptors so
 * calls to GitHub are rewritten through ACP's egress proxy and authorized
 * with a short-lived scoped token.
 *
 * The same axios instance can still be used for non-vendor URLs — those
 * pass through unchanged.
 */

import axios from "axios";
import { configure, withAcp } from "@agenticcontrolplane/proxy";

configure({ apiKey: process.env.ACP_API_KEY });

const gh = withAcp(axios.create({
  baseURL: "https://api.github.com",
  headers: { Accept: "application/vnd.github+json" },
}));

async function main(): Promise<void> {
  const r = await gh.get<Array<{ full_name: string }>>("/user/repos", {
    params: { per_page: 5, sort: "updated" },
  });
  console.log(`Got ${r.data.length} repos:`);
  for (const repo of r.data) console.log(`- ${repo.full_name}`);
}

main().catch((err) => {
  console.error(err.response?.data ?? err);
  process.exit(1);
});
