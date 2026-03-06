# ADR-003: Unified Provider Gateway — Dynamic Model Provider Architecture

**Status:** APPROVED
**Date:** 2026-03-06
**Authors:** Khaleel Musleh (Etheon)
**Related:** ADR-002 (Agent Loop), `src/daemon/agent/drivers/`

---

## 1. Context & Problem Statement

Jeriko's model/provider system has grown organically into a 4+1 driver architecture:

| Driver | File | Lines | Protocol |
|--------|------|-------|----------|
| AnthropicDriver | anthropic.ts | 285 | Anthropic Messages API |
| OpenAIDriver | openai.ts | 178 | OpenAI Chat Completions |
| LocalDriver | local.ts | 182 | OpenAI-compat (Ollama) |
| ClaudeCodeDriver | claude-code.ts | 247 | Subprocess (claude -p) |
| OpenAICompatibleDriver | openai-compat.ts | 206 | OpenAI-compat (generic) |

**Problems identified:**

1. **OpenAI driver duplicates OpenAICompatibleDriver** — identical message conversion,
   tool conversion, reasoning handling, stream parsing. Only difference: env var resolution
   and endpoint URL construction. ~80% code overlap.

2. **`type: "anthropic"` is declared but rejected** — `ProviderConfig.type` supports
   `"anthropic"` in the TypeScript interface, but `providers.ts` line 37-39 explicitly
   skips it: `unsupported type "${config.type}"`. This blocks Anthropic-compatible
   custom providers (proxies, regional endpoints, fine-tuned model hosts).

3. **No dynamic model discovery** — Users can't query what models a provider offers.
   The only way to know is to check the provider's website or docs.

4. **No model validation on switch** — `/model anything` silently accepts any string.
   The user only discovers the error at the next API call.

5. **Code architecture suggests each new protocol needs a new driver class** — but in
   reality, there are only two wire protocols: OpenAI Chat Completions and Anthropic
   Messages. Everything else is a configuration variant.

## 2. Competitor Analysis

### OpenRouter
- Single API endpoint, translates to all providers server-side
- User specifies `model: "anthropic/claude-3.5-sonnet"` — provider/model namespace
- SDK wraps OpenAI SDK with custom base URL
- **Insight**: The "universal gateway" is a server-side concept. Client-side, it's just
  an OpenAI-compatible endpoint.

### OpenCode
- Simple TOML config: `[providers.groq] apiKey = "..." baseUrl = "..."`
- Uses OpenAI SDK internally for all providers
- Provider selection via prefix: `groq:llama-3.1-8b`
- **Insight**: Configuration-driven, not code-driven. No per-provider driver classes.

### Portkey
- Gateway proxy with virtual keys, load balancing, fallbacks
- `@portkey-ai/gateway` npm package
- Supports both OpenAI and Anthropic protocols
- Routes requests based on provider config
- **Insight**: Two protocols (OpenAI + Anthropic) cover essentially all providers.

### LiteLLM
- `completion(model="groq/llama3", ...)` — prefix-based routing
- 100+ provider adapters, but all resolve to OpenAI or Anthropic wire format
- **Insight**: Even with 100+ providers, the actual protocol diversity is minimal.

### OpenClaw
- Built-in catalog of 7 providers, `api` field selects wire protocol: `"openai-completions"`
  or `"anthropic-messages"` (two-value enum, same insight as our approach)
- API key rotation with automatic fallback on 429 errors
- `${ENV_VAR}` syntax for credentials in config
- **Insight**: CLI tools benefit from simple enum-based protocol selection, not plugins.

### Vercel AI SDK (foundational pattern)
- Each provider is an npm package (`@ai-sdk/openai`, `@ai-sdk/anthropic`)
- `createProviderRegistry()` maps IDs to instances, `registry.languageModel('provider:model')`
- `@ai-sdk/openai-compatible` as a universal adapter
- **Insight**: The most widely-adopted TypeScript provider abstraction. OpenCode builds on it.

### Common Pattern
All competitors converge on the same architecture:
- **Two wire protocols** (OpenAI Chat Completions, Anthropic Messages)
- **Configuration-driven provider registration** (not class-per-provider)
- **Prefix-based routing** (`provider:model` or `provider/model`)
- **Environment variable auto-discovery**
- **OpenAI as lingua franca** — every system normalizes to or is compatible with it

Jeriko already has most of this. The gaps are protocol diversity (only OpenAI-compat
for custom providers) and the unnecessary OpenAI driver duplication.

## 3. Decision

### 3.1 Consolidate OpenAI Driver

Refactor `OpenAIDriver` to internally delegate to `OpenAICompatibleDriver`. This
eliminates ~100 lines of duplicate message/tool conversion code while preserving the
same external interface (`driver.name = "openai"`, same aliases).

The OpenAI driver becomes a thin constructor that configures an OpenAICompatibleDriver
with `OPENAI_API_KEY` and `OPENAI_BASE_URL` from the environment.

**Rationale**: The OpenAI Chat Completions protocol IS the "OpenAI-compatible" protocol.
Maintaining a separate implementation for the canonical provider is pure duplication.

**Keep separate**: LocalDriver (Ollama). It has meaningful differences: health check,
`options` block for params, no auth. These aren't configuration variations — they're
behavioral differences.

**Keep separate**: ClaudeCodeDriver. Subprocess pattern is fundamentally different.

### 3.2 Enable Anthropic Protocol for Custom Providers

Create `AnthropicCompatibleDriver` — a configurable version of `AnthropicDriver` that
takes `ProviderConfig` instead of hardcoded env vars. Update `providers.ts` to accept
`type: "anthropic"` and instantiate this driver.

This enables:
- Anthropic API proxies (corporate, regional)
- Self-hosted Anthropic-compatible endpoints
- Any future provider that speaks the Anthropic Messages protocol

### 3.3 Add Dynamic Model Fetching

Add `fetchProviderModels(providerId)` function that queries a provider's `/models`
endpoint (standard OpenAI-compat discovery). Expose via:
- `jeriko provider models <id>` CLI command
- `providers.models` IPC method

### 3.4 Add Model Validation on Switch

When `/model <name>` is used, validate that the provider exists and is reachable.
Don't block the switch (the model might be valid but unknown to us), but warn if
the provider can't be resolved.

## 4. Architecture After Changes

```
┌─────────────────────────────────────────────────────────────┐
│                    Driver Registry (index.ts)                │
│  Map<string, LLMDriver> — aliases resolve to drivers        │
├──────────────────┬──────────────────┬───────────────────────┤
│                  │                  │                       │
│  Built-in        │  Protocol        │  Special              │
│  ┌────────────┐  │  ┌────────────┐  │  ┌────────────────┐  │
│  │ anthropic  │  │  │ OpenAI-    │  │  │ LocalDriver    │  │
│  │ (native)   │  │  │ Compatible │  │  │ (Ollama)       │  │
│  └────────────┘  │  │ Driver     │  │  └────────────────┘  │
│                  │  │ (generic)  │  │  ┌────────────────┐  │
│  ┌────────────┐  │  └────────────┘  │  │ ClaudeCode     │  │
│  │ openai     │──│──→ delegates     │  │ Driver         │  │
│  │ (delegates)│  │                  │  │ (subprocess)   │  │
│  └────────────┘  │  ┌────────────┐  │  └────────────────┘  │
│                  │  │ Anthropic- │  │                       │
│                  │  │ Compatible │  │                       │
│                  │  │ Driver     │  │                       │
│                  │  │ (generic)  │  │                       │
│                  │  └────────────┘  │                       │
├──────────────────┴──────────────────┴───────────────────────┤
│  Boot: kernel.ts step 7                                     │
│  1. loadModelRegistry() — models.dev capabilities           │
│  2. registerCustomProviders(config.providers) — both types  │
│  3. discoverProviderPresets(envVars) — auto-discovery        │
└─────────────────────────────────────────────────────────────┘
```

## 5. Files Changed

| File | Change |
|------|--------|
| `drivers/openai.ts` | Refactor to delegate to OpenAICompatibleDriver |
| `drivers/anthropic-compat.ts` | NEW — AnthropicCompatibleDriver |
| `drivers/providers.ts` | Support `type: "anthropic"` |
| `drivers/presets.ts` | Add Anthropic-protocol presets |
| `drivers/models.ts` | Add `fetchProviderModels()` |
| `commands/agent/provider.ts` | Add `models` subcommand |
| `cli/app.tsx` | Model validation on `/model` |
| Tests | Update + add coverage |

## 6. What Does NOT Change

- **LLMDriver interface** — same `chat()` async generator contract
- **DriverConfig** — same shape, same capabilities object
- **ProviderConfig** — same shape, `type: "anthropic"` now works
- **Agent loop** — no changes, reads driver interface
- **parseModelSpec / resolveModel / getCapabilities** — unchanged
- **openai-stream.ts** — shared SSE parser, unchanged
- **ClaudeCodeDriver** — unchanged
- **LocalDriver** — unchanged (Ollama quirks warrant separate implementation)
- **Boot sequence** — same steps, enhanced providers.ts handles both types

## 7. Risk Assessment

| Risk | Mitigation |
|------|-----------|
| OpenAI driver delegation breaks edge cases | Comprehensive test suite (existing tests must pass) |
| AnthropicCompatibleDriver SSE parsing issues | Reuses proven AnthropicDriver parsing logic |
| Model fetch timeout blocks provider list | Async with timeout, non-blocking |
| Backward compat for config.json | ProviderConfig shape unchanged, new field optional |

## 8. Test Plan

1. All existing 1883 tests pass (zero regressions)
2. New tests for AnthropicCompatibleDriver
3. New tests for `fetchProviderModels()`
4. New tests for model validation
5. Live test: `jeriko provider models groq` (if API key available)
