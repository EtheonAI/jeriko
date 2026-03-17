// Model registry — the single source of truth for model capabilities.
//
// ALL capability data is dynamic:
//   - Cloud providers → fetched from models.dev at boot (ALL providers, not just a subset)
//   - Local/Ollama    → probed from Ollama's /api/show, then cross-referenced against
//                       models.dev family index to inherit model-intrinsic properties
//                       (reasoning, context window, output limits)
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
  /** Supports image/vision input (screenshots, photos). */
  vision: boolean;
  /** Supports structured output / JSON mode. */
  structuredOutput: boolean;
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

/** Cached default local model name — populated by fetchOllamaModels() or loadModelRegistry(). */
let cachedDefaultLocalModel: string | null = null;

/**
 * Family-based cross-reference index — maps normalized family names to the best
 * known capabilities for that model family across ALL providers on models.dev.
 *
 * Used to enrich Ollama probes with model-intrinsic properties (reasoning, context,
 * output limits) that can't be detected from Ollama's /api/show endpoint alone.
 *
 * Key: normalized family name (e.g., "deepseek-v3", "llama-4", "qwen3")
 * Value: best ModelCapabilities for that family (highest context, has reasoning, etc.)
 */
const familyCrossRef = new Map<string, ModelCapabilities>();

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

/** Fallback capabilities — ONLY used when models.dev AND Ollama probe both fail.
 *  The local "llama3" ID is a last-resort fallback; at runtime, resolveModel()
 *  prefers the first model detected from Ollama's /api/tags. */
const FALLBACK_CAPS: Record<string, ModelCapabilities> = {
  anthropic: {
    id: "claude-sonnet-4-6", provider: "anthropic", family: "claude-sonnet",
    context: 200_000, maxOutput: 64_000, toolCall: true, reasoning: true,
    vision: true, structuredOutput: true,
    costInput: 3, costOutput: 15,
  },
  openai: {
    id: "gpt-4o", provider: "openai", family: "gpt",
    context: 128_000, maxOutput: 16_384, toolCall: true, reasoning: false,
    vision: true, structuredOutput: true,
    costInput: 2.5, costOutput: 10,
  },
  local: {
    id: "llama3", provider: "local", family: "llama",
    context: 32_768, maxOutput: 4_096, toolCall: false, reasoning: false,
    vision: false, structuredOutput: false,
    costInput: 0, costOutput: 0,
  },
  "claude-code": {
    id: "claude-sonnet-4-6", provider: "claude-code", family: "claude-code",
    context: 200_000, maxOutput: 16_384, toolCall: false, reasoning: true,
    vision: true, structuredOutput: true,
    costInput: 0, costOutput: 0,
  },
};

// ---------------------------------------------------------------------------
// Fetch from models.dev (all providers)
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
    if (resp.ok) {
      const data = (await resp.json()) as Record<string, unknown>;
      parseRegistry(data);
      fetched = true;
      log.info(`Model registry loaded: ${capIndex.size} models from models.dev`);
    } else {
      log.warn(`Model registry fetch failed: HTTP ${resp.status}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`Model registry fetch failed (using static fallbacks): ${msg}`);
  }

  // Populate local models from Ollama — probe all installed models so they
  // appear in listModels() immediately. Without this, local models are absent
  // from the /model picker until individually probed on first chat use.
  try {
    const models = await fetchOllamaModels();
    if (models.length > 0) {
      if (!cachedDefaultLocalModel) {
        cachedDefaultLocalModel = models[0]!.id;
      }
      // Probe all models in parallel — populates localProbeCache so
      // listModels() returns them. Probes are cached, so subsequent
      // calls (e.g. during agent loop) are free.
      await Promise.all(models.map((m) => probeLocalModel(m.id)));
      log.info(`Ollama models loaded: ${models.length} models probed`);
    }
  } catch {
    // Non-fatal — local models will be probed lazily on first use
  }
}

function parseRegistry(data: Record<string, unknown>): void {
  // Parse ALL providers from models.dev — not a hardcoded subset.
  // This builds a comprehensive capability index used for:
  //   1. Direct model resolution (anthropic, openai — our native drivers)
  //   2. Cross-referencing Ollama cloud models against known capabilities
  //      (e.g., deepseek-v3 under deepinfra → reasoning: true)
  for (const providerId of Object.keys(data)) {
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
        vision: (m.vision as boolean) ?? false,
        structuredOutput: (m.structured_output as boolean) ?? (m.json_mode as boolean) ?? false,
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

  // After parsing all providers, build the family cross-reference index.
  // This enables Ollama cloud models to inherit capabilities (reasoning, context,
  // output limits) from the authoritative models.dev data.
  buildFamilyCrossRef();
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
// Family cross-reference — maps Ollama model names to models.dev capabilities
// ---------------------------------------------------------------------------

/**
 * Build the family cross-reference index from all parsed capIndex entries.
 * For each unique normalized family name, keep the entry with the richest
 * capabilities (highest context, has reasoning, has tool_call).
 *
 * Also indexes by normalized model ID for direct name matching.
 */
function buildFamilyCrossRef(): void {
  familyCrossRef.clear();

  for (const [, caps] of capIndex) {
    if (!caps.family) continue;

    // Index by normalized family name
    const normFamily = normalizeModelName(caps.family);
    indexCrossRef(normFamily, caps);

    // Also index by normalized model ID for direct matches
    // e.g., "deepseek-v3-0324" can match "deepseek-v3" from Ollama
    const normId = normalizeModelName(caps.id);
    if (normId !== normFamily) {
      indexCrossRef(normId, caps);
    }
  }

  log.debug(`Family cross-ref built: ${familyCrossRef.size} entries from ${capIndex.size} models`);
}

function indexCrossRef(key: string, caps: ModelCapabilities): void {
  const existing = familyCrossRef.get(key);
  if (!existing || scoreCaps(caps) > scoreCaps(existing)) {
    familyCrossRef.set(key, caps);
  }
}

/** Score capabilities for comparison — higher = more capable. */
function scoreCaps(caps: ModelCapabilities): number {
  return (
    (caps.toolCall ? 4 : 0) +
    (caps.reasoning ? 4 : 0) +
    (caps.vision ? 2 : 0) +
    (caps.context > 0 ? 2 : 0) +
    (caps.maxOutput > 0 ? 1 : 0)
  );
}

/**
 * Normalize a model or family name for cross-reference matching.
 * Converts to lowercase, normalizes separators to dashes, collapses duplicates.
 *
 * Examples:
 *   "DeepSeek-V3"       → "deepseek-v3"
 *   "Llama 3.3 70B"     → "llama-3-3-70b"
 *   "GPT-4o"            → "gpt-4o"
 *   "claude-sonnet-4-6" → "claude-sonnet-4-6"
 */
export function normalizeModelName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[._\s]+/g, "-")
    .replace(/--+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Generate progressively less specific keys for cross-referencing an Ollama
 * model name against the family index.
 *
 * Strategy: start with the exact base name, then progressively strip trailing
 * dash-delimited segments. Also generates variants with dash-before-digit
 * normalization (e.g., "llama4" → "llama-4") since Ollama and models.dev
 * use different naming conventions.
 *
 * Examples:
 *   "deepseek-v3.1:671b-cloud" → ["deepseek-v3-1", "deepseek-v3", "deepseek",
 *                                  "deepseek-v-3-1", "deepseek-v-3", "deepseek-v"]
 *   "llama4:maverick-cloud"    → ["llama4", "llama-4", "llama"]
 *   "qwen3.5:32b-cloud"       → ["qwen3-5", "qwen3", "qwen-3-5", "qwen-3", "qwen"]
 */
export function generateMatchKeys(modelId: string): string[] {
  const base = modelId.split(":")[0]!;
  const norm = normalizeModelName(base);

  const keys = new Set<string>();
  keys.add(norm);

  // Variant: insert dash before digits following letters ("llama4" → "llama-4")
  const withDash = norm.replace(/([a-z])(\d)/g, "$1-$2");
  if (withDash !== norm) keys.add(withDash);

  // Progressively strip trailing dash-segments from both the original
  // normalized name AND the dash-before-digit variant. This ensures we
  // reach the base family name regardless of naming convention.
  //   "llama-4"       → strip "-4"       → "llama"
  //   "deepseek-v3-1" → strip "-1"       → "deepseek-v3" → strip "-v3" → "deepseek"
  //   "kimi-k2-5"     → strip "-5"       → "kimi-k2"     → strip "-k2" → "kimi"
  for (const start of new Set([norm, withDash])) {
    let stripped = start;
    while (true) {
      const lastDash = stripped.lastIndexOf("-");
      if (lastDash < 1) break;
      const shorter = stripped.slice(0, lastDash);
      if (shorter.length < 2) break;
      keys.add(shorter);
      stripped = shorter;
    }
  }

  return [...keys];
}

/**
 * Cross-reference an Ollama model against the models.dev registry.
 *
 * Merges capabilities: Ollama's `capabilities` array is authoritative for
 * what the runtime supports (tools, thinking, vision). models.dev provides
 * supplementary data (context window, output limit) and fills in capabilities
 * that Ollama's older API versions don't report.
 *
 * When the Ollama probe had access to the `capabilities` array (modern Ollama),
 * those values are authoritative — models.dev cannot override them.
 * When the array was absent (older Ollama), models.dev fills in the gaps.
 */
function crossReferenceWithRegistry(
  modelId: string,
  probed: ModelCapabilities,
  hadCapabilitiesArray: boolean,
): ModelCapabilities {
  if (familyCrossRef.size === 0) return probed;

  const candidates = generateMatchKeys(modelId);

  for (const key of candidates) {
    const ref = familyCrossRef.get(key);
    if (ref) {
      log.debug(
        `Ollama cross-ref "${modelId}" → matched "${ref.id}" ` +
        `(family: ${ref.family}, provider: ${ref.provider}) ` +
        `[reasoning=${ref.reasoning} vision=${ref.vision} ctx=${ref.context} out=${ref.maxOutput}]`,
      );

      return {
        ...probed,
        // When Ollama reported a `capabilities` array, its values are
        // authoritative (the runtime knows what the model supports).
        // models.dev can only fill in gaps when the array was absent.
        reasoning: hadCapabilitiesArray ? probed.reasoning : (probed.reasoning || ref.reasoning),
        vision: hadCapabilitiesArray ? probed.vision : (probed.vision || ref.vision),
        structuredOutput: hadCapabilitiesArray ? probed.structuredOutput : (probed.structuredOutput || ref.structuredOutput),
        // Context/output: use the larger value — Ollama probe may underreport,
        // but models.dev reflects the model's true capacity.
        context: Math.max(probed.context, ref.context),
        maxOutput: Math.max(probed.maxOutput, ref.maxOutput),
        // Keep toolCall from Ollama probe — it reflects whether the Ollama
        // runtime actually supports tool calling for this model.
      };
    }
  }

  return probed;
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
  let reasoning = false;
  let vision = false;
  let probeSucceeded = false;
  let hadCapabilitiesArray = false;
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

      // Extract context length from model_info.
      // Ollama uses architecture-prefixed keys (e.g., "deepseek3.2.context_length")
      // as well as the standard "general.context_length". Check both.
      const modelInfo = data.model_info as Record<string, unknown> | undefined;
      if (modelInfo) {
        let ctxLen = modelInfo["general.context_length"] as number | undefined;
        if (!ctxLen) {
          // Find architecture-prefixed context_length (e.g., "deepseek3.2.context_length")
          for (const [key, val] of Object.entries(modelInfo)) {
            if (key.endsWith(".context_length") && typeof val === "number" && val > 0) {
              ctxLen = val;
              break;
            }
          }
        }
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

      // Detect tool calling — check Ollama's capabilities array first (most reliable),
      // then fall back to template inspection for older Ollama versions.
      const capabilities = data.capabilities as string[] | undefined;
      if (Array.isArray(capabilities) && capabilities.includes("tools")) {
        toolCall = true;
      }

      if (!toolCall) {
        const template = data.template as string | undefined;
        if (template) {
          // Ollama templates that support tools contain tool-related template blocks
          toolCall = template.includes(".Tools") ||
                     template.includes("tools") ||
                     template.includes("<tool_call>") ||
                     template.includes("function_call");

          // Cloud-proxied models use a minimal passthrough template ("{{ .Prompt }}")
          // and support tools natively via the underlying API.
          const isPassthrough = template.trim() === "{{ .Prompt }}";
          const isCloudModel = modelId.toLowerCase().includes("cloud");
          if (!toolCall && (isPassthrough || isCloudModel)) {
            toolCall = true;
            log.debug(`Ollama probe "${modelId}": detected cloud/passthrough model — enabling tools`);
          }
        }
      }

      // Detect reasoning and vision from capabilities array
      if (Array.isArray(capabilities)) {
        hadCapabilitiesArray = true;
        if (capabilities.includes("thinking")) reasoning = true;
        if (capabilities.includes("vision")) vision = true;
      }

      // Max output: default to context/4 if not explicitly set, capped at 32K
      if (maxOutput === 4_096 && context > 16_384) {
        maxOutput = Math.min(Math.floor(context / 4), 32_768);
      }

      probeSucceeded = true;
      log.debug(`Ollama probe "${modelId}": ctx=${context} out=${maxOutput} tools=${toolCall} reasoning=${reasoning}`);
    } else {
      log.debug(`Ollama probe "${modelId}" failed: HTTP ${resp.status}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.debug(`Ollama probe "${modelId}" error: ${msg}`);
  }

  const probed: ModelCapabilities = {
    id: modelId,
    provider: "local",
    family,
    context,
    maxOutput,
    toolCall,
    reasoning,
    vision,
    structuredOutput: false,
    costInput: 0,
    costOutput: 0,
  };

  // Cross-reference with models.dev to detect capabilities that Ollama's
  // /api/show can't report — vision, structured output, and more
  // accurate context/output limits from the model's spec sheet.
  const enriched = crossReferenceWithRegistry(modelId, probed, hadCapabilitiesArray);

  // Only cache successful probes. Failed probes (Ollama down, timeout) return
  // defaults with toolCall=false — caching these would permanently disable
  // tools even after Ollama becomes available.
  if (probeSucceeded) {
    localProbeCache.set(modelId, enriched);
  }
  return enriched;
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
 *   1. Exact match in capability index (e.g., "claude-sonnet-4-6")
 *   2. Direct alias match from registry (models.dev + custom providers)
 *   3. Static alias (curated defaults: "claude" → "claude-sonnet-4-6")
 *   4. Fuzzy substring match from models.dev (last resort, e.g., "gemini-pro")
 *   5. Local model env var
 *   6. Pass-through
 *
 * Static aliases are checked BEFORE fuzzy matching because they represent
 * intentional curated defaults (e.g., "claude" → sonnet, not opus).
 * Fuzzy matching is a last resort for arbitrary model names.
 */
export function resolveModel(provider: string, alias: string): string {
  const normalized = alias.toLowerCase();

  // 1. Exact match in capability index
  if (capIndex.has(`${provider}:${alias}`)) return alias;
  if (capIndex.has(`${provider}:${normalized}`)) return normalized;

  // 2. Direct alias match — from models.dev families AND custom provider aliases.
  //    This handles exact family names (e.g., "claude-sonnet" → "claude-sonnet-4-6").
  const aliases = aliasIndex.get(provider);
  if (aliases) {
    const direct = aliases.get(normalized);
    if (direct) return direct;
  }

  // 3. Static alias — curated defaults take priority over fuzzy matching.
  //    These are intentional choices: "claude" → sonnet (not opus),
  //    "gpt" → gpt-4o (not gpt-5.2), "sonnet" → latest sonnet.
  const staticMap = STATIC_ALIASES[provider];
  if (staticMap?.[normalized]) return staticMap[normalized]!;

  // 4. Fuzzy substring match — last resort, only from models.dev data.
  //    Catches cases like "gemini-pro" matching "gemini-2.5-pro".
  if (aliases && fetched) {
    for (const [key, modelId] of aliases) {
      if (key.includes(normalized) || normalized.includes(key)) return modelId;
    }
  }

  // 5. Local model: resolve "local"/"ollama" to env var, then cached detection, then fallback
  if (provider === "local" && (normalized === "local" || normalized === "ollama")) {
    return process.env.LOCAL_MODEL ?? cachedDefaultLocalModel ?? "llama3";
  }

  // 6. Pass-through
  return alias;
}

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

/**
 * Get capabilities for a resolved model ID.
 * For cloud models → reads from models.dev cache.
 * For local models → returns cached Ollama probe result, or a pre-probe default.
 * For custom providers → cross-references with models.dev family index.
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

  // 3.5. Cross-reference with family index for custom providers.
  // This auto-detects reasoning, context, and output caps for custom provider
  // models by matching against the models.dev family data (e.g., a "deepseek-chat-v3"
  // model on OpenRouter inherits DeepSeek V3's known capabilities).
  //
  // Only applies when no built-in provider fallback exists — built-in providers
  // (anthropic, openai, local, claude-code) have intentional fallback caps that
  // override model-level data (e.g., claude-code disables toolCall by design).
  if (familyCrossRef.size > 0 && !FALLBACK_CAPS[provider]) {
    const matchKeys = generateMatchKeys(modelId);
    for (const matchKey of matchKeys) {
      const ref = familyCrossRef.get(matchKey);
      if (ref) {
        return {
          ...ref,
          id: modelId,
          provider,
          // Zero out cost — custom provider pricing differs from the reference provider
          costInput: 0,
          costOutput: 0,
        };
      }
    }
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
    vision: false,
    structuredOutput: false,
    costInput: 0,
    costOutput: 0,
  };
}

/**
 * List all known models for a provider.
 *
 * Cloud models come from the models.dev capability index (populated at boot).
 * Local models come from Ollama probe cache (populated lazily on first use).
 *
 * When no local models have been probed yet, this still returns a default
 * local model entry if one is known (via LOCAL_MODEL env var or Ollama
 * detection at boot). This ensures local models appear in the /model picker
 * without requiring every consumer to add their own fallback.
 */
export function listModels(provider?: string): ModelCapabilities[] {
  const results: ModelCapabilities[] = [];
  for (const [key, caps] of capIndex) {
    if (!provider || key.startsWith(`${provider}:`)) results.push(caps);
  }

  if (!provider || provider === "local") {
    // Include probed local models — populated at boot by loadModelRegistry()
    // which probes all installed Ollama models in parallel.
    for (const [, caps] of localProbeCache) results.push(caps);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Custom provider alias registration
// ---------------------------------------------------------------------------

/**
 * Register model aliases for a custom provider.
 *
 * Called by `registerCustomProviders()` at boot for each ProviderConfig that
 * has a `models` mapping. Populates the alias index so that
 * `resolveModel(providerId, alias)` works for custom provider model shortcuts.
 *
 * @param providerId  Provider ID (e.g. "openrouter")
 * @param aliases     Alias → real model ID mapping (e.g. { "deepseek": "deepseek/deepseek-chat-v3" })
 */
export function registerProviderAliases(
  providerId: string,
  aliases: Record<string, string>,
): void {
  const existing = aliasIndex.get(providerId) ?? new Map<string, string>();
  for (const [alias, modelId] of Object.entries(aliases)) {
    existing.set(alias.toLowerCase(), modelId);
  }
  aliasIndex.set(providerId, existing);
}

/**
 * Check whether a name is a known provider.
 *
 * Checks (in order):
 *   1. Dynamic alias index (populated from models.dev + custom providers)
 *   2. Static fallback capability providers
 *   3. Driver registry (catches built-in aliases like "claude", "gpt", "ollama")
 *
 * Used by parseModelSpec() to distinguish "provider:model" from "model:tag".
 */
export function isKnownProvider(name: string): boolean {
  const lower = name.toLowerCase();
  if (aliasIndex.has(lower) || FALLBACK_CAPS[lower] !== undefined) return true;

  // Check the driver registry — lazy require to avoid top-level circular import.
  // At runtime this is cheap because drivers/index.js is already loaded by boot step 7.
  try {
    const { getDriver } = require("./index.js");
    getDriver(lower);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Dynamic model fetching from provider endpoints
// ---------------------------------------------------------------------------

/** A model available on a remote provider (from /models endpoint). */
export interface RemoteModel {
  id: string;
  created?: number;
  owned_by?: string;
  /** Ollama-specific: model file size in bytes. */
  size?: number;
  /** Ollama-specific: parameter count (e.g. "8B", "70B"). */
  parameter_size?: string;
  /** Ollama-specific: quantization level (e.g. "Q4_K_M"). */
  quantization?: string;
}

/**
 * Fetch available models from Ollama's /api/tags endpoint.
 *
 * Returns the list of locally available models. Non-fatal — returns empty on error.
 * Used by `jeriko provider models local` and model listing in the REPL.
 */
export async function fetchOllamaModels(): Promise<RemoteModel[]> {
  const baseUrl = getOllamaBaseUrl();

  try {
    const resp = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(5_000),
    });

    if (!resp.ok) return [];

    const data = (await resp.json()) as {
      models?: Array<{
        name?: string;
        modified_at?: string;
        size?: number;
        details?: { family?: string; parameter_size?: string; quantization_level?: string };
      }>;
    };

    if (!Array.isArray(data.models)) return [];

    const results = data.models.map((m) => ({
      id: m.name ?? "",
      owned_by: m.details?.family,
      size: m.size,
      parameter_size: m.details?.parameter_size,
      quantization: m.details?.quantization_level,
    })).filter((m) => m.id);

    // Cache the first model as the default local model for resolveModel()
    if (results.length > 0 && !cachedDefaultLocalModel) {
      cachedDefaultLocalModel = results[0]!.id;
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * Fetch available models from a provider's /models endpoint.
 *
 * Works with any OpenAI-compatible provider (standard /v1/models or /models).
 * Returns the raw model list from the API. Non-fatal — returns empty on error.
 *
 * @param baseUrl   Provider base URL (e.g. "https://api.groq.com/openai/v1")
 * @param apiKey    API key (already resolved, not an env ref)
 * @param headers   Optional extra headers
 */
export async function fetchProviderModels(
  baseUrl: string,
  apiKey: string,
  headers?: Record<string, string>,
): Promise<RemoteModel[]> {
  const base = baseUrl.replace(/\/+$/, "");
  // Try /models first (if baseUrl ends with /v1), then /v1/models
  const urls = base.endsWith("/v1")
    ? [`${base}/models`]
    : [`${base}/models`, `${base}/v1/models`];

  for (const url of urls) {
    try {
      const resp = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(headers ?? {}),
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (!resp.ok) continue;

      const data = (await resp.json()) as { data?: Array<Record<string, unknown>> };
      if (!Array.isArray(data.data)) continue;

      return data.data.map((m) => ({
        id: (m.id as string) ?? "",
        created: m.created as number | undefined,
        owned_by: m.owned_by as string | undefined,
      })).filter((m) => m.id);
    } catch {
      continue;
    }
  }

  return [];
}

// ---------------------------------------------------------------------------
// Model spec parsing — "provider:model" syntax
// ---------------------------------------------------------------------------

export interface ModelSpec {
  /** Backend/driver name (e.g. "openrouter", "anthropic", "local"). */
  backend: string;
  /** Model identifier within the backend. */
  model: string;
}

/**
 * Parse a model specifier that may use "provider:model" syntax.
 *
 * Rules:
 *   - If input contains ":", split on the first colon.
 *   - If the left side is a known driver/provider → { backend: left, model: right }
 *   - If the left side is NOT a known driver → treat the whole string as the model
 *     (backward compat for Ollama "llama3:70b" format)
 *   - If no colon → return the whole string as both backend and model
 *
 * @param spec          The model specifier string.
 * @param isDriverKnown Optional function to check if a name is a registered driver.
 *                      Defaults to checking the driver registry via getDriver().
 */
export function parseModelSpec(
  spec: string,
  isDriverKnown?: (name: string) => boolean,
): ModelSpec {
  const checkFn = isDriverKnown ?? isKnownProvider;

  // Check for "/" separator first — unambiguous provider delimiter.
  // Ollama tags use ":" (e.g., "llama3:70b", "deepseek-v3.2:cloud") but never "/",
  // so "local/deepseek-v3.2:cloud" → backend="local", model="deepseek-v3.2:cloud".
  const slashIdx = spec.indexOf("/");
  if (slashIdx > 0) {
    const slashLeft = spec.slice(0, slashIdx);
    const slashRight = spec.slice(slashIdx + 1);
    let knownViaSlash = false;
    try { knownViaSlash = checkFn(slashLeft); } catch { /* not found */ }
    if (knownViaSlash) {
      return { backend: slashLeft, model: slashRight };
    }
  }

  // Check for ":" separator — used by "provider:model" syntax.
  const colonIdx = spec.indexOf(":");
  if (colonIdx < 0) {
    return { backend: spec, model: spec };
  }

  const left = spec.slice(0, colonIdx);
  const right = spec.slice(colonIdx + 1);

  let knownAsDriver = false;
  try {
    knownAsDriver = checkFn(left);
  } catch {
    // Not found — not a known provider
  }

  if (knownAsDriver) {
    return { backend: left, model: right };
  }

  // Left side isn't a known provider — treat the whole string as model
  // (backward compat for Ollama "llama3:70b" format)
  return { backend: spec, model: spec };
}
