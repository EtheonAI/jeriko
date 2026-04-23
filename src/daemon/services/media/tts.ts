// Media service — Text-to-Speech synthesis.
//
// Supports two providers:
//   - "openai"  → OpenAI TTS API (tts-1 / tts-1-hd, 6 voices)
//   - "native"  → macOS `say` command (free, decent quality)
//
// Used by the channel router to optionally convert agent text responses
// into voice messages sent via Telegram/WhatsApp.

import type { TTSConfig } from "../../../shared/config.js";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { getLogger } from "../../../shared/logger.js";
import { withHttpRetry } from "../../../shared/http-retry.js";
import { redact } from "../../security/redaction.js";

const log = getLogger();

/**
 * Retry budget for one-shot TTS calls. Users are waiting for audio in real
 * time; more than two retries just multiplies the perceived latency without
 * meaningfully improving success rates (if cloud TTS is down, re-asking
 * doesn't fix it).
 */
const MEDIA_HTTP_RETRIES = 2;

/** Default max text length for TTS conversion (4096 chars). */
const DEFAULT_MAX_LENGTH = 4096;

/** Valid OpenAI TTS voices. */
const OPENAI_VOICES = new Set(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]);

/**
 * Synthesize text into an audio file.
 *
 * @param text    Text to convert to speech.
 * @param config  TTS configuration (provider, voice, model, max length).
 * @returns       Absolute path to the generated audio file, or null if disabled/failed.
 */
export async function synthesize(
  text: string,
  config: TTSConfig,
): Promise<string | null> {
  if (config.provider === "disabled") return null;
  if (!text.trim()) return null;

  // Truncate to max length
  const maxLen = config.maxLength ?? DEFAULT_MAX_LENGTH;
  const input = text.length > maxLen ? text.slice(0, maxLen) + "..." : text;

  try {
    switch (config.provider) {
      case "openai":
        return await synthesizeOpenAI(input, config);
      case "native":
        return await synthesizeNative(input, config);
      default:
        log.warn(`TTS: unknown provider "${config.provider}"`);
        return null;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`TTS synthesis failed: ${msg}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// OpenAI TTS API
// ---------------------------------------------------------------------------

async function synthesizeOpenAI(
  text: string,
  config: TTSConfig,
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    log.warn("TTS: OPENAI_API_KEY not set — cannot synthesize");
    return null;
  }

  const voice = config.voice && OPENAI_VOICES.has(config.voice)
    ? config.voice
    : "nova";
  const model = config.model === "tts-1-hd" ? "tts-1-hd" : "tts-1";

  const baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com";
  const url = baseUrl.endsWith("/v1")
    ? `${baseUrl}/audio/speech`
    : `${baseUrl}/v1/audio/speech`;

  const response = await withHttpRetry(() => fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      voice,
      input: text,
      response_format: "opus",
    }),
    signal: AbortSignal.timeout(60_000),
  }), { maxRetries: MEDIA_HTTP_RETRIES });

  if (!response.ok) {
    const errorText = await response.text();
    log.warn(`TTS OpenAI error ${response.status}: ${redact(errorText)}`);
    return null;
  }

  // Save the audio response to a temp file
  const audioData = new Uint8Array(await response.arrayBuffer());
  const outputPath = join(tmpdir(), `jeriko-tts-${randomUUID()}.ogg`);
  writeFileSync(outputPath, audioData);

  log.debug(`TTS: synthesized ${text.length} chars → ${outputPath} (${(audioData.length / 1024).toFixed(0)}KB)`);
  return outputPath;
}

// ---------------------------------------------------------------------------
// Native macOS TTS
// ---------------------------------------------------------------------------

async function synthesizeNative(
  text: string,
  config: TTSConfig,
): Promise<string | null> {
  if (process.platform !== "darwin") {
    log.warn("TTS native: only supported on macOS — falling back to disabled");
    return null;
  }

  const { spawn } = await import("node:child_process");

  // Use macOS `say` to generate AIFF, then convert to OGG with ffmpeg
  // (WhatsApp requires OGG Opus for voice messages).
  const aiffPath = join(tmpdir(), `jeriko-tts-${randomUUID()}.aiff`);
  const outputPath = join(tmpdir(), `jeriko-tts-${randomUUID()}.ogg`);

  const voice = config.voice ?? "Samantha";

  // Step 1: Generate AIFF with `say`
  await new Promise<void>((resolve, reject) => {
    const args = ["-o", aiffPath];
    if (voice) args.push("-v", voice);

    const proc = spawn("say", [...args, text], { timeout: 30_000 });

    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`say exited with code ${code}`));
    });
    proc.on("error", reject);
  });

  // Step 2: Convert AIFF → OGG Opus with ffmpeg
  await new Promise<void>((resolve, reject) => {
    const proc = spawn("ffmpeg", [
      "-y", "-i", aiffPath,
      "-c:a", "libopus", "-b:a", "48k",
      outputPath,
    ], { timeout: 30_000 });

    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg conversion failed (code ${code}). Install: brew install ffmpeg`));
    });
    proc.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new Error("ffmpeg not found. Install: brew install ffmpeg"));
      } else {
        reject(err);
      }
    });
  });

  // Clean up intermediate AIFF
  try {
    const { unlinkSync } = await import("node:fs");
    unlinkSync(aiffPath);
  } catch { /* non-fatal */ }

  log.debug(`TTS native: synthesized ${text.length} chars → ${outputPath}`);
  return outputPath;
}
