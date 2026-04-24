Running an autonomous agent on Claude Code? You probably use --dangerously-skip-permissions.

It's what you find in most examples and blog posts to run a Claude Code agent. Anthropic's docs flag it as recommended only for sandboxes with no internet access. People use it outside sandboxes anyway.

People use it becuase it turns off human in the loop approvals and makes your agent truly autonomous. 

It also disables Claude Code's built-in safety checks and every rule in your `settings.json`. So in addition to "no human in the loop" you get "no guardrails at all."

There's a safer flag: `--permission-mode=dontAsk`.

Instead of bypassing permissions, you pre-approve the exact tools your agent can use — WebSearch, curl, writes to /tmp, whatever it needs. Pre-approved tools run silently. Anything else — rm, git push, an unexpected network call — auto-denies. No prompt, no execution. The session aborts after 3 denied tries in a row.

So your real options for running a Claude Code autonomous agent:

1. `--dangerously-skip-permissions` — the name is accurate. Zero guardrails
2. `dontAsk` + allowlist — human approval removed, guardrails survive. Static policy
3. `dontAsk` + allowlist + an Agentic Control Plane — ACP adds dynamic policy (like "push only to feature branches" or "don't email customers outside business hours") and a full audit trail

ACP is a one-line install — it plugs in under Claude Code (and Codex, and CrewAI, and LangGraph) as a hook. Every tool call still passes through your allowlist; the ACP adds dynamic policy and an audit log you can manage in one console.

If you're setting up an autonomous Claude Code agent, skip `--dangerously-skip-permissions`. Use `dontAsk` with an allowlist. Add an ACP if you want the policy to be dynamic.

AgenticControlPlane.com
