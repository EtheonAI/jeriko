import { describe, expect, it, beforeEach, afterEach, mock } from "bun:test";
import { LocalDriver } from "../../src/daemon/agent/drivers/local.js";
import type {
  StreamChunk,
  DriverConfig,
  DriverMessage,
} from "../../src/daemon/agent/drivers/index.js";

// ─── Test helpers ───────────────────────────────────────────────────────────

/** Collect all chunks from an async generator. */
async function collectChunks(
  gen: AsyncGenerator<StreamChunk>,
): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const chunk of gen) {
    chunks.push(chunk);
  }
  return chunks;
}

/** Create a mock SSE Response from lines. */
function mockSSEResponse(lines: string[]): Response {
  const body = lines.join("\n") + "\n";
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

/** Minimal DriverConfig for tests. */
function baseConfig(overrides: Partial<DriverConfig> = {}): DriverConfig {
  return {
    model: "llama3",
    max_tokens: 4096,
    temperature: 0.7,
    ...overrides,
  };
}

/** Simple user message. */
function userMessages(content = "Hello"): DriverMessage[] {
  return [{ role: "user", content }];
}

/** Ollama /api/tags success response body. */
function tagsResponseBody(models: string[] = ["llama3:latest"]) {
  return JSON.stringify({
    models: models.map((name) => ({
      name,
      size: 4_000_000_000,
      details: { family: "llama", parameter_size: "8B", quantization_level: "Q4_K_M" },
    })),
  });
}

// ─── Fetch mock infrastructure ──────────────────────────────────────────────

let originalFetch: typeof globalThis.fetch;
let fetchMock: ReturnType<typeof mock>;

/**
 * Install a mock fetch that routes by URL pattern.
 * Each handler is (url, init) => Response | null.
 * Returns the first non-null response; falls through to a 500 error.
 */
type FetchHandler = (
  url: string,
  init?: RequestInit,
) => Response | Promise<Response> | null;

let fetchHandlers: FetchHandler[] = [];

function installFetchMock() {
  originalFetch = globalThis.fetch;
  fetchMock = mock((url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    for (const handler of fetchHandlers) {
      const result = handler(urlStr, init);
      if (result) return result instanceof Promise ? result : Promise.resolve(result);
    }
    return Promise.resolve(new Response("Unhandled mock URL", { status: 500 }));
  });
  globalThis.fetch = fetchMock as typeof fetch;
}

function restoreFetchMock() {
  globalThis.fetch = originalFetch;
  fetchHandlers = [];
}

function addFetchHandler(handler: FetchHandler) {
  fetchHandlers.push(handler);
}

// ─── Env var helpers ────────────────────────────────────────────────────────

const envBackup: Record<string, string | undefined> = {};

function setEnv(key: string, value: string | undefined) {
  if (!(key in envBackup)) envBackup[key] = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function restoreEnv() {
  for (const [key, value] of Object.entries(envBackup)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  for (const key of Object.keys(envBackup)) delete envBackup[key];
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Ollama LocalDriver", () => {
  beforeEach(() => {
    installFetchMock();
    // Clear env vars that affect URL resolution
    setEnv("LOCAL_MODEL_URL", undefined);
    setEnv("OLLAMA_BASE_URL", undefined);
  });

  afterEach(() => {
    restoreFetchMock();
    restoreEnv();
  });

  // ── Construction ────────────────────────────────────────────────────────

  describe("construction", () => {
    it("has name 'local'", () => {
      const driver = new LocalDriver();
      expect(driver.name).toBe("local");
    });
  });

  // ── URL resolution ──────────────────────────────────────────────────────

  describe("URL resolution", () => {
    it("uses default localhost:11434", async () => {
      const driver = new LocalDriver();

      // Health check handler — captures the URL
      let healthUrl = "";
      addFetchHandler((url) => {
        if (url.includes("/api/tags")) {
          healthUrl = url;
          return new Response(tagsResponseBody(), { status: 200 });
        }
        return null;
      });
      addFetchHandler((url) => {
        if (url.includes("/v1/chat/completions")) {
          return mockSSEResponse([
            'data: {"choices":[{"delta":{"content":"hi"},"finish_reason":null}]}',
            'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
          ]);
        }
        return null;
      });

      await collectChunks(driver.chat(userMessages(), baseConfig()));
      expect(healthUrl).toBe("http://localhost:11434/api/tags");
    });

    it("uses OLLAMA_BASE_URL when set", async () => {
      setEnv("OLLAMA_BASE_URL", "http://192.168.1.50:11434");
      const driver = new LocalDriver();

      let healthUrl = "";
      let chatUrl = "";
      addFetchHandler((url) => {
        if (url.includes("/api/tags")) {
          healthUrl = url;
          return new Response(tagsResponseBody(), { status: 200 });
        }
        return null;
      });
      addFetchHandler((url) => {
        if (url.includes("/v1/chat/completions")) {
          chatUrl = url;
          return mockSSEResponse([
            'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
          ]);
        }
        return null;
      });

      await collectChunks(driver.chat(userMessages(), baseConfig()));
      expect(healthUrl).toBe("http://192.168.1.50:11434/api/tags");
      expect(chatUrl).toBe("http://192.168.1.50:11434/v1/chat/completions");
    });

    it("uses LOCAL_MODEL_URL and strips /v1 suffix", async () => {
      setEnv("LOCAL_MODEL_URL", "http://gpu-server:8080/v1");
      const driver = new LocalDriver();

      let healthUrl = "";
      let chatUrl = "";
      addFetchHandler((url) => {
        if (url.includes("/api/tags")) {
          healthUrl = url;
          return new Response(tagsResponseBody(), { status: 200 });
        }
        return null;
      });
      addFetchHandler((url) => {
        if (url.includes("/v1/chat/completions")) {
          chatUrl = url;
          return mockSSEResponse([
            'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
          ]);
        }
        return null;
      });

      await collectChunks(driver.chat(userMessages(), baseConfig()));
      expect(healthUrl).toBe("http://gpu-server:8080/api/tags");
      expect(chatUrl).toBe("http://gpu-server:8080/v1/chat/completions");
    });

    it("LOCAL_MODEL_URL takes priority over OLLAMA_BASE_URL", async () => {
      setEnv("LOCAL_MODEL_URL", "http://priority:9999/v1");
      setEnv("OLLAMA_BASE_URL", "http://ignored:11434");
      const driver = new LocalDriver();

      let healthUrl = "";
      addFetchHandler((url) => {
        if (url.includes("/api/tags")) {
          healthUrl = url;
          return new Response(tagsResponseBody(), { status: 200 });
        }
        return null;
      });
      addFetchHandler((url) => {
        if (url.includes("/v1/chat/completions")) {
          return mockSSEResponse([
            'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
          ]);
        }
        return null;
      });

      await collectChunks(driver.chat(userMessages(), baseConfig()));
      expect(healthUrl).toBe("http://priority:9999/api/tags");
    });
  });

  // ── Health check ────────────────────────────────────────────────────────

  describe("health check", () => {
    it("yields error when Ollama is unreachable (connection refused)", async () => {
      const driver = new LocalDriver();

      addFetchHandler((url) => {
        if (url.includes("/api/tags")) {
          throw new Error("fetch failed: Connection refused");
        }
        return null;
      });

      const chunks = await collectChunks(driver.chat(userMessages(), baseConfig()));
      const errors = chunks.filter((c) => c.type === "error");
      expect(errors).toHaveLength(1);
      expect(errors[0]!.content).toContain("Ollama not reachable");
      expect(errors[0]!.content).toContain("Connection refused");
      expect(chunks.some((c) => c.type === "done")).toBe(true);
    });

    it("yields error when health check returns non-200", async () => {
      const driver = new LocalDriver();

      addFetchHandler((url) => {
        if (url.includes("/api/tags")) {
          return new Response("Service Unavailable", { status: 503 });
        }
        return null;
      });

      const chunks = await collectChunks(driver.chat(userMessages(), baseConfig()));
      const errors = chunks.filter((c) => c.type === "error");
      expect(errors).toHaveLength(1);
      expect(errors[0]!.content).toContain("HTTP 503");
      expect(chunks.some((c) => c.type === "done")).toBe(true);
    });
  });

  // ── Chat request format ─────────────────────────────────────────────────

  describe("chat request format", () => {
    it("sends correct request body with Ollama options format", async () => {
      const driver = new LocalDriver();
      let capturedBody: Record<string, unknown> | null = null;

      addFetchHandler((url) => {
        if (url.includes("/api/tags")) {
          return new Response(tagsResponseBody(), { status: 200 });
        }
        return null;
      });
      addFetchHandler((url, init) => {
        if (url.includes("/v1/chat/completions")) {
          capturedBody = JSON.parse(init?.body as string);
          return mockSSEResponse([
            'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
          ]);
        }
        return null;
      });

      await collectChunks(
        driver.chat(userMessages("test prompt"), baseConfig({
          model: "llama3:8b",
          temperature: 0.5,
          max_tokens: 2048,
        })),
      );

      expect(capturedBody).not.toBeNull();
      expect(capturedBody!.model).toBe("llama3:8b");
      expect(capturedBody!.stream).toBe(true);
      expect(capturedBody!.messages).toEqual([
        { role: "user", content: "test prompt" },
      ]);

      const options = capturedBody!.options as Record<string, unknown>;
      expect(options.temperature).toBe(0.5);
      expect(options.num_predict).toBe(2048);

      // No max_tokens at top level (that's OpenAI format, not Ollama)
      expect(capturedBody!.max_tokens).toBeUndefined();
    });

    it("does not include tools when none are provided", async () => {
      const driver = new LocalDriver();
      let capturedBody: Record<string, unknown> | null = null;

      addFetchHandler((url) => {
        if (url.includes("/api/tags")) {
          return new Response(tagsResponseBody(), { status: 200 });
        }
        return null;
      });
      addFetchHandler((url, init) => {
        if (url.includes("/v1/chat/completions")) {
          capturedBody = JSON.parse(init?.body as string);
          return mockSSEResponse([
            'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
          ]);
        }
        return null;
      });

      await collectChunks(driver.chat(userMessages(), baseConfig()));
      expect(capturedBody!.tools).toBeUndefined();
    });

    it("includes tools in OpenAI function calling format", async () => {
      const driver = new LocalDriver();
      let capturedBody: Record<string, unknown> | null = null;

      addFetchHandler((url) => {
        if (url.includes("/api/tags")) {
          return new Response(tagsResponseBody(), { status: 200 });
        }
        return null;
      });
      addFetchHandler((url, init) => {
        if (url.includes("/v1/chat/completions")) {
          capturedBody = JSON.parse(init?.body as string);
          return mockSSEResponse([
            'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
          ]);
        }
        return null;
      });

      await collectChunks(
        driver.chat(userMessages(), baseConfig({
          tools: [
            {
              name: "get_weather",
              description: "Get weather for a location",
              parameters: {
                type: "object",
                properties: { location: { type: "string" } },
                required: ["location"],
              },
            },
          ],
        })),
      );

      expect(capturedBody!.tools).toEqual([
        {
          type: "function",
          function: {
            name: "get_weather",
            description: "Get weather for a location",
            parameters: {
              type: "object",
              properties: { location: { type: "string" } },
              required: ["location"],
            },
          },
        },
      ]);
    });
  });

  // ── System prompt injection ─────────────────────────────────────────────

  describe("system prompt injection", () => {
    it("prepends system message when system_prompt is set", async () => {
      const driver = new LocalDriver();
      let capturedBody: Record<string, unknown> | null = null;

      addFetchHandler((url) => {
        if (url.includes("/api/tags")) {
          return new Response(tagsResponseBody(), { status: 200 });
        }
        return null;
      });
      addFetchHandler((url, init) => {
        if (url.includes("/v1/chat/completions")) {
          capturedBody = JSON.parse(init?.body as string);
          return mockSSEResponse([
            'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
          ]);
        }
        return null;
      });

      await collectChunks(
        driver.chat(userMessages(), baseConfig({ system_prompt: "You are helpful." })),
      );

      const messages = capturedBody!.messages as Array<{ role: string; content: string }>;
      expect(messages).toHaveLength(2);
      expect(messages[0]!.role).toBe("system");
      expect(messages[0]!.content).toBe("You are helpful.");
      expect(messages[1]!.role).toBe("user");
    });

    it("does not duplicate system message if already present", async () => {
      const driver = new LocalDriver();
      let capturedBody: Record<string, unknown> | null = null;

      addFetchHandler((url) => {
        if (url.includes("/api/tags")) {
          return new Response(tagsResponseBody(), { status: 200 });
        }
        return null;
      });
      addFetchHandler((url, init) => {
        if (url.includes("/v1/chat/completions")) {
          capturedBody = JSON.parse(init?.body as string);
          return mockSSEResponse([
            'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
          ]);
        }
        return null;
      });

      const msgs: DriverMessage[] = [
        { role: "system", content: "Existing system prompt" },
        { role: "user", content: "Hello" },
      ];

      await collectChunks(
        driver.chat(msgs, baseConfig({ system_prompt: "You are helpful." })),
      );

      const messages = capturedBody!.messages as Array<{ role: string; content: string }>;
      const systemMsgs = messages.filter((m) => m.role === "system");
      expect(systemMsgs).toHaveLength(1);
      expect(systemMsgs[0]!.content).toBe("Existing system prompt");
    });
  });

  // ── Message conversion ──────────────────────────────────────────────────

  describe("message conversion", () => {
    it("converts tool calls in assistant messages", async () => {
      const driver = new LocalDriver();
      let capturedBody: Record<string, unknown> | null = null;

      addFetchHandler((url) => {
        if (url.includes("/api/tags")) {
          return new Response(tagsResponseBody(), { status: 200 });
        }
        return null;
      });
      addFetchHandler((url, init) => {
        if (url.includes("/v1/chat/completions")) {
          capturedBody = JSON.parse(init?.body as string);
          return mockSSEResponse([
            'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
          ]);
        }
        return null;
      });

      const msgs: DriverMessage[] = [
        { role: "user", content: "What's the weather?" },
        {
          role: "assistant",
          content: "",
          tool_calls: [
            { id: "call_1", name: "get_weather", arguments: '{"location":"NYC"}' },
          ],
        },
        {
          role: "tool",
          content: '{"temp": 72}',
          tool_call_id: "call_1",
        },
      ];

      await collectChunks(driver.chat(msgs, baseConfig()));

      const messages = capturedBody!.messages as Array<Record<string, unknown>>;
      expect(messages).toHaveLength(3);

      // Assistant message with tool calls
      const assistantMsg = messages[1]!;
      expect(assistantMsg.tool_calls).toEqual([
        {
          id: "call_1",
          type: "function",
          function: { name: "get_weather", arguments: '{"location":"NYC"}' },
        },
      ]);

      // Tool result message
      const toolMsg = messages[2]!;
      expect(toolMsg.role).toBe("tool");
      expect(toolMsg.content).toBe('{"temp": 72}');
      expect(toolMsg.tool_call_id).toBe("call_1");
    });
  });

  // ── Stream response parsing ─────────────────────────────────────────────

  describe("stream response parsing", () => {
    it("yields text chunks from streaming response", async () => {
      const driver = new LocalDriver();

      addFetchHandler((url) => {
        if (url.includes("/api/tags")) {
          return new Response(tagsResponseBody(), { status: 200 });
        }
        return null;
      });
      addFetchHandler((url) => {
        if (url.includes("/v1/chat/completions")) {
          return mockSSEResponse([
            'data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}',
            'data: {"choices":[{"delta":{"content":" there"},"finish_reason":null}]}',
            'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
          ]);
        }
        return null;
      });

      const chunks = await collectChunks(driver.chat(userMessages(), baseConfig()));
      const textChunks = chunks.filter((c) => c.type === "text");
      expect(textChunks).toHaveLength(2);
      expect(textChunks[0]!.content).toBe("Hello");
      expect(textChunks[1]!.content).toBe(" there");
      expect(chunks.some((c) => c.type === "done")).toBe(true);
    });

    it("handles [DONE] sentinel", async () => {
      const driver = new LocalDriver();

      addFetchHandler((url) => {
        if (url.includes("/api/tags")) {
          return new Response(tagsResponseBody(), { status: 200 });
        }
        return null;
      });
      addFetchHandler((url) => {
        if (url.includes("/v1/chat/completions")) {
          return mockSSEResponse([
            'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":null}]}',
            "data: [DONE]",
          ]);
        }
        return null;
      });

      const chunks = await collectChunks(driver.chat(userMessages(), baseConfig()));
      expect(chunks.filter((c) => c.type === "text")).toHaveLength(1);
      expect(chunks.filter((c) => c.type === "done")).toHaveLength(1);
    });

    it("handles stream ending without [DONE] or finish_reason (OSS model edge case)", async () => {
      const driver = new LocalDriver();

      addFetchHandler((url) => {
        if (url.includes("/api/tags")) {
          return new Response(tagsResponseBody(), { status: 200 });
        }
        return null;
      });
      addFetchHandler((url) => {
        if (url.includes("/v1/chat/completions")) {
          return mockSSEResponse([
            'data: {"choices":[{"delta":{"content":"partial"},"finish_reason":null}]}',
            // Stream ends abruptly — no [DONE], no finish_reason
          ]);
        }
        return null;
      });

      const chunks = await collectChunks(driver.chat(userMessages(), baseConfig()));
      expect(chunks.filter((c) => c.type === "text")).toHaveLength(1);
      // The shared parser emits a done on stream end
      expect(chunks.filter((c) => c.type === "done")).toHaveLength(1);
    });

    it("accumulates and yields tool calls from streaming response", async () => {
      const driver = new LocalDriver();

      addFetchHandler((url) => {
        if (url.includes("/api/tags")) {
          return new Response(tagsResponseBody(), { status: 200 });
        }
        return null;
      });
      addFetchHandler((url) => {
        if (url.includes("/v1/chat/completions")) {
          return mockSSEResponse([
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_abc","type":"function","function":{"name":"get_weather","arguments":""}}]},"finish_reason":null}]}',
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"loc"}}]},"finish_reason":null}]}',
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"ation\\":\\"NYC\\"}"}}]},"finish_reason":null}]}',
            'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}',
          ]);
        }
        return null;
      });

      const chunks = await collectChunks(driver.chat(userMessages(), baseConfig()));
      const toolChunks = chunks.filter((c) => c.type === "tool_call");
      expect(toolChunks).toHaveLength(1);
      expect(toolChunks[0]!.tool_call).toEqual({
        id: "call_abc",
        name: "get_weather",
        arguments: '{"location":"NYC"}',
      });
    });
  });

  // ── Error handling ──────────────────────────────────────────────────────

  describe("error handling", () => {
    it("handles chat request fetch failure (after health check passes)", async () => {
      const driver = new LocalDriver();

      addFetchHandler((url) => {
        if (url.includes("/api/tags")) {
          return new Response(tagsResponseBody(), { status: 200 });
        }
        return null;
      });
      addFetchHandler((url) => {
        if (url.includes("/v1/chat/completions")) {
          throw new Error("Connection reset by peer");
        }
        return null;
      });

      const chunks = await collectChunks(driver.chat(userMessages(), baseConfig()));
      const errors = chunks.filter((c) => c.type === "error");
      expect(errors).toHaveLength(1);
      expect(errors[0]!.content).toContain("Ollama request failed");
      expect(errors[0]!.content).toContain("Connection reset by peer");
      expect(chunks.some((c) => c.type === "done")).toBe(true);
    });

    it("handles model not found (404 from chat endpoint)", async () => {
      const driver = new LocalDriver();

      addFetchHandler((url) => {
        if (url.includes("/api/tags")) {
          return new Response(tagsResponseBody(), { status: 200 });
        }
        return null;
      });
      addFetchHandler((url) => {
        if (url.includes("/v1/chat/completions")) {
          return new Response(
            JSON.stringify({ error: { message: "model 'nonexistent' not found" } }),
            { status: 404 },
          );
        }
        return null;
      });

      const chunks = await collectChunks(
        driver.chat(userMessages(), baseConfig({ model: "nonexistent" })),
      );
      const errors = chunks.filter((c) => c.type === "error");
      expect(errors).toHaveLength(1);
      expect(errors[0]!.content).toContain("Ollama API error 404");
      expect(errors[0]!.content).toContain("not found");
      expect(chunks.some((c) => c.type === "done")).toBe(true);
    });

    it("handles no response body", async () => {
      const driver = new LocalDriver();

      addFetchHandler((url) => {
        if (url.includes("/api/tags")) {
          return new Response(tagsResponseBody(), { status: 200 });
        }
        return null;
      });
      addFetchHandler((url) => {
        if (url.includes("/v1/chat/completions")) {
          // Create a Response with null body
          return new Response(null, { status: 200 });
        }
        return null;
      });

      const chunks = await collectChunks(driver.chat(userMessages(), baseConfig()));
      // Either the driver catches no body, or the shared parser handles it
      // The important thing is we get an error + done, not a crash
      const hasError = chunks.some((c) => c.type === "error");
      const hasDone = chunks.some((c) => c.type === "done");
      expect(hasError || hasDone).toBe(true);
    });

    it("handles chat response with 500 error", async () => {
      const driver = new LocalDriver();

      addFetchHandler((url) => {
        if (url.includes("/api/tags")) {
          return new Response(tagsResponseBody(), { status: 200 });
        }
        return null;
      });
      addFetchHandler((url) => {
        if (url.includes("/v1/chat/completions")) {
          return new Response("Internal Server Error", { status: 500 });
        }
        return null;
      });

      const chunks = await collectChunks(driver.chat(userMessages(), baseConfig()));
      const errors = chunks.filter((c) => c.type === "error");
      expect(errors).toHaveLength(1);
      expect(errors[0]!.content).toContain("Ollama API error 500");
      expect(chunks.some((c) => c.type === "done")).toBe(true);
    });
  });

  // ── No auth header ──────────────────────────────────────────────────────

  describe("authentication", () => {
    it("does not send an Authorization header (Ollama is local)", async () => {
      const driver = new LocalDriver();
      let capturedHeaders: Record<string, string> | null = null;

      addFetchHandler((url) => {
        if (url.includes("/api/tags")) {
          return new Response(tagsResponseBody(), { status: 200 });
        }
        return null;
      });
      addFetchHandler((url, init) => {
        if (url.includes("/v1/chat/completions")) {
          capturedHeaders = Object.fromEntries(
            new Headers(init?.headers as HeadersInit).entries(),
          );
          return mockSSEResponse([
            'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
          ]);
        }
        return null;
      });

      await collectChunks(driver.chat(userMessages(), baseConfig()));
      expect(capturedHeaders).not.toBeNull();
      expect(capturedHeaders!["authorization"]).toBeUndefined();
      expect(capturedHeaders!["content-type"]).toBe("application/json");
    });
  });

  // ── POST method ─────────────────────────────────────────────────────────

  describe("HTTP method", () => {
    it("uses POST for chat completions", async () => {
      const driver = new LocalDriver();
      let capturedMethod = "";

      addFetchHandler((url) => {
        if (url.includes("/api/tags")) {
          return new Response(tagsResponseBody(), { status: 200 });
        }
        return null;
      });
      addFetchHandler((url, init) => {
        if (url.includes("/v1/chat/completions")) {
          capturedMethod = init?.method ?? "";
          return mockSSEResponse([
            'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
          ]);
        }
        return null;
      });

      await collectChunks(driver.chat(userMessages(), baseConfig()));
      expect(capturedMethod).toBe("POST");
    });
  });

  // ── Multiple tool calls ─────────────────────────────────────────────────

  describe("multiple concurrent tool calls", () => {
    it("accumulates multiple tool calls by index", async () => {
      const driver = new LocalDriver();

      addFetchHandler((url) => {
        if (url.includes("/api/tags")) {
          return new Response(tagsResponseBody(), { status: 200 });
        }
        return null;
      });
      addFetchHandler((url) => {
        if (url.includes("/v1/chat/completions")) {
          return mockSSEResponse([
            // Two tool calls started simultaneously
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"get_weather","arguments":""}},{"index":1,"id":"call_2","type":"function","function":{"name":"get_time","arguments":""}}]},"finish_reason":null}]}',
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"city\\":\\"NYC\\"}"}},{"index":1,"function":{"arguments":"{\\"tz\\":\\"EST\\"}"}}]},"finish_reason":null}]}',
            'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}',
          ]);
        }
        return null;
      });

      const chunks = await collectChunks(driver.chat(userMessages(), baseConfig()));
      const toolChunks = chunks.filter((c) => c.type === "tool_call");
      expect(toolChunks).toHaveLength(2);
      expect(toolChunks[0]!.tool_call!.name).toBe("get_weather");
      expect(toolChunks[0]!.tool_call!.arguments).toBe('{"city":"NYC"}');
      expect(toolChunks[1]!.tool_call!.name).toBe("get_time");
      expect(toolChunks[1]!.tool_call!.arguments).toBe('{"tz":"EST"}');
    });
  });

  // ── Tool calls flushed on abrupt stream end ─────────────────────────────

  describe("tool call flush on stream end", () => {
    it("flushes tool calls when stream ends without finish_reason", async () => {
      const driver = new LocalDriver();

      addFetchHandler((url) => {
        if (url.includes("/api/tags")) {
          return new Response(tagsResponseBody(), { status: 200 });
        }
        return null;
      });
      addFetchHandler((url) => {
        if (url.includes("/v1/chat/completions")) {
          return mockSSEResponse([
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_x","type":"function","function":{"name":"do_thing","arguments":"{\\"a\\":1}"}}]},"finish_reason":null}]}',
            // Stream ends — no finish_reason=tool_calls, no [DONE]
          ]);
        }
        return null;
      });

      const chunks = await collectChunks(driver.chat(userMessages(), baseConfig()));
      const toolChunks = chunks.filter((c) => c.type === "tool_call");
      expect(toolChunks).toHaveLength(1);
      expect(toolChunks[0]!.tool_call!.name).toBe("do_thing");
      expect(chunks.some((c) => c.type === "done")).toBe(true);
    });
  });
});
