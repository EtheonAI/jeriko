/**
 * TUI Setup — Detection logic and provider options for first-launch setup.
 *
 * Pure logic with no SolidJS dependencies — fully testable in isolation.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { getConfigDir } from "../../../shared/config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProviderOption {
  /** Internal identifier: "anthropic", "openai", "local" */
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
// Provider options
// ---------------------------------------------------------------------------

export const PROVIDER_OPTIONS: readonly ProviderOption[] = [
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
] as const;

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
