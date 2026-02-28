// Daemon — Anthropic / Claude driver.
// Streams chat completions via the Anthropic Messages API.
// Supports extended thinking and prompt caching.

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

const DEFAULT_BASE_URL = "https://api.anthropic.com";
const API_VERSION = "2023-06-01";
const THINKING_BETA = "extended-thinking-2025-04-11";
const PROMPT_CACHE_BETA = "prompt-caching-2024-07-31";

// ---------------------------------------------------------------------------
// Internal message types (Anthropic API shapes)
// ---------------------------------------------------------------------------

interface AnthropicContentBlock {
  type: "text" | "tool_use" | "tool_result" | "thinking";
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: unknown;
  /** tool_result blocks use tool_use_id, not id */
  tool_use_id?: string;
  content?: string;
}

interface AnthropicToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

export class AnthropicDriver implements LLMDriver {
  readonly name = "anthropic";

  private get apiKey(): string {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error("ANTHROPIC_API_KEY environment variable is not set");
    }
    return key;
  }

  private get baseUrl(): string {
    return process.env.ANTHROPIC_BASE_URL ?? DEFAULT_BASE_URL;
  }

  /**
   * Convert driver-agnostic messages to the Anthropic message format.
   * System messages are extracted — Anthropic puts them in a top-level field.
   */
  private convertMessages(messages: DriverMessage[]): {
    system: string | undefined;
    messages: AnthropicMessage[];
  } {
    let system: string | undefined;
    const converted: AnthropicMessage[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        // Anthropic: system is a top-level param, not a message.
        system = msg.content;
        continue;
      }

      if (msg.role === "tool") {
        // Tool results must be user messages with tool_result content blocks.
        converted.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: msg.tool_call_id,
              content: msg.content,
            },
          ],
        });
        continue;
      }

      if (msg.role === "assistant" && msg.tool_calls?.length) {
        // Assistant message with tool calls → content blocks.
        const blocks: AnthropicContentBlock[] = [];
        if (msg.content) {
          blocks.push({ type: "text", text: msg.content });
        }
        for (const tc of msg.tool_calls) {
          blocks.push({
            type: "tool_use",
            id: tc.id,
            name: tc.name,
            input: JSON.parse(tc.arguments),
          });
        }
        converted.push({ role: "assistant", content: blocks });
        continue;
      }

      converted.push({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      });
    }

    return { system, messages: converted };
  }

  private convertTools(config: DriverConfig): AnthropicToolDef[] | undefined {
    if (!config.tools?.length) return undefined;
    return config.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
  }

  async *chat(
    messages: DriverMessage[],
    config: DriverConfig,
  ): AsyncGenerator<StreamChunk> {
    const { system, messages: converted } = this.convertMessages(messages);
    const tools = this.convertTools(config);

    // Build request headers.
    const betas: string[] = [];
    if (config.extended_thinking) betas.push(THINKING_BETA);
    betas.push(PROMPT_CACHE_BETA);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-api-key": this.apiKey,
      "anthropic-version": API_VERSION,
    };
    if (betas.length > 0) {
      headers["anthropic-beta"] = betas.join(",");
    }

    // Build request body. Model is already resolved by agent.ts.
    const body: Record<string, unknown> = {
      model: config.model,
      max_tokens: config.max_tokens,
      temperature: config.temperature,
      stream: true,
    };
    if (system) body.system = system;
    if (config.system_prompt && !system) body.system = config.system_prompt;
    body.messages = converted;
    if (tools) body.tools = tools;

    if (config.extended_thinking) {
      body.thinking = {
        type: "enabled",
        budget_tokens: Math.min(config.max_tokens * 4, 128_000),
      };
    }

    // Make the streaming request.
    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: config.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      yield { type: "error", content: `Anthropic API error ${response.status}: ${errorText}` };
      yield { type: "done", content: "" };
      return;
    }

    if (!response.body) {
      yield { type: "error", content: "Anthropic API returned no body" };
      yield { type: "done", content: "" };
      return;
    }

    // Parse SSE stream.
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
}
