// Media service — Speech-to-Text transcription.
//
// Supports two providers:
//   - "openai"  → OpenAI Whisper API (whisper-1 model, $0.006/min)
//   - "local"   → whisper.cpp CLI (free, requires local installation)
//
// Used by the channel router to auto-transcribe incoming voice messages
// before forwarding the text to the agent loop.

import type { STTConfig } from "../../../shared/config.js";
import { readFileSync, statSync } from "node:fs";
import { getLogger } from "../../../shared/logger.js";

const log = getLogger();

/** Maximum audio file size accepted by OpenAI Whisper API (25 MB). */
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

/** Supported audio MIME types and their file extensions. */
const MIME_TO_EXT: Record<string, string> = {
  "audio/ogg":  "ogg",
  "audio/mpeg": "mp3",
  "audio/mp3":  "mp3",
  "audio/wav":  "wav",
  "audio/wave": "wav",
  "audio/webm": "webm",
  "audio/m4a":  "m4a",
  "audio/mp4":  "m4a",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
};

/**
 * Transcribe an audio file to text.
 *
 * @param audioPath  Absolute path to the audio file on disk.
 * @param config     STT configuration (provider, language, model path).
 * @returns          Transcribed text, or null if transcription fails or is disabled.
 */
export async function transcribe(
  audioPath: string,
  config: STTConfig,
): Promise<string | null> {
  if (config.provider === "disabled") return null;

  try {
    switch (config.provider) {
      case "openai":
        return await transcribeOpenAI(audioPath, config);
      case "local":
        return await transcribeLocal(audioPath, config);
      default:
        log.warn(`STT: unknown provider "${config.provider}"`);
        return null;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`STT transcription failed: ${msg}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// OpenAI Whisper API
// ---------------------------------------------------------------------------

async function transcribeOpenAI(
  audioPath: string,
  config: STTConfig,
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    log.warn("STT: OPENAI_API_KEY not set — cannot transcribe");
    return null;
  }

  // Validate file size
  const stat = statSync(audioPath);
  if (stat.size > MAX_FILE_SIZE_BYTES) {
    log.warn(`STT: audio file too large (${(stat.size / 1024 / 1024).toFixed(1)}MB > 25MB limit)`);
    return null;
  }

  // Detect MIME type from extension
  const ext = audioPath.split(".").pop()?.toLowerCase() ?? "";
  const mimeType = Object.entries(MIME_TO_EXT).find(([, e]) => e === ext)?.[0] ?? "audio/ogg";

  // Build multipart form data
  const audioData = readFileSync(audioPath);
  const blob = new Blob([audioData], { type: mimeType });
  const formData = new FormData();
  formData.append("file", blob, `audio.${ext || "ogg"}`);
  formData.append("model", "whisper-1");
  formData.append("response_format", "json");

  if (config.language) {
    formData.append("language", config.language);
  }

  const baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com";
  const url = baseUrl.endsWith("/v1")
    ? `${baseUrl}/audio/transcriptions`
    : `${baseUrl}/v1/audio/transcriptions`;

  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    log.warn(`STT OpenAI error ${response.status}: ${errorText}`);
    return null;
  }

  const result = (await response.json()) as { text?: string };
  const text = result.text?.trim();

  if (text) {
    log.debug(`STT: transcribed ${(stat.size / 1024).toFixed(0)}KB audio → ${text.length} chars`);
  }

  return text || null;
}

// ---------------------------------------------------------------------------
// Local whisper — auto-detects whisper.cpp vs OpenAI Python whisper
// ---------------------------------------------------------------------------

/**
 * Detect which whisper CLI variant is installed.
 * - whisper.cpp: `whisper -h` mentions "-f" flag
 * - OpenAI Python whisper: `whisper -h` mentions "--model MODEL"
 * Falls back to "whisper-cpp" to try the Homebrew binary name.
 */
async function detectWhisperVariant(): Promise<"whisper-cpp" | "python" | null> {
  const { spawnSync } = await import("node:child_process");

  // Try `whisper` first
  const result = spawnSync("whisper", ["--help"], { timeout: 5_000 });
  if (result.status === 0 || result.stderr?.length) {
    const output = (result.stdout?.toString() ?? "") + (result.stderr?.toString() ?? "");
    if (output.includes("--model MODEL") || output.includes("output_format")) {
      return "python";
    }
    if (output.includes("-f ") || output.includes("whisper.cpp")) {
      return "whisper-cpp";
    }
    // If help output exists but doesn't match either pattern, assume Python
    if (output.length > 0) return "python";
  }

  // Try `whisper-cpp` (Homebrew installs as whisper-cpp)
  const cppResult = spawnSync("whisper-cpp", ["--help"], { timeout: 5_000 });
  if (cppResult.status === 0 || cppResult.stdout?.length) {
    return "whisper-cpp";
  }

  return null;
}

async function transcribeLocal(
  audioPath: string,
  config: STTConfig,
): Promise<string | null> {
  const { spawn } = await import("node:child_process");
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");

  const variant = await detectWhisperVariant();
  if (!variant) {
    log.warn("STT: no whisper CLI found. Install: pip install openai-whisper OR brew install whisper-cpp");
    return null;
  }

  if (variant === "python") {
    return transcribeWithPythonWhisper(audioPath, config, spawn);
  }

  return transcribeWithWhisperCpp(audioPath, config, spawn);
}

/** Transcribe using OpenAI's Python `whisper` package. */
function transcribeWithPythonWhisper(
  audioPath: string,
  config: STTConfig,
  spawn: typeof import("node:child_process").spawn,
): Promise<string | null> {
  const { tmpdir } = require("node:os");
  const { readFileSync } = require("node:fs");
  const { join, basename } = require("node:path");

  const outputDir = tmpdir();
  const args = [
    audioPath,
    "--model", config.modelPath ?? "tiny",
    "--output_format", "txt",
    "--output_dir", outputDir,
  ];

  if (config.language) {
    args.push("--language", config.language);
  }

  return new Promise<string | null>((resolve) => {
    const proc = spawn("whisper", args, { timeout: 120_000 });

    let stderr = "";
    proc.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

    proc.on("close", (code) => {
      if (code === 0) {
        // Python whisper writes output to <outputDir>/<inputFilename>.txt
        const baseName = basename(audioPath).replace(/\.[^.]+$/, "");
        const txtPath = join(outputDir, `${baseName}.txt`);
        try {
          const text = readFileSync(txtPath, "utf-8").trim();
          if (text) {
            log.debug(`STT python-whisper: transcribed → ${text.length} chars`);
            // Clean up the output file
            try { require("node:fs").unlinkSync(txtPath); } catch { /* non-fatal */ }
            resolve(text);
            return;
          }
        } catch {
          log.debug(`STT python-whisper: could not read output file ${txtPath}`);
        }
      }
      if (stderr) log.debug(`STT python-whisper stderr: ${stderr.slice(0, 200)}`);
      resolve(null);
    });

    proc.on("error", (err) => {
      log.warn(`STT python-whisper error: ${err.message}`);
      resolve(null);
    });
  });
}

/** Transcribe using whisper.cpp CLI. */
function transcribeWithWhisperCpp(
  audioPath: string,
  config: STTConfig,
  spawn: typeof import("node:child_process").spawn,
): Promise<string | null> {
  const args = [
    "-f", audioPath,
    "--output-txt",
    "--no-timestamps",
  ];

  if (config.modelPath) {
    args.push("-m", config.modelPath);
  }

  if (config.language) {
    args.push("-l", config.language);
  }

  // Use whisper-cpp binary name if that's what's installed
  const bin = "whisper-cpp";

  return new Promise<string | null>((resolve) => {
    const proc = spawn(bin, args, { timeout: 120_000 });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
    proc.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

    proc.on("close", (code) => {
      if (code === 0 && stdout.trim()) {
        log.debug(`STT whisper.cpp: transcribed → ${stdout.trim().length} chars`);
        resolve(stdout.trim());
      } else {
        if (stderr) log.debug(`STT whisper.cpp stderr: ${stderr}`);
        resolve(null);
      }
    });

    proc.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        log.warn("STT: whisper-cpp not found. Install: brew install whisper-cpp");
      } else {
        log.warn(`STT whisper.cpp error: ${err.message}`);
      }
      resolve(null);
    });
  });
}
