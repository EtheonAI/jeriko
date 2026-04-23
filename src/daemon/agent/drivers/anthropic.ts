// Daemon — Anthropic / Claude driver.
// Streams chat completions via the Anthropic Messages API.
// Supports extended thinking and prompt caching.
//
// Message conversion, tool conversion, and SSE parsing are delegated to shared
// modules (anthropic-shared.ts, anthropic-stream.ts), also used by
// AnthropicCompatibleDriver for custom Anthropic-protocol providers.
//
// Transport resilience (retry / backoff / Retry-After) is delegated to
// `shared/http-retry` so every driver + connector shares the same discipline.

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
import { withHttpRetry } from "../../../shared/http-retry.js";
import { redact } from "../../security/redaction.js";
import { getLogger } from "../../../shared/logger.js";

const DEFAULT_BASE_URL = "https://api.anthropic.com";
const log = getLogger();

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

    // Prompt-caching aware body builder — places `cache_control` breakpoints
    // at stable segments so subsequent turns hit the Anthropic prompt cache.
    const { body } = buildCachedAnthropicRequest({ messages, config });

    const signal = withTimeout(config.signal);
    const url = `${this.baseUrl}/v1/messages`;
    const serialized = JSON.stringify(body);

    let response: Response;
    try {
      response = await withHttpRetry(
        () => fetch(url, { method: "POST", headers, body: serialized, signal }),
        {
          onRetry: ({ attempt, delayMs, status, reason }) => {
            if (status === 429) {
              log.warn(
                `Anthropic rate-limited (429). Retrying in ${Math.round(delayMs)}ms ` +
                `(attempt ${attempt + 1}).`,
              );
            } else {
              log.debug(
                `Anthropic retry: status=${status} attempt=${attempt + 1} ` +
                `delay=${Math.round(delayMs)}ms reason="${reason}"`,
              );
            }
          },
        },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      yield { type: "error", content: `Anthropic request failed: ${msg}` };
      yield { type: "done", content: "" };
      return;
    }

    if (!response.ok) {
      const errorText = await response.text();
      yield {
        type: "error",
        content: `Anthropic API error ${response.status}: ${redact(errorText)}`,
      };
      yield { type: "done", content: "" };
      return;
    }

    yield* parseAnthropicStream({ response, providerName: "Anthropic" });
  }
}
