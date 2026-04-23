// Shared SSE stream parser for Anthropic Messages API.
//
// Extracted from anthropic.ts to enable reuse by AnthropicCompatibleDriver.
// Handles the Anthropic streaming event protocol:
//   - content_block_start / content_block_delta / content_block_stop
//   - text_delta, thinking_delta, input_json_delta
//   - message_stop, error events
//   - Tool call accumulation across content blocks

import type { StreamChunk, ToolCall, UsageInfo } from "./index.js";

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

        if (eventType === "message_start") {
          const usage = extractUsage(event.message);
          if (usage) yield { type: "usage", content: "", usage };
        }

        if (eventType === "message_delta") {
          const usage = extractUsage(event);
          if (usage) yield { type: "usage", content: "", usage };
        }

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

// ---------------------------------------------------------------------------
// Usage extraction
// ---------------------------------------------------------------------------

/**
 * Extract usage telemetry from a message_start / message_delta event.
 *
 * Anthropic sends cumulative `usage` objects at start (cache info + input)
 * and at the final message_delta (final output_tokens). We forward both so
 * the driver-agnostic accumulator can collapse them.
 */
function extractUsage(source: unknown): UsageInfo | undefined {
  if (!source || typeof source !== "object") return undefined;
  const raw = (source as { usage?: unknown }).usage;
  if (!raw || typeof raw !== "object") return undefined;
  const u = raw as Record<string, unknown>;

  const usage: UsageInfo = {};
  if (typeof u.input_tokens === "number") usage.input_tokens = u.input_tokens;
  if (typeof u.output_tokens === "number") usage.output_tokens = u.output_tokens;
  if (typeof u.cache_creation_input_tokens === "number") {
    usage.cache_creation_input_tokens = u.cache_creation_input_tokens;
  }
  if (typeof u.cache_read_input_tokens === "number") {
    usage.cache_read_input_tokens = u.cache_read_input_tokens;
  }

  return Object.keys(usage).length > 0 ? usage : undefined;
}
