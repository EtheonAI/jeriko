// Media service — Image generation.
//
// Provider-agnostic interface for generating images from text prompts.
// Currently supports:
//   - "openai"  → DALL-E 3 (via OpenAI Images API)
//   - "auto"    → first available provider with API key set
//
// Used by the `generate_image` agent tool. Generated images are saved
// to tmpdir and their paths are returned in JSON — the channel router
// auto-detects image extensions and sends them via sendPhoto().

import type { ImageGenConfig } from "../../../shared/config.js";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { getLogger } from "../../../shared/logger.js";
import { withHttpRetry } from "../../../shared/http-retry.js";
import { redact } from "../../security/redaction.js";

const log = getLogger();

/** Retry budget for single-shot image generation — see tts.ts for rationale. */
const MEDIA_HTTP_RETRIES = 2;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of an image generation request. */
export interface ImageGenResult {
  /** Local file path to the generated image. */
  path: string;
  /** Original URL from the provider (if applicable). */
  url?: string;
  /** DALL-E 3 may revise the prompt for better results. */
  revisedPrompt?: string;
}

export interface ImageGenOptions {
  /** Text prompt describing the desired image. */
  prompt: string;
  /** Image dimensions: "1024x1024", "1024x1792", "1792x1024". */
  size?: string;
  /** Style: "vivid" or "natural" (DALL-E 3 only). */
  style?: string;
  /** Explicit provider override (default: auto). */
  provider?: string;
}

/** Valid DALL-E 3 sizes. */
const VALID_SIZES = new Set(["1024x1024", "1024x1792", "1792x1024"]);

/** Valid DALL-E 3 styles. */
const VALID_STYLES = new Set(["vivid", "natural"]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate an image from a text prompt.
 *
 * @param options  Generation parameters (prompt, size, style, provider).
 * @param config   Image generation config from JerikoConfig.media.imageGen.
 * @returns        Result with local file path, or throws on failure.
 */
export async function generateImage(
  options: ImageGenOptions,
  config?: ImageGenConfig,
): Promise<ImageGenResult> {
  if (!options.prompt?.trim()) {
    throw new Error("Image generation requires a non-empty prompt");
  }

  const provider = resolveProvider(options.provider, config);

  switch (provider) {
    case "openai":
      return generateOpenAI(options, config);
    default:
      throw new Error(
        `Image generation provider "${provider}" is not available. ` +
        `Set OPENAI_API_KEY for DALL-E 3.`,
      );
  }
}

// ---------------------------------------------------------------------------
// Provider resolution
// ---------------------------------------------------------------------------

function resolveProvider(
  explicit?: string,
  config?: ImageGenConfig,
): string {
  // Explicit override from tool call args
  if (explicit && explicit !== "auto") return explicit;

  // Config-level default
  const configProvider = config?.provider ?? "auto";
  if (configProvider !== "auto") return configProvider;

  // Auto-detect: check which API keys are available
  if (process.env.OPENAI_API_KEY) return "openai";

  throw new Error(
    "No image generation provider available. " +
    "Set OPENAI_API_KEY for DALL-E 3.",
  );
}

// ---------------------------------------------------------------------------
// OpenAI DALL-E 3
// ---------------------------------------------------------------------------

async function generateOpenAI(
  options: ImageGenOptions,
  config?: ImageGenConfig,
): Promise<ImageGenResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not set — cannot generate images");
  }

  const size = resolveSize(options.size, config?.defaultSize);
  const style = resolveStyle(options.style, config?.defaultStyle);

  const baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com";
  const url = baseUrl.endsWith("/v1")
    ? `${baseUrl}/images/generations`
    : `${baseUrl}/v1/images/generations`;

  const response = await withHttpRetry(() => fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt: options.prompt,
      n: 1,
      size,
      style,
      response_format: "url",
    }),
    signal: AbortSignal.timeout(120_000),
  }), { maxRetries: MEDIA_HTTP_RETRIES });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DALL-E 3 error ${response.status}: ${redact(errorText)}`);
  }

  const result = (await response.json()) as {
    data?: Array<{ url?: string; revised_prompt?: string }>;
  };

  const imageData = result.data?.[0];
  if (!imageData?.url) {
    throw new Error("DALL-E 3 returned no image URL");
  }

  // Download the generated image to a local file
  const imageResponse = await withHttpRetry(() => fetch(imageData.url!, {
    signal: AbortSignal.timeout(60_000),
  }), { maxRetries: MEDIA_HTTP_RETRIES });

  if (!imageResponse.ok) {
    throw new Error(`Failed to download generated image: HTTP ${imageResponse.status}`);
  }

  const imageBytes = new Uint8Array(await imageResponse.arrayBuffer());
  const outputPath = join(tmpdir(), `jeriko-image-${randomUUID()}.png`);
  writeFileSync(outputPath, imageBytes);

  log.info(`Image generated: ${outputPath} (${(imageBytes.length / 1024).toFixed(0)}KB, DALL-E 3)`);

  return {
    path: outputPath,
    url: imageData.url,
    revisedPrompt: imageData.revised_prompt,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveSize(explicit?: string, configDefault?: string): string {
  if (explicit && VALID_SIZES.has(explicit)) return explicit;
  if (configDefault && VALID_SIZES.has(configDefault)) return configDefault;
  return "1024x1024";
}

function resolveStyle(explicit?: string, configDefault?: string): string {
  if (explicit && VALID_STYLES.has(explicit)) return explicit;
  if (configDefault && VALID_STYLES.has(configDefault)) return configDefault;
  return "vivid";
}
