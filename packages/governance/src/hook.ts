import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { getConfig } from "./config.js";
import { getContext } from "./context.js";
import type {
  PostToolOutputRequest,
  PostToolOutputResponse,
  PreToolUseRequest,
  PreToolUseResponse,
} from "./types.js";

/**
 * Why a governed call ran WITHOUT a decision from ACP (acp-governance-sdks#6).
 *
 *   not-configured — no context bound; wrap the handler in withContext()
 *   unreachable    — the gateway could not be reached (network / timeout)
 *   gateway-error  — the gateway answered without a decision (5xx, 401…)
 *
 * Fail-open is deliberate: governance must never be the single point of
 * failure for an agent. Fail-open *silently* is the failure mode this SDK
 * exists to eliminate — so every lapse is announced once per cause per
 * process (console.warn), names its cause in the returned reason, and
 * leaves a line in the lapse log for every call it let through.
 */
export type UngovernedCause = "not-configured" | "unreachable" | "gateway-error";

// ── Lapse ledger ───────────────────────────────────────────────────────
// One line per ungoverned call, appended to ~/.acp/lapse.log (ACP_LAPSE_LOG
// overrides; "off" disables) — the same file the Claude Code hook writes on
// an interactive fail-open, so an operator sees every ungoverned call on the
// machine in one place, whichever client let it through. Best-effort.

function lapseLogPath(): string | null {
  const override = process.env.ACP_LAPSE_LOG;
  if (override !== undefined) {
    if (/^(off|0|false|)$/i.test(override.trim())) return null;
    return override.startsWith("~") ? join(homedir(), override.slice(1)) : override;
  }
  return join(homedir(), ".acp", "lapse.log");
}

function recordLapse(cause: UngovernedCause, toolName: string, detail: string): void {
  const path = lapseLogPath();
  if (!path) return;
  try {
    mkdirSync(dirname(path), { recursive: true });
    const stamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    appendFileSync(path, `${stamp} UNGOVERNED acp-governance-node ${cause} tool=${toolName} ${detail}\n`);
  } catch {
    /* a ledger failure must never touch the call path */
  }
}

// ── Once-per-cause warning ─────────────────────────────────────────────

const warned = new Set<UngovernedCause>();

function warnOnce(cause: UngovernedCause, message: string): void {
  if (warned.has(cause)) return;
  warned.add(cause);
  console.warn(message);
}

/** Test seam: forget which causes have been announced. */
export function _resetUngovernedWarningsForTests(): void {
  warned.clear();
}

const HOW_TO_FIX: Record<UngovernedCause, string> = {
  "not-configured": "bind an identity with withContext({ userToken }, …) around the agent run",
  "unreachable": "check the configured baseUrl / network; the gateway did not answer",
  "gateway-error": "the gateway answered without a decision; check the token and the gateway status",
};

function lapse(cause: UngovernedCause, detail: string, toolName: string): string {
  warnOnce(
    cause,
    `[ACP] UNGOVERNED: ${toolName} ran without a governance decision (${cause}: ${detail}). ` +
      `Fail-open by design — ${HOW_TO_FIX[cause]}. Every further ungoverned call is recorded in ` +
      `${lapseLogPath() ?? "no lapse log (disabled)"}; this warning is shown once per cause.`,
  );
  recordLapse(cause, toolName, detail);
  return `fail-open (${cause}): ${detail}`;
}

// ── Transport ──────────────────────────────────────────────────────────

type Outcome<T> = { body: T; cause?: undefined; detail?: undefined } | { body: null; cause: UngovernedCause; detail: string };

async function post<TReq, TRes extends object>(path: string, body: TReq): Promise<Outcome<TRes>> {
  const ctx = getContext();
  if (!ctx) return { body: null, cause: "not-configured", detail: "no governance context bound in this scope" };
  const cfg = getConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  let r: Response;
  try {
    r = await fetch(`${cfg.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${ctx.userToken}`,
        "X-GS-Client": cfg.clientHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    const name = e instanceof Error ? (e.name === "AbortError" ? "timeout" : e.name) : "error";
    return { body: null, cause: "unreachable", detail: `${name} against ${cfg.baseUrl}` };
  } finally {
    clearTimeout(timer);
  }
  let data: unknown = null;
  try {
    data = await r.json();
  } catch {
    data = null;
  }
  const isObj = data !== null && typeof data === "object";
  if (r.ok && isObj) return { body: data as TRes };
  // A 4xx that carries a decision IS the verdict, not an outage: the gateway
  // answers rate-limit denies (429) and invalid-tool denies (400) with
  // {decision, reason}. Treating those as fail-open would run exactly the
  // calls the gateway refused.
  if (isObj) {
    const d = (data as { decision?: unknown }).decision;
    if (d === "deny" || d === "ask") return { body: data as TRes };
  }
  return { body: null, cause: "gateway-error", detail: `HTTP ${r.status} from ${cfg.baseUrl}${path}` };
}

/**
 * Ask ACP whether a tool call should proceed. POSTs to /govern/tool-use.
 *
 * Fails open: when no decision could be obtained the result is `allow` with
 * reason `"fail-open (<cause>): <detail>"` — announced once per cause on
 * console.warn, and recorded in the lapse log for every such call.
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
  const out = await post<PreToolUseRequest, PreToolUseResponse>("/govern/tool-use", body);
  if (!out.body) return { allowed: true, reason: lapse(out.cause, out.detail, toolName), decision: "allow" };
  return {
    allowed: out.body.decision === "allow",
    reason: out.body.reason ?? "",
    decision: out.body.decision,
  };
}

/**
 * Report the result of a tool call to ACP. POSTs to /govern/tool-output.
 *
 * Fire-and-forget by default. If the response indicates redaction or block,
 * it is returned so the caller can optionally swap `tool_output` for the
 * server-redacted version or drop the result. Returns null when no answer
 * could be obtained — the pre-call already announced the lapse.
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
  return (await post<PostToolOutputRequest, PostToolOutputResponse>("/govern/tool-output", body)).body;
}
