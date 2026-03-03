// Daemon — OpenAI driver.
// Streams chat completions via the OpenAI Chat Completions API.
// Reasoning detection is DYNAMIC — read from config.capabilities, not hardcoded.

import type {
  LLMDriver,
  StreamChunk,
  DriverConfig,
  DriverMessage,
} from "./index.js";
import { parseOpenAIStream } from "./openai-stream.js";
import { withTimeout } from "./signal.js";

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

    const signal = withTimeout(config.signal);
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
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

    // Delegate SSE parsing to shared stream parser.
    yield* parseOpenAIStream({ response, signal });
  }
}
