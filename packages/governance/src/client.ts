import type {
  AgentIdentity,
  GovernResult,
  GovernanceClientOptions,
  PostToolUseRequest,
  PostToolUseResponse,
  PreToolUseRequest,
  PreToolUseResponse,
} from "./types.js";
import { GovernanceBlockedError, GovernanceDeniedError } from "./errors.js";

const DEFAULT_BASE_URL = "https://api.agenticcontrolplane.com";
const DEFAULT_TIMEOUT_MS = 5000;
const POST_OUTPUT_BYTE_CEILING = 200 * 1024;

/**
 * The Agentic Control Plane governance client.
 *
 * Wraps tool executions with PreToolUse / PostToolUse governance checks.
 * Every framework-level tool call should pass through `governTool()` so the
 * gateway sees it, applies policy, and records an audit log entry tagged
 * with the agent's identity.
 */
export class GovernanceClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly failureMode: "open" | "closed";

  constructor(options: GovernanceClientOptions) {
    if (!options.apiKey) {
      throw new Error("GovernanceClient: apiKey is required");
    }
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.failureMode = options.failureMode ?? "closed";
  }

  /**
   * Govern a tool execution end-to-end:
   *   1. POST to /govern/tool-use (deny → throws GovernanceDeniedError)
   *   2. Run the supplied execute() function
   *   3. POST to /govern/tool-output (block → throws GovernanceBlockedError;
   *      redact → returns modified output)
   *
   * Auditable as a single governed unit identified by agent.agentName.
   */
  async governTool<T>(args: {
    tool: string;
    input: unknown;
    agent: AgentIdentity;
    execute: () => Promise<T>;
  }): Promise<GovernResult<T>> {
    const { tool, input, agent, execute } = args;

    // ── PreToolUse ──────────────────────────────────────────────────
    const preReq: PreToolUseRequest = {
      tool_name: tool,
      tool_input: input,
      hook_event_name: "PreToolUse",
      agent_name: agent.agentName,
      agent_tier: agent.agentTier ?? "api",
      ...(agent.sessionId ? { session_id: agent.sessionId } : {}),
    };
    const preResp = await this.preToolUse(preReq);
    if (preResp.decision === "deny") {
      throw new GovernanceDeniedError(
        `Tool ${tool} denied by ACP: ${preResp.reason ?? "policy"}`,
        tool,
        preResp.reason ?? "policy",
      );
    }

    // ── Execute ─────────────────────────────────────────────────────
    const rawOutput = await execute();

    // ── PostToolUse ─────────────────────────────────────────────────
    const outputStr = serializeOutput(rawOutput);
    const postReq: PostToolUseRequest = {
      tool_name: tool,
      tool_input: input,
      tool_output: outputStr,
      hook_event_name: "PostToolUse",
      agent_name: agent.agentName,
      agent_tier: agent.agentTier ?? "api",
      ...(agent.sessionId ? { session_id: agent.sessionId } : {}),
    };
    const postResp = await this.postToolUse(postReq);

    if (postResp.action === "block") {
      throw new GovernanceBlockedError(
        `Tool ${tool} output blocked by ACP: ${postResp.reason ?? "policy"}`,
        tool,
        postResp.reason ?? "policy",
      );
    }

    if (postResp.action === "redact" && postResp.modified_output != null) {
      return {
        output: postResp.modified_output as unknown as T,
        redacted: true,
        ...(postResp.findings ? { findings: postResp.findings } : {}),
      };
    }

    return {
      output: rawOutput,
      redacted: false,
      ...(postResp.findings ? { findings: postResp.findings } : {}),
    };
  }

  /** Manual PreToolUse — useful for adapters that need to interleave
   *  governance with framework-specific control flow. */
  async preToolUse(req: PreToolUseRequest): Promise<PreToolUseResponse> {
    const url = `${this.baseUrl}/govern/tool-use`;
    return this.fetch<PreToolUseResponse>(url, req, {
      decision: "deny",
      reason: "ACP unreachable — failed closed",
    });
  }

  /** Manual PostToolUse — useful for adapters that govern output separately. */
  async postToolUse(req: PostToolUseRequest): Promise<PostToolUseResponse> {
    const url = `${this.baseUrl}/govern/tool-output`;
    // Truncate output before sending — the gateway also enforces this
    // ceiling, but we honor it locally to keep payloads small.
    if (
      typeof req.tool_output === "string" &&
      Buffer.byteLength(req.tool_output, "utf8") > POST_OUTPUT_BYTE_CEILING
    ) {
      req = { ...req, tool_output: req.tool_output.slice(0, POST_OUTPUT_BYTE_CEILING) };
    }
    return this.fetch<PostToolUseResponse>(url, req, { action: "pass" });
  }

  private async fetch<R>(url: string, body: unknown, failureFallback: R): Promise<R> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
          "x-acp-sdk": `@agenticcontrolplane/governance/0.1.0`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!resp.ok) {
        return this.failOrFallback(failureFallback, `HTTP ${resp.status}`);
      }
      return (await resp.json()) as R;
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : "unknown";
      return this.failOrFallback(failureFallback, reason);
    } finally {
      clearTimeout(timer);
    }
  }

  private failOrFallback<R>(fallback: R, reason: string): R {
    if (this.failureMode === "closed") {
      // For PreToolUse, the fallback is { decision: "deny" } — caller
      // throws based on that. For PostToolUse, the fallback is
      // { action: "pass" } since blocking output on outage would lose
      // useful work after the tool already ran. Asymmetric by design.
      void reason;
      return fallback;
    }
    // failureMode "open" — return the success-shaped default for both calls.
    if ((fallback as { decision?: string }).decision === "deny") {
      return { decision: "allow", reason: "fail-open" } as unknown as R;
    }
    return fallback;
  }
}

function serializeOutput(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
