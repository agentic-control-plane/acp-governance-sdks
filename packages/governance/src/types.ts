/**
 * Wire types — match the Agentic Control Plane gateway endpoints
 * `/govern/tool-use` and `/govern/tool-output` (see hookGovernance.ts in
 * gatewaystack-connect). Keep this in sync with the gateway.
 */

/** Decision returned by the PreToolUse governance check. */
export type Decision = "allow" | "deny";

/** Action returned by the PostToolUse governance check. */
export type PostAction = "pass" | "redact" | "block";

/** What this SDK supports declaring as the agent's framework-native name.
 *  Surfaces in the dashboard's Detected Agents view as a per-agent row. */
export interface AgentIdentity {
  /** Required: identifies this agent within the workspace. Examples:
   *  "pr-reviewer" (custom), "researcher" (CrewAI role),
   *  "skill.security-scanner" (Anthropic Skill), "supervisor" (LangGraph node). */
  agentName: string;

  /** Optional client-reported tier (interactive, subagent, background, api).
   *  Defaults to "api" — appropriate for SDK-driven agents. */
  agentTier?: string;

  /** Optional session identifier for grouping correlated calls. */
  sessionId?: string;
}

/** The shape of a PreToolUse request the SDK sends to the gateway. */
export interface PreToolUseRequest {
  tool_name: string;
  tool_input: unknown;
  session_id?: string;
  cwd?: string;
  hook_event_name: "PreToolUse";
  agent_tier?: string;
  agent_name?: string;
  permission_mode?: string;
}

export interface PreToolUseResponse {
  decision: Decision;
  reason?: string;
}

/** The shape of a PostToolUse request. */
export interface PostToolUseRequest {
  tool_name: string;
  tool_input: unknown;
  tool_output: string;
  session_id?: string;
  cwd?: string;
  hook_event_name: "PostToolUse";
  agent_tier?: string;
  agent_name?: string;
}

export interface PostToolUseResponse {
  action: PostAction;
  modified_output?: string;
  reason?: string;
  findings?: {
    pii?: unknown;
    injection?: unknown;
  };
}

/** Result of a governed tool execution. */
export interface GovernResult<T> {
  /** The tool's output. Modified if PostToolUse returned action: "redact". */
  output: T;
  /** True if PostToolUse returned action: "redact". */
  redacted: boolean;
  /** Findings flagged by the governance pipeline (PII, prompt injection). */
  findings?: PostToolUseResponse["findings"];
}

/** Configuration for the GovernanceClient. */
export interface GovernanceClientOptions {
  /** Bearer token. Format: `gsk_<slug>_<random>` for API keys, or a
   *  Firebase ID token for human-driven sessions. */
  apiKey: string;
  /** Override the gateway base URL. Defaults to https://api.agenticcontrolplane.com */
  baseUrl?: string;
  /** HTTP timeout per governance call, in ms. Default: 5000. */
  timeoutMs?: number;
  /** When the governance plane is unreachable, fail-closed (deny) is the
   *  safer default. Set to "open" only if you explicitly accept the risk
   *  that ungoverned calls happen during outages. Default: "closed". */
  failureMode?: "open" | "closed";
}
