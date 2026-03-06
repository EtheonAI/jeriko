// OpenAI Driver Audit Tests
//
// Tests the full OpenAI/GPT driver stack:
//   - OpenAICompatibleDriver: message conversion, tool conversion, URL logic, chat flow
//   - parseOpenAIStream: split-boundary parsing, advanced tool call accumulation
//   - OpenAIDriver: lazy delegation, env var wiring
//
// All HTTP is mocked — no real API calls.

import { describe, expect, it, beforeEach, afterEach, mock } from "bun:test";
import { OpenAICompatibleDriver } from "../../src/daemon/agent/drivers/openai-compat.js";
import { parseOpenAIStream } from "../../src/daemon/agent/drivers/openai-stream.js";
import type {
  StreamChunk,
  DriverMessage,
  DriverConfig,
  DriverTool,
} from "../../src/daemon/agent/drivers/index.js";
import type { ProviderConfig } from "../../src/shared/config.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProvider(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: "test-provider",
    name: "Test Provider",
    baseUrl: "https://api.test.com/v1",
    apiKey: "sk-test-key-12345",
    type: "openai-compatible",
    ...overrides,
  };
}

function makeConfig(overrides: Partial<DriverConfig> = {}): DriverConfig {
  return {
    model: "gpt-4o",
    max_tokens: 4096,
    temperature: 0.7,
    ...overrides,
  };
}

function makeMessages(...msgs: DriverMessage[]): DriverMessage[] {
  return msgs;
}

/** Collect all chunks from an async generator. */
async function collect(gen: AsyncGenerator<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const c of gen) chunks.push(c);
  return chunks;
}

/** Build SSE response body from lines. */
function sseBody(lines: string[]): string {
  return lines.join("\n") + "\n";
}

/** Create a mock Response with SSE body. */
function mockSSE(lines: string[]): Response {
  return new Response(sseBody(lines), {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

/**
 * Create a ReadableStream that delivers data in specified byte-sized chunks.
 * Used to test split-boundary parsing.
 */
function chunkedStream(text: string, chunkSize: number): ReadableStream<Uint8Array> {
  const encoded = new TextEncoder().encode(text);
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= encoded.length) {
        controller.close();
        return;
      }
      const end = Math.min(offset + chunkSize, encoded.length);
      controller.enqueue(encoded.slice(offset, end));
      offset = end;
    },
  });
}

// Track original fetch for restoration
const originalFetch = globalThis.fetch;

// ---------------------------------------------------------------------------
// 1. Message Conversion
// ---------------------------------------------------------------------------

describe("OpenAICompatibleDriver message conversion", () => {
  let driver: OpenAICompatibleDriver;
  let lastRequestBody: Record<string, unknown> | null;

  beforeEach(() => {
    lastRequestBody = null;
    driver = new OpenAICompatibleDriver(makeProvider());

    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      lastRequestBody = JSON.parse(init?.body as string);
      return mockSSE([
        'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}',
      ]);
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("converts basic user/assistant/system messages", async () => {
    const messages = makeMessages(
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there!" },
    );

    await collect(driver.chat(messages, makeConfig()));

    const sent = lastRequestBody!.messages as Array<Record<string, unknown>>;
    expect(sent).toHaveLength(3);
    expect(sent[0]).toEqual({ role: "system", content: "You are helpful." });
    expect(sent[1]).toEqual({ role: "user", content: "Hello" });
    expect(sent[2]).toEqual({ role: "assistant", content: "Hi there!" });
  });

  it("converts assistant messages with tool_calls", async () => {
    const messages = makeMessages({
      role: "assistant",
      content: "",
      tool_calls: [
        { id: "call_abc", name: "bash", arguments: '{"command":"ls"}' },
      ],
    });

    await collect(driver.chat(messages, makeConfig()));

    const sent = lastRequestBody!.messages as Array<Record<string, unknown>>;
    // system prompt injected + 1 assistant message
    const assistantMsg = sent.find((m) => m.role === "assistant")!;
    expect(assistantMsg.content).toBeNull(); // empty string -> null
    expect(assistantMsg.tool_calls).toEqual([
      {
        id: "call_abc",
        type: "function",
        function: { name: "bash", arguments: '{"command":"ls"}' },
      },
    ]);
  });

  it("preserves content when assistant has both content and tool_calls", async () => {
    const messages = makeMessages({
      role: "assistant",
      content: "Let me check that.",
      tool_calls: [
        { id: "call_1", name: "read", arguments: '{"path":"/tmp"}' },
      ],
    });

    await collect(driver.chat(messages, makeConfig()));

    const sent = lastRequestBody!.messages as Array<Record<string, unknown>>;
    const assistantMsg = sent.find((m) => m.role === "assistant")!;
    expect(assistantMsg.content).toBe("Let me check that.");
    expect(assistantMsg.tool_calls).toBeDefined();
  });

  it("converts tool result messages with tool_call_id", async () => {
    const messages = makeMessages(
      {
        role: "assistant",
        content: "",
        tool_calls: [{ id: "call_1", name: "bash", arguments: "{}" }],
      },
      { role: "tool", content: "file1.txt\nfile2.txt", tool_call_id: "call_1" },
    );

    await collect(driver.chat(messages, makeConfig()));

    const sent = lastRequestBody!.messages as Array<Record<string, unknown>>;
    const toolMsg = sent.find((m) => m.role === "tool")!;
    expect(toolMsg.tool_call_id).toBe("call_1");
    expect(toolMsg.content).toBe("file1.txt\nfile2.txt");
  });

  it("injects system_prompt if none present in messages", async () => {
    const messages = makeMessages({ role: "user", content: "Hi" });
    const config = makeConfig({ system_prompt: "You are Jeriko." });

    await collect(driver.chat(messages, config));

    const sent = lastRequestBody!.messages as Array<Record<string, unknown>>;
    expect(sent[0]).toEqual({ role: "system", content: "You are Jeriko." });
    expect(sent[1]).toEqual({ role: "user", content: "Hi" });
  });

  it("does NOT inject system_prompt if messages already have one", async () => {
    const messages = makeMessages(
      { role: "system", content: "Existing system." },
      { role: "user", content: "Hi" },
    );
    const config = makeConfig({ system_prompt: "Should not appear." });

    await collect(driver.chat(messages, config));

    const sent = lastRequestBody!.messages as Array<Record<string, unknown>>;
    const systemMsgs = sent.filter((m) => m.role === "system");
    expect(systemMsgs).toHaveLength(1);
    expect(systemMsgs[0]!.content).toBe("Existing system.");
  });
});

// ---------------------------------------------------------------------------
// 2. Tool Definition Conversion
// ---------------------------------------------------------------------------

describe("OpenAICompatibleDriver tool conversion", () => {
  let driver: OpenAICompatibleDriver;
  let lastRequestBody: Record<string, unknown> | null;

  beforeEach(() => {
    lastRequestBody = null;
    driver = new OpenAICompatibleDriver(makeProvider());

    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      lastRequestBody = JSON.parse(init?.body as string);
      return mockSSE([
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
      ]);
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("converts DriverTool[] to OpenAI function calling format", async () => {
    const tools: DriverTool[] = [
      {
        name: "bash",
        description: "Execute a shell command",
        parameters: {
          type: "object",
          properties: { command: { type: "string" } },
          required: ["command"],
        },
      },
      {
        name: "read",
        description: "Read a file",
        parameters: {
          type: "object",
          properties: { path: { type: "string" } },
        },
      },
    ];

    await collect(
      driver.chat(
        [{ role: "user", content: "test" }],
        makeConfig({ tools }),
      ),
    );

    const body = lastRequestBody!;
    expect(body.tool_choice).toBe("auto");
    const sent = body.tools as Array<Record<string, unknown>>;
    expect(sent).toHaveLength(2);
    expect(sent[0]).toEqual({
      type: "function",
      function: {
        name: "bash",
        description: "Execute a shell command",
        parameters: {
          type: "object",
          properties: { command: { type: "string" } },
          required: ["command"],
        },
      },
    });
  });

  it("omits tools and tool_choice when no tools provided", async () => {
    await collect(
      driver.chat(
        [{ role: "user", content: "test" }],
        makeConfig({ tools: undefined }),
      ),
    );

    expect(lastRequestBody!.tools).toBeUndefined();
    expect(lastRequestBody!.tool_choice).toBeUndefined();
  });

  it("omits tools when tools array is empty", async () => {
    await collect(
      driver.chat(
        [{ role: "user", content: "test" }],
        makeConfig({ tools: [] }),
      ),
    );

    expect(lastRequestBody!.tools).toBeUndefined();
    expect(lastRequestBody!.tool_choice).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3. URL Construction (chatEndpoint)
// ---------------------------------------------------------------------------

describe("OpenAICompatibleDriver URL construction", () => {
  let capturedUrl: string;

  beforeEach(() => {
    capturedUrl = "";
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      capturedUrl = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
      return mockSSE([
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
      ]);
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("appends /chat/completions when baseUrl ends with /v1", async () => {
    const driver = new OpenAICompatibleDriver(
      makeProvider({ baseUrl: "https://api.openai.com/v1" }),
    );
    await collect(driver.chat([{ role: "user", content: "x" }], makeConfig()));
    expect(capturedUrl).toBe("https://api.openai.com/v1/chat/completions");
  });

  it("appends /v1/chat/completions when baseUrl does not end with /v1", async () => {
    const driver = new OpenAICompatibleDriver(
      makeProvider({ baseUrl: "https://openrouter.ai/api" }),
    );
    await collect(driver.chat([{ role: "user", content: "x" }], makeConfig()));
    expect(capturedUrl).toBe("https://openrouter.ai/api/v1/chat/completions");
  });

  it("strips trailing slashes before appending", async () => {
    const driver = new OpenAICompatibleDriver(
      makeProvider({ baseUrl: "https://api.openai.com/v1///" }),
    );
    await collect(driver.chat([{ role: "user", content: "x" }], makeConfig()));
    expect(capturedUrl).toBe("https://api.openai.com/v1/chat/completions");
  });
});

// ---------------------------------------------------------------------------
// 4. Reasoning-Only Model Handling
// ---------------------------------------------------------------------------

describe("OpenAICompatibleDriver reasoning-only models", () => {
  let lastRequestBody: Record<string, unknown> | null;

  beforeEach(() => {
    lastRequestBody = null;
    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      lastRequestBody = JSON.parse(init?.body as string);
      return mockSSE([
        'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}',
      ]);
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("uses max_completion_tokens and omits temperature for reasoning-only", async () => {
    const driver = new OpenAICompatibleDriver(makeProvider());
    const config = makeConfig({
      max_tokens: 8192,
      temperature: 0.5,
      capabilities: {
        id: "o3",
        provider: "openai",
        family: "o3",
        context: 128000,
        maxOutput: 16384,
        reasoning: true,
        toolCall: false,
        vision: false,
        inputPrice: 0,
        outputPrice: 0,
      },
    });

    await collect(driver.chat([{ role: "user", content: "think" }], config));

    expect(lastRequestBody!.max_completion_tokens).toBe(8192);
    expect(lastRequestBody!.max_tokens).toBeUndefined();
    expect(lastRequestBody!.temperature).toBeUndefined();
  });

  it("converts system messages to user for reasoning-only models", async () => {
    const driver = new OpenAICompatibleDriver(makeProvider());
    const messages = makeMessages(
      { role: "system", content: "System instructions" },
      { role: "user", content: "Question" },
    );
    const config = makeConfig({
      capabilities: {
        id: "o3",
        provider: "openai",
        family: "o3",
        context: 128000,
        maxOutput: 16384,
        reasoning: true,
        toolCall: false,
        vision: false,
        inputPrice: 0,
        outputPrice: 0,
      },
    });

    await collect(driver.chat(messages, config));

    const sent = lastRequestBody!.messages as Array<Record<string, unknown>>;
    // System message should have been converted to user
    expect(sent[0]!.role).toBe("user");
    expect(sent[0]!.content).toBe("System instructions");
  });

  it("does NOT convert system to user for dual-capability models (reasoning + tools)", async () => {
    const driver = new OpenAICompatibleDriver(makeProvider());
    const messages = makeMessages(
      { role: "system", content: "System prompt" },
      { role: "user", content: "Use tools" },
    );
    const config = makeConfig({
      capabilities: {
        id: "qwen3",
        provider: "openrouter",
        family: "qwen3",
        context: 128000,
        maxOutput: 8192,
        reasoning: true,
        toolCall: true,
        vision: false,
        inputPrice: 0,
        outputPrice: 0,
      },
    });

    await collect(driver.chat(messages, config));

    const sent = lastRequestBody!.messages as Array<Record<string, unknown>>;
    expect(sent[0]!.role).toBe("system");
  });
});

// ---------------------------------------------------------------------------
// 5. Request Headers
// ---------------------------------------------------------------------------

describe("OpenAICompatibleDriver headers", () => {
  let capturedHeaders: Record<string, string>;

  beforeEach(() => {
    capturedHeaders = {};
    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedHeaders = Object.fromEntries(
        Object.entries(init?.headers as Record<string, string> || {}),
      );
      return mockSSE([
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
      ]);
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends Content-Type and Authorization", async () => {
    const driver = new OpenAICompatibleDriver(
      makeProvider({ apiKey: "sk-my-key" }),
    );
    await collect(driver.chat([{ role: "user", content: "x" }], makeConfig()));

    expect(capturedHeaders["Content-Type"]).toBe("application/json");
    expect(capturedHeaders["Authorization"]).toBe("Bearer sk-my-key");
  });

  it("merges custom headers from provider config", async () => {
    const driver = new OpenAICompatibleDriver(
      makeProvider({
        apiKey: "sk-test",
        headers: {
          "HTTP-Referer": "https://jeriko.ai",
          "X-Title": "Jeriko",
        },
      }),
    );
    await collect(driver.chat([{ role: "user", content: "x" }], makeConfig()));

    expect(capturedHeaders["HTTP-Referer"]).toBe("https://jeriko.ai");
    expect(capturedHeaders["X-Title"]).toBe("Jeriko");
    expect(capturedHeaders["Authorization"]).toBe("Bearer sk-test");
  });

  it("resolves env refs in custom headers", async () => {
    const savedEnv = process.env.MY_CUSTOM_HEADER;
    process.env.MY_CUSTOM_HEADER = "resolved-value";
    try {
      const driver = new OpenAICompatibleDriver(
        makeProvider({
          apiKey: "sk-test",
          headers: { "X-Custom": "{env:MY_CUSTOM_HEADER}" },
        }),
      );
      await collect(driver.chat([{ role: "user", content: "x" }], makeConfig()));
      expect(capturedHeaders["X-Custom"]).toBe("resolved-value");
    } finally {
      if (savedEnv === undefined) delete process.env.MY_CUSTOM_HEADER;
      else process.env.MY_CUSTOM_HEADER = savedEnv;
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Error Handling (Driver Level)
// ---------------------------------------------------------------------------

describe("OpenAICompatibleDriver error handling", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("yields error + done on network failure", async () => {
    globalThis.fetch = mock(async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;

    const driver = new OpenAICompatibleDriver(makeProvider());
    const chunks = await collect(
      driver.chat([{ role: "user", content: "x" }], makeConfig()),
    );

    const errors = chunks.filter((c) => c.type === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]!.content).toContain("ECONNREFUSED");
    expect(errors[0]!.content).toContain("Test Provider");
    expect(chunks.at(-1)!.type).toBe("done");
  });

  it("yields error + done on HTTP 401", async () => {
    globalThis.fetch = mock(async () => {
      return new Response("Incorrect API key provided", { status: 401 });
    }) as typeof fetch;

    const driver = new OpenAICompatibleDriver(makeProvider());
    const chunks = await collect(
      driver.chat([{ role: "user", content: "x" }], makeConfig()),
    );

    const errors = chunks.filter((c) => c.type === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]!.content).toContain("401");
    expect(errors[0]!.content).toContain("Incorrect API key");
    expect(chunks.at(-1)!.type).toBe("done");
  });

  it("yields error + done on HTTP 429 rate limit", async () => {
    globalThis.fetch = mock(async () => {
      return new Response(
        JSON.stringify({ error: { message: "Rate limit exceeded" } }),
        { status: 429 },
      );
    }) as typeof fetch;

    const driver = new OpenAICompatibleDriver(makeProvider());
    const chunks = await collect(
      driver.chat([{ role: "user", content: "x" }], makeConfig()),
    );

    const errors = chunks.filter((c) => c.type === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]!.content).toContain("429");
    expect(chunks.at(-1)!.type).toBe("done");
  });

  it("yields error + done when response has no body", async () => {
    globalThis.fetch = mock(async () => {
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    const driver = new OpenAICompatibleDriver(makeProvider());
    const chunks = await collect(
      driver.chat([{ role: "user", content: "x" }], makeConfig()),
    );

    const errors = chunks.filter((c) => c.type === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]!.content).toContain("no body");
    expect(chunks.at(-1)!.type).toBe("done");
  });

  it("resolves env ref for API key at call time", async () => {
    const savedKey = process.env.TEST_AUDIT_KEY;
    process.env.TEST_AUDIT_KEY = "sk-resolved-from-env";

    let capturedAuth = "";
    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      capturedAuth = headers?.["Authorization"] ?? "";
      return mockSSE([
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
      ]);
    }) as typeof fetch;

    try {
      const driver = new OpenAICompatibleDriver(
        makeProvider({ apiKey: "{env:TEST_AUDIT_KEY}" }),
      );
      await collect(driver.chat([{ role: "user", content: "x" }], makeConfig()));
      expect(capturedAuth).toBe("Bearer sk-resolved-from-env");
    } finally {
      if (savedKey === undefined) delete process.env.TEST_AUDIT_KEY;
      else process.env.TEST_AUDIT_KEY = savedKey;
    }
  });
});

// ---------------------------------------------------------------------------
// 7. SSE Split-Boundary Parsing
// ---------------------------------------------------------------------------

describe("parseOpenAIStream split-boundary parsing", () => {
  it("handles data split across multiple small chunks", async () => {
    const body = sseBody([
      'data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}',
      'data: {"choices":[{"delta":{"content":" world"},"finish_reason":null}]}',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
    ]);

    // Deliver in 10-byte chunks to force splits mid-line
    const stream = chunkedStream(body, 10);
    const response = new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });

    const chunks: StreamChunk[] = [];
    for await (const c of parseOpenAIStream({ response })) {
      chunks.push(c);
    }

    const text = chunks.filter((c) => c.type === "text");
    expect(text).toHaveLength(2);
    expect(text[0]!.content).toBe("Hello");
    expect(text[1]!.content).toBe(" world");
    expect(chunks.at(-1)!.type).toBe("done");
  });

  it("handles [DONE] split across chunks", async () => {
    const body = sseBody([
      'data: {"choices":[{"delta":{"content":"x"},"finish_reason":null}]}',
      "data: [DONE]",
    ]);

    // 7-byte chunks will split "data: [DONE]" across reads
    const stream = chunkedStream(body, 7);
    const response = new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });

    const chunks: StreamChunk[] = [];
    for await (const c of parseOpenAIStream({ response })) {
      chunks.push(c);
    }

    expect(chunks.some((c) => c.type === "text")).toBe(true);
    expect(chunks.at(-1)!.type).toBe("done");
  });
});

// ---------------------------------------------------------------------------
// 8. Advanced Tool Call Accumulation
// ---------------------------------------------------------------------------

describe("parseOpenAIStream advanced tool calls", () => {
  it("accumulates arguments across many small chunks", async () => {
    // Simulate arguments arriving in very small fragments
    const response = mockSSE([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_x","function":{"name":"bash","arguments":""}}]},"finish_reason":null}]}',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{"}}]},"finish_reason":null}]}',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"co"}}]},"finish_reason":null}]}',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"mmand"}}]},"finish_reason":null}]}',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\": \\"ls -la\\"}"}}]},"finish_reason":null}]}',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}',
    ]);

    const chunks: StreamChunk[] = [];
    for await (const c of parseOpenAIStream({ response })) {
      chunks.push(c);
    }

    const toolChunks = chunks.filter((c) => c.type === "tool_call");
    expect(toolChunks).toHaveLength(1);
    expect(toolChunks[0]!.tool_call!.arguments).toBe('{"command": "ls -la"}');
  });

  it("handles tool call followed by text (mixed response)", async () => {
    // Some models emit tool_calls with finish_reason=tool_calls, then more content
    // In practice OpenAI doesn't do this, but test the parser handles it.
    const response = mockSSE([
      'data: {"choices":[{"delta":{"content":"Before tool."},"finish_reason":null}]}',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"bash","arguments":"{\\"cmd\\":\\"ls\\"}"}}]},"finish_reason":null}]}',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}',
    ]);

    const chunks: StreamChunk[] = [];
    for await (const c of parseOpenAIStream({ response })) {
      chunks.push(c);
    }

    expect(chunks.filter((c) => c.type === "text")).toHaveLength(1);
    expect(chunks.filter((c) => c.type === "tool_call")).toHaveLength(1);
  });

  it("updates tool call id if provided in later chunk", async () => {
    const response = mockSSE([
      // First chunk: no id
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"read","arguments":"{"}}]},"finish_reason":null}]}',
      // Second chunk: id arrives
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_late","function":{"arguments":"\\"path\\": \\"/tmp\\"}"}}]},"finish_reason":null}]}',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}',
    ]);

    const chunks: StreamChunk[] = [];
    for await (const c of parseOpenAIStream({ response })) {
      chunks.push(c);
    }

    const tc = chunks.filter((c) => c.type === "tool_call");
    expect(tc).toHaveLength(1);
    expect(tc[0]!.tool_call!.id).toBe("call_late");
    expect(tc[0]!.tool_call!.arguments).toBe('{"path": "/tmp"}');
  });

  it("handles 3 parallel tool calls with interleaved chunks", async () => {
    const response = mockSSE([
      // All three start
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c0","function":{"name":"bash","arguments":""}},{"index":1,"id":"c1","function":{"name":"read","arguments":""}},{"index":2,"id":"c2","function":{"name":"write","arguments":""}}]},"finish_reason":null}]}',
      // Arguments arrive interleaved
      'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"function":{"arguments":"{\\"p\\":\\"/a\\"}"}}]},"finish_reason":null}]}',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"c\\":\\"ls\\"}"}}]},"finish_reason":null}]}',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":2,"function":{"arguments":"{\\"f\\":\\"/b\\"}"}}]},"finish_reason":null}]}',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}',
    ]);

    const chunks: StreamChunk[] = [];
    for await (const c of parseOpenAIStream({ response })) {
      chunks.push(c);
    }

    const tcs = chunks.filter((c) => c.type === "tool_call");
    expect(tcs).toHaveLength(3);

    const names = tcs.map((c) => c.tool_call!.name);
    expect(names).toContain("bash");
    expect(names).toContain("read");
    expect(names).toContain("write");
  });
});

// ---------------------------------------------------------------------------
// 9. Full Chat Flow (end-to-end with mocked fetch)
// ---------------------------------------------------------------------------

describe("OpenAICompatibleDriver full chat flow", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends correct request body shape", async () => {
    let capturedBody: Record<string, unknown> = {};

    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      return mockSSE([
        'data: {"choices":[{"delta":{"content":"response"},"finish_reason":null}]}',
        "data: [DONE]",
      ]);
    }) as typeof fetch;

    const driver = new OpenAICompatibleDriver(makeProvider());
    const tools: DriverTool[] = [{
      name: "bash",
      description: "Run command",
      parameters: { type: "object", properties: {} },
    }];

    const chunks = await collect(
      driver.chat(
        [{ role: "user", content: "hello" }],
        makeConfig({ model: "gpt-4o", max_tokens: 2048, temperature: 0.3, tools }),
      ),
    );

    // Verify request body
    expect(capturedBody.model).toBe("gpt-4o");
    expect(capturedBody.stream).toBe(true);
    expect(capturedBody.stream_options).toEqual({ include_usage: true });
    expect(capturedBody.max_tokens).toBe(2048);
    expect(capturedBody.temperature).toBe(0.3);
    expect(capturedBody.tool_choice).toBe("auto");
    expect((capturedBody.tools as unknown[]).length).toBe(1);

    // Verify response
    const text = chunks.filter((c) => c.type === "text");
    expect(text).toHaveLength(1);
    expect(text[0]!.content).toBe("response");
    expect(chunks.at(-1)!.type).toBe("done");
  });

  it("streams a multi-turn tool use conversation", async () => {
    globalThis.fetch = mock(async () => {
      return mockSSE([
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"bash","arguments":"{\\"command\\":\\"pwd\\"}"}}]},"finish_reason":null}]}',
        'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}',
      ]);
    }) as typeof fetch;

    const driver = new OpenAICompatibleDriver(makeProvider());
    const chunks = await collect(
      driver.chat(
        [{ role: "user", content: "where am I?" }],
        makeConfig({
          tools: [{
            name: "bash",
            description: "Run shell",
            parameters: { type: "object", properties: { command: { type: "string" } } },
          }],
        }),
      ),
    );

    const toolCalls = chunks.filter((c) => c.type === "tool_call");
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]!.tool_call!.name).toBe("bash");
    expect(JSON.parse(toolCalls[0]!.tool_call!.arguments)).toEqual({ command: "pwd" });
  });
});

// ---------------------------------------------------------------------------
// 10. OpenAIDriver Lazy Delegation
// ---------------------------------------------------------------------------

describe("OpenAIDriver", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("reads OPENAI_API_KEY and OPENAI_BASE_URL from environment", async () => {
    const savedKey = process.env.OPENAI_API_KEY;
    const savedUrl = process.env.OPENAI_BASE_URL;

    process.env.OPENAI_API_KEY = "sk-audit-test-key";
    delete process.env.OPENAI_BASE_URL;

    let capturedUrl = "";
    let capturedAuth = "";

    globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
      capturedAuth = (init?.headers as Record<string, string>)?.["Authorization"] ?? "";
      return mockSSE([
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
      ]);
    }) as typeof fetch;

    try {
      // Import fresh to get a new instance
      const { OpenAIDriver } = await import(
        "../../src/daemon/agent/drivers/openai.js"
      );
      const driver = new OpenAIDriver();
      await collect(driver.chat([{ role: "user", content: "x" }], makeConfig()));

      expect(capturedUrl).toBe("https://api.openai.com/v1/chat/completions");
      expect(capturedAuth).toBe("Bearer sk-audit-test-key");
    } finally {
      if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = savedKey;
      if (savedUrl === undefined) delete process.env.OPENAI_BASE_URL;
      else process.env.OPENAI_BASE_URL = savedUrl;
    }
  });
});
