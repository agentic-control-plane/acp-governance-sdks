# Agentic Control Plane SDKs

> **For agents that build governed agents.**

Embed [ACP governance](https://agenticcontrolplane.com) directly in your agent code. Three primitives:

1. **Govern your own tool calls.** Wrap any tool with `@governed` / `governed()`; before it runs, ACP decides allow / deny / redact based on your workspace policy.
2. **Spawn subagents with delegation chains.** Use `spawn_subagent()` + `child_context()` (Python) or the equivalent TypeScript helpers to mint a scope-narrowed child API key for any subagent your agent creates. The gateway intersects scopes with the parent, atomically debits the parent's budget, preserves the originating human's identity (`originSub`), and produces audit logs that trace through the chain — same governance model as in-process delegation, available to any external agent framework. See [`agents-building-agents quickstart`](https://agenticcontrolplane.com/agents/quickstart/).
3. **Broker outbound credentials.** Use `acpFetch` (or `withAcp(axios)`) so calls to external vendors (GitHub today; more coming) are routed through the ACP egress proxy. Your agent only ever holds an opaque short-lived token; the real OAuth credential never leaves the gateway. See [`@agenticcontrolplane/proxy`](packages/proxy).

Works across coding-agent clients (Claude Code, Cursor) and server-deployed agent frameworks (CrewAI, LangChain, Anthropic SDK). Same governance model end-to-end.

## Packages

**Node / TypeScript** (`packages/`):

| Package | Purpose | Status |
|---|---|---|
| [`@agenticcontrolplane/governance`](packages/governance) | Thin core SDK — framework-agnostic. Wraps any tool handler. | `0.2.0` |
| [`@agenticcontrolplane/governance-anthropic`](packages/governance-anthropic) | Adapter for Anthropic Messages API + Claude Agent SDK. | `0.2.0` |
| [`@agenticcontrolplane/proxy`](packages/proxy) | Credential brokering — wrap fetch / axios so vendor calls route through ACP with short-lived scoped tokens. | `0.1.0` |

**Python** (`python/`):

| Package | Purpose | Status |
|---|---|---|
| [`acp-governance`](python/acp-governance) | Thin core SDK — framework-agnostic. | `0.1.0` |
| [`acp-crewai`](python/acp-crewai) | Adapter for CrewAI (includes `install_crew_hooks` for inter-agent handoff capture). | `0.1.0` |
| [`acp-langchain`](python/acp-langchain) | Adapter for LangChain / LangGraph. | `0.1.0` |

## Quick starts

### TypeScript (Anthropic SDK / any Node agent)

```ts
import { governHandlers, withContext } from "@agenticcontrolplane/governance-anthropic";

const handlers = governHandlers({
  web_search: async ({ query }) => doSearch(query),
});

app.post("/run", async (req, res) => {
  const token = req.header("authorization")!.slice("Bearer ".length);
  await withContext({ userToken: token }, async () => {
    // run your tool-use loop; handlers are governed
  });
});
```

### Python (CrewAI)

```python
from crewai.tools import tool
from acp_crewai import governed, install_crew_hooks, set_context

@tool("web_search")
@governed("web_search")
def web_search(query: str) -> str:
    return do_search(query)

@app.post("/run")
def run(topic: str, authorization: str = Header(...)):
    set_context(user_token=authorization.removeprefix("Bearer ").strip())
    crew = Crew(agents=[...], tasks=[...])
    install_crew_hooks(crew)   # also captures inter-agent handoffs
    return {"result": str(crew.kickoff())}
```

### Python (LangChain / LangGraph)

```python
from langchain_core.tools import tool
from acp_langchain import governed, set_context

@tool
@governed("web_search")
def web_search(query: str) -> str:
    return do_search(query)
```

### TypeScript (credential brokering for external vendor calls)

```ts
import { acpFetch, AcpProviderNotConnectedError } from "@agenticcontrolplane/proxy";

try {
  const r = await acpFetch("https://api.github.com/user/repos");
  // → ACP routes this through its egress proxy, with a short-lived scoped
  //   token. The agent never holds the user's real GitHub OAuth credential.
} catch (err) {
  if (err instanceof AcpProviderNotConnectedError) {
    // Surface err.connectUrl in your UI so the user can authorize GitHub
    // in the ACP dashboard, then retry.
  }
}
```

## Protocol

The governance packages (`governance`, `governance-anthropic`, `acp-governance`, framework adapters) speak the tool-call hook protocol — same shape Claude Code's hook uses:

- `POST /govern/tool-use` — `{ tool_name, tool_input, session_id }` + `Authorization: Bearer <user-jwt>` → `{ decision: "allow" | "deny" | "ask", reason? }`
- `POST /govern/tool-output` — same + `tool_output` → `{ action: "pass" | "redact" | "block", modified_output?, findings? }`
- Fail-open on network errors / timeout (5s default).

The proxy package (`@agenticcontrolplane/proxy`) speaks the credential-brokering protocol:

- `POST /api/v1/scoped-tokens` — mint a short-lived `acp_st_<slug>_<random>` token bound to the caller's stored OAuth credential
- `GET/POST/PATCH/DELETE /api/v3/*` and `POST /api/graphql` — egress proxy paths that verify the scoped token and forward to the vendor

Third-party frameworks that don't have a first-class adapter can call these endpoints directly — the snippet is ~20 lines in any language.

## Development

```bash
# Node
npm install
npm run build       # build TS packages
npm run typecheck   # across the workspace

# Python — install each package editable into a venv
python -m venv .venv && source .venv/bin/activate
pip install -e python/acp-governance -e python/acp-crewai -e python/acp-langchain
```

## Repo layout

```
packages/                             # npm workspace
  governance/                         # @agenticcontrolplane/governance
  governance-anthropic/               # @agenticcontrolplane/governance-anthropic
  proxy/                              # @agenticcontrolplane/proxy
python/                               # PyPI packages (each standalone)
  acp-governance/
  acp-crewai/
  acp-langchain/
```

## Publishing

Pre-release. Until `1.0`, expect API changes. Pin exact versions in production.

```bash
# Node
cd packages/governance && npm publish --access public --provenance
cd packages/governance-anthropic && npm publish --access public --provenance
cd packages/proxy && npm publish --access public --provenance

# Python
cd python/acp-governance && python -m build && twine upload dist/*
cd python/acp-crewai     && python -m build && twine upload dist/*
cd python/acp-langchain  && python -m build && twine upload dist/*
```

## License

MIT — see [LICENSE](LICENSE).
