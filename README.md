# Agentic Control Plane SDKs

Embed [ACP governance](https://agenticcontrolplane.com) directly in your agent code. Wrap any tool call with `@governed` / `governed()`; before it runs ACP decides allow / deny / redact based on your workspace policy.

Same governance model as Claude Code. Works across coding-agent clients (Claude Code, Cursor) and server-deployed agent frameworks (CrewAI, LangChain, Anthropic SDK).

## Packages

**Node / TypeScript** (`packages/`):

| Package | Purpose | Status |
|---|---|---|
| [`@agenticcontrolplane/governance`](packages/governance) | Thin core SDK — framework-agnostic. Wraps any tool handler. | `0.2.0` |
| [`@agenticcontrolplane/governance-anthropic`](packages/governance-anthropic) | Adapter for Anthropic Messages API + Claude Agent SDK. | `0.2.0` |

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

## Protocol

All packages speak the same wire protocol to the ACP gateway — same shape Claude Code's hook uses:

- `POST /govern/tool-use` — `{ tool_name, tool_input, session_id }` + `Authorization: Bearer <user-jwt>` → `{ decision: "allow" | "deny" | "ask", reason? }`
- `POST /govern/tool-output` — same + `tool_output` → `{ action: "pass" | "redact" | "block", modified_output?, findings? }`
- Fail-open on network errors / timeout (5s default).

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

# Python
cd python/acp-governance && python -m build && twine upload dist/*
cd python/acp-crewai     && python -m build && twine upload dist/*
cd python/acp-langchain  && python -m build && twine upload dist/*
```

## License

MIT — see [LICENSE](LICENSE).
