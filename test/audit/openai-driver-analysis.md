# OpenAI Driver Audit -- Analysis

**Date**: 2026-03-06
**Files audited**:
- `src/daemon/agent/drivers/openai.ts`
- `src/daemon/agent/drivers/openai-stream.ts`
- `src/daemon/agent/drivers/openai-compat.ts`
- `src/daemon/agent/drivers/index.ts`
- `src/daemon/agent/drivers/signal.ts`
- `src/shared/env-ref.ts`
- `test/unit/openai-stream.test.ts` (existing tests)

---

## 1. Architecture Overview

The OpenAI driver uses a three-layer design:

```
OpenAIDriver (openai.ts)          -- thin wrapper, lazy delegate
  -> OpenAICompatibleDriver       -- message conversion, HTTP fetch, error handling
       -> parseOpenAIStream()     -- shared SSE parser (also used by LocalDriver)
```

`OpenAIDriver` is a facade that configures an `OpenAICompatibleDriver` with
`OPENAI_API_KEY` (via `{env:OPENAI_API_KEY}` ref) and `OPENAI_BASE_URL` (or
default `https://api.openai.com/v1`). The delegate is created lazily on first
`chat()` call so env vars can be set after module import.

---

## 2. Request Flow (chat method)

1. **Capability detection**: Reads `config.capabilities?.reasoning` and
   `config.capabilities?.toolCall` to determine if the model is reasoning-only.

2. **Message conversion** (`convertMessages`):
   - Maps `DriverMessage[]` to OpenAI `ChatCompletion.messages` format.
   - Assistant messages with `tool_calls` get them converted to
     `{ id, type: "function", function: { name, arguments } }`.
   - If assistant has tool_calls but no content, content is set to `null`.
   - Tool result messages get `tool_call_id` preserved.

3. **System prompt injection**:
   - If `config.system_prompt` is set and model is NOT reasoning-only,
     prepends a system message (if none exists already).
   - Reasoning-only models: all system messages are converted to user role.

4. **Headers**: `Content-Type` + `Authorization: Bearer <key>` + any custom
   provider headers (each resolved via `resolveEnvRef`).

5. **Body construction**:
   - Always: `model`, `messages`, `stream: true`, `stream_options: { include_usage: true }`
   - Reasoning-only: `max_completion_tokens` (no `temperature`)
   - Normal: `max_tokens` + `temperature`
   - If tools present: `tools` + `tool_choice: "auto"`

6. **Signal**: `withTimeout(config.signal)` combines user abort + 120s timeout.

7. **Fetch**: POST to `chatEndpoint` (auto-appends `/v1/chat/completions` or
   `/chat/completions` depending on whether base URL already ends with `/v1`).

8. **Error handling**:
   - Network/fetch error: yields `{ type: "error" }` + `{ type: "done" }`
   - Non-OK response: reads error text, yields error + done
   - No body: yields error + done

9. **Streaming**: Delegates to `parseOpenAIStream({ response, signal })`.

---

## 3. SSE Stream Parsing (parseOpenAIStream)

### Buffer management
- Uses `ReadableStreamDefaultReader` + `TextDecoder` with `{ stream: true }`.
- Accumulates partial data in `buffer`, splits on `\n`, keeps last (possibly
  incomplete) line in buffer.

### Line processing
- Only processes lines starting with `data: ` (skips comments, event types).
- `[DONE]` sentinel: flushes tool calls, yields done, returns.
- Malformed JSON: silently skipped (try/catch around JSON.parse).
- Missing/empty `choices`: skipped.
- Missing `delta`: skipped.

### Text deltas
- `delta.content` (truthy check) -> yields `{ type: "text" }`.
- `delta.reasoning_content` (truthy check) -> yields `{ type: "thinking" }`.

### Tool call accumulation
- `delta.tool_calls` is an array of partial tool call objects.
- Each has an `index` field to identify which tool call it belongs to.
- First chunk for an index creates a new entry in `partialToolCalls` Map.
- Subsequent chunks append to `arguments` string.
- `id` and `name` are updated if provided (later chunks can refine them).
- Fallback ID: `call_${Date.now()}_${idx}` if no `id` is provided.

### Flush conditions
1. `finish_reason === "tool_calls"` -- flushes accumulated tool calls.
2. `data: [DONE]` -- flushes before yielding done.
3. Stream ends (reader.read() returns done) -- flushes remaining.
4. Entries without a `name` are skipped during flush.

### Terminal conditions
- `finish_reason === "stop"` or `"length"` -- yields done, returns.
- `data: [DONE]` -- yields done, returns.
- Stream exhausted -- yields done after flush.
- Abort signal -- yields error + done.

### Abort handling
- Checks `signal?.aborted` at top of each read loop iteration.
- Races `reader.read()` against abort signal promise (Bun compatibility).
- `reader.releaseLock()` in `finally` block.

---

## 4. OpenAI-Compatible Driver Differences

The `OpenAICompatibleDriver` is the actual implementation. The `OpenAIDriver`
just wraps it with OpenAI-specific defaults. Key differences for custom providers:

- **Base URL**: Custom providers pass any URL; endpoint logic auto-detects `/v1`.
- **API key**: Resolved via `resolveEnvRef()` at call time, not at construction.
- **Custom headers**: Provider config can include arbitrary headers (e.g.,
  `HTTP-Referer` for OpenRouter), each resolved via `resolveEnvRef`.
- **Name in errors**: Uses `this.config.name` (e.g., "OpenRouter") in error messages.

---

## 5. Tool Definition Conversion

`convertTools()` maps `DriverTool[]` to OpenAI format:
```
{ name, description, parameters }  ->  { type: "function", function: { name, description, parameters } }
```
Returns `undefined` if no tools provided (which omits `tools` and `tool_choice`
from the request body).

---

## 6. Error Paths

| Scenario | Handling |
|----------|----------|
| Fetch throws (network error) | Yields error with message + done |
| HTTP non-200 | Reads response text, yields error with status + body + done |
| No response body | Yields error + done |
| SSE no body | Yields error + done (in parseOpenAIStream) |
| Malformed SSE JSON | Silently skipped |
| Abort signal | Yields error "Request aborted" + done |
| Missing env var for API key | `resolveEnvRef` throws (uncaught -- crashes the generator) |

---

## 7. Potential Issues

### 7a. Bug: Empty string content is dropped (CONFIRMED)

In `parseOpenAIStream`, line 135:
```ts
if (delta.content) { ... }
```
This uses a truthy check. An empty string `""` is falsy and would be skipped.
While OpenAI typically does not send empty content deltas, some providers may
send `delta.content: ""` as a keepalive or initial chunk. This is harmless in
practice but technically incorrect -- it should be `delta.content != null` or
`typeof delta.content === "string"` if the intent is to forward all content.

**Severity**: Low. Empty string content has no visible impact.

### 7b. Bug: Empty string reasoning_content is dropped

Same truthy check issue at line 140:
```ts
if (delta.reasoning_content) { ... }
```

**Severity**: Low. Same rationale as above.

### 7c. Missing env var crashes generator

If `OPENAI_API_KEY` is not set, `resolveEnvRef("{env:OPENAI_API_KEY}")` throws
synchronously inside the `apiKey` getter, which is called during `chat()`. This
bubbles up as an unhandled exception rather than yielding an error chunk.

**Severity**: Medium. The agent loop likely catches this at a higher level, but
the driver contract says it should yield error + done.

### 7d. chatEndpoint does not handle URLs with paths beyond /v1

The endpoint logic:
```ts
if (base.endsWith("/v1")) return `${base}/chat/completions`;
return `${base}/v1/chat/completions`;
```
This works for `https://api.openai.com/v1` and bare domains. But a URL like
`https://proxy.example.com/openai/v1/` would have the trailing slash stripped
and then match `/v1`, which is correct. A URL like
`https://proxy.example.com/api/v2` would get `/v1/chat/completions` appended,
which may or may not be correct. This is an edge case in provider configuration.

**Severity**: Low. Provider configs are user-controlled.

### 7e. stream_options may not be supported by all providers

The request body always includes `stream_options: { include_usage: true }`.
Some OpenAI-compatible providers may reject or ignore this field.

**Severity**: Low. Most providers either support or ignore unknown fields.

### 7f. No retry logic

No exponential backoff or retry on transient failures (429, 500, 503). Each
failure immediately yields an error chunk.

**Severity**: Low-Medium. The agent loop may retry at a higher level.

---

## 8. Existing Test Coverage

`test/unit/openai-stream.test.ts` covers the SSE parser well:
- Text deltas, [DONE], finish_reason=length/stop
- Non-data lines, malformed JSON, empty choices
- Tool call accumulation (single, multiple, concurrent)
- Tool call flush on [DONE], stream end, finish_reason
- Nameless tool call skipping
- Reasoning content
- No-body response, empty stream, abort signal
- Fallback tool call IDs

**Not covered** (addressed in new audit test):
- `OpenAICompatibleDriver.convertMessages()` (message format conversion)
- `OpenAICompatibleDriver.convertTools()` (tool definition format)
- `OpenAICompatibleDriver.chatEndpoint` (URL construction)
- Full `chat()` flow with mocked fetch (request body validation)
- Reasoning-only model handling (system->user conversion, max_completion_tokens)
- Custom headers and env ref resolution
- Error paths at the driver level (non-200, network error, missing body)
- Split-boundary SSE parsing (chunks split mid-line)

---

## 9. Conclusion

The driver is well-structured with clean separation of concerns. The delegation
from `OpenAIDriver` to `OpenAICompatibleDriver` eliminates duplication. The
shared SSE parser handles the full OpenAI streaming protocol including edge
cases like missing [DONE] sentinels.

The main findings are minor: truthy checks on content fields (cosmetic), and
the missing env var crash (medium, but likely caught upstream). No critical bugs.
