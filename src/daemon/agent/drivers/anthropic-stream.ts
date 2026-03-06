// Shared SSE stream parser for Anthropic Messages API.
//
// Extracted from anthropic.ts to enable reuse by AnthropicCompatibleDriver.
// Handles the Anthropic streaming event protocol:
//   - content_block_start / content_block_delta / content_block_stop
//   - text_delta, thinking_delta, input_json_delta
//   - message_stop, error events
//   - Tool call accumulation across content blocks

import type { StreamChunk, ToolCall } from "./index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParseAnthropicStreamOptions {
  /** The fetch Response to stream from. Must have a body. */
  response: Response;
  /** Display name for error messages (e.g. "Anthropic", "My Provider"). */
  providerName?: string;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse an SSE stream from an Anthropic Messages API endpoint.
 *
 * Yields StreamChunk items as they arrive. The final yield is always `type: "done"`.
 *
 * Supports the full Anthropic streaming protocol:
 *   - Text deltas (`text_delta`)
 *   - Thinking deltas (`thinking_delta`)
 *   - Tool call accumulation (`content_block_start` → `input_json_delta` → `content_block_stop`)
 *   - `message_stop` terminal event
 *   - Error events
 */
export async function* parseAnthropicStream(
  opts: ParseAnthropicStreamOptions,
): AsyncGenerator<StreamChunk> {
  const { response, providerName = "Anthropic" } = opts;

  if (!response.body) {
    yield { type: "error", content: `${providerName} API returned no body` };
    yield { type: "done", content: "" };
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentToolCall: Partial<ToolCall> | null = null;
  let toolCallArgs = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;

        let event: Record<string, unknown>;
        try {
          event = JSON.parse(data);
        } catch {
          continue;
        }

        const eventType = event.type as string;

        if (eventType === "content_block_start") {
          const block = event.content_block as Record<string, unknown> | undefined;
          if (block?.type === "tool_use") {
            currentToolCall = {
              id: block.id as string,
              name: block.name as string,
            };
            toolCallArgs = "";
          }
        }

        if (eventType === "content_block_delta") {
          const delta = event.delta as Record<string, unknown> | undefined;
          if (!delta) continue;

          if (delta.type === "text_delta") {
            yield { type: "text", content: (delta.text as string) ?? "" };
          } else if (delta.type === "thinking_delta") {
            yield { type: "thinking", content: (delta.thinking as string) ?? "" };
          } else if (delta.type === "input_json_delta") {
            toolCallArgs += (delta.partial_json as string) ?? "";
          }
        }

        if (eventType === "content_block_stop" && currentToolCall) {
          const tc: ToolCall = {
            id: currentToolCall.id!,
            name: currentToolCall.name!,
            arguments: toolCallArgs,
          };
          yield { type: "tool_call", content: "", tool_call: tc };
          currentToolCall = null;
          toolCallArgs = "";
        }

        if (eventType === "message_stop") {
          yield { type: "done", content: "" };
          return;
        }

        if (eventType === "error") {
          const errObj = event.error as Record<string, unknown> | undefined;
          yield {
            type: "error",
            content: `Stream error: ${(errObj?.message as string) ?? "unknown"}`,
          };
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  yield { type: "done", content: "" };
}
