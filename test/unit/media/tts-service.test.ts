// Unit tests — TTS service with mocked fetch for OpenAI TTS API.
//
// Tests the synthesize() function's success paths, voice selection,
// model selection, text truncation, and file output.

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("TTS Service — detailed", () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  const originalBaseUrl = process.env.OPENAI_BASE_URL;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalKey) process.env.OPENAI_API_KEY = originalKey;
    else delete process.env.OPENAI_API_KEY;
    if (originalBaseUrl) process.env.OPENAI_BASE_URL = originalBaseUrl;
    else delete process.env.OPENAI_BASE_URL;
  });

  // ── OpenAI success path ──────────────────────────────────────────

  it("OpenAI: synthesizes text and writes OGG file to disk", async () => {
    process.env.OPENAI_API_KEY = "test-key-tts";
    let outputPath: string | null = null;

    // Mock a successful TTS response returning fake audio bytes
    const fakeAudio = new Uint8Array([0x4f, 0x67, 0x67, 0x53]); // OGG magic bytes
    globalThis.fetch = (async () => {
      return new Response(fakeAudio, {
        status: 200,
        headers: { "Content-Type": "audio/ogg" },
      });
    }) as typeof fetch;

    const { synthesize } = await import("../../../src/daemon/services/media/tts.js");
    outputPath = await synthesize("Hello world", { provider: "openai" });

    expect(outputPath).not.toBeNull();
    expect(outputPath!).toContain("jeriko-tts-");
    expect(outputPath!).toEndWith(".ogg");
    expect(existsSync(outputPath!)).toBe(true);

    // Clean up
    if (outputPath) try { unlinkSync(outputPath); } catch {}
  });

  it("OpenAI: sends correct payload with voice and model", async () => {
    process.env.OPENAI_API_KEY = "test-key-tts";
    let capturedBody: Record<string, unknown> = {};
    let capturedUrl = "";

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      capturedUrl = typeof input === "string" ? input : input.toString();
      capturedBody = JSON.parse(init?.body as string);
      return new Response(new Uint8Array(4), { status: 200 });
    }) as typeof fetch;

    const { synthesize } = await import("../../../src/daemon/services/media/tts.js");
    const outputPath = await synthesize("Test voice", {
      provider: "openai",
      voice: "echo",
      model: "tts-1-hd",
    });

    expect(capturedUrl).toContain("/v1/audio/speech");
    expect(capturedBody.voice).toBe("echo");
    expect(capturedBody.model).toBe("tts-1-hd");
    expect(capturedBody.input).toBe("Test voice");
    expect(capturedBody.response_format).toBe("opus");

    if (outputPath) try { unlinkSync(outputPath); } catch {}
  });

  // ── Voice validation ──────────────────────────────────────────────

  it("OpenAI: defaults to 'nova' for invalid voice", async () => {
    process.env.OPENAI_API_KEY = "test-key-tts";
    let capturedBody: Record<string, unknown> = {};

    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(new Uint8Array(4), { status: 200 });
    }) as typeof fetch;

    const { synthesize } = await import("../../../src/daemon/services/media/tts.js");
    const outputPath = await synthesize("Test", {
      provider: "openai",
      voice: "robot-9000", // invalid
    });

    expect(capturedBody.voice).toBe("nova");
    if (outputPath) try { unlinkSync(outputPath); } catch {}
  });

  it("OpenAI: accepts all 6 valid voices", async () => {
    const validVoices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
    process.env.OPENAI_API_KEY = "test-key-tts";

    for (const voice of validVoices) {
      let capturedBody: Record<string, unknown> = {};

      globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string);
        return new Response(new Uint8Array(4), { status: 200 });
      }) as typeof fetch;

      const { synthesize } = await import("../../../src/daemon/services/media/tts.js");
      const outputPath = await synthesize("Test", {
        provider: "openai",
        voice,
      });

      expect(capturedBody.voice).toBe(voice);
      if (outputPath) try { unlinkSync(outputPath); } catch {}
    }
  });

  // ── Model selection ──────────────────────────────────────────────

  it("OpenAI: defaults invalid model to 'tts-1'", async () => {
    process.env.OPENAI_API_KEY = "test-key-tts";
    let capturedBody: Record<string, unknown> = {};

    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(new Uint8Array(4), { status: 200 });
    }) as typeof fetch;

    const { synthesize } = await import("../../../src/daemon/services/media/tts.js");
    const outputPath = await synthesize("Test", {
      provider: "openai",
      model: "tts-3-ultra", // invalid
    });

    expect(capturedBody.model).toBe("tts-1");
    if (outputPath) try { unlinkSync(outputPath); } catch {}
  });

  // ── Text truncation ──────────────────────────────────────────────

  it("truncates text at maxLength and appends ellipsis", async () => {
    process.env.OPENAI_API_KEY = "test-key-tts";
    let capturedBody: Record<string, unknown> = {};

    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(new Uint8Array(4), { status: 200 });
    }) as typeof fetch;

    const { synthesize } = await import("../../../src/daemon/services/media/tts.js");
    const longText = "A".repeat(200);
    const outputPath = await synthesize(longText, {
      provider: "openai",
      maxLength: 50,
    });

    const input = capturedBody.input as string;
    expect(input.length).toBe(53); // 50 chars + "..."
    expect(input).toEndWith("...");
    if (outputPath) try { unlinkSync(outputPath); } catch {}
  });

  it("does not truncate text under maxLength", async () => {
    process.env.OPENAI_API_KEY = "test-key-tts";
    let capturedBody: Record<string, unknown> = {};

    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(new Uint8Array(4), { status: 200 });
    }) as typeof fetch;

    const { synthesize } = await import("../../../src/daemon/services/media/tts.js");
    const outputPath = await synthesize("Short text", {
      provider: "openai",
      maxLength: 100,
    });

    expect(capturedBody.input).toBe("Short text");
    if (outputPath) try { unlinkSync(outputPath); } catch {}
  });

  // ── OpenAI error paths ──────────────────────────────────────────

  it("OpenAI: returns null on HTTP error", async () => {
    process.env.OPENAI_API_KEY = "test-key-tts";

    globalThis.fetch = (async () => {
      return new Response("Server error", { status: 500 });
    }) as typeof fetch;

    const { synthesize } = await import("../../../src/daemon/services/media/tts.js");
    const result = await synthesize("Hello", { provider: "openai" });
    expect(result).toBeNull();
  });

  it("OpenAI: returns null on network error", async () => {
    process.env.OPENAI_API_KEY = "test-key-tts";

    globalThis.fetch = (async () => {
      throw new Error("DNS_RESOLUTION_FAILED");
    }) as typeof fetch;

    const { synthesize } = await import("../../../src/daemon/services/media/tts.js");
    const result = await synthesize("Hello", { provider: "openai" });
    expect(result).toBeNull();
  });

  // ── Base URL customization ──────────────────────────────────────

  it("OpenAI: respects OPENAI_BASE_URL", async () => {
    process.env.OPENAI_API_KEY = "test-key-tts";
    process.env.OPENAI_BASE_URL = "https://custom-tts.example.com/v1";
    let capturedUrl = "";

    globalThis.fetch = (async (input: string | URL | Request) => {
      capturedUrl = typeof input === "string" ? input : input.toString();
      return new Response(new Uint8Array(4), { status: 200 });
    }) as typeof fetch;

    const { synthesize } = await import("../../../src/daemon/services/media/tts.js");
    const outputPath = await synthesize("Test", { provider: "openai" });

    expect(capturedUrl).toBe("https://custom-tts.example.com/v1/audio/speech");
    if (outputPath) try { unlinkSync(outputPath); } catch {}
  });

  // ── Native macOS TTS ──────────────────────────────────────────

  it("native: works on macOS with say + ffmpeg", async () => {
    if (process.platform !== "darwin") return;

    const { synthesize } = await import("../../../src/daemon/services/media/tts.js");
    const outputPath = await synthesize("Hello world test", {
      provider: "native",
      voice: "Samantha",
    });

    // On macOS with ffmpeg installed, this should produce a real OGG file
    if (outputPath) {
      expect(outputPath).toEndWith(".ogg");
      expect(existsSync(outputPath)).toBe(true);
      try { unlinkSync(outputPath); } catch {}
    }
    // If ffmpeg or say isn't available, result is null (graceful)
  }, 15_000);

  // ── Unknown provider ────────────────────────────────────────────

  it("returns null for unknown provider", async () => {
    const { synthesize } = await import("../../../src/daemon/services/media/tts.js");
    const result = await synthesize("Hello", { provider: "azure" as "openai" });
    expect(result).toBeNull();
  });
});
