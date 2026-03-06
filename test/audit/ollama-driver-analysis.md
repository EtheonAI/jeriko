# Ollama (Local) Driver Audit -- Analysis

**Date**: 2026-03-06
**Files audited**:
- `src/daemon/agent/drivers/local.ts`
- `src/daemon/agent/drivers/openai-stream.ts`
- `src/daemon/agent/drivers/index.ts`
- `src/daemon/agent/drivers/signal.ts`
- `src/daemon/agent/drivers/models.ts` (Ollama probe + model listing)

---

## 1. Architecture Overview

The Ollama driver is a thin adapter that talks to Ollama's OpenAI-compatible
endpoint (`/v1/chat/completions`). It delegates all SSE parsing to the shared
`parseOpenAIStream()` parser (same as OpenAI and custom providers).

```
LocalDriver (local.ts)
  -> health check: GET /api/tags (5s timeout)
  -> chat: POST /v1/chat/completions (streaming)
       -> parseOpenAIStream() (shared SSE parser)
```

Model capability detection is handled externally by `models.ts`:
```
probeLocalModel(modelId)
  -> POST /api/show { name: modelId }
  -> Extract: context window, max output, tool calling (from template)
  -> Cross-reference with models.dev family index (reasoning, vision, etc.)
```

---

## 2. URL Construction

The `baseUrl` getter resolves Ollama's base URL from three sources:

| Priority | Source | Example |
|----------|--------|---------|
| 1 | `LOCAL_MODEL_URL` (trailing `/v1` stripped) | `http://gpu:11434/v1` -> `http://gpu:11434` |
| 2 | `OLLAMA_BASE_URL` | `http://192.168.1.10:11434` |
| 3 | Default | `http://localhost:11434` |

The `/v1` suffix stripping on `LOCAL_MODEL_URL` is correct -- it prevents the
endpoint becoming `/v1/v1/chat/completions`. The regex `\/v1\/?$` handles both
`/v1` and `/v1/` variants.

The same logic is duplicated in `models.ts:getOllamaBaseUrl()`. Both
implementations are identical, which is good for consistency but represents
minor code duplication.

**Endpoints used:**
- Health check: `${baseUrl}/api/tags` (Ollama native)
- Chat: `${baseUrl}/v1/chat/completions` (OpenAI-compatible)
- Model listing: `${baseUrl}/api/tags` (in models.ts)
- Model probe: `${baseUrl}/api/show` (in models.ts)

---

## 3. Model Listing

`fetchOllamaModels()` in models.ts fetches `GET /api/tags` and maps the
response to `RemoteModel[]`:

```ts
{ name, size, details.family, details.parameter_size, details.quantization_level }
```

Non-fatal: returns `[]` on any error. Correctly filters out models with empty names.

---

## 4. Tool Support Detection

Tool calling detection is sophisticated and multi-layered:

1. **Template inspection** (`probeLocalModel` via `/api/show`):
   - Checks template string for `.Tools`, `tools`, `<tool_call>`, `function_call`
   - Cloud/passthrough models (template is `{{ .Prompt }}` or name contains "cloud")
     are assumed to support tools

2. **Cross-referencing** (`crossReferenceWithRegistry`):
   - After Ollama probe, matches model name against models.dev family index
   - Inherits: reasoning, vision, structuredOutput, context, maxOutput
   - Keeps: toolCall from Ollama probe (runtime-dependent, not model-intrinsic)

3. **Tool conversion** (`convertTools`):
   - Maps `DriverTool[]` to OpenAI function calling format
   - Only included in request body when tools are present
   - Agent layer filters tools based on capabilities before calling driver

This design correctly separates "can the runtime do tool calling" (Ollama probe)
from "is the model reasoning-capable" (models.dev cross-ref).

---

## 5. Streaming Response Parsing

Delegated entirely to `parseOpenAIStream()`. The Ollama driver passes:
```ts
yield* parseOpenAIStream({ response, signal });
```

The shared parser handles all SSE edge cases including:
- Incremental tool call accumulation
- Missing `[DONE]` sentinel (flush on stream end)
- Abort signal racing (Bun compatibility)
- Malformed JSON (silently skipped)

---

## 6. Request Body Format

```json
{
  "model": "llama3",
  "messages": [...],
  "stream": true,
  "options": {
    "temperature": 0.7,
    "num_predict": 4096
  },
  "tools": [...]  // optional
}
```

Notable: Ollama uses `options.num_predict` instead of OpenAI's `max_tokens`.
The driver correctly maps `config.max_tokens` to `options.num_predict`.

Temperature and max tokens are nested under `options`, which is Ollama's
native format. The OpenAI-compat endpoint accepts both formats, but using
`options` is more reliable for Ollama.

---

## 7. Error Handling

| Scenario | Handling | Quality |
|----------|----------|---------|
| Ollama not running (ECONNREFUSED) | Health check catches it, yields error + done | Good |
| Ollama health returns non-200 | Yields error with status code + done | Good |
| Chat request fetch throws | Yields error + done | Good |
| Chat response non-200 | Reads error text, yields error with status + body + done | Good |
| No response body | Yields error + done | Good |
| Model not found (404) | Caught by non-OK response handling | Good |
| Timeout | `withTimeout()` combines user signal + 120s timeout | Good |
| Abort signal | Handled by parseOpenAIStream race pattern | Good |

The health check before the chat request is a valuable UX improvement -- it
gives a clear "Ollama not reachable" error instead of a generic fetch failure.
The 5-second timeout on the health check prevents long hangs.

---

## 8. Message Conversion

`convertMessages()` maps `DriverMessage[]` to `OllamaMessage[]`:

- Preserves all four roles: system, user, assistant, tool
- Converts `tool_calls` array to OpenAI format
- Preserves `tool_call_id` for tool result messages
- System prompt injection: adds system message if `config.system_prompt` is set
  and no system message already exists

---

## 9. Potential Issues

### 9a. Minor: Health check adds latency on every call

The driver performs a `GET /api/tags` health check before every `chat()` call.
This adds a round-trip (typically <10ms for localhost) on every request. For
high-frequency agent loops, this could be optimized with a cached health status
or removed in favor of letting the chat request itself fail with a clear error.

**Severity**: Low. Localhost round-trips are fast, and the improved error
messages justify the cost.

### 9b. Minor: Duplicated baseUrl logic

`LocalDriver.baseUrl` and `models.ts:getOllamaBaseUrl()` contain identical
logic for resolving the Ollama base URL. If one is updated, the other must be
too. Could be extracted to a shared utility.

**Severity**: Low. Both implementations are simple and stable.

### 9c. Minor: options.temperature always sent

Even when `config.temperature` is undefined, the request body includes
`options: { temperature: undefined, num_predict: undefined }`. Ollama handles
undefined values gracefully (uses defaults), but it would be cleaner to omit
undefined values.

**Severity**: Low. Ollama ignores undefined values in options.

### 9d. Info: No Authentication Header

Unlike OpenAI and Anthropic drivers, the Ollama driver sends no authentication
header. This is correct -- Ollama runs locally and has no auth by default. If a
user runs Ollama behind a reverse proxy with auth, they would need to configure
that separately. This is a known limitation, not a bug.

### 9e. Info: Truthy check on content in shared parser

Same issue as noted in the OpenAI audit: `if (delta.content)` drops empty string
content. Irrelevant in practice.

**Severity**: Low.

---

## 10. Existing Test Coverage

The shared SSE parser (`parseOpenAIStream`) has extensive tests in
`test/unit/openai-stream.test.ts` covering all streaming edge cases.

**Not covered** (addressed in new audit test):
- `LocalDriver` construction (name, default URL, custom URLs)
- `LocalDriver.convertMessages()` (message format conversion)
- `LocalDriver.convertTools()` (tool definition format)
- Health check behavior (reachable, unreachable, non-200)
- Full `chat()` flow with mocked fetch (request body validation)
- System prompt injection
- Error paths at the driver level (connection refused, 404 model)
- Ollama-specific request body format (options.num_predict, not max_tokens)

---

## 11. Conclusion

The Ollama driver is well-designed and clean. It correctly uses Ollama's
OpenAI-compatible endpoint, delegates SSE parsing to the shared parser, and
has robust error handling with a pre-flight health check. The capability
detection system (template inspection + models.dev cross-referencing) is
sophisticated and accurate.

No critical bugs found. The minor issues (duplicated baseUrl logic, per-call
health check latency, always-sent undefined options) are cosmetic and do not
affect correctness.
