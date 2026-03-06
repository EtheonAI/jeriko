/**
 * CLI Setup — Detection logic and provider options for first-launch setup.
 *
 * Provider options are derived from the preset registry (presets.ts) plus
 * built-in drivers. This ensures onboarding shows the same providers
 * available throughout the system — no hardcoded subset.
 *
 * Pure logic with no UI dependencies — fully testable in isolation.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { getConfigDir } from "../../shared/config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChannelChoice = "telegram" | "whatsapp" | "skip";

export interface ChannelOption {
  /** Internal identifier */
  id: ChannelChoice;
  /** Display name shown in the wizard */
  name: string;
  /** Short hint shown beside the option */
  hint?: string;
}

export interface ProviderOption {
  /** Internal identifier: "anthropic", "openai", "local", or preset ID */
  id: string;
  /** Display name shown in the setup wizard */
  name: string;
  /** Environment variable key for the API key */
  envKey: string;
  /** Model identifier written to config */
  model: string;
  /** Whether this provider requires an API key */
  needsApiKey: boolean;
}

// ---------------------------------------------------------------------------
// Channel options
// ---------------------------------------------------------------------------

export const CHANNEL_OPTIONS: readonly ChannelOption[] = [
  {
    id: "telegram",
    name: "Telegram",
    hint: "requires bot token from @BotFather",
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    hint: "pairs via QR code at daemon start",
  },
  {
    id: "skip",
    name: "Skip — I'll set it up later",
    hint: "/channel add",
  },
] as const;

// ---------------------------------------------------------------------------
// Provider options — built from preset registry + built-in drivers
// ---------------------------------------------------------------------------

/** Built-in providers that are always available (not from presets). */
const BUILT_IN_PROVIDERS: readonly ProviderOption[] = [
  {
    id: "anthropic",
    name: "Claude (Anthropic)",
    envKey: "ANTHROPIC_API_KEY",
    model: "claude",
    needsApiKey: true,
  },
  {
    id: "openai",
    name: "GPT (OpenAI)",
    envKey: "OPENAI_API_KEY",
    model: "gpt4",
    needsApiKey: true,
  },
  {
    id: "local",
    name: "Local (Ollama)",
    envKey: "",
    model: "local",
    needsApiKey: false,
  },
];

/**
 * Build the full provider option list for setup/onboarding.
 *
 * Order: built-in first (Anthropic, OpenAI, Ollama), then presets from the
 * registry sorted by tier (major cloud → inference platforms → local servers).
 *
 * Presets that overlap with built-in drivers (e.g. "lmstudio") are included
 * since they have different base URLs and auth requirements.
 */
export function getProviderOptions(): ProviderOption[] {
  const options: ProviderOption[] = [...BUILT_IN_PROVIDERS];
  const builtInIds = new Set(BUILT_IN_PROVIDERS.map((p) => p.id));

  try {
    // Dynamic import to avoid circular dependency — presets.ts is in daemon layer
    const { PROVIDER_PRESETS } = require("../../daemon/agent/drivers/presets.js");

    for (const preset of PROVIDER_PRESETS) {
      if (builtInIds.has(preset.id)) continue;

      options.push({
        id: preset.id,
        name: preset.name,
        envKey: preset.envKey,
        model: preset.defaultModel
          ? `${preset.id}:${preset.defaultModel}`
          : preset.id,
        needsApiKey: true,
      });
    }
  } catch {
    // Presets not available (e.g. in test) — built-in only
  }

  return options;
}

/**
 * Static subset for backward compatibility.
 * Used by tests that import PROVIDER_OPTIONS directly.
 */
export const PROVIDER_OPTIONS: readonly ProviderOption[] = BUILT_IN_PROVIDERS;

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Determine whether the first-launch setup wizard should be shown.
 *
 * Returns true when BOTH:
 *   1. No config file exists at ~/.config/jeriko/config.json
 *   2. No API key env vars are set (ANTHROPIC_API_KEY, OPENAI_API_KEY)
 *
 * This means returning users with env vars skip setup entirely,
 * and users who have already run init (config exists) also skip.
 */
export function needsSetup(): boolean {
  // If config already exists, user has been through init
  const configPath = join(getConfigDir(), "config.json");
  if (existsSync(configPath)) return false;

  // If any API key is present in env, user knows what they're doing
  if (process.env.ANTHROPIC_API_KEY) return false;
  if (process.env.OPENAI_API_KEY) return false;

  return true;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Basic validation for an API key string.
 * Checks: non-empty, minimum length, no whitespace.
 */
export function validateApiKey(key: string): boolean {
  const trimmed = key.trim();
  if (trimmed.length < 10) return false;
  if (/\s/.test(trimmed)) return false;
  return true;
}
