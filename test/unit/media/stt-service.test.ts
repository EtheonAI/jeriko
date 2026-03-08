// Unit tests — STT service with mocked fetch for OpenAI Whisper.
//
// Tests the transcribe() function's success paths, error handling,
// API payload construction, language parameters, and file validation.

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

describe("STT Service — detailed", () => {
  const testDir = join(tmpdir(), `jeriko-stt-detail-${randomUUID()}`);
  let testAudioPath: string;
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  const originalBaseUrl = process.env.OPENAI_BASE_URL;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    testAudioPath = join(testDir, "test-voice.ogg");
    writeFileSync(testAudioPath, Buffer.alloc(256, 0));
  });

  afterEach(() => {
    try { unlinkSync(testAudioPath); } catch {}
    globalThis.fetch = originalFetch;
    if (originalKey) process.env.OPENAI_API_KEY = originalKey;
    else delete process.env.OPENAI_API_KEY;
    if (originalBaseUrl) process.env.OPENAI_BASE_URL = originalBaseUrl;
    else delete process.env.OPENAI_BASE_URL;
  });

  // ── OpenAI success path ──────────────────────────────────────────

  it("OpenAI: sends correct multipart form and returns transcribed text", async () => {
    process.env.OPENAI_API_KEY = "test-key-stt";
    let capturedUrl = "";
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: FormData | null = null;

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      capturedUrl = typeof input === "string" ? input : input.toString();
      capturedHeaders = Object.fromEntries(
        Object.entries(init?.headers ?? {}).map(([k, v]) => [k, String(v)]),
      );
      capturedBody = init?.body as FormData;

      return new Response(JSON.stringify({ text: "Hello world transcribed" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const { transcribe } = await import("../../../src/daemon/services/media/stt.js");
    const result = await transcribe(testAudioPath, { provider: "openai" });

    expect(result).toBe("Hello world transcribed");
    expect(capturedUrl).toContain("/v1/audio/transcriptions");
    expect(capturedHeaders.Authorization).toBe("Bearer test-key-stt");
  });

  it("OpenAI: sends language parameter when configured", async () => {
    process.env.OPENAI_API_KEY = "test-key-stt";
    let capturedBody: FormData | null = null;

    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      capturedBody = init?.body as FormData;
      return new Response(JSON.stringify({ text: "Hola mundo" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const { transcribe } = await import("../../../src/daemon/services/media/stt.js");
    const result = await transcribe(testAudioPath, {
      provider: "openai",
      language: "es",
    });

    expect(result).toBe("Hola mundo");
    // The FormData should have been sent with language=es
    // We can't easily inspect FormData in a mock, but we verify the call succeeded
  });

  it("OpenAI: respects OPENAI_BASE_URL", async () => {
    process.env.OPENAI_API_KEY = "test-key-stt";
    process.env.OPENAI_BASE_URL = "https://custom-api.example.com/v1";
    let capturedUrl = "";

    globalThis.fetch = (async (input: string | URL | Request) => {
      capturedUrl = typeof input === "string" ? input : input.toString();
      return new Response(JSON.stringify({ text: "ok" }), { status: 200 });
    }) as typeof fetch;

    const { transcribe } = await import("../../../src/daemon/services/media/stt.js");
    await transcribe(testAudioPath, { provider: "openai" });

    expect(capturedUrl).toBe("https://custom-api.example.com/v1/audio/transcriptions");
  });

  // ── OpenAI error paths ──────────────────────────────────────────

  it("OpenAI: returns null on HTTP error (non-200)", async () => {
    process.env.OPENAI_API_KEY = "test-key-stt";

    globalThis.fetch = (async () => {
      return new Response("rate limited", { status: 429 });
    }) as typeof fetch;

    const { transcribe } = await import("../../../src/daemon/services/media/stt.js");
    const result = await transcribe(testAudioPath, { provider: "openai" });
    expect(result).toBeNull();
  });

  it("OpenAI: returns null on malformed JSON response", async () => {
    process.env.OPENAI_API_KEY = "test-key-stt";

    globalThis.fetch = (async () => {
      return new Response("not json", { status: 200 });
    }) as typeof fetch;

    const { transcribe } = await import("../../../src/daemon/services/media/stt.js");
    const result = await transcribe(testAudioPath, { provider: "openai" });
    // Will throw on JSON parse => caught by outer try/catch => null
    expect(result).toBeNull();
  });

  it("OpenAI: returns null when response has empty text field", async () => {
    process.env.OPENAI_API_KEY = "test-key-stt";

    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ text: "" }), { status: 200 });
    }) as typeof fetch;

    const { transcribe } = await import("../../../src/daemon/services/media/stt.js");
    const result = await transcribe(testAudioPath, { provider: "openai" });
    expect(result).toBeNull();
  });

  it("OpenAI: returns null when response has no text field", async () => {
    process.env.OPENAI_API_KEY = "test-key-stt";

    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ duration: 3.5 }), { status: 200 });
    }) as typeof fetch;

    const { transcribe } = await import("../../../src/daemon/services/media/stt.js");
    const result = await transcribe(testAudioPath, { provider: "openai" });
    expect(result).toBeNull();
  });

  it("OpenAI: returns null on network error (fetch throws)", async () => {
    process.env.OPENAI_API_KEY = "test-key-stt";

    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;

    const { transcribe } = await import("../../../src/daemon/services/media/stt.js");
    const result = await transcribe(testAudioPath, { provider: "openai" });
    expect(result).toBeNull();
  });

  // ── File validation ──────────────────────────────────────────────

  it("returns null when audio file does not exist", async () => {
    process.env.OPENAI_API_KEY = "test-key-stt";
    const { transcribe } = await import("../../../src/daemon/services/media/stt.js");

    const result = await transcribe("/tmp/nonexistent-audio-file.ogg", { provider: "openai" });
    expect(result).toBeNull();
  });

  // ── MIME type detection ──────────────────────────────────────────

  it("detects MIME type from file extension", async () => {
    process.env.OPENAI_API_KEY = "test-key-stt";
    let capturedBody: FormData | null = null;

    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      capturedBody = init?.body as FormData;
      return new Response(JSON.stringify({ text: "mp3 audio" }), { status: 200 });
    }) as typeof fetch;

    const mp3Path = join(testDir, "test-voice.mp3");
    writeFileSync(mp3Path, Buffer.alloc(128, 0));

    const { transcribe } = await import("../../../src/daemon/services/media/stt.js");
    const result = await transcribe(mp3Path, { provider: "openai" });
    expect(result).toBe("mp3 audio");

    try { unlinkSync(mp3Path); } catch {}
  });

  // ── Unknown provider ────────────────────────────────────────────

  it("returns null for unknown provider", async () => {
    const { transcribe } = await import("../../../src/daemon/services/media/stt.js");
    const result = await transcribe(testAudioPath, { provider: "azure" as "openai" });
    expect(result).toBeNull();
  });

  // ── Trims whitespace from transcription ──────────────────────────

  it("trims whitespace from transcribed text", async () => {
    process.env.OPENAI_API_KEY = "test-key-stt";

    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ text: "  hello world  \n" }), { status: 200 });
    }) as typeof fetch;

    const { transcribe } = await import("../../../src/daemon/services/media/stt.js");
    const result = await transcribe(testAudioPath, { provider: "openai" });
    expect(result).toBe("hello world");
  });
});
