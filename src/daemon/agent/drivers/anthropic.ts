// Daemon — Anthropic / Claude driver.
// Streams chat completions via the Anthropic Messages API.
// Supports extended thinking and prompt caching.
//
// Message conversion, tool conversion, and SSE parsing are delegated to shared
// modules (anthropic-shared.ts, anthropic-stream.ts), also used by
// AnthropicCompatibleDriver for custom Anthropic-protocol providers.

import type {
  LLMDriver,
  StreamChunk,
  DriverConfig,
  DriverMessage,
} from "./index.js";
import { withTimeout } from "./signal.js";
import { parseAnthropicStream } from "./anthropic-stream.js";
import { buildAnthropicHeaders } from "./anthropic-shared.js";
import { buildCachedAnthropicRequest } from "../cache/anthropic-build.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URL = "https://api.anthropic.com";

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

  async *chat(
    messages: DriverMessage[],
    config: DriverConfig,
  ): AsyncGenerator<StreamChunk> {
    const headers = buildAnthropicHeaders(
      { apiKey: this.apiKey, baseUrl: this.baseUrl },
      config,
    );

    const { body } = buildCachedAnthropicRequest({ messages, config });

    const signal = withTimeout(config.signal);
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      yield { type: "error", content: `Anthropic request failed: ${msg}` };
      yield { type: "done", content: "" };
      return;
    }

    if (!response.ok) {
      const errorText = await response.text();
      yield { type: "error", content: `Anthropic API error ${response.status}: ${errorText}` };
      yield { type: "done", content: "" };
      return;
    }

    yield* parseAnthropicStream({ response, providerName: "Anthropic" });
  }
}
