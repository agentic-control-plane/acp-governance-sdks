# @agenticcontrolplane/proxy

> Credential brokering for SDK-deployed agents. Wrap `fetch` (or axios) so calls to known vendors are routed through ACP — short-lived scoped tokens replace your real OAuth credentials at the boundary.

The agent only ever holds an opaque `acp_st_...` token. The real OAuth credential never leaves the gateway.

```ts
import { acpFetch } from "@agenticcontrolplane/proxy";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ fetch: acpFetch });

// Inside a tool handler that calls GitHub:
const r = await acpFetch("https://api.github.com/user/repos");
// → SDK routes this through https://api.agenticcontrolplane.com/api/v3/user/repos
// → ACP server-side decrypts the user's stored OAuth token, forwards to GitHub
// → response relays back, agent never sees the real PAT
```

Pairs with [`@agenticcontrolplane/governance`](../governance) (`governed()` decorator for tool-call governance) — same identity model, different concern.

## Install

```bash
npm install @agenticcontrolplane/proxy
```

If you use `withContext({ userToken })` to scope calls to a specific user, also install the governance package (peer):

```bash
npm install @agenticcontrolplane/governance
```

## Usage

### Drop-in fetch

```ts
import { acpFetch } from "@agenticcontrolplane/proxy";

const r = await acpFetch("https://api.github.com/user/repos");
```

Works as a `fetch` override on any SDK that accepts one:

```ts
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic({ fetch: acpFetch });
```

### Wrap an axios instance

```ts
import axios from "axios";
import { withAcp } from "@agenticcontrolplane/proxy";

const gh = withAcp(axios.create({ baseURL: "https://api.github.com" }));
const r = await gh.get("/user/repos");
```

`withAcp` returns the same axios instance with request + response interceptors installed.

## Auth — two modes

### User-token mode (server-deployed agents)

If your app already plumbs a user JWT, wrap calls in `withContext` from `@agenticcontrolplane/governance`:

```ts
import { withContext } from "@agenticcontrolplane/governance";
import { acpFetch } from "@agenticcontrolplane/proxy";

app.post("/run", async (req) => {
  const userJwt = req.header("authorization")!.slice("Bearer ".length);
  await withContext({ userToken: userJwt }, async () => {
    const repos = await acpFetch("https://api.github.com/user/repos");
    // ACP resolves the user's identity from their JWT and looks up
    // *their* connected GitHub credential.
  });
});
```

### API-key mode (CLI / dev tools)

```ts
import { configure, acpFetch } from "@agenticcontrolplane/proxy";

configure({ apiKey: process.env.ACP_API_KEY }); // gsk_...
// or simply set ACP_API_KEY in the environment

const r = await acpFetch("https://api.github.com/user/repos");
```

## Connection lifecycle

The OAuth dance happens **out-of-band**, in the ACP dashboard, by whoever owns the credential. The SDK never runs OAuth.

If the user hasn't connected the vendor yet, the call throws `AcpProviderNotConnectedError` with a `connectUrl` your app surfaces:

```ts
import { acpFetch, AcpProviderNotConnectedError } from "@agenticcontrolplane/proxy";

try {
  const repos = await acpFetch("https://api.github.com/user/repos");
} catch (err) {
  if (err instanceof AcpProviderNotConnectedError) {
    // Your UI: "Connect GitHub to use this feature"
    res.json({ needsConnect: { provider: err.provider, url: err.connectUrl } });
    return;
  }
  throw err;
}
```

After the user clicks the URL and completes OAuth, retry the call.

## Identity model

Every credential and every action has a **human accountable owner**, even when no human is in the immediate loop. The proxy looks up that human's connected credential server-side via `originSub` — not the dev's, not the agent's, not the immediate caller's.

Three runtime modes:

- **Interactive** — end-user clicks → agent runs synchronously with their JWT. originSub = end-user.
- **Scheduled / async** — dev persists the user's JWT or `gsk_` key at schedule time, restores `withContext` at run time. originSub = configurer.
- **Subagent** — `spawn_subagent()` from `@agenticcontrolplane/governance` carries originSub through. The subagent's calls broker the originator's credential, not its own.

What this rules out: agent-as-principal. Agents in v0.1 don't have their own GitHub credentials separate from any human.

## Configuration

```ts
import { configure } from "@agenticcontrolplane/proxy";

configure({
  baseUrl: "https://api.agenticcontrolplane.com", // default
  apiKey: process.env.ACP_API_KEY,                 // gsk_...
  failMode: "open",                                // "open" | "closed"
  defaultTokenTtlSeconds: 300,
  timeoutMs: 5000,
});
```

Defaults are sensible — most callers only need to set `apiKey` (or rely on `withContext`).

### `failMode`

- `"open"` (default): if ACP is unreachable or returns 5xx, the SDK falls back to the original vendor URL with whatever credentials the caller provided. Audit is degraded for that call; the agent doesn't break.
- `"closed"`: throws `AcpUnreachableError`. The call doesn't happen.

Per-call override:

```ts
await acpFetch(url, { failMode: "closed" });
```

## Errors

All errors extend `AcpError`. Discriminate by `instanceof` or `.code`:

| Class | `.code` | When |
|---|---|---|
| `AcpProviderNotConnectedError` | `provider_not_connected` | User hasn't connected the vendor. Has `.provider` and `.connectUrl`. |
| `AcpFeatureDisabledError` | `feature_disabled` | Tenant has the proxy / scoped-tokens feature off. |
| `AcpUnauthorizedError` | `unauthorized` | Bad API key, expired/revoked scoped token, no auth provided. |
| `AcpPolicyDeniedError` | `policy_denied` | Pattern policy on the gateway denied this method+path. Has `.operation`, `.method`, `.path`. |
| `AcpUnreachableError` | `unreachable` | Gateway 5xx / network error and `failMode: "closed"`. |

## Vendor coverage (v0.1)

- **GitHub** — `api.github.com/*` (REST) + `api.github.com/graphql`

More vendors require corresponding server-side proxy handlers in `gatewaystack-connect`. Track progress in the [parent epic](https://github.com/davidcrowe/gatewaystack-connect/issues/114).

## License

MIT
