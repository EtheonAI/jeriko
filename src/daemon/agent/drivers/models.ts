// Model registry — the single source of truth for model capabilities.
//
// ALL capability data is dynamic:
//   - Anthropic + OpenAI → fetched from models.dev at boot
//   - Local/Ollama       → probed from Ollama's /api/show at first use
//
// ZERO hardcoded model lists. Every decision in the system (tools, reasoning,
// compaction, max output) reads from this registry.

import { getLogger } from "../../../shared/logger.js";

const log = getLogger();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Everything the system needs to know about a model's capabilities. */
export interface ModelCapabilities {
  /** Real API model ID (e.g., "claude-sonnet-4-6", "gpt-4o"). */
  id: string;
  /** Provider ("anthropic", "openai", "local"). */
  provider: string;
  /** Model family (e.g., "claude-sonnet", "gpt", "llama"). */
  family: string;
  /** Context window size in tokens. */
  context: number;
  /** Maximum output tokens per response. */
  maxOutput: number;
  /** Supports native function/tool calling. */
  toolCall: boolean;
  /** Supports reasoning/thinking mode. */
  reasoning: boolean;
  /** Cost per 1M input tokens (USD). 0 for local models. */
  costInput: number;
  /** Cost per 1M output tokens (USD). 0 for local models. */
  costOutput: number;
}

// ---------------------------------------------------------------------------
// Registry state
// ---------------------------------------------------------------------------

/** All models indexed by "provider:modelId" composite key. */
const capIndex = new Map<string, ModelCapabilities>();

/** Per-provider alias → model ID mappings (built from fetched data). */
const aliasIndex = new Map<string, Map<string, string>>();

/** Cached local model probes (Ollama /api/show results). */
const localProbeCache = new Map<string, ModelCapabilities>();

/** Whether we've successfully fetched from models.dev. */
let fetched = false;

// ---------------------------------------------------------------------------
// Static alias fallbacks — ONLY for alias→ID mapping when offline.
// No capabilities are hardcoded — those come from models.dev or Ollama probe.
// ---------------------------------------------------------------------------

const STATIC_ALIASES: Record<string, Record<string, string>> = {
  anthropic: {
    claude:            "claude-sonnet-4-6",
    "claude-sonnet":   "claude-sonnet-4-6",
    sonnet:            "claude-sonnet-4-6",
    "claude-opus":     "claude-opus-4-6",
    opus:              "claude-opus-4-6",
    "claude-haiku":    "claude-haiku-4-5-20251001",
    haiku:             "claude-haiku-4-5-20251001",
    anthropic:         "claude-sonnet-4-6",
  },
  openai: {
    openai:  "gpt-4o",
    gpt:     "gpt-4o",
    gpt4:    "gpt-4o",
    "gpt-4": "gpt-4o",
    gpt5:    "gpt-5",
    "gpt-5": "gpt-5",
  },
  "claude-code": {
    "claude-code": "claude-sonnet-4-6",
    cc:            "claude-sonnet-4-6",
  },
};

/** Fallback capabilities — ONLY used when models.dev AND Ollama probe both fail. */
const FALLBACK_CAPS: Record<string, ModelCapabilities> = {
  anthropic: {
    id: "claude-sonnet-4-6", provider: "anthropic", family: "claude-sonnet",
    context: 200_000, maxOutput: 64_000, toolCall: true, reasoning: true,
    costInput: 3, costOutput: 15,
  },
  openai: {
    id: "gpt-4o", provider: "openai", family: "gpt",
    context: 128_000, maxOutput: 16_384, toolCall: true, reasoning: false,
    costInput: 2.5, costOutput: 10,
  },
  local: {
    id: "llama3", provider: "local", family: "llama",
    context: 32_768, maxOutput: 4_096, toolCall: false, reasoning: false,
    costInput: 0, costOutput: 0,
  },
  "claude-code": {
    id: "claude-sonnet-4-6", provider: "claude-code", family: "claude-code",
    context: 200_000, maxOutput: 16_384, toolCall: false, reasoning: true,
    costInput: 0, costOutput: 0,
  },
};

// ---------------------------------------------------------------------------
// Fetch from models.dev (Anthropic + OpenAI)
// ---------------------------------------------------------------------------

const MODELS_URL = "https://models.dev/api.json";
const FETCH_TIMEOUT = 8_000;

/**
 * Fetch the model registry from models.dev.
 * Called once at daemon boot. Non-fatal — falls back to static defaults.
 */
export async function loadModelRegistry(): Promise<void> {
  try {
    const resp = await fetch(MODELS_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!resp.ok) {
      log.warn(`Model registry fetch failed: HTTP ${resp.status}`);
      return;
    }

    const data = (await resp.json()) as Record<string, unknown>;
    parseRegistry(data);
    fetched = true;
    log.info(`Model registry loaded: ${capIndex.size} models from models.dev`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`Model registry fetch failed (using static fallbacks): ${msg}`);
  }
}

function parseRegistry(data: Record<string, unknown>): void {
  const providers = ["anthropic", "openai"];

  for (const providerId of providers) {
    const provider = data[providerId] as Record<string, unknown> | undefined;
    if (!provider || typeof provider !== "object") continue;

    const models = provider.models as Record<string, unknown> | undefined;
    if (!models || typeof models !== "object") continue;

    const providerAliases = new Map<string, string>();

    for (const [modelId, raw] of Object.entries(models)) {
      if (!raw || typeof raw !== "object") continue;
      const m = raw as Record<string, unknown>;

      const family = (m.family as string) ?? "";
      const status = (m.status as string) ?? "active";
      if (family.includes("embedding") || status === "deprecated") continue;

      const limit = (m.limit as Record<string, unknown>) ?? {};
      const cost = (m.cost as Record<string, unknown>) ?? {};

      const caps: ModelCapabilities = {
        id: modelId,
        provider: providerId,
        family,
        context: (limit.context as number) ?? 0,
        maxOutput: (limit.output as number) ?? 0,
        toolCall: (m.tool_call as boolean) ?? false,
        reasoning: (m.reasoning as boolean) ?? false,
        costInput: (cost.input as number) ?? 0,
        costOutput: (cost.output as number) ?? 0,
      };

      capIndex.set(`${providerId}:${modelId}`, caps);
      providerAliases.set(modelId, modelId);
      if (family && !providerAliases.has(family)) {
        providerAliases.set(family, modelId);
      }
    }

    aliasIndex.set(providerId, providerAliases);
    updateFamilyDefaults(providerId);
  }
}

/** For each family, pick the best model (latest, most capable). */
function updateFamilyDefaults(providerId: string): void {
  const families = new Map<string, ModelCapabilities[]>();

  for (const [key, caps] of capIndex) {
    if (!key.startsWith(`${providerId}:`)) continue;
    const list = families.get(caps.family) ?? [];
    list.push(caps);
    families.set(caps.family, list);
  }

  const aliases = aliasIndex.get(providerId);
  if (!aliases) return;

  for (const [family, models] of families) {
    if (models.length === 0) continue;
    const best = pickBest(models);
    aliases.set(family, best.id);
  }
}

function pickBest(models: ModelCapabilities[]): ModelCapabilities {
  return [...models].sort((a, b) => {
    if (a.toolCall !== b.toolCall) return a.toolCall ? -1 : 1;
    if (a.reasoning !== b.reasoning) return a.reasoning ? -1 : 1;
    if (a.maxOutput !== b.maxOutput) return b.maxOutput - a.maxOutput;
    if (a.context !== b.context) return b.context - a.context;
    return b.id.localeCompare(a.id);
  })[0]!;
}

// ---------------------------------------------------------------------------
// Ollama probe — dynamic detection of local model capabilities
// ---------------------------------------------------------------------------

/**
 * Probe Ollama's /api/show endpoint to detect a local model's capabilities.
 * Returns cached result if already probed.
 *
 * Detects:
 *   - context window from model_info.general.context_length or parameters
 *   - tool calling from template format ({{- if .Tools }})
 *   - max output from model parameters or defaults
 */
export async function probeLocalModel(modelId: string): Promise<ModelCapabilities> {
  // Return cached probe
  const cached = localProbeCache.get(modelId);
  if (cached) return cached;

  const baseUrl = getOllamaBaseUrl();
  let context = 32_768;
  let maxOutput = 4_096;
  let toolCall = false;
  const family = modelId.split(":")[0] ?? modelId;

  try {
    const resp = await fetch(`${baseUrl}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: modelId }),
      signal: AbortSignal.timeout(5_000),
    });

    if (resp.ok) {
      const data = (await resp.json()) as Record<string, unknown>;

      // Extract context length from model_info
      const modelInfo = data.model_info as Record<string, unknown> | undefined;
      if (modelInfo) {
        const ctxLen = modelInfo["general.context_length"] as number | undefined;
        if (ctxLen && ctxLen > 0) context = ctxLen;
      }

      // Extract from parameters string (e.g., "num_ctx 131072\n...")
      const params = data.parameters as string | undefined;
      if (params) {
        const ctxMatch = params.match(/num_ctx\s+(\d+)/);
        if (ctxMatch) context = parseInt(ctxMatch[1]!, 10);

        const predictMatch = params.match(/num_predict\s+(\d+)/);
        if (predictMatch) maxOutput = parseInt(predictMatch[1]!, 10);
      }

      // Detect tool calling from template
      const template = data.template as string | undefined;
      if (template) {
        // Ollama templates that support tools contain tool-related template blocks
        toolCall = template.includes(".Tools") ||
                   template.includes("tools") ||
                   template.includes("<tool_call>") ||
                   template.includes("function_call");

        // Cloud-proxied models use a minimal passthrough template ("{{ .Prompt }}")
        // and support tools natively via the underlying API. Detect by:
        //   1. Template is just "{{ .Prompt }}" (passthrough)
        //   2. Model name contains "cloud" (convention for Ollama cloud proxies)
        const isPassthrough = template.trim() === "{{ .Prompt }}";
        const isCloudModel = modelId.toLowerCase().includes("cloud");
        if (!toolCall && (isPassthrough || isCloudModel)) {
          toolCall = true;
          log.debug(`Ollama probe "${modelId}": detected cloud/passthrough model — enabling tools`);
        }
      }

      // Max output: default to context/4 if not explicitly set, capped at 32K
      if (maxOutput === 4_096 && context > 16_384) {
        maxOutput = Math.min(Math.floor(context / 4), 32_768);
      }

      log.debug(`Ollama probe "${modelId}": ctx=${context} out=${maxOutput} tools=${toolCall}`);
    } else {
      log.debug(`Ollama probe "${modelId}" failed: HTTP ${resp.status}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.debug(`Ollama probe "${modelId}" error: ${msg}`);
  }

  const caps: ModelCapabilities = {
    id: modelId,
    provider: "local",
    family,
    context,
    maxOutput,
    toolCall,
    reasoning: false,
    costInput: 0,
    costOutput: 0,
  };

  localProbeCache.set(modelId, caps);
  return caps;
}

function getOllamaBaseUrl(): string {
  const localUrl = process.env.LOCAL_MODEL_URL;
  if (localUrl) return localUrl.replace(/\/v1\/?$/, "");
  return process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a model alias to a real API model ID.
 *
 * Resolution order:
 *   1. Exact match in capability index
 *   2. Alias match from fetched registry (family-based)
 *   3. Static fallback aliases
 *   4. Pass-through
 */
export function resolveModel(provider: string, alias: string): string {
  const normalized = alias.toLowerCase();

  // 1. Exact match
  if (capIndex.has(`${provider}:${alias}`)) return alias;
  if (capIndex.has(`${provider}:${normalized}`)) return normalized;

  // 2. Dynamic alias from fetched registry
  if (fetched) {
    const aliases = aliasIndex.get(provider);
    if (aliases) {
      const direct = aliases.get(normalized);
      if (direct) return direct;
      for (const [key, modelId] of aliases) {
        if (key.includes(normalized) || normalized.includes(key)) return modelId;
      }
    }
  }

  // 3. Static alias fallback
  const staticMap = STATIC_ALIASES[provider];
  if (staticMap?.[normalized]) return staticMap[normalized]!;

  // 4. Local model: resolve "local"/"ollama" to env var
  if (provider === "local" && (normalized === "local" || normalized === "ollama")) {
    return process.env.LOCAL_MODEL ?? "llama3";
  }

  // 5. Pass-through
  return alias;
}

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

/**
 * Get capabilities for a resolved model ID.
 * For cloud models → reads from models.dev cache.
 * For local models → returns cached Ollama probe result, or a pre-probe default.
 *
 * IMPORTANT: For local models, call probeLocalModel() first (async) to get
 * accurate capabilities. This sync version returns cached data or a fallback.
 */
export function getCapabilities(provider: string, modelId: string): ModelCapabilities {
  // 1. Check models.dev capability index
  const key = `${provider}:${modelId}`;
  const indexed = capIndex.get(key);
  if (indexed) return indexed;

  // 2. Check local probe cache
  const probed = localProbeCache.get(modelId);
  if (probed) return probed;

  // 3. Case-insensitive search
  for (const [k, v] of capIndex) {
    if (k.toLowerCase() === key.toLowerCase()) return v;
  }

  // 4. Provider fallback
  const fallback = FALLBACK_CAPS[provider];
  if (fallback) return { ...fallback, id: modelId };

  // 5. Ultra-conservative default
  return {
    id: modelId,
    provider,
    family: "unknown",
    context: 24_000,
    maxOutput: 4_096,
    toolCall: false,
    reasoning: false,
    costInput: 0,
    costOutput: 0,
  };
}

/**
 * List all known models for a provider.
 */
export function listModels(provider?: string): ModelCapabilities[] {
  const results: ModelCapabilities[] = [];
  for (const [key, caps] of capIndex) {
    if (!provider || key.startsWith(`${provider}:`)) results.push(caps);
  }
  // Include probed local models
  if (!provider || provider === "local") {
    for (const [, caps] of localProbeCache) results.push(caps);
  }
  return results;
}
