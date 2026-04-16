import type { AgentIdentity, GovernanceClient } from "@agenticcontrolplane/governance";

/** A tool handler — receives the input the model produced, returns a result. */
export type ToolHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
) => Promise<TOutput> | TOutput;

/** A map of tool name → handler. Tool names must match the `name` field in
 *  the tool definitions you pass to Anthropic's Messages API. */
export type ToolHandlerMap = Record<string, ToolHandler>;

/** Options for the runMessagesWithTools convenience loop. */
export interface RunOptions {
  /** The Anthropic SDK client (typed loosely so this package works without
   *  taking a hard dependency on the SDK). */
  client: AnthropicLike;

  /** The Agentic Control Plane governance client. */
  acp: GovernanceClient;

  /** Agent identity carried through to every audit log entry. */
  agent: AgentIdentity;

  /** The model to use, e.g. "claude-sonnet-4-6". */
  model: string;

  /** The conversation so far. */
  messages: AnthropicMessage[];

  /** Tool definitions in Anthropic's tool-use schema. */
  tools: AnthropicToolDef[];

  /** Tool handlers keyed by tool name. Wrapped with governance internally. */
  toolHandlers: ToolHandlerMap;

  /** Optional system prompt. */
  system?: string;

  /** Optional max iterations to bound runaway loops. Default: 20. */
  maxIterations?: number;

  /** Optional max output tokens per Anthropic call. Default: 4096. */
  maxTokens?: number;
}

export interface RunResult {
  /** The final assistant message content blocks. */
  finalContent: AnthropicContentBlock[];
  /** All messages produced over the loop, including tool_use / tool_result rounds. */
  messages: AnthropicMessage[];
  /** How many tool-call iterations ran. */
  iterations: number;
  /** Set if the loop exited because maxIterations was hit. */
  truncated: boolean;
}

// ── Loose Anthropic SDK shape ──────────────────────────────────────
// We keep these types narrow and structural so the package builds without
// a hard dependency on the SDK. Users who pass a real Anthropic client
// satisfy these interfaces by structural typing.

export interface AnthropicLike {
  messages: {
    create: (params: AnthropicMessagesCreateParams) => Promise<AnthropicMessageResponse>;
  };
}

export interface AnthropicMessagesCreateParams {
  model: string;
  messages: AnthropicMessage[];
  tools?: AnthropicToolDef[];
  system?: string;
  max_tokens: number;
  [k: string]: unknown;
}

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

export type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string | unknown; is_error?: boolean };

export interface AnthropicToolDef {
  name: string;
  description?: string;
  input_schema: unknown;
}

export interface AnthropicMessageResponse {
  id: string;
  role: "assistant";
  content: AnthropicContentBlock[];
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  [k: string]: unknown;
}
