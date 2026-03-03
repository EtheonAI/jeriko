/**
 * Provider Presets — Built-in registry of well-known LLM providers.
 *
 * Each preset defines a provider's API endpoint, env var for the API key,
 * and default model. When the corresponding environment variable is set,
 * the provider is auto-discovered and registered as an OpenAI-compatible driver.
 *
 * This enables zero-config provider setup:
 *   export GROQ_API_KEY=gsk_...
 *   jeriko ask "hello" --model groq:llama-3.1-8b-instant
 *
 * Presets are layered UNDER explicit config — if a user has a `providers[]`
 * entry in config.json with the same ID, the config entry wins.
 *
 * The registry is derived from models.dev and covers all major providers.
 */

import type { ProviderConfig } from "../../../shared/config.js";

// ---------------------------------------------------------------------------
// Preset definition
// ---------------------------------------------------------------------------

export interface ProviderPreset {
  /** Registry ID (used as driver name and provider:model prefix). */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** OpenAI-compatible API base URL. */
  baseUrl: string;
  /** Environment variable name for the API key. */
  envKey: string;
  /** Optional secondary env var (for providers that support multiple). */
  envKeyAlt?: string;
  /** Default model to use when no model suffix is given. */
  defaultModel?: string;
  /** Extra headers required by this provider. */
  headers?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// The preset registry — ordered by popularity/importance
// ---------------------------------------------------------------------------

export const PROVIDER_PRESETS: ReadonlyArray<ProviderPreset> = [
  // --- Tier 1: Major cloud providers ---
  {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    envKey: "OPENROUTER_API_KEY",
    defaultModel: "anthropic/claude-sonnet-4",
  },
  {
    id: "groq",
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    envKey: "GROQ_API_KEY",
    defaultModel: "llama-3.1-8b-instant",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    envKey: "DEEPSEEK_API_KEY",
    defaultModel: "deepseek-chat",
  },
  {
    id: "google",
    name: "Google (Gemini)",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    envKey: "GEMINI_API_KEY",
    envKeyAlt: "GOOGLE_GENERATIVE_AI_API_KEY",
    defaultModel: "gemini-2.5-pro",
  },
  {
    id: "xai",
    name: "xAI (Grok)",
    baseUrl: "https://api.x.ai/v1",
    envKey: "XAI_API_KEY",
    defaultModel: "grok-3-latest",
  },
  {
    id: "mistral",
    name: "Mistral",
    baseUrl: "https://api.mistral.ai/v1",
    envKey: "MISTRAL_API_KEY",
    defaultModel: "mistral-large-latest",
  },

  // --- Tier 2: Inference platforms ---
  {
    id: "together",
    name: "Together AI",
    baseUrl: "https://api.together.xyz/v1",
    envKey: "TOGETHER_API_KEY",
    defaultModel: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
  },
  {
    id: "fireworks",
    name: "Fireworks AI",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    envKey: "FIREWORKS_API_KEY",
    defaultModel: "accounts/fireworks/models/llama-v3p1-8b-instruct",
  },
  {
    id: "deepinfra",
    name: "DeepInfra",
    baseUrl: "https://api.deepinfra.com/v1/openai",
    envKey: "DEEPINFRA_API_KEY",
    defaultModel: "meta-llama/Meta-Llama-3.1-8B-Instruct",
  },
  {
    id: "cerebras",
    name: "Cerebras",
    baseUrl: "https://api.cerebras.ai/v1",
    envKey: "CEREBRAS_API_KEY",
    defaultModel: "llama3.1-8b",
  },
  {
    id: "perplexity",
    name: "Perplexity",
    baseUrl: "https://api.perplexity.ai",
    envKey: "PERPLEXITY_API_KEY",
    defaultModel: "sonar-pro",
  },
  {
    id: "cohere",
    name: "Cohere",
    baseUrl: "https://api.cohere.com/v2",
    envKey: "COHERE_API_KEY",
    defaultModel: "command-r-plus",
  },

  // --- Tier 3: Platform integrations ---
  {
    id: "github-models",
    name: "GitHub Models",
    baseUrl: "https://models.github.ai/inference",
    envKey: "GITHUB_TOKEN",
    defaultModel: "openai/gpt-4o",
  },
  {
    id: "nvidia",
    name: "Nvidia",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    envKey: "NVIDIA_API_KEY",
    defaultModel: "meta/llama-3.1-8b-instruct",
  },
  {
    id: "nebius",
    name: "Nebius",
    baseUrl: "https://api.tokenfactory.nebius.com/v1",
    envKey: "NEBIUS_API_KEY",
    defaultModel: "meta-llama/meta-llama-3.1-8b-instruct",
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    baseUrl: "https://router.huggingface.co/v1",
    envKey: "HF_TOKEN",
    defaultModel: "meta-llama/Meta-Llama-3.1-8B-Instruct",
  },

  // --- Tier 4: Aggregators & gateways ---
  {
    id: "requesty",
    name: "Requesty",
    baseUrl: "https://router.requesty.ai/v1",
    envKey: "REQUESTY_API_KEY",
    defaultModel: "anthropic/claude-sonnet-4",
  },
  {
    id: "helicone",
    name: "Helicone",
    baseUrl: "https://ai-gateway.helicone.ai/v1",
    envKey: "HELICONE_API_KEY",
    defaultModel: "gpt-4o",
  },

  // --- Tier 5: Regional / specialized ---
  {
    id: "alibaba",
    name: "Alibaba (DashScope)",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    envKey: "DASHSCOPE_API_KEY",
    defaultModel: "qwen-plus",
  },
  {
    id: "siliconflow",
    name: "SiliconFlow",
    baseUrl: "https://api.siliconflow.com/v1",
    envKey: "SILICONFLOW_API_KEY",
    defaultModel: "deepseek-ai/DeepSeek-V3",
  },
  {
    id: "novita",
    name: "Novita AI",
    baseUrl: "https://api.novita.ai/openai",
    envKey: "NOVITA_API_KEY",
    defaultModel: "meta-llama/llama-3.1-8b-instruct",
  },
  {
    id: "sambanova",
    name: "SambaNova",
    baseUrl: "https://api.sambanova.ai/v1",
    envKey: "SAMBANOVA_API_KEY",
    defaultModel: "Meta-Llama-3.1-8B-Instruct",
  },

  // --- Tier 6: Local model servers ---
  {
    id: "lmstudio",
    name: "LM Studio",
    baseUrl: "http://127.0.0.1:1234/v1",
    envKey: "LMSTUDIO_API_KEY",  // Often not needed, but env var enables auto-discovery
  },
];

// ---------------------------------------------------------------------------
// Discovery — find presets where the API key env var is set
// ---------------------------------------------------------------------------

/**
 * Discover all presets whose environment variable is set.
 *
 * Returns ProviderConfig entries ready for registerCustomProviders().
 * Skips presets that conflict with existing config entries (by ID).
 *
 * @param existingIds  Set of provider IDs already in config.providers[]
 */
export function discoverProviderPresets(
  existingIds: ReadonlySet<string>,
): ProviderConfig[] {
  const discovered: ProviderConfig[] = [];

  for (const preset of PROVIDER_PRESETS) {
    // Skip if already configured explicitly
    if (existingIds.has(preset.id)) continue;

    // Check primary env var, then alt
    const apiKey = process.env[preset.envKey]
      ?? (preset.envKeyAlt ? process.env[preset.envKeyAlt] : undefined);

    if (!apiKey) continue;

    discovered.push({
      id: preset.id,
      name: preset.name,
      baseUrl: preset.baseUrl,
      apiKey: `{env:${preset.envKey}}`,
      type: "openai-compatible",
      ...(preset.defaultModel ? { defaultModel: preset.defaultModel } : {}),
      ...(preset.headers ? { headers: preset.headers } : {}),
    });
  }

  return discovered;
}

/**
 * Get all known presets (for display in `jeriko provider list`).
 */
export function listPresets(): ReadonlyArray<ProviderPreset> {
  return PROVIDER_PRESETS;
}

/**
 * Look up a preset by ID.
 */
export function getPreset(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id);
}
