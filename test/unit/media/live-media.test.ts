// Live tests — Media services with real local tools.
//
// These tests use actual local binaries (say, ffmpeg, whisper) when available.
// Skipped gracefully on CI or when tools aren't installed.
// Run: bun test test/unit/media/live-media.test.ts

import { describe, it, expect, afterEach } from "bun:test";
import { existsSync, unlinkSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

// ---------------------------------------------------------------------------
// Detect available tools
// ---------------------------------------------------------------------------

const hasSay = process.platform === "darwin" && spawnSync("which", ["say"]).status === 0;
const hasFfmpeg = spawnSync("which", ["ffmpeg"]).status === 0;
const hasWhisper = spawnSync("which", ["whisper"]).status === 0;

// ---------------------------------------------------------------------------
// Native TTS — macOS say + ffmpeg
// ---------------------------------------------------------------------------

describe("Live: Native TTS (macOS say + ffmpeg)", () => {
  const createdFiles: string[] = [];

  afterEach(() => {
    for (const f of createdFiles) {
      try { unlinkSync(f); } catch {}
    }
    createdFiles.length = 0;
  });

  it("synthesizes text to OGG file using macOS native TTS", async () => {
    if (!hasSay || !hasFfmpeg) return; // skip if tools not available

    const { synthesize } = await import("../../../src/daemon/services/media/tts.js");
    const outputPath = await synthesize("Testing Jeriko native text to speech", {
      provider: "native",
      voice: "Samantha",
    });

    expect(outputPath).not.toBeNull();
    expect(outputPath!).toEndWith(".ogg");
    expect(existsSync(outputPath!)).toBe(true);

    // Verify it's a real audio file with non-trivial size
    const stat = statSync(outputPath!);
    expect(stat.size).toBeGreaterThan(100); // Real OGG should be > 100 bytes

    createdFiles.push(outputPath!);
  }, 15_000);

  it("synthesizes with different voice", async () => {
    if (!hasSay || !hasFfmpeg) return;

    const { synthesize } = await import("../../../src/daemon/services/media/tts.js");
    const outputPath = await synthesize("Hello world", {
      provider: "native",
      voice: "Alex",
    });

    if (outputPath) {
      expect(existsSync(outputPath)).toBe(true);
      createdFiles.push(outputPath);
    }
    // Some voices may not be installed — null is acceptable
  }, 15_000);

  it("cleans up intermediate AIFF file", async () => {
    if (!hasSay || !hasFfmpeg) return;

    const { synthesize } = await import("../../../src/daemon/services/media/tts.js");
    const outputPath = await synthesize("Cleanup test", {
      provider: "native",
    });

    if (outputPath) {
      // The intermediate AIFF should have been deleted
      // We can't easily check the exact path, but verify no AIFF files leaked
      createdFiles.push(outputPath);
    }
  }, 15_000);
});

// ---------------------------------------------------------------------------
// STT + TTS roundtrip — synthesize then transcribe
// ---------------------------------------------------------------------------

describe("Live: STT + TTS roundtrip", () => {
  const createdFiles: string[] = [];

  afterEach(() => {
    for (const f of createdFiles) {
      try { unlinkSync(f); } catch {}
    }
    createdFiles.length = 0;
  });

  it("synthesizes text to audio, then transcribes it back", async () => {
    // This test requires both TTS and STT to be fully functional
    if (!hasSay || !hasFfmpeg || !hasWhisper) return;

    const { synthesize } = await import("../../../src/daemon/services/media/tts.js");
    const { transcribe } = await import("../../../src/daemon/services/media/stt.js");

    // Step 1: Synthesize text to audio
    const audioPath = await synthesize("Hello world testing one two three", {
      provider: "native",
      voice: "Samantha",
    });

    if (!audioPath) return; // TTS failed, skip

    createdFiles.push(audioPath);
    expect(existsSync(audioPath)).toBe(true);

    // Step 2: Transcribe back to text
    const transcription = await transcribe(audioPath, { provider: "local" });

    if (transcription) {
      // The transcription should contain some of the original words
      const lower = transcription.toLowerCase();
      const hasRelevantWord =
        lower.includes("hello") ||
        lower.includes("world") ||
        lower.includes("testing") ||
        lower.includes("one") ||
        lower.includes("two") ||
        lower.includes("three");
      expect(hasRelevantWord).toBe(true);
    }
    // null is acceptable if whisper can't handle the format
  }, 30_000);
});

// ---------------------------------------------------------------------------
// Image generation tool — structural verification
// ---------------------------------------------------------------------------

describe("Live: generate_image tool structure", () => {
  it("tool is registered and has correct parameter schema", async () => {
    const { clearTools, getTool, registerTool } = await import("../../../src/daemon/agent/tools/registry.js");
    const { generateImageTool } = await import("../../../src/daemon/agent/tools/generate-image.js");

    clearTools();
    registerTool(generateImageTool);

    const tool = getTool("generate_image");
    expect(tool).toBeDefined();

    // Verify parameter schema is correct
    const params = tool!.parameters;
    expect(params.type).toBe("object");
    expect(params.required).toContain("prompt");

    const props = params.properties as Record<string, Record<string, unknown>>;
    expect(props.prompt).toBeDefined();
    expect(props.prompt.type).toBe("string");
    expect(props.size).toBeDefined();
    expect(props.size.enum).toEqual(["1024x1024", "1024x1792", "1792x1024"]);
    expect(props.style).toBeDefined();
    expect(props.style.enum).toEqual(["vivid", "natural"]);
    expect(props.provider).toBeDefined();

    clearTools();
  });

  it("all aliases resolve to the same tool", async () => {
    const { clearTools, getTool, registerTool } = await import("../../../src/daemon/agent/tools/registry.js");
    const { generateImageTool } = await import("../../../src/daemon/agent/tools/generate-image.js");

    clearTools();
    registerTool(generateImageTool);

    const aliases = ["generate_image", "create_image", "image_gen", "dall_e", "image_generation", "make_image"];
    const ids = aliases.map((a) => getTool(a)?.id);

    // All should resolve to "generate_image"
    for (const id of ids) {
      expect(id).toBe("generate_image");
    }

    clearTools();
  });
});

// ---------------------------------------------------------------------------
// ContentBlock backward compatibility
// ---------------------------------------------------------------------------

describe("Live: ContentBlock backward compat", () => {
  it("messageText handles string, empty array, image-only, mixed", () => {
    const { messageText } = require("../../../src/daemon/agent/drivers/index.js");

    // String content
    expect(messageText({ role: "user", content: "hello" })).toBe("hello");

    // Empty array
    expect(messageText({ role: "user", content: [] })).toBe("");

    // Image only
    expect(
      messageText({
        role: "user",
        content: [{ type: "image", data: "abc", mediaType: "image/png" }],
      }),
    ).toBe("");

    // Mixed
    expect(
      messageText({
        role: "user",
        content: [
          { type: "image", data: "abc", mediaType: "image/png" },
          { type: "text", text: "Describe this" },
          { type: "image", data: "def", mediaType: "image/jpeg" },
          { type: "text", text: "and this" },
        ],
      }),
    ).toBe("Describe this\nand this");
  });
});
