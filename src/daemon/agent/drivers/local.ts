// Daemon — Local / Ollama driver.
// Streams chat completions from a local Ollama instance.
// Uses the OpenAI-compatible /v1/chat/completions endpoint.
//
// ZERO hardcoded model lists — tool calling and capabilities are detected
// dynamically via Ollama's /api/show endpoint (probed by models.ts).

import type {
  LLMDriver,
  StreamChunk,
  DriverConfig,
  DriverMessage,
  ToolCall,
} from "./index.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URL = "http://localhost:11434";

// ---------------------------------------------------------------------------
// Internal types (Ollama OpenAI-compat shapes)
// ---------------------------------------------------------------------------

interface OllamaMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

interface OllamaTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

export class LocalDriver implements LLMDriver {
  readonly name = "local";

  private get baseUrl(): string {
    const localUrl = process.env.LOCAL_MODEL_URL;
    if (localUrl) return localUrl.replace(/\/v1\/?$/, "");
    return process.env.OLLAMA_BASE_URL ?? DEFAULT_BASE_URL;
  }

  private convertMessages(messages: DriverMessage[]): OllamaMessage[] {
    return messages.map((msg) => {
      const base: OllamaMessage = {
        role: msg.role,
        content: msg.content,
      };

      if (msg.tool_calls?.length) {
        base.tool_calls = msg.tool_calls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: tc.arguments },
        }));
      }

      if (msg.tool_call_id) {
        base.tool_call_id = msg.tool_call_id;
      }

      return base;
    });
  }

  private convertTools(config: DriverConfig): OllamaTool[] | undefined {
    // Tools already filtered by agent.ts based on dynamic capabilities.
    // If tools are present in config, the model supports them.
    if (!config.tools?.length) return undefined;

    return config.tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  async *chat(
    messages: DriverMessage[],
    config: DriverConfig,
  ): AsyncGenerator<StreamChunk> {
    // Model is already resolved by agent.ts — use directly
    const converted = this.convertMessages(messages);
    const tools = this.convertTools(config);

    // Inject system prompt if provided and not present.
    if (config.system_prompt) {
      const hasSystem = converted.some((m) => m.role === "system");
      if (!hasSystem) {
        converted.unshift({ role: "system", content: config.system_prompt });
      }
    }

    // Verify Ollama is reachable.
    try {
      const healthResp = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (!healthResp.ok) {
        yield { type: "error", content: `Ollama not reachable at ${this.baseUrl}: HTTP ${healthResp.status}` };
        yield { type: "done", content: "" };
        return;
      }
    } catch (err) {
      yield {
        type: "error",
        content: `Ollama not reachable at ${this.baseUrl}: ${err instanceof Error ? err.message : String(err)}`,
      };
      yield { type: "done", content: "" };
      return;
    }

    // Use Ollama's OpenAI-compatible endpoint.
    const body: Record<string, unknown> = {
      model: config.model,
      messages: converted,
      stream: true,
      options: {
        temperature: config.temperature,
        num_predict: config.max_tokens,
      },
    };

    if (tools) {
      body.tools = tools;
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: config.signal,
      });
    } catch (err) {
      yield {
        type: "error",
        content: `Ollama request failed: ${err instanceof Error ? err.message : String(err)}`,
      };
      yield { type: "done", content: "" };
      return;
    }

    if (!response.ok) {
      const errorText = await response.text();
      yield { type: "error", content: `Ollama API error ${response.status}: ${errorText}` };
      yield { type: "done", content: "" };
      return;
    }

    if (!response.body) {
      yield { type: "error", content: "Ollama API returned no body" };
      yield { type: "done", content: "" };
      return;
    }

    // Parse SSE stream (OpenAI-compatible format).
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const partialToolCalls = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();

    try {
      while (true) {
        // Race reader.read() against AbortSignal. Bun doesn't reliably
        // abort an in-progress stream read when the fetch signal fires,
        // so we check manually on each iteration.
        let readResult: { done: boolean; value?: Uint8Array };
        if (config.signal?.aborted) {
          yield { type: "error", content: "Request aborted" };
          yield { type: "done", content: "" };
          return;
        }
        if (config.signal) {
          readResult = await Promise.race([
            reader.read(),
            new Promise<never>((_, reject) => {
              if (config.signal!.aborted) {
                reject(new DOMException("Aborted", "AbortError"));
                return;
              }
              config.signal!.addEventListener(
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
            for (const [, partial] of partialToolCalls) {
              const tc: ToolCall = {
                id: partial.id,
                name: partial.name,
                arguments: partial.arguments,
              };
              yield { type: "tool_call", content: "", tool_call: tc };
            }
            partialToolCalls.clear();
            yield { type: "done", content: "" };
            return;
          }

          let event: Record<string, unknown>;
          try {
            event = JSON.parse(data);
          } catch {
            continue;
          }

          const choices = event.choices as
            | Array<Record<string, unknown>>
            | undefined;
          if (!choices?.length) continue;

          const delta = choices[0]!.delta as Record<string, unknown> | undefined;
          if (!delta) continue;

          const finishReason = choices[0]!.finish_reason as string | null;

          if (delta.content) {
            yield { type: "text", content: delta.content as string };
          }

          // Tool calls
          const toolCalls = delta.tool_calls as
            | Array<Record<string, unknown>>
            | undefined;
          if (toolCalls) {
            for (const tc of toolCalls) {
              const idx = (tc.index as number) ?? 0;
              const fn = tc.function as Record<string, unknown> | undefined;

              if (!partialToolCalls.has(idx)) {
                partialToolCalls.set(idx, {
                  id: (tc.id as string) ?? `call_local_${Date.now()}_${idx}`,
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

          if (finishReason === "tool_calls") {
            for (const [, partial] of partialToolCalls) {
              const toolCall: ToolCall = {
                id: partial.id,
                name: partial.name,
                arguments: partial.arguments,
              };
              yield { type: "tool_call", content: "", tool_call: toolCall };
            }
            partialToolCalls.clear();
          }

          if (finishReason === "stop" || finishReason === "length") {
            yield { type: "done", content: "" };
            return;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Flush any remaining partial tool calls — some Ollama models (especially
    // OSS models served via cloud proxies) end the stream without sending
    // [DONE] or finish_reason=tool_calls. Without this flush, accumulated
    // tool calls are silently lost and the model gets no tool results back.
    if (partialToolCalls.size > 0) {
      for (const [, partial] of partialToolCalls) {
        if (partial.name) {
          const tc: ToolCall = {
            id: partial.id,
            name: partial.name,
            arguments: partial.arguments,
          };
          yield { type: "tool_call", content: "", tool_call: tc };
        }
      }
      partialToolCalls.clear();
    }

    yield { type: "done", content: "" };
  }
}
