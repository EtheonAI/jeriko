// Shared SSE stream parser for OpenAI-compatible chat completions.
//
// Extracted from openai.ts and local.ts to eliminate ~120 lines of duplication.
// Used by OpenAIDriver, LocalDriver, and OpenAICompatibleDriver.
//
// Handles:
//   - SSE `data:` line parsing with buffer management
//   - `[DONE]` sentinel handling
//   - Partial tool call accumulation (streamed incrementally by index)
//   - `reasoning_content` deltas (o-series internal reasoning)
//   - `finish_reason` detection (stop, length, tool_calls)
//   - AbortSignal race for Bun (doesn't reliably abort in-progress reads)
//   - Flush of remaining partial tool calls on stream end

import type { StreamChunk, ToolCall, UsageInfo } from "./index.js";
import type { CacheUsageShape } from "./provider-defaults.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParseOpenAIStreamOptions {
  /** The fetch Response to stream from. Must have a body. */
  response: Response;
  /** Optional AbortSignal — used to race against reader.read() for Bun compat. */
  signal?: AbortSignal;
  /**
   * Wire-protocol shape for the provider's cached-token telemetry. Drives
   * whether cached tokens are subtracted from `prompt_tokens` (legacy
   * OpenAI `openai-inclusive`), assumed already-excluded (`openai-exclusive`),
   * or ignored (`none`). Sourced from {@link ModelCapabilities.usageShape};
   * callers should pass the capability's field verbatim.
   *
   * Omitting the option defaults to `openai-inclusive` — the historical
   * OpenAI v1 Chat Completions contract — so existing call sites that
   * haven't been updated still behave correctly.
   */
  usageShape?: CacheUsageShape;
}

interface PartialToolCall {
  id: string;
  name: string;
  arguments: string;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse an SSE stream from an OpenAI-compatible chat completions endpoint.
 *
 * Yields StreamChunk items as they arrive. The final yield is always `type: "done"`.
 *
 * Supports the full OpenAI streaming protocol:
 *   - Incremental text deltas (`delta.content`)
 *   - Reasoning/thinking deltas (`delta.reasoning_content`)
 *   - Incremental tool call accumulation (`delta.tool_calls`)
 *   - Finish reasons: `stop`, `length`, `tool_calls`
 *   - `[DONE]` sentinel
 *
 * Also handles Bun's AbortSignal limitations — races reader.read() against
 * the signal on each iteration so cancellation is responsive.
 */
export async function* parseOpenAIStream(
  opts: ParseOpenAIStreamOptions,
): AsyncGenerator<StreamChunk> {
  const { response, signal } = opts;
  const usageShape: CacheUsageShape = opts.usageShape ?? "openai-inclusive";

  if (!response.body) {
    yield { type: "error", content: "Response has no body" };
    yield { type: "done", content: "" };
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const partialToolCalls = new Map<number, PartialToolCall>();

  try {
    while (true) {
      // Bun doesn't reliably abort an in-progress stream read when the
      // fetch signal fires. Race reader.read() against the AbortSignal
      // so cancellation is responsive on every iteration.
      if (signal?.aborted) {
        yield { type: "error", content: "Request aborted" };
        yield { type: "done", content: "" };
        return;
      }

      let readResult: { done: boolean; value?: Uint8Array };
      if (signal) {
        readResult = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) => {
            if (signal.aborted) {
              reject(new DOMException("Aborted", "AbortError"));
              return;
            }
            signal.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          }),
        ]);
      } else {
        readResult = await reader.read();
      }

      const { done, value } = readResult;
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();

        if (data === "[DONE]") {
          // Flush any remaining partial tool calls
          yield* flushToolCalls(partialToolCalls);
          yield { type: "done", content: "" };
          return;
        }

        let event: Record<string, unknown>;
        try {
          event = JSON.parse(data);
        } catch {
          continue;
        }

        // OpenAI emits a final SSE event with `usage` and empty choices[] when
        // `stream_options.include_usage` is true. Capture that for the ledger.
        const usage = extractOpenAIUsage(event.usage, usageShape);
        if (usage) {
          yield { type: "usage", content: "", usage };
        }

        const choices = event.choices as Array<Record<string, unknown>> | undefined;
        if (!choices?.length) continue;

        const choice = choices[0]!;
        const delta = choice.delta as Record<string, unknown> | undefined;
        if (!delta) continue;

        const finishReason = choice.finish_reason as string | null;

        // Text content delta
        if (delta.content) {
          yield { type: "text", content: delta.content as string };
        }

        // Reasoning content — multiple field names across providers:
        //   - `reasoning_content`: OpenAI o-series models
        //   - `reasoning`: Ollama cloud models (e.g. gpt-oss, kimi-k2-thinking)
        const reasoning = (delta.reasoning_content ?? delta.reasoning) as string | undefined;
        if (reasoning) {
          yield { type: "thinking", content: reasoning };
        }

        // Tool calls (streamed incrementally by index)
        const toolCalls = delta.tool_calls as Array<Record<string, unknown>> | undefined;
        if (toolCalls) {
          for (const tc of toolCalls) {
            const idx = (tc.index as number) ?? 0;
            const fn = tc.function as Record<string, unknown> | undefined;

            if (!partialToolCalls.has(idx)) {
              partialToolCalls.set(idx, {
                id: (tc.id as string) ?? `call_${Date.now()}_${idx}`,
                name: (fn?.name as string) ?? "",
                arguments: "",
              });
            }
            const partial = partialToolCalls.get(idx)!;
            if (tc.id) partial.id = tc.id as string;
            if (fn?.name) partial.name = fn.name as string;
            if (fn?.arguments) partial.arguments += fn.arguments as string;
          }
        }

        // Tool calls finish reason — emit accumulated tool calls
        if (finishReason === "tool_calls") {
          yield* flushToolCalls(partialToolCalls);
        }

        // Terminal finish reasons
        if (finishReason === "stop" || finishReason === "length") {
          yield { type: "done", content: "" };
          return;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Flush any remaining partial tool calls — some providers/models end the
  // stream without sending [DONE] or finish_reason=tool_calls. Without this
  // flush, accumulated tool calls are silently lost.
  if (partialToolCalls.size > 0) {
    yield* flushToolCalls(partialToolCalls);
  }

  yield { type: "done", content: "" };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Emit all accumulated partial tool calls as StreamChunk items and clear the map.
 * Skips entries without a name (incomplete/malformed tool calls).
 */
function* flushToolCalls(
  partialToolCalls: Map<number, PartialToolCall>,
): Generator<StreamChunk> {
  for (const [, partial] of partialToolCalls) {
    if (!partial.name) continue;
    const tc: ToolCall = {
      id: partial.id,
      name: partial.name,
      arguments: partial.arguments,
    };
    yield { type: "tool_call", content: "", tool_call: tc };
  }
  partialToolCalls.clear();
}

/**
 * Normalize the OpenAI-flavoured usage object into the driver-agnostic
 * `UsageInfo`. OpenAI exposes prompt cache telemetry via
 * `prompt_tokens_details.cached_tokens`; recent o-series variants also
 * report `cache_creation_tokens` in the same nested object.
 *
 * The reported shape varies across OpenAI's wire contract:
 *
 *   • `openai-inclusive` — v1 Chat Completions behaviour: `prompt_tokens`
 *     includes cached tokens. We subtract to split. This is still the
 *     canonical shape for OpenAI at time of writing.
 *   • `openai-exclusive` — future / v2 shape where `prompt_tokens`
 *     already excludes cached tokens. No subtraction; cached tokens are
 *     surfaced verbatim. Selecting this shape on the legacy contract
 *     would over-count input by the cached amount — callers must pass
 *     the right value from `ModelCapabilities.usageShape`.
 *   • `none` / `anthropic` — not applicable to OpenAI stream parsing
 *     and are treated as "do not normalize cached tokens".
 */
function extractOpenAIUsage(
  raw: unknown,
  usageShape: CacheUsageShape,
): UsageInfo | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const u = raw as Record<string, unknown>;
  const details = u.prompt_tokens_details as Record<string, unknown> | undefined;

  const usage: UsageInfo = {};
  if (typeof u.prompt_tokens === "number") usage.input_tokens = u.prompt_tokens;
  if (typeof u.completion_tokens === "number") usage.output_tokens = u.completion_tokens;

  if (!details) {
    return Object.keys(usage).length > 0 ? usage : undefined;
  }

  const cached = details.cached_tokens;
  if (typeof cached === "number" && cached > 0) {
    usage.cache_read_input_tokens = cached;
    if (usageShape === "openai-inclusive" && typeof usage.input_tokens === "number") {
      usage.input_tokens = Math.max(0, usage.input_tokens - cached);
    }
    // `openai-exclusive` / `none` / `anthropic` — leave `input_tokens` as
    // the provider reported it; the provider has already split cached
    // from uncached input.
  }

  const created = details.cache_creation_tokens;
  if (typeof created === "number" && created > 0) {
    usage.cache_creation_input_tokens = created;
  }

  return Object.keys(usage).length > 0 ? usage : undefined;
}
