# ACP Starter — Google Agent Development Kit (Python)

Minimal template for wiring ACP governance into a Google ADK agent.

## Setup

```bash
cp .env.example .env
# edit .env: set ACP_USER_TOKEN (gsk_...) and GOOGLE_API_KEY
# (from https://aistudio.google.com/apikey — the free-tier Gemini key works)

bash run.sh
```

`run.sh` creates a local `.venv` via `uv`, installs `google-adk` + `acp-governance`, and runs `starter.py`.

## What to change

- `lookup_record(id)` body — replace with your real tool logic
- The docstring — ADK builds the tool schema from signature + type hints + docstring
- `agent_name: "my-adk-agent"` in `set_context` — rename for dashboard attribution
- `model: "gemini-flash-latest"` — swap to `"gemini-2.5-pro"` or any ADK-supported model
- For Vertex AI instead of direct Gemini: set `GOOGLE_GENAI_USE_VERTEXAI=True` + `GOOGLE_CLOUD_PROJECT=...` in `.env` and use Application Default Credentials

Add more tools: define more `@governed(...)` functions and pass them in `Agent(tools=[...])`.

## How governance is wired

No framework-specific adapter. `@governed("tool_name")` from `acp-governance` wraps the tool function with ACP's pre/post hook protocol. ADK introspects the wrapped callable via `inspect.signature` (following `__wrapped__` from `functools.wraps`), so the tool's schema is built correctly from the original signature.

LLM calls go direct to Gemini (or Vertex) with your own key. Governance is tool-layer, not LLM-layer.

## ADK-specific notes

- **Cleaner governance via Plugins.** ADK offers both `before_tool_callback` / `after_tool_callback` on the `Agent` class AND a `Plugin` class registered on the `Runner` that applies across all agents/tools. For this starter we use plain `@governed` stacking for simplicity; a future `acp-google-adk` package could ship an `ACPGovernancePlugin(BasePlugin)` that wires ACP once per Runner rather than per-tool.
- **Heavier single-shot pattern.** Unlike CrewAI's `crew.kickoff()` or LangGraph's `agent.invoke()`, ADK requires an explicit `Runner` + `SessionService` + event iteration. This starter wraps that boilerplate so a customer only has to edit the tool body.
- **No first-class guardrails.** ADK docs punt to "in-tool defense + callbacks + plugins" — same gap CrewAI/AutoGen have. ACP fills it at the tool layer.

## References

- [Google ADK quickstart](https://adk.dev/tutorials/)
- [ADK callbacks](https://adk.dev/callbacks/)
- [ADK plugins](https://adk.dev/plugins/)
- [ACP governance model](https://agenticcontrolplane.com/docs/governance-model)

## Get an API key

[cloud.agenticcontrolplane.com](https://cloud.agenticcontrolplane.com/) → create a workspace → Settings → API Keys → New key.

Gemini API key: [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
