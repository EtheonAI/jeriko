// Unit tests — MediaConfig types and integration with JerikoConfig.

import { describe, it, expect } from "bun:test";
import type {
  JerikoConfig,
  MediaConfig,
  STTConfig,
  TTSConfig,
  ImageGenConfig,
} from "../../../src/shared/config.js";

describe("MediaConfig types", () => {
  it("STTConfig accepts valid providers", () => {
    const configs: STTConfig[] = [
      { provider: "openai" },
      { provider: "local" },
      { provider: "disabled" },
      { provider: "openai", language: "en" },
      { provider: "local", modelPath: "/path/to/model.bin", language: "es" },
    ];
    expect(configs).toHaveLength(5);
  });

  it("TTSConfig accepts valid providers and voices", () => {
    const configs: TTSConfig[] = [
      { provider: "openai" },
      { provider: "native" },
      { provider: "disabled" },
      { provider: "openai", voice: "nova", model: "tts-1-hd", maxLength: 2000 },
      { provider: "native", voice: "Samantha" },
    ];
    expect(configs).toHaveLength(5);
  });

  it("ImageGenConfig accepts valid providers", () => {
    const configs: ImageGenConfig[] = [
      {},
      { provider: "openai" },
      { provider: "auto" },
      { provider: "openai", defaultSize: "1024x1024", defaultStyle: "vivid" },
    ];
    expect(configs).toHaveLength(4);
  });

  it("MediaConfig nests correctly in JerikoConfig", () => {
    const media: MediaConfig = {
      stt: { provider: "openai", language: "en" },
      tts: { provider: "openai", voice: "nova" },
      imageGen: { provider: "auto" },
    };

    // Verify it can be assigned to a JerikoConfig-shaped object
    const config = { media } as Partial<JerikoConfig>;
    expect(config.media).toBeDefined();
    expect(config.media!.stt!.provider).toBe("openai");
    expect(config.media!.tts!.provider).toBe("openai");
    expect(config.media!.imageGen!.provider).toBe("auto");
  });

  it("MediaConfig fields are all optional", () => {
    const empty: MediaConfig = {};
    expect(empty.stt).toBeUndefined();
    expect(empty.tts).toBeUndefined();
    expect(empty.imageGen).toBeUndefined();
  });

  it("JerikoConfig.media is optional", () => {
    // Verify existing configs without media field still work
    const config = { agent: { model: "claude" } } as Partial<JerikoConfig>;
    expect(config.media).toBeUndefined();
  });
});
