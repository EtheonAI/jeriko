// Comprehensive audit tests for the Anthropic driver.
//
// Tests cover: message conversion, tool conversion, request building,
// header construction, SSE stream parsing, error handling, and edge cases.
// All tests mock the Anthropic API — no real API calls.

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import type {
  DriverConfig,
  DriverMessage,
  DriverTool,
  StreamChunk,
  ToolCall,
} from "../../src/daemon/agent/drivers/index.js";
import {
  convertToAnthropicMessages,
  convertToAnthropicTools,
  buildAnthropicRequestBody,
  buildAnthropicHeaders,
} from "../../src/daemon/agent/drivers/anthropic-shared.js";
import { parseAnthropicStream } from "../../src/daemon/agent/drivers/anthropic-stream.js";
import { AnthropicDriver } from "../../src/daemon/agent/drivers/anthropic.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Collect all chunks from an async generator into an array. */
async function collectChunks(gen: AsyncGenerator<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const chunk of gen) {
    chunks.push(chunk);
  }
  return chunks;
}

/** Build a minimal DriverConfig for testing. */
function makeConfig(overrides: Partial<DriverConfig> = {}): DriverConfig {
  return {
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    temperature: 0.7,
    ...overrides,
  };
}

/** Create a mock SSE Response from raw event lines. */
function mockSSEResponse(events: string[]): Response {
  const sseText = events.map((e) => `data: ${e}\n\n`).join("");
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(sseText));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

// ============================================================================
// 1. Message Conversion
// ============================================================================

describe("convertToAnthropicMessages", () => {
  it("extracts system message to top-level field", () => {
    const messages: DriverMessage[] = [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Hello" },
    ];
    const result = convertToAnthropicMessages(messages);
    expect(result.system).toBe("You are a helpful assistant.");
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toEqual({ role: "user", content: "Hello" });
  });

  it("returns undefined system when no system message", () => {
    const messages: DriverMessage[] = [
      { role: "user", content: "Hello" },
    ];
    const result = convertToAnthropicMessages(messages);
    expect(result.system).toBeUndefined();
    expect(result.messages).toHaveLength(1);
  });

  it("last system message wins when multiple are present", () => {
    const messages: DriverMessage[] = [
      { role: "system", content: "First system" },
      { role: "system", content: "Second system" },
      { role: "user", content: "Hello" },
    ];
    const result = convertToAnthropicMessages(messages);
    expect(result.system).toBe("Second system");
    expect(result.messages).toHaveLength(1);
  });

  it("converts tool messages to user role with tool_result block", () => {
    const messages: DriverMessage[] = [
      { role: "tool", content: "file contents here", tool_call_id: "tc_123" },
    ];
    const result = convertToAnthropicMessages(messages);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe("user");
    expect(result.messages[0].content).toEqual([
      {
        type: "tool_result",
        tool_use_id: "tc_123",
        content: "file contents here",
      },
    ]);
  });

  it("converts assistant messages with tool_calls to content blocks", () => {
    const messages: DriverMessage[] = [
      {
        role: "assistant",
        content: "Let me check that.",
        tool_calls: [
          { id: "tc_1", name: "read_file", arguments: '{"path":"/tmp/x"}' },
        ],
      },
    ];
    const result = convertToAnthropicMessages(messages);
    expect(result.messages).toHaveLength(1);
    const msg = result.messages[0];
    expect(msg.role).toBe("assistant");
    expect(Array.isArray(msg.content)).toBe(true);
    const blocks = msg.content as any[];
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({ type: "text", text: "Let me check that." });
    expect(blocks[1]).toEqual({
      type: "tool_use",
      id: "tc_1",
      name: "read_file",
      input: { path: "/tmp/x" },
    });
  });

  it("omits text block when assistant has tool_calls but empty content", () => {
    const messages: DriverMessage[] = [
      {
        role: "assistant",
        content: "",
        tool_calls: [
          { id: "tc_1", name: "bash", arguments: '{"cmd":"ls"}' },
        ],
      },
    ];
    const result = convertToAnthropicMessages(messages);
    const blocks = result.messages[0].content as any[];
    // Empty string is falsy, so text block is omitted
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("tool_use");
  });

  it("handles assistant with multiple tool_calls", () => {
    const messages: DriverMessage[] = [
      {
        role: "assistant",
        content: "Running two tools.",
        tool_calls: [
          { id: "tc_1", name: "read_file", arguments: '{"path":"/a"}' },
          { id: "tc_2", name: "write_file", arguments: '{"path":"/b","data":"x"}' },
        ],
      },
    ];
    const result = convertToAnthropicMessages(messages);
    const blocks = result.messages[0].content as any[];
    expect(blocks).toHaveLength(3); // text + 2 tool_use
    expect(blocks[1].name).toBe("read_file");
    expect(blocks[2].name).toBe("write_file");
  });

  it("passes plain user and assistant messages through", () => {
    const messages: DriverMessage[] = [
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello!" },
    ];
    const result = convertToAnthropicMessages(messages);
    expect(result.messages).toEqual([
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello!" },
    ]);
  });

  it("handles empty messages array", () => {
    const result = convertToAnthropicMessages([]);
    expect(result.system).toBeUndefined();
    expect(result.messages).toEqual([]);
  });

  it("uses safeParseArgs for malformed JSON in tool_call arguments", () => {
    const messages: DriverMessage[] = [
      {
        role: "assistant",
        content: "",
        tool_calls: [
          { id: "tc_1", name: "bash", arguments: "not valid json" },
        ],
      },
    ];
    const result = convertToAnthropicMessages(messages);
    const blocks = result.messages[0].content as any[];
    expect(blocks[0].input).toEqual({}); // fallback to empty object
  });

  it("uses safeParseArgs for empty string arguments", () => {
    const messages: DriverMessage[] = [
      {
        role: "assistant",
        content: "",
        tool_calls: [
          { id: "tc_1", name: "bash", arguments: "" },
        ],
      },
    ];
    const result = convertToAnthropicMessages(messages);
    const blocks = result.messages[0].content as any[];
    expect(blocks[0].input).toEqual({});
  });

  it("preserves complex multi-turn conversation order", () => {
    const messages: DriverMessage[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "Q1" },
      {
        role: "assistant",
        content: "",
        tool_calls: [{ id: "t1", name: "bash", arguments: '{"cmd":"ls"}' }],
      },
      { role: "tool", content: "file.txt", tool_call_id: "t1" },
      { role: "assistant", content: "Found file.txt" },
      { role: "user", content: "Q2" },
    ];
    const result = convertToAnthropicMessages(messages);
    expect(result.system).toBe("sys");
    expect(result.messages).toHaveLength(5);
    expect(result.messages[0].role).toBe("user");
    expect(result.messages[1].role).toBe("assistant");
    expect(result.messages[2].role).toBe("user"); // tool_result
    expect(result.messages[3].role).toBe("assistant");
    expect(result.messages[4].role).toBe("user");
  });
});

// ============================================================================
// 2. Tool Conversion
// ============================================================================

describe("convertToAnthropicTools", () => {
  it("converts tools to Anthropic format", () => {
    const config = makeConfig({
      tools: [
        {
          name: "read_file",
          description: "Read a file",
          parameters: {
            type: "object",
            properties: { path: { type: "string" } },
            required: ["path"],
          },
        },
      ],
    });
    const result = convertToAnthropicTools(config);
    expect(result).toHaveLength(1);
    expect(result![0]).toEqual({
      name: "read_file",
      description: "Read a file",
      input_schema: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    });
  });

  it("returns undefined when tools array is empty", () => {
    const config = makeConfig({ tools: [] });
    expect(convertToAnthropicTools(config)).toBeUndefined();
  });

  it("returns undefined when tools is not set", () => {
    const config = makeConfig();
    expect(convertToAnthropicTools(config)).toBeUndefined();
  });

  it("converts multiple tools", () => {
    const config = makeConfig({
      tools: [
        { name: "a", description: "tool a", parameters: { type: "object" } },
        { name: "b", description: "tool b", parameters: { type: "object" } },
      ],
    });
    const result = convertToAnthropicTools(config);
    expect(result).toHaveLength(2);
    expect(result![0].name).toBe("a");
    expect(result![1].name).toBe("b");
  });
});

// ============================================================================
// 3. Request Body Building
// ============================================================================

describe("buildAnthropicRequestBody", () => {
  it("includes model, max_tokens, temperature, stream", () => {
    const config = makeConfig();
    const body = buildAnthropicRequestBody(config, {
      system: undefined,
      messages: [{ role: "user", content: "hi" }],
      tools: undefined,
    });
    expect(body.model).toBe("claude-sonnet-4-6");
    expect(body.max_tokens).toBe(4096);
    expect(body.temperature).toBe(0.7);
    expect(body.stream).toBe(true);
  });

  it("includes system from converted messages", () => {
    const config = makeConfig();
    const body = buildAnthropicRequestBody(config, {
      system: "Be helpful",
      messages: [],
      tools: undefined,
    });
    expect(body.system).toBe("Be helpful");
  });

  it("falls back to config.system_prompt when no system in messages", () => {
    const config = makeConfig({ system_prompt: "Fallback system" });
    const body = buildAnthropicRequestBody(config, {
      system: undefined,
      messages: [],
      tools: undefined,
    });
    expect(body.system).toBe("Fallback system");
  });

  it("message system takes priority over config.system_prompt", () => {
    const config = makeConfig({ system_prompt: "From config" });
    const body = buildAnthropicRequestBody(config, {
      system: "From messages",
      messages: [],
      tools: undefined,
    });
    expect(body.system).toBe("From messages");
  });

  it("omits system when neither source provides one", () => {
    const config = makeConfig();
    const body = buildAnthropicRequestBody(config, {
      system: undefined,
      messages: [],
      tools: undefined,
    });
    expect(body.system).toBeUndefined();
  });

  it("omits tools when undefined", () => {
    const config = makeConfig();
    const body = buildAnthropicRequestBody(config, {
      system: undefined,
      messages: [],
      tools: undefined,
    });
    expect(body.tools).toBeUndefined();
  });

  it("includes tools when provided", () => {
    const tools = [{ name: "t", description: "d", input_schema: {} }];
    const body = buildAnthropicRequestBody(makeConfig(), {
      system: undefined,
      messages: [],
      tools,
    });
    expect(body.tools).toBe(tools);
  });

  it("enables extended thinking with budget", () => {
    const config = makeConfig({ extended_thinking: true, max_tokens: 8192 });
    const body = buildAnthropicRequestBody(config, {
      system: undefined,
      messages: [],
      tools: undefined,
    });
    expect(body.thinking).toEqual({
      type: "enabled",
      budget_tokens: 32768, // 8192 * 4
    });
  });

  it("caps thinking budget at 128K", () => {
    const config = makeConfig({ extended_thinking: true, max_tokens: 100_000 });
    const body = buildAnthropicRequestBody(config, {
      system: undefined,
      messages: [],
      tools: undefined,
    });
    expect((body.thinking as any).budget_tokens).toBe(128_000);
  });

  it("does not include thinking when extended_thinking is false", () => {
    const config = makeConfig({ extended_thinking: false });
    const body = buildAnthropicRequestBody(config, {
      system: undefined,
      messages: [],
      tools: undefined,
    });
    expect(body.thinking).toBeUndefined();
  });
});

// ============================================================================
// 4. Header Building
// ============================================================================

describe("buildAnthropicHeaders", () => {
  it("includes required headers", () => {
    const headers = buildAnthropicHeaders(
      { apiKey: "sk-test", baseUrl: "https://api.anthropic.com" },
      makeConfig(),
    );
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["x-api-key"]).toBe("sk-test");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
  });

  it("always includes prompt caching beta", () => {
    const headers = buildAnthropicHeaders(
      { apiKey: "sk-test", baseUrl: "https://api.anthropic.com" },
      makeConfig(),
    );
    expect(headers["anthropic-beta"]).toContain("prompt-caching-2024-07-31");
  });

  it("includes extended thinking beta when enabled", () => {
    const headers = buildAnthropicHeaders(
      { apiKey: "sk-test", baseUrl: "https://api.anthropic.com" },
      makeConfig({ extended_thinking: true }),
    );
    const beta = headers["anthropic-beta"];
    expect(beta).toContain("extended-thinking-2025-04-11");
    expect(beta).toContain("prompt-caching-2024-07-31");
  });

  it("merges custom headers", () => {
    const headers = buildAnthropicHeaders(
      {
        apiKey: "sk-test",
        baseUrl: "https://api.anthropic.com",
        customHeaders: { "X-Custom": "value" },
      },
      makeConfig(),
    );
    expect(headers["X-Custom"]).toBe("value");
  });

  it("custom headers can override defaults", () => {
    const headers = buildAnthropicHeaders(
      {
        apiKey: "sk-test",
        baseUrl: "https://api.anthropic.com",
        customHeaders: { "x-api-key": "override-key" },
      },
      makeConfig(),
    );
    expect(headers["x-api-key"]).toBe("override-key");
  });
});

// ============================================================================
// 5. SSE Stream Parsing
// ============================================================================

describe("parseAnthropicStream", () => {
  it("parses text_delta events", async () => {
    const response = mockSSEResponse([
      JSON.stringify({
        type: "content_block_delta",
        delta: { type: "text_delta", text: "Hello" },
      }),
      JSON.stringify({
        type: "content_block_delta",
        delta: { type: "text_delta", text: " world" },
      }),
      JSON.stringify({ type: "message_stop" }),
    ]);
    const chunks = await collectChunks(parseAnthropicStream({ response }));
    expect(chunks).toEqual([
      { type: "text", content: "Hello" },
      { type: "text", content: " world" },
      { type: "done", content: "" },
    ]);
  });

  it("parses thinking_delta events", async () => {
    const response = mockSSEResponse([
      JSON.stringify({
        type: "content_block_delta",
        delta: { type: "thinking_delta", thinking: "Let me think..." },
      }),
      JSON.stringify({ type: "message_stop" }),
    ]);
    const chunks = await collectChunks(parseAnthropicStream({ response }));
    expect(chunks[0]).toEqual({ type: "thinking", content: "Let me think..." });
    expect(chunks[1]).toEqual({ type: "done", content: "" });
  });

  it("parses complete tool call flow", async () => {
    const response = mockSSEResponse([
      JSON.stringify({
        type: "content_block_start",
        content_block: { type: "tool_use", id: "tc_1", name: "read_file" },
      }),
      JSON.stringify({
        type: "content_block_delta",
        delta: { type: "input_json_delta", partial_json: '{"pa' },
      }),
      JSON.stringify({
        type: "content_block_delta",
        delta: { type: "input_json_delta", partial_json: 'th":"/tmp"}' },
      }),
      JSON.stringify({ type: "content_block_stop" }),
      JSON.stringify({ type: "message_stop" }),
    ]);
    const chunks = await collectChunks(parseAnthropicStream({ response }));
    expect(chunks).toHaveLength(2); // tool_call + done
    expect(chunks[0].type).toBe("tool_call");
    expect(chunks[0].tool_call).toEqual({
      id: "tc_1",
      name: "read_file",
      arguments: '{"path":"/tmp"}',
    });
    expect(chunks[1].type).toBe("done");
  });

  it("handles text + tool_call in same message", async () => {
    const response = mockSSEResponse([
      JSON.stringify({
        type: "content_block_delta",
        delta: { type: "text_delta", text: "Let me read that." },
      }),
      JSON.stringify({
        type: "content_block_start",
        content_block: { type: "tool_use", id: "tc_2", name: "bash" },
      }),
      JSON.stringify({
        type: "content_block_delta",
        delta: { type: "input_json_delta", partial_json: '{"cmd":"ls"}' },
      }),
      JSON.stringify({ type: "content_block_stop" }),
      JSON.stringify({ type: "message_stop" }),
    ]);
    const chunks = await collectChunks(parseAnthropicStream({ response }));
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toEqual({ type: "text", content: "Let me read that." });
    expect(chunks[1].type).toBe("tool_call");
    expect(chunks[1].tool_call!.name).toBe("bash");
    expect(chunks[2].type).toBe("done");
  });

  it("handles multiple tool calls", async () => {
    const response = mockSSEResponse([
      // First tool
      JSON.stringify({
        type: "content_block_start",
        content_block: { type: "tool_use", id: "tc_a", name: "read" },
      }),
      JSON.stringify({
        type: "content_block_delta",
        delta: { type: "input_json_delta", partial_json: '{}' },
      }),
      JSON.stringify({ type: "content_block_stop" }),
      // Second tool
      JSON.stringify({
        type: "content_block_start",
        content_block: { type: "tool_use", id: "tc_b", name: "write" },
      }),
      JSON.stringify({
        type: "content_block_delta",
        delta: { type: "input_json_delta", partial_json: '{"x":1}' },
      }),
      JSON.stringify({ type: "content_block_stop" }),
      JSON.stringify({ type: "message_stop" }),
    ]);
    const chunks = await collectChunks(parseAnthropicStream({ response }));
    const toolCalls = chunks.filter((c) => c.type === "tool_call");
    expect(toolCalls).toHaveLength(2);
    expect(toolCalls[0].tool_call!.id).toBe("tc_a");
    expect(toolCalls[1].tool_call!.id).toBe("tc_b");
  });

  it("handles content_block_stop without active tool call (no-op)", async () => {
    const response = mockSSEResponse([
      JSON.stringify({
        type: "content_block_delta",
        delta: { type: "text_delta", text: "hello" },
      }),
      // content_block_stop with no tool call active
      JSON.stringify({ type: "content_block_stop" }),
      JSON.stringify({ type: "message_stop" }),
    ]);
    const chunks = await collectChunks(parseAnthropicStream({ response }));
    expect(chunks).toHaveLength(2);
    expect(chunks[0].type).toBe("text");
    expect(chunks[1].type).toBe("done");
  });

  it("handles stream error event", async () => {
    const response = mockSSEResponse([
      JSON.stringify({
        type: "error",
        error: { type: "overloaded_error", message: "Server overloaded" },
      }),
      JSON.stringify({ type: "message_stop" }),
    ]);
    const chunks = await collectChunks(parseAnthropicStream({ response }));
    expect(chunks[0]).toEqual({
      type: "error",
      content: "Stream error: Server overloaded",
    });
    // continues to message_stop
    expect(chunks[1]).toEqual({ type: "done", content: "" });
  });

  it("handles stream error with no message", async () => {
    const response = mockSSEResponse([
      JSON.stringify({
        type: "error",
        error: { type: "api_error" },
      }),
      JSON.stringify({ type: "message_stop" }),
    ]);
    const chunks = await collectChunks(parseAnthropicStream({ response }));
    expect(chunks[0].content).toBe("Stream error: unknown");
  });

  it("skips malformed JSON lines", async () => {
    const response = mockSSEResponse([
      "not valid json at all",
      JSON.stringify({
        type: "content_block_delta",
        delta: { type: "text_delta", text: "ok" },
      }),
      JSON.stringify({ type: "message_stop" }),
    ]);
    const chunks = await collectChunks(parseAnthropicStream({ response }));
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual({ type: "text", content: "ok" });
    expect(chunks[1]).toEqual({ type: "done", content: "" });
  });

  it("skips [DONE] sentinel", async () => {
    const response = mockSSEResponse([
      JSON.stringify({
        type: "content_block_delta",
        delta: { type: "text_delta", text: "hi" },
      }),
      "[DONE]",
      JSON.stringify({ type: "message_stop" }),
    ]);
    const chunks = await collectChunks(parseAnthropicStream({ response }));
    expect(chunks).toHaveLength(2);
    expect(chunks[0].type).toBe("text");
    expect(chunks[1].type).toBe("done");
  });

  it("yields error + done when response has no body", async () => {
    const response = new Response(null, { status: 200 });
    // Override body to null
    Object.defineProperty(response, "body", { value: null });
    const chunks = await collectChunks(parseAnthropicStream({ response }));
    expect(chunks).toHaveLength(2);
    expect(chunks[0].type).toBe("error");
    expect(chunks[0].content).toContain("returned no body");
    expect(chunks[1].type).toBe("done");
  });

  it("uses custom provider name in error messages", async () => {
    const response = new Response(null, { status: 200 });
    Object.defineProperty(response, "body", { value: null });
    const chunks = await collectChunks(
      parseAnthropicStream({ response, providerName: "MyProxy" }),
    );
    expect(chunks[0].content).toContain("MyProxy");
  });

  it("yields done when stream ends without message_stop", async () => {
    const response = mockSSEResponse([
      JSON.stringify({
        type: "content_block_delta",
        delta: { type: "text_delta", text: "partial" },
      }),
      // No message_stop — stream just ends
    ]);
    const chunks = await collectChunks(parseAnthropicStream({ response }));
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual({ type: "text", content: "partial" });
    expect(chunks[1]).toEqual({ type: "done", content: "" });
  });

  it("handles empty tool call arguments", async () => {
    const response = mockSSEResponse([
      JSON.stringify({
        type: "content_block_start",
        content_block: { type: "tool_use", id: "tc_e", name: "no_args" },
      }),
      // No input_json_delta events — args stay empty
      JSON.stringify({ type: "content_block_stop" }),
      JSON.stringify({ type: "message_stop" }),
    ]);
    const chunks = await collectChunks(parseAnthropicStream({ response }));
    expect(chunks[0].tool_call!.arguments).toBe("");
  });

  it("handles content_block_delta with no delta field", async () => {
    const response = mockSSEResponse([
      JSON.stringify({ type: "content_block_delta" }), // missing delta
      JSON.stringify({ type: "message_stop" }),
    ]);
    const chunks = await collectChunks(parseAnthropicStream({ response }));
    // Should skip the event with no delta and just yield done
    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe("done");
  });

  it("handles text_delta with missing text field", async () => {
    const response = mockSSEResponse([
      JSON.stringify({
        type: "content_block_delta",
        delta: { type: "text_delta" }, // no text field
      }),
      JSON.stringify({ type: "message_stop" }),
    ]);
    const chunks = await collectChunks(parseAnthropicStream({ response }));
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual({ type: "text", content: "" }); // ?? "" fallback
    expect(chunks[1].type).toBe("done");
  });

  it("handles chunked SSE data across multiple reads", async () => {
    // Simulate data arriving in chunks that split mid-line
    const encoder = new TextEncoder();
    const part1 = 'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"He';
    const part2 = 'llo"}}\n\ndata: {"type":"message_stop"}\n\n';

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(part1));
        controller.enqueue(encoder.encode(part2));
        controller.close();
      },
    });
    const response = new Response(stream, { status: 200 });
    const chunks = await collectChunks(parseAnthropicStream({ response }));
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual({ type: "text", content: "Hello" });
    expect(chunks[1]).toEqual({ type: "done", content: "" });
  });

  it("ignores non-data SSE lines", async () => {
    // Simulate lines that don't start with "data: "
    const encoder = new TextEncoder();
    const sseText = [
      "event: content_block_delta",
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"ok"}}',
      "",
      'data: {"type":"message_stop"}',
      "",
    ].join("\n");
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sseText));
        controller.close();
      },
    });
    const response = new Response(stream, { status: 200 });
    const chunks = await collectChunks(parseAnthropicStream({ response }));
    expect(chunks[0]).toEqual({ type: "text", content: "ok" });
    expect(chunks[1]).toEqual({ type: "done", content: "" });
  });
});

// ============================================================================
// 6. AnthropicDriver — Integration (mocked fetch)
// ============================================================================

describe("AnthropicDriver.chat", () => {
  let origApiKey: string | undefined;
  let origBaseUrl: string | undefined;
  let origFetch: typeof globalThis.fetch;

  beforeEach(() => {
    origApiKey = process.env.ANTHROPIC_API_KEY;
    origBaseUrl = process.env.ANTHROPIC_BASE_URL;
    origFetch = globalThis.fetch;
    process.env.ANTHROPIC_API_KEY = "test-key-123";
  });

  afterEach(() => {
    if (origApiKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = origApiKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
    if (origBaseUrl !== undefined) {
      process.env.ANTHROPIC_BASE_URL = origBaseUrl;
    } else {
      delete process.env.ANTHROPIC_BASE_URL;
    }
    globalThis.fetch = origFetch;
  });

  it("throws when ANTHROPIC_API_KEY is not set", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const driver = new AnthropicDriver();
    const gen = driver.chat(
      [{ role: "user", content: "hi" }],
      makeConfig(),
    );
    // The error is thrown when apiKey getter is accessed during chat()
    try {
      const chunks = await collectChunks(gen);
      // If it doesn't throw, it should yield an error chunk
      const errorChunk = chunks.find((c) => c.type === "error");
      expect(errorChunk).toBeDefined();
    } catch (err) {
      expect((err as Error).message).toContain("ANTHROPIC_API_KEY");
    }
  });

  it("yields error + done on network failure", async () => {
    globalThis.fetch = (() => {
      throw new Error("Network unreachable");
    }) as any;
    const driver = new AnthropicDriver();
    const chunks = await collectChunks(
      driver.chat([{ role: "user", content: "hi" }], makeConfig()),
    );
    expect(chunks).toHaveLength(2);
    expect(chunks[0].type).toBe("error");
    expect(chunks[0].content).toContain("Anthropic request failed");
    expect(chunks[0].content).toContain("Network unreachable");
    expect(chunks[1].type).toBe("done");
  });

  it("yields error + done on non-200 response", async () => {
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ error: { message: "Rate limited" } }), {
        status: 429,
        statusText: "Too Many Requests",
      });
    }) as any;
    const driver = new AnthropicDriver();
    const chunks = await collectChunks(
      driver.chat([{ role: "user", content: "hi" }], makeConfig()),
    );
    expect(chunks).toHaveLength(2);
    expect(chunks[0].type).toBe("error");
    expect(chunks[0].content).toContain("429");
    expect(chunks[0].content).toContain("Rate limited");
    expect(chunks[1].type).toBe("done");
  });

  it("yields error + done on 401 auth error", async () => {
    globalThis.fetch = (async () => {
      return new Response('{"error":{"message":"Invalid API key"}}', {
        status: 401,
      });
    }) as any;
    const driver = new AnthropicDriver();
    const chunks = await collectChunks(
      driver.chat([{ role: "user", content: "hi" }], makeConfig()),
    );
    expect(chunks[0].type).toBe("error");
    expect(chunks[0].content).toContain("401");
    expect(chunks[0].content).toContain("Invalid API key");
  });

  it("sends correct request to API", async () => {
    let capturedUrl = "";
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: any = {};

    globalThis.fetch = (async (url: string, opts: any) => {
      capturedUrl = url;
      capturedHeaders = opts.headers;
      capturedBody = JSON.parse(opts.body);
      return mockSSEResponse([JSON.stringify({ type: "message_stop" })]);
    }) as any;

    const driver = new AnthropicDriver();
    const messages: DriverMessage[] = [
      { role: "system", content: "Be helpful" },
      { role: "user", content: "Hello" },
    ];
    const config = makeConfig({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      temperature: 0.5,
    });

    await collectChunks(driver.chat(messages, config));

    expect(capturedUrl).toBe("https://api.anthropic.com/v1/messages");
    expect(capturedHeaders["x-api-key"]).toBe("test-key-123");
    expect(capturedHeaders["anthropic-version"]).toBe("2023-06-01");
    expect(capturedBody.model).toBe("claude-sonnet-4-6");
    expect(capturedBody.max_tokens).toBe(2048);
    expect(capturedBody.temperature).toBe(0.5);
    expect(capturedBody.stream).toBe(true);
    expect(capturedBody.system).toBe("Be helpful");
    expect(capturedBody.messages).toEqual([{ role: "user", content: "Hello" }]);
  });

  it("uses custom base URL from environment", async () => {
    process.env.ANTHROPIC_BASE_URL = "https://my-proxy.example.com";
    let capturedUrl = "";

    globalThis.fetch = (async (url: string) => {
      capturedUrl = url;
      return mockSSEResponse([JSON.stringify({ type: "message_stop" })]);
    }) as any;

    const driver = new AnthropicDriver();
    await collectChunks(
      driver.chat([{ role: "user", content: "hi" }], makeConfig()),
    );
    expect(capturedUrl).toBe("https://my-proxy.example.com/v1/messages");
  });

  it("streams full conversation with text and tool call", async () => {
    globalThis.fetch = (async () => {
      return mockSSEResponse([
        JSON.stringify({
          type: "content_block_delta",
          delta: { type: "text_delta", text: "I'll check." },
        }),
        JSON.stringify({
          type: "content_block_start",
          content_block: { type: "tool_use", id: "tc_99", name: "bash" },
        }),
        JSON.stringify({
          type: "content_block_delta",
          delta: { type: "input_json_delta", partial_json: '{"command":"pwd"}' },
        }),
        JSON.stringify({ type: "content_block_stop" }),
        JSON.stringify({ type: "message_stop" }),
      ]);
    }) as any;

    const driver = new AnthropicDriver();
    const chunks = await collectChunks(
      driver.chat([{ role: "user", content: "where am I?" }], makeConfig()),
    );
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toEqual({ type: "text", content: "I'll check." });
    expect(chunks[1].type).toBe("tool_call");
    expect(chunks[1].tool_call).toEqual({
      id: "tc_99",
      name: "bash",
      arguments: '{"command":"pwd"}',
    });
    expect(chunks[2].type).toBe("done");
  });

  it("includes tools in request body", async () => {
    let capturedBody: any = {};

    globalThis.fetch = (async (_url: string, opts: any) => {
      capturedBody = JSON.parse(opts.body);
      return mockSSEResponse([JSON.stringify({ type: "message_stop" })]);
    }) as any;

    const driver = new AnthropicDriver();
    const config = makeConfig({
      tools: [
        {
          name: "test_tool",
          description: "A test tool",
          parameters: { type: "object", properties: {} },
        },
      ],
    });
    await collectChunks(
      driver.chat([{ role: "user", content: "hi" }], config),
    );
    expect(capturedBody.tools).toEqual([
      {
        name: "test_tool",
        description: "A test tool",
        input_schema: { type: "object", properties: {} },
      },
    ]);
  });

  it("handles async fetch rejection (not throw)", async () => {
    globalThis.fetch = (() => {
      return Promise.reject(new Error("DNS resolution failed"));
    }) as any;
    const driver = new AnthropicDriver();
    const chunks = await collectChunks(
      driver.chat([{ role: "user", content: "hi" }], makeConfig()),
    );
    expect(chunks[0].type).toBe("error");
    expect(chunks[0].content).toContain("DNS resolution failed");
    expect(chunks[1].type).toBe("done");
  });

  it("sends extended thinking headers and body when enabled", async () => {
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: any = {};

    globalThis.fetch = (async (_url: string, opts: any) => {
      capturedHeaders = opts.headers;
      capturedBody = JSON.parse(opts.body);
      return mockSSEResponse([JSON.stringify({ type: "message_stop" })]);
    }) as any;

    const driver = new AnthropicDriver();
    const config = makeConfig({ extended_thinking: true, max_tokens: 4096 });
    await collectChunks(
      driver.chat([{ role: "user", content: "think hard" }], config),
    );

    expect(capturedHeaders["anthropic-beta"]).toContain("extended-thinking-2025-04-11");
    expect(capturedBody.thinking).toEqual({
      type: "enabled",
      budget_tokens: 16384, // 4096 * 4
    });
  });
});

// ============================================================================
// 7. Driver Registration
// ============================================================================

describe("Anthropic driver registration", () => {
  it("resolves via getDriver('anthropic')", async () => {
    const { getDriver } = await import("../../src/daemon/agent/drivers/index.js");
    const driver = getDriver("anthropic");
    expect(driver.name).toBe("anthropic");
  });

  it("resolves via getDriver('claude') alias", async () => {
    const { getDriver } = await import("../../src/daemon/agent/drivers/index.js");
    const driver = getDriver("claude");
    expect(driver.name).toBe("anthropic");
  });
});

// ============================================================================
// 8. Edge Cases & Robustness
// ============================================================================

describe("edge cases", () => {
  it("safeParseArgs: valid JSON returns parsed object", () => {
    // Test via message conversion since safeParseArgs is not exported
    const messages: DriverMessage[] = [
      {
        role: "assistant",
        content: "",
        tool_calls: [
          { id: "t", name: "x", arguments: '{"key":"value","n":42}' },
        ],
      },
    ];
    const result = convertToAnthropicMessages(messages);
    const blocks = result.messages[0].content as any[];
    expect(blocks[0].input).toEqual({ key: "value", n: 42 });
  });

  it("safeParseArgs: array JSON returns array (not object)", () => {
    const messages: DriverMessage[] = [
      {
        role: "assistant",
        content: "",
        tool_calls: [
          { id: "t", name: "x", arguments: "[1,2,3]" },
        ],
      },
    ];
    const result = convertToAnthropicMessages(messages);
    const blocks = result.messages[0].content as any[];
    // Arrays are valid JSON — safeParseArgs returns them as-is
    expect(blocks[0].input).toEqual([1, 2, 3]);
  });

  it("safeParseArgs: null JSON returns null", () => {
    const messages: DriverMessage[] = [
      {
        role: "assistant",
        content: "",
        tool_calls: [
          { id: "t", name: "x", arguments: "null" },
        ],
      },
    ];
    const result = convertToAnthropicMessages(messages);
    const blocks = result.messages[0].content as any[];
    expect(blocks[0].input).toBeNull();
  });

  it("safeParseArgs: numeric JSON returns number", () => {
    const messages: DriverMessage[] = [
      {
        role: "assistant",
        content: "",
        tool_calls: [
          { id: "t", name: "x", arguments: "42" },
        ],
      },
    ];
    const result = convertToAnthropicMessages(messages);
    const blocks = result.messages[0].content as any[];
    expect(blocks[0].input).toBe(42);
  });

  it("tool message with undefined tool_call_id", () => {
    const messages: DriverMessage[] = [
      { role: "tool", content: "result" },
    ];
    const result = convertToAnthropicMessages(messages);
    const blocks = result.messages[0].content as any[];
    expect(blocks[0].tool_use_id).toBeUndefined();
  });

  it("handles very large tool call arguments in stream", async () => {
    const bigValue = "x".repeat(100_000);
    const response = mockSSEResponse([
      JSON.stringify({
        type: "content_block_start",
        content_block: { type: "tool_use", id: "tc_big", name: "big" },
      }),
      JSON.stringify({
        type: "content_block_delta",
        delta: { type: "input_json_delta", partial_json: `{"data":"${bigValue}"}` },
      }),
      JSON.stringify({ type: "content_block_stop" }),
      JSON.stringify({ type: "message_stop" }),
    ]);
    const chunks = await collectChunks(parseAnthropicStream({ response }));
    expect(chunks[0].tool_call!.arguments).toContain(bigValue);
  });

  it("content_block_start with text type does not initialize tool call", async () => {
    const response = mockSSEResponse([
      JSON.stringify({
        type: "content_block_start",
        content_block: { type: "text", text: "" },
      }),
      JSON.stringify({
        type: "content_block_delta",
        delta: { type: "text_delta", text: "hello" },
      }),
      JSON.stringify({ type: "content_block_stop" }),
      JSON.stringify({ type: "message_stop" }),
    ]);
    const chunks = await collectChunks(parseAnthropicStream({ response }));
    // Should not yield a tool_call — only text + done
    expect(chunks).toHaveLength(2);
    expect(chunks[0].type).toBe("text");
    expect(chunks[1].type).toBe("done");
  });

  it("empty system message is falsy — config.system_prompt takes over", () => {
    // This documents the Bug 4 behavior from the analysis
    const config = makeConfig({ system_prompt: "Fallback" });
    const body = buildAnthropicRequestBody(config, {
      system: "", // empty string — falsy
      messages: [],
      tools: undefined,
    });
    // Empty string is falsy, so config.system_prompt wins
    expect(body.system).toBe("Fallback");
  });
});
