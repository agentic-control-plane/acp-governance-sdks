import { GovernanceDeniedError } from "@agenticcontrolplane/governance";
import type {
  AnthropicContentBlock,
  AnthropicMessage,
  RunOptions,
  RunResult,
} from "./types.js";

/**
 * Run an Anthropic Messages API tool-use loop end-to-end with governance.
 *
 * - The model is called repeatedly until it stops emitting `tool_use` blocks.
 * - Every `tool_use` block is dispatched through the matching handler in
 *   `toolHandlers` AND through ACP's PreToolUse / PostToolUse pipeline.
 * - Denials surface as `tool_result` blocks with `is_error: true` so the
 *   model can react gracefully (try a different approach, report failure)
 *   rather than the loop throwing mid-conversation.
 * - Returns the final assistant message and the full conversation transcript.
 *
 * Use this when you want one call that drives the whole tool-using session.
 * For finer control, use `withGovernance` and run the loop yourself.
 */
export async function runMessagesWithTools(opts: RunOptions): Promise<RunResult> {
  const { client, acp, agent, model, tools, toolHandlers, system } = opts;
  const maxIterations = opts.maxIterations ?? 20;
  const maxTokens = opts.maxTokens ?? 4096;

  const messages: AnthropicMessage[] = [...opts.messages];
  let iterations = 0;
  let truncated = false;
  let finalContent: AnthropicContentBlock[] = [];

  while (iterations < maxIterations) {
    iterations += 1;

    const params: Record<string, unknown> = {
      model,
      messages,
      tools,
      max_tokens: maxTokens,
    };
    if (system) params["system"] = system;

    const response = await client.messages.create(
      params as Parameters<typeof client.messages.create>[0],
    );
    finalContent = response.content;
    messages.push({ role: "assistant", content: response.content });

    const toolUses = response.content.filter(
      (b): b is Extract<AnthropicContentBlock, { type: "tool_use" }> => b.type === "tool_use",
    );
    if (toolUses.length === 0) break;

    // Execute each tool_use through ACP. Denials become error tool_results
    // so the model can adapt instead of the loop failing.
    const toolResults: AnthropicContentBlock[] = [];
    for (const tu of toolUses) {
      const handler = toolHandlers[tu.name];
      if (!handler) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: `No handler registered for tool: ${tu.name}`,
          is_error: true,
        });
        continue;
      }

      try {
        const result = await acp.governTool({
          tool: tu.name,
          input: tu.input,
          agent,
          execute: () => Promise.resolve(handler(tu.input)),
        });
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: serializeToolResult(result.output),
        });
      } catch (err: unknown) {
        if (err instanceof GovernanceDeniedError) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: `[ACP] Tool denied: ${err.reason}`,
            is_error: true,
          });
        } else {
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: `Tool error: ${err instanceof Error ? err.message : String(err)}`,
            is_error: true,
          });
        }
      }
    }

    messages.push({ role: "user", content: toolResults });

    if (response.stop_reason && response.stop_reason !== "tool_use") {
      // Model signaled it's done despite emitting tool_use — unusual but respect it.
      break;
    }
  }

  if (iterations >= maxIterations) truncated = true;

  return { finalContent, messages, iterations, truncated };
}

function serializeToolResult(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
