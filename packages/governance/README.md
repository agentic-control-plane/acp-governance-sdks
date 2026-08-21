# @agenticcontrolplane/governance

Thin Node SDK for the [Agentic Control Plane](https://agenticcontrolplane.com) governance hook protocol.

Wraps the two endpoints ACP exposes:
- `POST /govern/tool-use` — pre-tool check (allow / deny / ask)
- `POST /govern/tool-output` — post-tool audit + PII scan

Same protocol Claude Code uses. Works with any Node agent runtime.

## Install

```bash
npm install @agenticcontrolplane/governance
```

## Usage

```ts
import { withContext, governed } from "@agenticcontrolplane/governance";

// Wrap your tool handlers once.
const search = governed("web_search", async ({ query }: { query: string }) => {
  return doSearch(query);  // your code, your credentials
});

// In each request handler, bind the end user's JWT to the async context.
app.post("/run", async (req, res) => {
  const token = req.header("authorization")!.slice("Bearer ".length);
  await withContext({ userToken: token }, async () => {
    const result = await search({ query: req.body.q });
    // result is the tool's output, or "tool_error: <reason>" on deny.
    res.json({ result });
  });
});
```

## What happens per call

1. `preToolUse` POSTs to `/govern/tool-use` with `{ tool_name, tool_input, session_id }` + `Authorization: Bearer <user-jwt>`.
2. Gateway evaluates policy, rate limits, scope, PII → returns `{ decision, reason }`.
3. On `deny`, the wrapped handler short-circuits with `"tool_error: <reason>"` (model can see and adapt).
4. On `allow`, your handler runs. Result is sent to `/govern/tool-output` for audit.
5. If gateway returns `action: "redact"`, the redacted output is returned to the caller.

## Fail-open

Network errors, timeouts (5s default), non-2xx responses → tool proceeds with reason `"fail-open"`. Governance is never a single point of failure for the agent.

## Both planes in one call

`governed()` covers what your agent *does*. The ACP proxy covers what it
*spends*. `init()` wires both — call it before you construct a model client,
since the SDKs read their config from the environment at construction time:

```ts
import { init } from "@agenticcontrolplane/governance";
import Anthropic from "@anthropic-ai/sdk";

init();                            // governance + proxy
const client = new Anthropic();    // now priced and metered by ACP
```

Constructing clients explicitly instead? Skip `init()` and pass the options:

```ts
import { modelClientOptions } from "@agenticcontrolplane/governance";

const client = new Anthropic(modelClientOptions("anthropic"));
```

Set `ACP_API_KEY=gsk_...` from [the console](https://cloud.agenticcontrolplane.com).

**Routing is all-or-nothing per provider.** `init()` either sets both the base
URL and the key, or leaves that provider completely alone and warns — a
half-applied provider (ACP's URL against your real vendor key) is just a 401.
So if `OPENAI_BASE_URL` already points at your own gateway, ACP won't silently
reroute you; it tells you those calls aren't being priced.

Three API shapes, each on its own mount — `"anthropic"`, `"openai"` (chat
completions), and `"openai-responses"`. The last two are **not**
interchangeable: `/v1` serves chat completions, `/openai/v1` serves responses.

## Framework adapters

This package is the core. For framework-native ergonomics see:

- [`@agenticcontrolplane/governance-anthropic`](https://www.npmjs.com/package/@agenticcontrolplane/governance-anthropic) — Anthropic Agent SDK + Messages API
- [`acp-crewai`](https://pypi.org/project/acp-crewai) (Python) — CrewAI
- [`acp-langchain`](https://pypi.org/project/acp-langchain) (Python) — LangChain / LangGraph

## API

```ts
configure(partial: Partial<Config>): void
getConfig(): Config

withContext(ctx, fn): Promise<T>
getContext(): GovernanceContext | undefined

preToolUse(toolName, toolInput?): Promise<{ allowed, reason, decision }>
postToolOutput(toolName, toolInput, toolOutput): Promise<PostToolOutputResponse | null>

governed<I, O>(toolName, handler, opts?): AsyncHandler<I, O | string>

// proxy plane — price and meter model calls
init(options?: InitOptions): Record<string, string>   // both planes
modelBaseUrl(shape?: ModelShape): string
modelClientOptions(shape?: ModelShape): { baseURL, apiKey }
apiKey(): string                                      // reads ACP_API_KEY
```

## License

MIT
