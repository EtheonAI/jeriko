import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { AnthropicDriver } from "../../src/daemon/agent/drivers/anthropic.js";
import type { DriverConfig, DriverMessage, StreamChunk } from "../../src/daemon/agent/drivers/index.js";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_SET_TIMEOUT = globalThis.setTimeout;
const ORIGINAL_API_KEY = process.env.ANTHROPIC_API_KEY;
const ORIGINAL_RANDOM = Math.random;

function makeSseResponse(lines: string[], init?: ResponseInit): Response {
  return new Response(lines.join("\n") + "\n", {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
    ...init,
  });
}

async function collect(driver: AnthropicDriver, messages: DriverMessage[], config: DriverConfig): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const chunk of driver.chat(messages, config)) {
    chunks.push(chunk);
  }
  return chunks;
}

describe("AnthropicDriver retry/backoff", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    globalThis.setTimeout = ORIGINAL_SET_TIMEOUT;
    Math.random = ORIGINAL_RANDOM;
    if (ORIGINAL_API_KEY === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = ORIGINAL_API_KEY;
    }
    mock.restore();
  });

  it("retries 429 with Retry-After and succeeds", async () => {
    const fetchMock = mock(async () => {
      return fetchMock.mock.calls.length === 1
        ? new Response("rate limited", { status: 429, headers: { "Retry-After": "2" } })
        : makeSseResponse([
            'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"ok"}}',
            'data: {"type":"message_stop"}',
          ]);
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const sleepCalls: number[] = [];
    globalThis.setTimeout = ((fn: (...args: unknown[]) => void, delay?: number) => {
      sleepCalls.push(Number(delay ?? 0));
      fn();
      return 0 as unknown as Timer;
    }) as typeof setTimeout;

    const driver = new AnthropicDriver();
    const chunks = await collect(driver, [{ role: "user", content: "hello" }], {
      model: "claude-sonnet-4-6",
      max_tokens: 256,
      temperature: 0,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleepCalls).toEqual([2000]);
    expect(chunks.some((c) => c.type === "text" && c.content === "ok")).toBe(true);
    expect(chunks[chunks.length - 1]?.type).toBe("done");
  });

  it("retries 503 with backoff and then returns error after max retries", async () => {
    const fetchMock = mock(async () => new Response("temporary outage", { status: 503 }));
    globalThis.fetch = fetchMock as typeof fetch;

    const sleepCalls: number[] = [];
    const randomSpy = mock(() => 0.5);
    Math.random = randomSpy;
    globalThis.setTimeout = ((fn: (...args: unknown[]) => void, delay?: number) => {
      sleepCalls.push(Number(delay ?? 0));
      fn();
      return 0 as unknown as Timer;
    }) as typeof setTimeout;

    const driver = new AnthropicDriver();
    const chunks = await collect(driver, [{ role: "user", content: "hello" }], {
      model: "claude-sonnet-4-6",
      max_tokens: 256,
      temperature: 0,
    });

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(sleepCalls).toEqual([1000, 2000, 4000, 8000]);
    expect(chunks[0]?.type).toBe("error");
    expect(chunks[0]?.content).toContain("Anthropic API error 503");
    expect(chunks[chunks.length - 1]?.type).toBe("done");
  });

  it("does not retry non-retryable 400 errors", async () => {
    const fetchMock = mock(async () => new Response("bad request", { status: 400 }));
    globalThis.fetch = fetchMock as typeof fetch;

    const sleepSpy = mock(() => 0 as unknown as Timer);
    globalThis.setTimeout = sleepSpy as unknown as typeof setTimeout;

    const driver = new AnthropicDriver();
    const chunks = await collect(driver, [{ role: "user", content: "hello" }], {
      model: "claude-sonnet-4-6",
      max_tokens: 256,
      temperature: 0,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleepSpy).not.toHaveBeenCalled();
    expect(chunks[0]?.type).toBe("error");
    expect(chunks[0]?.content).toContain("Anthropic API error 400");
  });
});
