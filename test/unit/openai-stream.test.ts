import { describe, expect, it } from "bun:test";
import { parseOpenAIStream } from "../../src/daemon/agent/drivers/openai-stream.js";
import type { StreamChunk } from "../../src/daemon/agent/drivers/index.js";

// ─── Test helpers ───────────────────────────────────────────────────────────

/**
 * Create a mock Response from SSE lines.
 * Each element in `lines` becomes a line in the SSE stream (auto-prefixed with \n).
 */
function mockSSEResponse(lines: string[]): Response {
  const body = lines.join("\n") + "\n";
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

/** Collect all chunks from the async generator. */
async function collectChunks(response: Response, signal?: AbortSignal): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const chunk of parseOpenAIStream({ response, signal })) {
    chunks.push(chunk);
  }
  return chunks;
}

// ─── Basic text streaming ───────────────────────────────────────────────────

describe("parseOpenAIStream", () => {
  it("yields text chunks from content deltas", async () => {
    const response = mockSSEResponse([
      'data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}',
      'data: {"choices":[{"delta":{"content":" world"},"finish_reason":null}]}',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
    ]);

    const chunks = await collectChunks(response);

    const textChunks = chunks.filter((c) => c.type === "text");
    expect(textChunks).toHaveLength(2);
    expect(textChunks[0]!.content).toBe("Hello");
    expect(textChunks[1]!.content).toBe(" world");

    const doneChunks = chunks.filter((c) => c.type === "done");
    expect(doneChunks).toHaveLength(1);
  });

  it("handles [DONE] sentinel", async () => {
    const response = mockSSEResponse([
      'data: {"choices":[{"delta":{"content":"Hi"},"finish_reason":null}]}',
      "data: [DONE]",
    ]);

    const chunks = await collectChunks(response);

    expect(chunks.filter((c) => c.type === "text")).toHaveLength(1);
    expect(chunks.filter((c) => c.type === "done")).toHaveLength(1);
  });

  it("handles finish_reason=length", async () => {
    const response = mockSSEResponse([
      'data: {"choices":[{"delta":{"content":"truncated"},"finish_reason":null}]}',
      'data: {"choices":[{"delta":{},"finish_reason":"length"}]}',
    ]);

    const chunks = await collectChunks(response);
    expect(chunks.some((c) => c.type === "done")).toBe(true);
  });

  it("skips non-data lines", async () => {
    const response = mockSSEResponse([
      ": this is a comment",
      "event: message",
      'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":null}]}',
      "",
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
    ]);

    const chunks = await collectChunks(response);
    const textChunks = chunks.filter((c) => c.type === "text");
    expect(textChunks).toHaveLength(1);
    expect(textChunks[0]!.content).toBe("ok");
  });

  it("skips malformed JSON lines", async () => {
    const response = mockSSEResponse([
      "data: {invalid json}",
      'data: {"choices":[{"delta":{"content":"valid"},"finish_reason":null}]}',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
    ]);

    const chunks = await collectChunks(response);
    const textChunks = chunks.filter((c) => c.type === "text");
    expect(textChunks).toHaveLength(1);
    expect(textChunks[0]!.content).toBe("valid");
  });

  it("handles empty choices array", async () => {
    const response = mockSSEResponse([
      'data: {"choices":[]}',
      'data: {"choices":[{"delta":{"content":"after"},"finish_reason":null}]}',
      "data: [DONE]",
    ]);

    const chunks = await collectChunks(response);
    const textChunks = chunks.filter((c) => c.type === "text");
    expect(textChunks).toHaveLength(1);
  });
});

// ─── Tool call accumulation ─────────────────────────────────────────────────

describe("parseOpenAIStream tool calls", () => {
  it("accumulates partial tool calls and yields on finish_reason=tool_calls", async () => {
    const response = mockSSEResponse([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"bash","arguments":""}}]},"finish_reason":null}]}',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"command\\""}}]},"finish_reason":null}]}',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":": \\"ls\\"}"}}]},"finish_reason":null}]}',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}',
    ]);

    const chunks = await collectChunks(response);
    const toolChunks = chunks.filter((c) => c.type === "tool_call");
    expect(toolChunks).toHaveLength(1);

    const tc = toolChunks[0]!.tool_call!;
    expect(tc.id).toBe("call_1");
    expect(tc.name).toBe("bash");
    expect(tc.arguments).toBe('{"command": "ls"}');
  });

  it("handles multiple concurrent tool calls", async () => {
    const response = mockSSEResponse([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"read","arguments":"{\\"path\\": \\"/tmp/a\\"}"}}]},"finish_reason":null}]}',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"id":"call_2","function":{"name":"read","arguments":"{\\"path\\": \\"/tmp/b\\"}"}}]},"finish_reason":null}]}',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}',
    ]);

    const chunks = await collectChunks(response);
    const toolChunks = chunks.filter((c) => c.type === "tool_call");
    expect(toolChunks).toHaveLength(2);
    expect(toolChunks[0]!.tool_call!.id).toBe("call_1");
    expect(toolChunks[1]!.tool_call!.id).toBe("call_2");
  });

  it("flushes tool calls on [DONE] if finish_reason was not sent", async () => {
    const response = mockSSEResponse([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"bash","arguments":"{\\"command\\": \\"pwd\\"}"}}]},"finish_reason":null}]}',
      "data: [DONE]",
    ]);

    const chunks = await collectChunks(response);
    const toolChunks = chunks.filter((c) => c.type === "tool_call");
    expect(toolChunks).toHaveLength(1);
    expect(toolChunks[0]!.tool_call!.name).toBe("bash");
  });

  it("flushes remaining tool calls on stream end without [DONE]", async () => {
    // Some providers just end the stream without [DONE] or finish_reason
    const response = mockSSEResponse([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"write","arguments":"{\\"path\\": \\"/tmp/x\\"}"}}]},"finish_reason":null}]}',
    ]);

    const chunks = await collectChunks(response);
    const toolChunks = chunks.filter((c) => c.type === "tool_call");
    expect(toolChunks).toHaveLength(1);
    expect(toolChunks[0]!.tool_call!.name).toBe("write");
  });

  it("skips tool calls without a name during flush", async () => {
    const response = mockSSEResponse([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"arguments":"partial"}}]},"finish_reason":null}]}',
    ]);

    const chunks = await collectChunks(response);
    const toolChunks = chunks.filter((c) => c.type === "tool_call");
    // Should be skipped because name is empty
    expect(toolChunks).toHaveLength(0);
  });
});

// ─── Reasoning content ──────────────────────────────────────────────────────

describe("parseOpenAIStream reasoning", () => {
  it("yields thinking chunks for reasoning_content deltas", async () => {
    const response = mockSSEResponse([
      'data: {"choices":[{"delta":{"reasoning_content":"Let me think..."},"finish_reason":null}]}',
      'data: {"choices":[{"delta":{"content":"Here is my answer."},"finish_reason":null}]}',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
    ]);

    const chunks = await collectChunks(response);

    const thinkingChunks = chunks.filter((c) => c.type === "thinking");
    expect(thinkingChunks).toHaveLength(1);
    expect(thinkingChunks[0]!.content).toBe("Let me think...");

    const textChunks = chunks.filter((c) => c.type === "text");
    expect(textChunks).toHaveLength(1);
    expect(textChunks[0]!.content).toBe("Here is my answer.");
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe("parseOpenAIStream edge cases", () => {
  it("handles response with no body", async () => {
    const response = new Response(null, { status: 200 });

    const chunks = await collectChunks(response);
    expect(chunks.some((c) => c.type === "error")).toBe(true);
    expect(chunks.some((c) => c.type === "done")).toBe(true);
  });

  it("handles empty stream (no data lines)", async () => {
    const response = mockSSEResponse([""]);

    const chunks = await collectChunks(response);
    // Should still yield done
    expect(chunks.some((c) => c.type === "done")).toBe(true);
  });

  it("respects AbortSignal", async () => {
    const controller = new AbortController();
    controller.abort();

    const response = mockSSEResponse([
      'data: {"choices":[{"delta":{"content":"should not appear"},"finish_reason":null}]}',
    ]);

    const chunks = await collectChunks(response, controller.signal);
    // Should yield error + done, not the content
    expect(chunks.some((c) => c.type === "error" && c.content.includes("abort"))).toBe(true);
  });

  it("generates fallback tool call IDs when not provided", async () => {
    const response = mockSSEResponse([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"bash","arguments":"{\\"cmd\\":\\"ls\\"}"}}]},"finish_reason":null}]}',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}',
    ]);

    const chunks = await collectChunks(response);
    const toolChunks = chunks.filter((c) => c.type === "tool_call");
    expect(toolChunks).toHaveLength(1);
    // Should have a generated ID starting with "call_"
    expect(toolChunks[0]!.tool_call!.id).toMatch(/^call_/);
  });
});
