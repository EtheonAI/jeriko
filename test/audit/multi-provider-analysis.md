# Multi-Provider System Audit

## Provider Registration Flow

### Boot Sequence (kernel.ts)
1. **Step 7a** -- Register explicit providers from `config.providers[]` via `registerCustomProviders()`
2. **Step 7b** -- Auto-discover provider presets (`presets.ts`) by checking env vars (e.g., `GROQ_API_KEY`), skip IDs already in config
3. Each provider config creates either an `OpenAICompatibleDriver` or `AnthropicCompatibleDriver` based on `type` field
4. Driver is registered in the global `drivers` Map under provider's `id`
5. Model aliases from `config.models` and `defaultModel` are registered in `aliasIndex`

### Built-in Drivers (index.ts)
- `AnthropicDriver` registered as "anthropic" + alias "claude"
- `OpenAIDriver` registered as "openai" + aliases "gpt", "gpt4", "gpt-4", "gpt-4o", "o1", "o3"
- `LocalDriver` registered as "local" + alias "ollama"
- `ClaudeCodeDriver` registered as "claude-code" + alias "cc"

### Provider Presets (presets.ts)
22 pre-configured providers (OpenRouter, Groq, DeepSeek, Google, xAI, Mistral, Together, Fireworks, DeepInfra, Cerebras, Perplexity, Cohere, GitHub Models, Nvidia, Nebius, Hugging Face, Requesty, Helicone, Alibaba, SiliconFlow, Novita, SambaNova, LM Studio). Auto-registered when their env var is set.

## Model Resolution (`resolveModel`)

Resolution order:
1. Exact match in `capIndex` ("provider:modelId")
2. Direct alias match from `aliasIndex` (models.dev families + custom aliases)
3. Static alias lookup (`STATIC_ALIASES` -- curated defaults like "claude" -> "claude-sonnet-4-6")
4. Fuzzy substring match from models.dev (only when fetched)
5. Local model env var fallback (`LOCAL_MODEL`)
6. Pass-through (return alias unchanged)

## `provider:model` Syntax (`parseModelSpec`)

- Input with colon: splits on first `:`, checks if left side is a known provider
- Known provider check: `isKnownProvider()` -- checks aliasIndex, FALLBACK_CAPS, then driver registry
- If left side IS a known provider: `{ backend: left, model: right }`
- If left side is NOT known: `{ backend: whole_string, model: whole_string }` (backward compat for Ollama "llama3:70b")
- Input without colon: `{ backend: spec, model: spec }`

## Driver Selection (`getDriver`)

- Looks up `backend.toLowerCase()` in the `drivers` Map
- Throws if not found (lists all registered driver names in error)
- `agent.ts` calls `getDriver(config.backend)` then uses `driver.name` as canonical provider name

## API Key Resolution

- **AnthropicDriver**: Reads `process.env.ANTHROPIC_API_KEY` directly (getter)
- **OpenAIDriver**: Delegates to `OpenAICompatibleDriver` with `apiKey: "{env:OPENAI_API_KEY}"`
- **OpenAICompatibleDriver**: Calls `resolveEnvRef(this.config.apiKey)` at call time
- **resolveEnvRef**: Matches `{env:VAR_NAME}` pattern, reads from `process.env`, throws if empty/undefined
- **Custom headers**: Also resolved via `resolveEnvRef()` per header value
- Presets use `{env:PRESET_ENV_KEY}` format

## Capability Detection

### Cloud Models (anthropic, openai)
- Fetched from `models.dev/api.json` at boot (`loadModelRegistry()`)
- Parsed into `capIndex` Map keyed by `provider:modelId`
- `FALLBACK_CAPS` used when models.dev is unreachable

### Local Models (Ollama)
- Probed via `/api/show` endpoint (context, tool support from template, max output)
- Cross-referenced with `familyCrossRef` (built from ALL models.dev data)
- Inherits reasoning, vision, structuredOutput, context, maxOutput from models.dev
- Keeps toolCall from Ollama probe (runtime-dependent)

### Custom Providers
- `getCapabilities()` step 3.5: cross-references model ID against `familyCrossRef`
- Only when no built-in fallback exists for the provider
- Zeroes out cost (custom provider pricing differs)

### Ultra-conservative Default
- Unknown provider + unknown model: `toolCall: false, reasoning: false, vision: false, context: 24000, maxOutput: 4096`

## Error Handling

- **Unknown provider/backend**: `getDriver()` throws with list of registered drivers
- **Unknown model**: passes through unchanged (step 6 of resolveModel) -- model string sent to API as-is
- **Missing API key**: `resolveEnvRef` throws; `AnthropicDriver.apiKey` getter throws
- **Invalid provider config**: skipped with warning (missing id/baseUrl, unsupported type)
- **models.dev fetch failure**: non-fatal, logs warning, uses static fallbacks

## Potential Issues Found

1. **parseModelSpec backward compat**: When left side of colon is not a known provider, the whole string becomes BOTH backend and model. This means `getDriver("llama3:70b")` will be called, which throws. The caller (kernel.ts line 546) would need to handle this -- it does use the returned `backend` directly with `getDriver()`.

2. **OpenAIDriver lazy delegate**: The delegate is created once on first use, reading `OPENAI_BASE_URL` at that time. If the env var changes later, the old URL persists. This is documented behavior ("lazy to allow environment variables to be set after module load but before first API call").

3. **isKnownProvider uses require()**: Uses `require("./index.js")` which is a synchronous CommonJS call -- works in Bun but is technically a CJS pattern in an ESM codebase. This is intentional to avoid circular imports.

4. **Family cross-ref cost zeroing**: When a custom provider model matches via family cross-ref, costs are zeroed. This is correct (custom provider pricing differs) but means cost tracking is unavailable for auto-discovered providers.
