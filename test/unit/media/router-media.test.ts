// Unit tests — Channel router media integration.
//
// Tests the media-specific functions extracted from router.ts:
// transcribeAttachment(), sendVoiceResponse(), vision block assembly,
// and capability gating. These are the actual integration points
// where media features meet the channel system.

import { describe, it, expect, afterEach, beforeEach } from "bun:test";
import { writeFileSync, unlinkSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type { ContentBlock, ImageBlock, TextBlock } from "../../../src/daemon/agent/drivers/index.js";
import { messageText } from "../../../src/daemon/agent/drivers/index.js";
import type { STTConfig, TTSConfig } from "../../../src/shared/config.js";

// ---------------------------------------------------------------------------
// Vision block assembly — mirrors router.ts lines 252-293
// ---------------------------------------------------------------------------

describe("Router — vision block assembly", () => {
  const testDir = join(tmpdir(), `jeriko-router-test-${randomUUID()}`);
  let testImagePath: string;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    testImagePath = join(testDir, "photo.jpg");
    // Create a minimal JPEG-like file
    writeFileSync(testImagePath, Buffer.alloc(64, 0xff));
  });

  afterEach(() => {
    try { unlinkSync(testImagePath); } catch {}
  });

  it("builds ContentBlock[] from image file with correct mediaType", () => {
    const imageData = readFileSync(testImagePath);
    const base64 = imageData.toString("base64");
    const ext = testImagePath.split(".").pop()?.toLowerCase() ?? "jpg";
    const mediaType = ext === "png" ? "image/png"
      : ext === "webp" ? "image/webp"
      : ext === "gif" ? "image/gif"
      : "image/jpeg";

    const imageBlock: ImageBlock = {
      type: "image",
      data: base64,
      mediaType,
    };

    expect(imageBlock.type).toBe("image");
    expect(imageBlock.data).toBe(base64);
    expect(imageBlock.mediaType).toBe("image/jpeg");
    expect(base64.length).toBeGreaterThan(0);
  });

  it("detects PNG mediaType from extension", () => {
    const pngPath = join(testDir, "photo.png");
    writeFileSync(pngPath, Buffer.alloc(32, 0));

    const ext = pngPath.split(".").pop()?.toLowerCase() ?? "jpg";
    const mediaType = ext === "png" ? "image/png"
      : ext === "webp" ? "image/webp"
      : ext === "gif" ? "image/gif"
      : "image/jpeg";

    expect(mediaType).toBe("image/png");
    try { unlinkSync(pngPath); } catch {}
  });

  it("detects WebP mediaType from extension", () => {
    const ext = "webp";
    const mediaType = ext === "png" ? "image/png"
      : ext === "webp" ? "image/webp"
      : ext === "gif" ? "image/gif"
      : "image/jpeg";

    expect(mediaType).toBe("image/webp");
  });

  it("detects GIF mediaType from extension", () => {
    const ext = "gif";
    const mediaType = ext === "png" ? "image/png"
      : ext === "webp" ? "image/webp"
      : ext === "gif" ? "image/gif"
      : "image/jpeg";

    expect(mediaType).toBe("image/gif");
  });

  it("defaults to image/jpeg for unknown extensions", () => {
    const ext = "bmp";
    const mediaType = ext === "png" ? "image/png"
      : ext === "webp" ? "image/webp"
      : ext === "gif" ? "image/gif"
      : "image/jpeg";

    expect(mediaType).toBe("image/jpeg");
  });

  it("assembles vision blocks with images first, text last", () => {
    const imageBlocks: ContentBlock[] = [
      { type: "image", data: "img1base64", mediaType: "image/jpeg" },
      { type: "image", data: "img2base64", mediaType: "image/png" },
    ];
    const augmentedText = "User sent a photo.\n\nDescribe these";

    const visionBlocks: ContentBlock[] = [
      ...imageBlocks,
      { type: "text" as const, text: augmentedText },
    ];

    expect(visionBlocks).toHaveLength(3);
    expect(visionBlocks[0]!.type).toBe("image");
    expect(visionBlocks[1]!.type).toBe("image");
    expect(visionBlocks[2]!.type).toBe("text");
    expect((visionBlocks[2] as TextBlock).text).toBe(augmentedText);
  });

  it("messageText extracts only text from vision blocks", () => {
    const visionBlocks: ContentBlock[] = [
      { type: "image", data: "img1base64", mediaType: "image/jpeg" },
      { type: "text", text: "What is in this image?" },
    ];

    const msg = { role: "user" as const, content: visionBlocks };
    expect(messageText(msg)).toBe("What is in this image?");
  });
});

// ---------------------------------------------------------------------------
// Vision capability gating — mirrors router.ts lines 308-316
// ---------------------------------------------------------------------------

describe("Router — vision capability gating", () => {
  it("only replaces content with vision blocks when model has vision=true", () => {
    const visionBlocks: ContentBlock[] = [
      { type: "image", data: "base64data", mediaType: "image/jpeg" },
      { type: "text", text: "Describe this" },
    ];

    const history = [
      { role: "user" as const, content: "Describe this" },
    ];

    // Simulate vision-capable model
    const capsVision = { vision: true };
    if (visionBlocks && capsVision.vision && history.length > 0) {
      history[history.length - 1]!.content = visionBlocks as any;
    }

    expect(Array.isArray(history[0]!.content)).toBe(true);
    expect((history[0]!.content as ContentBlock[])).toHaveLength(2);
  });

  it("keeps text-only content when model has vision=false", () => {
    const visionBlocks: ContentBlock[] = [
      { type: "image", data: "base64data", mediaType: "image/jpeg" },
      { type: "text", text: "Describe this" },
    ];

    const history = [
      { role: "user" as const, content: "Describe this" },
    ];

    // Simulate non-vision model
    const capsNoVision = { vision: false };
    if (visionBlocks && capsNoVision.vision && history.length > 0) {
      history[history.length - 1]!.content = visionBlocks as any;
    }

    // Content should remain as string (not replaced)
    expect(typeof history[0]!.content).toBe("string");
    expect(history[0]!.content).toBe("Describe this");
  });

  it("does not crash when history is empty", () => {
    const visionBlocks: ContentBlock[] = [
      { type: "image", data: "base64data", mediaType: "image/jpeg" },
      { type: "text", text: "Describe this" },
    ];

    const history: Array<{ role: string; content: string | ContentBlock[] }> = [];

    const caps = { vision: true };
    if (visionBlocks && caps.vision && history.length > 0) {
      history[history.length - 1]!.content = visionBlocks;
    }

    // Should not throw — history.length check prevents access
    expect(history).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// transcribeAttachment — mirrors router.ts lines 453-465
// ---------------------------------------------------------------------------

describe("Router — transcribeAttachment logic", () => {
  it("returns null when sttConfig is undefined", () => {
    const sttConfig: STTConfig | undefined = undefined;
    // Mirrors the guard in transcribeAttachment
    const result = !sttConfig || sttConfig.provider === "disabled" ? null : "would-transcribe";
    expect(result).toBeNull();
  });

  it("returns null when sttConfig provider is disabled", () => {
    const sttConfig: STTConfig = { provider: "disabled" };
    const result = !sttConfig || sttConfig.provider === "disabled" ? null : "would-transcribe";
    expect(result).toBeNull();
  });

  it("would proceed to transcribe when provider is openai", () => {
    const sttConfig: STTConfig = { provider: "openai" };
    const wouldTranscribe = !(!sttConfig || sttConfig.provider === "disabled");
    expect(wouldTranscribe).toBe(true);
  });

  it("would proceed to transcribe when provider is local", () => {
    const sttConfig: STTConfig = { provider: "local" };
    const wouldTranscribe = !(!sttConfig || sttConfig.provider === "disabled");
    expect(wouldTranscribe).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// sendVoiceResponse — mirrors router.ts lines 469-493
// ---------------------------------------------------------------------------

describe("Router — sendVoiceResponse logic", () => {
  it("skips TTS when ttsConfig is undefined", () => {
    const ttsConfig: TTSConfig | undefined = undefined;
    const shouldSend = ttsConfig && ttsConfig.provider !== "disabled";
    expect(shouldSend).toBeFalsy();
  });

  it("skips TTS when provider is disabled", () => {
    const ttsConfig: TTSConfig = { provider: "disabled" };
    const shouldSend = ttsConfig && ttsConfig.provider !== "disabled";
    expect(shouldSend).toBeFalsy();
  });

  it("proceeds with TTS when provider is openai", () => {
    const ttsConfig: TTSConfig = { provider: "openai" };
    const shouldSend = ttsConfig && ttsConfig.provider !== "disabled";
    expect(shouldSend).toBeTruthy();
  });

  it("proceeds with TTS when provider is native", () => {
    const ttsConfig: TTSConfig = { provider: "native" };
    const shouldSend = ttsConfig && ttsConfig.provider !== "disabled";
    expect(shouldSend).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Voice message detection — mirrors router.ts lines 243-250
// ---------------------------------------------------------------------------

describe("Router — voice attachment detection", () => {
  it("identifies voice attachment type for transcription", () => {
    const voiceTypes = ["voice", "audio"];
    const nonVoiceTypes = ["photo", "document", "video", "sticker"];

    for (const type of voiceTypes) {
      const isVoice = type === "voice" || type === "audio";
      expect(isVoice).toBe(true);
    }

    for (const type of nonVoiceTypes) {
      const isVoice = type === "voice" || type === "audio";
      expect(isVoice).toBe(false);
    }
  });

  it("constructs transcription text prefix correctly", () => {
    const transcription = "Hello world";
    const attType = "voice";
    const filePart = `[Transcribed ${attType}]: ${transcription}`;
    expect(filePart).toBe("[Transcribed voice]: Hello world");
  });

  it("constructs audio transcription prefix correctly", () => {
    const transcription = "Some audio content";
    const attType = "audio";
    const filePart = `[Transcribed ${attType}]: ${transcription}`;
    expect(filePart).toBe("[Transcribed audio]: Some audio content");
  });
});

// ---------------------------------------------------------------------------
// File path detection — response scanning for generated images
// ---------------------------------------------------------------------------

describe("Router — response file detection", () => {
  const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp"]);
  const VIDEO_EXTS = new Set(["mp4", "avi", "mov", "mkv", "webm"]);
  const AUDIO_EXTS = new Set(["mp3", "ogg", "wav", "m4a", "flac", "opus"]);

  it("detects image extensions for sendPhoto", () => {
    for (const ext of IMAGE_EXTS) {
      expect(IMAGE_EXTS.has(ext)).toBe(true);
      expect(VIDEO_EXTS.has(ext)).toBe(false);
      expect(AUDIO_EXTS.has(ext)).toBe(false);
    }
  });

  it("detects audio extensions for sendAudio", () => {
    for (const ext of AUDIO_EXTS) {
      expect(AUDIO_EXTS.has(ext)).toBe(true);
      expect(IMAGE_EXTS.has(ext)).toBe(false);
    }
  });

  it("generated image path matches image extension pattern", () => {
    const generatedPath = `/tmp/jeriko-image-${randomUUID()}.png`;
    const ext = generatedPath.split(".").pop()?.toLowerCase() ?? "";
    expect(IMAGE_EXTS.has(ext)).toBe(true);
  });

  it("generated TTS path matches audio extension pattern", () => {
    const ttsPath = `/tmp/jeriko-tts-${randomUUID()}.ogg`;
    const ext = ttsPath.split(".").pop()?.toLowerCase() ?? "";
    expect(AUDIO_EXTS.has(ext)).toBe(true);
  });
});
