import { getConfig } from "./config.js";
import { getContext } from "./context.js";
import type {
  PostToolOutputRequest,
  PostToolOutputResponse,
  PreToolUseRequest,
  PreToolUseResponse,
} from "./types.js";

async function post<TReq, TRes>(path: string, body: TReq): Promise<TRes | null> {
  const ctx = getContext();
  if (!ctx) return null;
  const cfg = getConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const r = await fetch(`${cfg.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${ctx.userToken}`,
        "X-GS-Client": cfg.clientHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!r.ok) return null;
    return (await r.json()) as TRes;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ask ACP whether a tool call should proceed. POSTs to /govern/tool-use.
 *
 * Fails open: if the gateway is unreachable or returns an error, the decision
 * is `allow` with reason `"fail-open"`. Governance should never be a single
 * point of failure for the agent.
 */
export async function preToolUse(
  toolName: string,
  toolInput?: unknown,
): Promise<{ allowed: boolean; reason: string; decision: "allow" | "deny" | "ask" }> {
  const ctx = getContext();
  const body: PreToolUseRequest = {
    tool_name: toolName,
    tool_input: toolInput,
    hook_event_name: "PreToolUse",
    ...(ctx?.sessionId && { session_id: ctx.sessionId }),
    ...(ctx?.agentTier && { agent_tier: ctx.agentTier }),
    ...(ctx?.agentName && { agent_name: ctx.agentName }),
  };
  const res = await post<PreToolUseRequest, PreToolUseResponse>("/govern/tool-use", body);
  if (!res) return { allowed: true, reason: "fail-open", decision: "allow" };
  return {
    allowed: res.decision === "allow",
    reason: res.reason ?? "",
    decision: res.decision,
  };
}

/**
 * Report the result of a tool call to ACP. POSTs to /govern/tool-output.
 *
 * Fire-and-forget by default. If the response indicates redaction or block,
 * it is returned so the caller can optionally swap `tool_output` for the
 * server-redacted version or drop the result.
 */
export async function postToolOutput(
  toolName: string,
  toolInput: unknown,
  toolOutput: unknown,
): Promise<PostToolOutputResponse | null> {
  const ctx = getContext();
  const body: PostToolOutputRequest = {
    tool_name: toolName,
    tool_input: toolInput,
    tool_output: typeof toolOutput === "string" ? toolOutput.slice(0, 200_000) : toolOutput,
    hook_event_name: "PostToolUse",
    ...(ctx?.sessionId && { session_id: ctx.sessionId }),
    ...(ctx?.agentTier && { agent_tier: ctx.agentTier }),
    ...(ctx?.agentName && { agent_name: ctx.agentName }),
  };
  return post<PostToolOutputRequest, PostToolOutputResponse>("/govern/tool-output", body);
}
