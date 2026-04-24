# Findings

Running log of docs/code divergences discovered while building the 18 scout implementations. Source material for the meta-blog-post.

## From #1 Claude Agent SDK (TS) — 2026-04-23

1. **Blog post imports a nonexistent package.** [`2026-04-10-governing-the-anthropic-agent-sdk.md`](../../../agenticcontrolplane.com/_posts/2026-04-10-governing-the-anthropic-agent-sdk.md) line 26 says `import { governTool } from "@acp/agent-sdk-adapter"`. Neither the package nor the symbol exist. The real package is `@agenticcontrolplane/governance-anthropic` exporting `governHandlers`, `withContext`, etc. Fix: rewrite the blog-post snippet.

2. **Existing example used a retired API.** `examples/anthropic-pr-reviewer.ts` imports `GovernanceClient` from `@agenticcontrolplane/governance` and `runMessagesWithTools` from `@agenticcontrolplane/governance-anthropic`. Neither exists in the current src. Both were part of a pre-rewrite API that's still reflected in stale `dist/` files. Fix: rewrite the example to the current `governHandlers` + `withContext` pattern.

3. **Built `dist/` was stale.** The `packages/governance-anthropic/dist/index.d.ts` listed `withGovernance` / `runMessagesWithTools` (the old API) while the `src/index.ts` exports `governHandlers` + re-exports. Root cause: src was rewritten without rebuilding. Rebuilt as part of this work; dist is now in sync.

4. **Neither the blog post nor the example shows the `withContext` requirement.** Without `withContext({ userToken }, fn)`, governance calls silently no-op (the SDK's `post()` returns null when context is missing). This is a correctness footgun — a user following the blog post would ship an "ungoverned" agent and not know. Fix: every walkthrough must show the `withContext` wrapper with a visible comment about the no-op behavior.

5. **Monorepo root is CJS; packages are ESM.** No `"type": "module"` at root, but `@agenticcontrolplane/governance-anthropic` is ESM-only (no CJS export). Running a script directly from `examples/` under tsx fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`. Workaround: add a minimal `package.json` with `"type": "module"` in each example subfolder. Better fix: add a `require` export in the SDK's `exports` field.

6. **`EMAIL_FROM` on production Cloud Run is `noreply@reducibl.com`.** This works (Resend domain verified) but creates brand confusion for any email landing in an ACP customer's inbox. Consider verifying `noreply@agenticcontrolplane.com` in Resend and switching. Not blocking.

7. **`RESEND_API_KEY` is an inline env var on Cloud Run, not in Secret Manager.** Minor security hygiene item — if the service description ever leaks, the key leaks. p2 tech debt.

## From #1 verified-in-production — 2026-04-23

8. **Shipped fix** — PRs #88 (gateway: persist `agent_name` in `emitLogEvent` + Activity detail panel shows `Agent` field) and #89 (dashboard: `npm audit fix` clearing 12 pre-existing advisories that had been failing CI on every merge to main). Deployed; re-ran the scout; confirmed `Agent: framework-scout` appears in the dashboard.

9. **CI had been red on main for 3+ merges in a row.** Nobody noticed or reverted. The `dashboard / audit (critical only)` check failed on every merge yet PRs kept landing — suggests the check is non-blocking in branch protection. Worth auditing the GitHub branch protection settings to see what's actually gating prod.

## From #2 Claude Code — 2026-04-23

10. **ACP Claude Code plugin hook does not send `agent_name`.** `~/.acp/govern.mjs` sends `agent_tier` (resolved dynamically) but no `agent_name`. Events for scheduled background runs and interactive sessions land indistinguishably as `client=claude-code-plugin`. Parallel fix needed to #88: pick up `ACP_AGENT_NAME` from env and pass it through. Batch with similar gaps in Codex CLI / Cursor hooks when we get there.

11. **Claude Code headless-mode flag: we got this wrong twice before landing on the right answer.**

    - **First pass:** tried `--permission-mode=acceptEdits` — silently broke Bash/WebSearch (the flag only auto-approves edits, not tool execution).
    - **Second pass:** fell back to `--dangerously-skip-permissions` and shipped. Disables approval prompts AND built-in safety checks AND `settings.json` rules. Anthropic explicitly flags this as "recommended only for sandboxes with no internet access." People (including us) ignore that and use it outside sandboxes anyway.
    - **Third pass:** discovered `--permission-mode=dontAsk` via Claude Code docs — pre-approve tools via `.claude/settings.json`, anything off-list auto-denies. Strictly better than the dangerous flag. Got excited, wrote a LinkedIn post, briefly published.
    - **Fourth pass (actual current recommendation):** Anthropic shipped [`--permission-mode=auto`](https://www.anthropic.com/engineering/claude-code-auto-mode) — ML classifiers approve/deny each action on the fly. That's their mainstream recommendation. 17% false-negative rate on dangerous actions per their own numbers, cited incidents include accidental git branch deletion, auth token exfil, and production DB migrations attempted. Scout #2 finalized on `auto` mode; `dontAsk` documented as the deterministic-policy alternative.

    Meta-post material: *"We tried four flags before landing on the right one. Nobody in the tutorials had the right answer. Anthropic's auto-mode announcement landed mid-iteration. The fact that even the people building ACP needed four attempts to find the safe default is the entire argument for an external governance layer."*

12. **Default write-path sandbox blocks `/tmp`.** Claude Code in `--print` mode restricts writes to the session's allowed roots (project dir). Our scout prompt instructed writing HTML to `/tmp/scout-email-body.html`; Claude Code wrote to `examples/framework-scout/out/` instead and continued. Graceful degradation, but the prompt should match the sandbox — document `/tmp` is off-limits, or use `--add-dir /tmp`.

## From #3 OpenAI Agents SDK (Py) — 2026-04-23

13. **Proxy pattern deprecated from ACP positioning.** Building #3 hit the Responses-vs-Chat-Completions API mismatch, the `{slug}/v1` multi-tenant URL routing issue, AND the "no provider API key configured" tenant-setup friction in rapid succession. Step back: ACP's moat is governance (policy, audit, deny), not LLM routing (Portkey / OpenRouter / LiteLLM already own that). Proxying LLM calls means maintaining per-provider adapters forever (Responses + Chat Completions + Anthropic native + streaming + thinking + multimodal), being in the hot path for massive LLM traffic, and custodying the PII-richest data in the business. Not worth it. Decorator + hook patterns already give full governance at the tool layer, which is where dangerous actions happen.

14. **Aider dropped entirely.** Aider was the only integration requiring proxy (it accepts `OPENAI_BASE_URL` and nothing else). With proxy deprecated, it has no governance path. Removed from the marketing site (integrations page, nav, frameworks list, docs, llms.txt, blog post mentions) in the same commit as this finding. Scout matrix shrinks 18 → 17.

15. **#3 rewritten from proxy to decorator.** OpenAI Agents SDK has `@function_tool`; we stack ACP's `@governed` underneath. Tools governed, LLM calls go direct to Anthropic with the agent's own key. Same pattern as #7 CrewAI and #8 LangGraph — which makes sense, because OpenAI Agents SDK's ergonomics are closer to those frameworks than to Aider.

## From #2 rewrite + `dontAsk` discovery — 2026-04-23

16. **Pattern-scoped Bash allowlist entries hang silently.** Started #2's `dontAsk` allowlist with fine-grained patterns: `Bash(curl *)`, `Bash(date *)`, `Bash(jq *)`, `Bash(cat /tmp/*)`, `Bash(printf *)`, etc. Scout hung for 15+ minutes with zero stdout. The prompt instructs Claude to use compound shell commands (pipes, heredocs like `cat > file <<EOF`) which don't cleanly match single-pattern rules — so calls were silently denied, Claude retried other approaches, and nothing reached the 3-consecutive-denial abort threshold. Wider bare `Bash` in the allowlist worked. Lesson for docs: pattern-scoped entries are brittle for scripted agents; use bare tool names + trust the ACP hook to catch dangerous commands dynamically.

## From the 2026-04-23 diligence pass (research current docs, align existing scouts) — 2026-04-23

17. **Research-first process commitment.** We built four scouts on intuition + limited subagent assistance. Post-build diligence surfaced that two of the four (#3 OpenAI Agents SDK, #4 Codex CLI) were using out-of-date patterns. Going forward: research each framework's current docs BEFORE coding, not after. Capture the current recommendation in the scout's README so future customers reading the starter get the aligned pattern, not our first guess.

18. **#3 OpenAI Agents SDK migrated from `@governed` stacking to native tool guardrails.** `openai-agents` v0.14 added dedicated `tool_input_guardrails` / `tool_output_guardrails` parameters on `@function_tool`, with `@tool_input_guardrail` / `@tool_output_guardrail` decorators returning `ToolGuardrailFunctionOutput.allow() | .reject_content(message=...)`. Both patterns govern the same calls, but native guardrails flow rejections through the SDK's built-in `tool_error_formatter` (cleaner tracing, survives SDK churn). Also added `max_turns=12` on `Runner.run_sync` as a runaway-loop safety net. Production starters should additionally include at least one `@input_guardrail` at the agent level (PII / scope / prompt-injection check).

19. **#4 Codex CLI flag migrated from `--dangerously-bypass-approvals-and-sandbox` to `--full-auto`.** OpenAI's Codex docs label the dangerous flag *"Elevated Risk / not recommended"* and reserve it for externally-sandboxed environments. The recommended headless path is `codex exec --full-auto` (= `--sandbox workspace-write`), with Codex 0.124+ adding `--ask-for-approval never` for explicit clarity. Exact Claude Code parallel: `--dangerously-skip-permissions` → `--permission-mode=auto`.

20. **Codex hook coverage gap documented.** `PreToolUse` / `PostToolUse` hooks fire reliably for `shell` (Bash) calls, but `apply_patch` file edits and most MCP tool calls don't trigger them (upstream: [openai/codex#16732](https://github.com/openai/codex/issues/16732)). For a customer building an agent that relies on `apply_patch` for code edits, hook-only governance has real coverage holes today. Either wait for the upstream fix, wrap `apply_patch` in a Bash command, or treat Codex governance as "Bash-only" until the issue ships.

21. **Anthropic `@anthropic-ai/sdk` has no first-class governance primitive.** Confirmed via docs research: the plain SDK exposes only a custom-fetch escape hatch — no PreToolUse/PostToolUse hooks, no guardrail primitive analogous to OpenAI Agents SDK's. The documented pattern for governing a hand-rolled loop IS exactly what `@agenticcontrolplane/governance-anthropic`'s `governHandlers` does: wrap each handler, return `{type: "tool_result", is_error: true, content: "..."}` on denial. Our scout #1 is aligned with current official guidance — no migration needed. If a customer wants Anthropic's higher-level `@anthropic-ai/claude-agent-sdk` package (which wraps the tool-use loop and ships hooks), governance goes through its `PreToolUse`/`PostToolUse` hook interface instead. Parallel to, not replacement of, the plain-SDK decorator path.
