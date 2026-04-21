/**
 * Wire types for the ACP governance hook protocol.
 *
 * These match the request/response shape of the shipping Claude Code hook
 * integration so every adapter (this package + framework-specific ones)
 * speaks the same protocol to the tenant gateway.
 */

export type Decision = "allow" | "deny" | "ask";
export type PostAction = "pass" | "redact" | "block";

export interface PreToolUseRequest {
  tool_name: string;
  tool_input?: unknown;
  session_id?: string;
  agent_tier?: "interactive" | "subagent" | "background" | "api";
  agent_name?: string;
  cwd?: string;
  client?: { name?: string; version?: string };
  hook_event_name?: "PreToolUse";
}

export interface PreToolUseResponse {
  decision: Decision;
  reason?: string;
}

export interface PostToolOutputRequest {
  tool_name: string;
  tool_input?: unknown;
  tool_output?: unknown;
  session_id?: string;
  agent_tier?: "interactive" | "subagent" | "background" | "api";
  agent_name?: string;
  cwd?: string;
  client?: { name?: string; version?: string };
  hook_event_name?: "PostToolUse";
}

export interface PostToolOutputResponse {
  action: PostAction;
  modified_output?: string;
  reason?: string;
  findings?: {
    pii?: { types: string[]; count: number };
    injection?: Record<string, number>;
  };
}

export interface Config {
  baseUrl: string;
  timeoutMs: number;
  clientHeader: string;
}
