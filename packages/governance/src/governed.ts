import { postToolOutput, preToolUse } from "./hook.js";

export type AsyncHandler<I, O> = (input: I) => Promise<O>;

/**
 * Wrap an async tool handler so every call is checked with ACP first.
 *
 *   const handler = governed("web_search", async ({ query }) => await search(query));
 *
 * If ACP denies the call, the wrapped handler returns the string
 * `"tool_error: <reason>"` so the model can see the denial and adapt.
 *
 * After execution, the result is reported to ACP for audit and post-output
 * PII scanning. If ACP returns a redacted version, the redacted version is
 * returned to the caller (pass `onRedact: "keep"` to override).
 */
export function governed<I, O>(
  toolName: string,
  handler: AsyncHandler<I, O>,
  opts: { onRedact?: "replace" | "keep" } = {},
): AsyncHandler<I, O | string> {
  const onRedact = opts.onRedact ?? "replace";
  return async (input: I): Promise<O | string> => {
    const { allowed, reason } = await preToolUse(toolName, input);
    if (!allowed) return `tool_error: ${reason || "denied by ACP policy"}`;
    const output = await handler(input);
    const post = await postToolOutput(toolName, input, output);
    if (post?.action === "redact" && onRedact === "replace" && post.modified_output !== undefined) {
      return post.modified_output as unknown as O;
    }
    if (post?.action === "block") {
      return `tool_error: ${post.reason || "output blocked by ACP policy"}`;
    }
    return output;
  };
}
