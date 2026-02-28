// Daemon — OpenAI driver.
// Streams chat completions via the OpenAI Chat Completions API.
// Reasoning detection is DYNAMIC — read from config.capabilities, not hardcoded.

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

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

// ---------------------------------------------------------------------------
// Internal types (OpenAI API shapes)
// ---------------------------------------------------------------------------

interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface OpenAITool {
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

export class OpenAIDriver implements LLMDriver {
  readonly name = "openai";

  private get apiKey(): string {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }
    return key;
  }

  private get baseUrl(): string {
    return process.env.OPENAI_BASE_URL ?? DEFAULT_BASE_URL;
  }

  private convertMessages(messages: DriverMessage[]): OpenAIMessage[] {
    return messages.map((msg) => {
      const base: OpenAIMessage = {
        role: msg.role,
        content: msg.content,
      };

      if (msg.tool_calls?.length) {
        base.tool_calls = msg.tool_calls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: tc.arguments },
        }));
        if (!msg.content) base.content = null;
      }

      if (msg.tool_call_id) {
        base.tool_call_id = msg.tool_call_id;
      }

      return base;
    });
  }

  private convertTools(config: DriverConfig): OpenAITool[] | undefined {
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
    // Dynamic reasoning detection from capabilities (not hardcoded)
    const isReasoning = config.capabilities?.reasoning ?? false;
    const converted = this.convertMessages(messages);
    const tools = this.convertTools(config);

    // Inject system prompt — reasoning models don't support system role
    if (config.system_prompt && !isReasoning) {
      const hasSystem = converted.some((m) => m.role === "system");
      if (!hasSystem) {
        converted.unshift({ role: "system", content: config.system_prompt });
      }
    }

    // Reasoning models: convert system messages to user messages
    if (isReasoning) {
      for (const msg of converted) {
        if (msg.role === "system") {
          msg.role = "user";
        }
      }
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };

    const body: Record<string, unknown> = {
      model: config.model,
      messages: converted,
      stream: true,
      stream_options: { include_usage: true },
    };

    // Reasoning models use different parameter names
    if (isReasoning) {
      body.max_completion_tokens = config.max_tokens;
    } else {
      body.max_tokens = config.max_tokens;
      body.temperature = config.temperature;
    }

    // Tools only if model supports them (already filtered by agent.ts,
    // but reasoning models have additional API restrictions)
    if (tools && !isReasoning) {
      body.tools = tools;
      body.tool_choice = "auto";
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: config.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      yield { type: "error", content: `OpenAI API error ${response.status}: ${errorText}` };
      yield { type: "done", content: "" };
      return;
    }

    if (!response.body) {
      yield { type: "error", content: "OpenAI API returned no body" };
      yield { type: "done", content: "" };
      return;
    }

    // Parse SSE stream.
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const partialToolCalls = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();

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

          // Reasoning content (o-series internal reasoning, if exposed)
          if (delta.reasoning_content) {
            yield { type: "thinking", content: delta.reasoning_content as string };
          }

          // Tool calls (streamed incrementally)
          const toolCalls = delta.tool_calls as
            | Array<Record<string, unknown>>
            | undefined;
          if (toolCalls) {
            for (const tc of toolCalls) {
              const idx = tc.index as number;
              const fn = tc.function as Record<string, unknown> | undefined;

              if (!partialToolCalls.has(idx)) {
                partialToolCalls.set(idx, {
                  id: (tc.id as string) ?? "",
                  name: fn?.name as string ?? "",
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

    yield { type: "done", content: "" };
  }
}
