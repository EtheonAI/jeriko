// Custom provider registration — creates driver instances from config at boot.
//
// Reads ProviderConfig[] from the Jeriko config and registers each one as:
//   1. An OpenAICompatibleDriver in the driver registry
//   2. Model aliases in the model registry (for resolveModel() lookups)
//
// Usage in kernel.ts boot step 7:
//   registerCustomProviders(config.providers ?? []);

import type { ProviderConfig } from "../../../shared/config.js";
import { OpenAICompatibleDriver } from "./openai-compat.js";
import { AnthropicCompatibleDriver } from "./anthropic-compat.js";
import { registerDriver, type LLMDriver } from "./index.js";
import { registerProviderAliases } from "./models.js";
import { getLogger } from "../../../shared/logger.js";

const log = getLogger();

/** Supported provider protocol types. */
const SUPPORTED_TYPES = new Set(["openai-compatible", "anthropic"]);

/**
 * Create a driver instance from a provider config.
 *
 * Routes to the correct driver class based on the `type` field:
 *   - "openai-compatible" (default) → OpenAICompatibleDriver
 *   - "anthropic" → AnthropicCompatibleDriver
 */
function createDriverFromConfig(config: ProviderConfig): LLMDriver {
  const type = config.type ?? "openai-compatible";
  switch (type) {
    case "anthropic":
      return new AnthropicCompatibleDriver(config);
    case "openai-compatible":
    default:
      return new OpenAICompatibleDriver(config);
  }
}

/**
 * Register custom providers from config.
 *
 * For each ProviderConfig:
 *   1. Creates the appropriate driver (OpenAI-compat or Anthropic-compat)
 *   2. Registers it in the driver registry under the provider's `id`
 *   3. Registers model aliases if a `models` mapping is defined
 *   4. Registers the default model alias if `defaultModel` is defined
 *
 * @param providers  Array of provider configs from JerikoConfig.providers
 */
export function registerCustomProviders(providers: ProviderConfig[]): void {
  for (const config of providers) {
    if (!config.id || !config.baseUrl) {
      log.warn(`Skipping invalid provider config: missing id or baseUrl`);
      continue;
    }

    const type = config.type ?? "openai-compatible";
    if (!SUPPORTED_TYPES.has(type)) {
      log.warn(`Skipping provider "${config.id}": unsupported type "${type}"`);
      continue;
    }

    const driver = createDriverFromConfig(config);
    registerDriver(driver);

    // Register model aliases (short names → real API model IDs)
    const aliases: Record<string, string> = {};

    if (config.models) {
      Object.assign(aliases, config.models);
    }

    // Default model: also add an alias from the provider ID itself to the default model
    // so `--model openrouter` (without a colon-suffix) resolves to the default.
    if (config.defaultModel) {
      aliases[config.id] = config.defaultModel;
    }

    if (Object.keys(aliases).length > 0) {
      registerProviderAliases(config.id, aliases);
    }

    log.info(
      `Custom provider registered: ${config.name} (${config.id}) → ${config.baseUrl}` +
      (config.defaultModel ? ` [default: ${config.defaultModel}]` : ""),
    );
  }
}
