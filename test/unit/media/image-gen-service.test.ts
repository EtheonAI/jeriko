// Unit tests — Image generation service with mocked fetch.
//
// Tests generateImage(), resolveSize(), resolveStyle(), provider resolution,
// DALL-E 3 API payload construction, image download, and file output.

import { describe, it, expect, afterEach } from "bun:test";
import { existsSync, unlinkSync } from "node:fs";

describe("Image Generation Service — detailed", () => {
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

  // Helper to set up a mock that returns a successful DALL-E response
  function mockDallESuccess(opts?: {
    revisedPrompt?: string;
    captureBody?: (body: Record<string, unknown>) => void;
    captureUrl?: (url: string) => void;
  }) {
    const imageUrl = "https://fake-dalle.openai.com/image/generated.png";
    let callCount = 0;

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      callCount++;

      // First call: DALL-E API
      if (url.includes("/images/generations")) {
        if (opts?.captureUrl) opts.captureUrl(url);
        if (opts?.captureBody && init?.body) {
          opts.captureBody(JSON.parse(init.body as string));
        }
        return new Response(
          JSON.stringify({
            data: [{
              url: imageUrl,
              revised_prompt: opts?.revisedPrompt ?? "A beautiful cat sitting on a windowsill",
            }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      // Second call: image download
      if (url === imageUrl) {
        // 1x1 PNG bytes
        const pngBytes = new Uint8Array([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        ]);
        return new Response(pngBytes, {
          status: 200,
          headers: { "Content-Type": "image/png" },
        });
      }

      return new Response("not found", { status: 404 });
    }) as typeof fetch;
  }

  // ── Success path ────────────────────────────────────────────────

  it("generates image and saves PNG to disk", async () => {
    process.env.OPENAI_API_KEY = "test-key-img";
    mockDallESuccess();

    const { generateImage } = await import("../../../src/daemon/services/media/image-gen.js");
    const result = await generateImage({ prompt: "a cat" });

    expect(result.path).toContain("jeriko-image-");
    expect(result.path).toEndWith(".png");
    expect(existsSync(result.path)).toBe(true);
    expect(result.url).toContain("fake-dalle.openai.com");
    expect(result.revisedPrompt).toBeDefined();

    try { unlinkSync(result.path); } catch {}
  });

  it("returns revised prompt from DALL-E 3", async () => {
    process.env.OPENAI_API_KEY = "test-key-img";
    mockDallESuccess({ revisedPrompt: "A majestic calico cat perched on a windowsill at sunset" });

    const { generateImage } = await import("../../../src/daemon/services/media/image-gen.js");
    const result = await generateImage({ prompt: "cat on window" });

    expect(result.revisedPrompt).toBe("A majestic calico cat perched on a windowsill at sunset");

    try { unlinkSync(result.path); } catch {}
  });

  // ── API payload ─────────────────────────────────────────────────

  it("sends correct DALL-E 3 payload", async () => {
    process.env.OPENAI_API_KEY = "test-key-img";
    let capturedBody: Record<string, unknown> = {};

    mockDallESuccess({ captureBody: (body) => { capturedBody = body; } });

    const { generateImage } = await import("../../../src/daemon/services/media/image-gen.js");
    const result = await generateImage({
      prompt: "a sunset over mountains",
      size: "1792x1024",
      style: "natural",
    });

    expect(capturedBody.model).toBe("dall-e-3");
    expect(capturedBody.prompt).toBe("a sunset over mountains");
    expect(capturedBody.size).toBe("1792x1024");
    expect(capturedBody.style).toBe("natural");
    expect(capturedBody.n).toBe(1);
    expect(capturedBody.response_format).toBe("url");

    try { unlinkSync(result.path); } catch {}
  });

  // ── Size resolution ─────────────────────────────────────────────

  it("defaults to 1024x1024 for invalid size", async () => {
    process.env.OPENAI_API_KEY = "test-key-img";
    let capturedBody: Record<string, unknown> = {};

    mockDallESuccess({ captureBody: (body) => { capturedBody = body; } });

    const { generateImage } = await import("../../../src/daemon/services/media/image-gen.js");
    const result = await generateImage({ prompt: "test", size: "512x512" });

    expect(capturedBody.size).toBe("1024x1024");
    try { unlinkSync(result.path); } catch {}
  });

  it("accepts all 3 valid sizes", async () => {
    const validSizes = ["1024x1024", "1024x1792", "1792x1024"];
    process.env.OPENAI_API_KEY = "test-key-img";

    for (const size of validSizes) {
      let capturedBody: Record<string, unknown> = {};
      mockDallESuccess({ captureBody: (body) => { capturedBody = body; } });

      const { generateImage } = await import("../../../src/daemon/services/media/image-gen.js");
      const result = await generateImage({ prompt: "test", size });

      expect(capturedBody.size).toBe(size);
      try { unlinkSync(result.path); } catch {}
    }
  });

  // ── Style resolution ────────────────────────────────────────────

  it("defaults to 'vivid' for invalid style", async () => {
    process.env.OPENAI_API_KEY = "test-key-img";
    let capturedBody: Record<string, unknown> = {};

    mockDallESuccess({ captureBody: (body) => { capturedBody = body; } });

    const { generateImage } = await import("../../../src/daemon/services/media/image-gen.js");
    const result = await generateImage({ prompt: "test", style: "hyperreal" });

    expect(capturedBody.style).toBe("vivid");
    try { unlinkSync(result.path); } catch {}
  });

  it("accepts 'natural' style", async () => {
    process.env.OPENAI_API_KEY = "test-key-img";
    let capturedBody: Record<string, unknown> = {};

    mockDallESuccess({ captureBody: (body) => { capturedBody = body; } });

    const { generateImage } = await import("../../../src/daemon/services/media/image-gen.js");
    const result = await generateImage({ prompt: "test", style: "natural" });

    expect(capturedBody.style).toBe("natural");
    try { unlinkSync(result.path); } catch {}
  });

  // ── Config defaults ─────────────────────────────────────────────

  it("uses config defaults for size and style", async () => {
    process.env.OPENAI_API_KEY = "test-key-img";
    let capturedBody: Record<string, unknown> = {};

    mockDallESuccess({ captureBody: (body) => { capturedBody = body; } });

    const { generateImage } = await import("../../../src/daemon/services/media/image-gen.js");
    const result = await generateImage({ prompt: "test" }, {
      provider: "openai",
      defaultSize: "1024x1792",
      defaultStyle: "natural",
    });

    expect(capturedBody.size).toBe("1024x1792");
    expect(capturedBody.style).toBe("natural");
    try { unlinkSync(result.path); } catch {}
  });

  it("explicit args override config defaults", async () => {
    process.env.OPENAI_API_KEY = "test-key-img";
    let capturedBody: Record<string, unknown> = {};

    mockDallESuccess({ captureBody: (body) => { capturedBody = body; } });

    const { generateImage } = await import("../../../src/daemon/services/media/image-gen.js");
    const result = await generateImage(
      { prompt: "test", size: "1792x1024", style: "vivid" },
      { defaultSize: "1024x1792", defaultStyle: "natural" },
    );

    expect(capturedBody.size).toBe("1792x1024");
    expect(capturedBody.style).toBe("vivid");
    try { unlinkSync(result.path); } catch {}
  });

  // ── Provider resolution ─────────────────────────────────────────

  it("auto-detects openai when OPENAI_API_KEY is set", async () => {
    process.env.OPENAI_API_KEY = "test-key-img";
    let capturedUrl = "";

    mockDallESuccess({ captureUrl: (url) => { capturedUrl = url; } });

    const { generateImage } = await import("../../../src/daemon/services/media/image-gen.js");
    const result = await generateImage({ prompt: "test" });

    expect(capturedUrl).toContain("/v1/images/generations");
    try { unlinkSync(result.path); } catch {}
  });

  it("throws when no provider is available (no API key)", async () => {
    delete process.env.OPENAI_API_KEY;

    const { generateImage } = await import("../../../src/daemon/services/media/image-gen.js");
    await expect(generateImage({ prompt: "test" })).rejects.toThrow("No image generation provider");
  });

  it("throws for explicit openai provider with no key", async () => {
    delete process.env.OPENAI_API_KEY;

    const { generateImage } = await import("../../../src/daemon/services/media/image-gen.js");
    await expect(
      generateImage({ prompt: "test", provider: "openai" }),
    ).rejects.toThrow("OPENAI_API_KEY not set");
  });

  // ── API errors ──────────────────────────────────────────────────

  it("throws on DALL-E API error", async () => {
    process.env.OPENAI_API_KEY = "test-key-img";

    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ error: { message: "content policy violation" } }), {
        status: 400,
      });
    }) as typeof fetch;

    const { generateImage } = await import("../../../src/daemon/services/media/image-gen.js");
    await expect(generateImage({ prompt: "test" })).rejects.toThrow("DALL-E 3 error 400");
  });

  it("throws when DALL-E returns no image URL", async () => {
    process.env.OPENAI_API_KEY = "test-key-img";

    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ data: [{}] }), { status: 200 });
    }) as typeof fetch;

    const { generateImage } = await import("../../../src/daemon/services/media/image-gen.js");
    await expect(generateImage({ prompt: "test" })).rejects.toThrow("no image URL");
  });

  it("throws when image download fails", async () => {
    process.env.OPENAI_API_KEY = "test-key-img";

    let callCount = 0;
    globalThis.fetch = (async () => {
      callCount++;
      if (callCount === 1) {
        // DALL-E API success
        return new Response(
          JSON.stringify({ data: [{ url: "https://fake.com/img.png" }] }),
          { status: 200 },
        );
      }
      // Image download fails
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const { generateImage } = await import("../../../src/daemon/services/media/image-gen.js");
    await expect(generateImage({ prompt: "test" })).rejects.toThrow("Failed to download");
  });

  // ── Base URL customization ──────────────────────────────────────

  it("respects OPENAI_BASE_URL", async () => {
    process.env.OPENAI_API_KEY = "test-key-img";
    process.env.OPENAI_BASE_URL = "https://custom-img.example.com/v1";
    let capturedUrl = "";

    mockDallESuccess({ captureUrl: (url) => { capturedUrl = url; } });

    const { generateImage } = await import("../../../src/daemon/services/media/image-gen.js");
    const result = await generateImage({ prompt: "test" });

    expect(capturedUrl).toBe("https://custom-img.example.com/v1/images/generations");
    try { unlinkSync(result.path); } catch {}
  });
});
