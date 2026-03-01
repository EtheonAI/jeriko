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
import { registerDriver } from "./index.js";
import { registerProviderAliases } from "./models.js";
import { getLogger } from "../../../shared/logger.js";

const log = getLogger();

/**
 * Register custom providers from config.
 *
 * For each ProviderConfig:
 *   1. Creates an OpenAICompatibleDriver instance
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

    // Only openai-compatible is supported for now
    if (config.type && config.type !== "openai-compatible") {
      log.warn(`Skipping provider "${config.id}": unsupported type "${config.type}"`);
      continue;
    }

    const driver = new OpenAICompatibleDriver(config);
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
