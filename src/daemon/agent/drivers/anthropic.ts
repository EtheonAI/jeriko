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
import {
  convertToAnthropicMessages,
  convertToAnthropicTools,
  buildAnthropicRequestBody,
  buildAnthropicHeaders,
} from "./anthropic-shared.js";
import { getLogger } from "../../../shared/logger.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URL = "https://api.anthropic.com";
const MAX_RETRIES = 4;
const BASE_DELAY_MS = 1000;

const log = getLogger();

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
    const { system, messages: converted } = convertToAnthropicMessages(messages);
    const tools = convertToAnthropicTools(config);

    const headers = buildAnthropicHeaders(
      { apiKey: this.apiKey, baseUrl: this.baseUrl },
      config,
    );

    const body = buildAnthropicRequestBody(config, { system, messages: converted, tools });

    const signal = withTimeout(config.signal);
    const isRetryable = (status: number) =>
      status === 429 || status === 502 || status === 503 || status === 504;

    let response!: Response;
    let lastStatus = 0;
    let lastErrorText = "";

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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

      if (response.ok) break;

      lastStatus = response.status;
      const { redact } = await import("../../security/redaction.js");
      lastErrorText = redact(await response.text());

      if (!isRetryable(lastStatus) || attempt === MAX_RETRIES) break;

      let delayMs: number;
      const retryAfterHeader = response.headers.get("Retry-After");
      if (retryAfterHeader !== null) {
        const parsed = parseInt(retryAfterHeader, 10);
        delayMs = Number.isNaN(parsed) ? BASE_DELAY_MS : parsed * 1000;
      } else {
        const base = BASE_DELAY_MS * Math.pow(2, attempt);
        const jitter = base * 0.2 * (Math.random() * 2 - 1);
        delayMs = base + jitter;
      }

      if (lastStatus === 429) {
        log.warn(
          `Anthropic rate-limited (429). Retrying in ${Math.round(delayMs)}ms (attempt ${attempt + 1}/${MAX_RETRIES}).`,
        );
      }

      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }

    if (!response.ok) {
      yield { type: "error", content: `Anthropic API error ${lastStatus}: ${lastErrorText}` };
      yield { type: "done", content: "" };
      return;
    }

    yield* parseAnthropicStream({ response, providerName: "Anthropic" });
  }
}
