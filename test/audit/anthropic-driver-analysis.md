# Anthropic Driver Audit Analysis

## Files Audited

| File | Purpose |
|------|---------|
| `src/daemon/agent/drivers/anthropic.ts` | Native Anthropic driver class |
| `src/daemon/agent/drivers/anthropic-shared.ts` | Message/tool conversion, request building |
| `src/daemon/agent/drivers/anthropic-stream.ts` | SSE stream parser |
| `src/daemon/agent/drivers/anthropic-compat.ts` | Provider-compatible variant (reuses shared) |
| `src/daemon/agent/drivers/signal.ts` | Timeout/abort signal combiner |
| `src/daemon/agent/drivers/index.ts` | Driver types + registry |

## Full Request/Response Flow

```
AnthropicDriver.chat(messages, config)
  1. convertToAnthropicMessages(messages) → { system, messages }
  2. convertToAnthropicTools(config) → tools[]
  3. buildAnthropicHeaders({apiKey, baseUrl}, config) → headers
  4. buildAnthropicRequestBody(config, {system, messages, tools}) → body
  5. withTimeout(config.signal) → composite AbortSignal
  6. fetch(baseUrl + "/v1/messages", { POST, headers, body, signal })
  7. On network error → yield error + done, return
  8. On non-200 → yield error + done, return
  9. yield* parseAnthropicStream({ response })
```

## Message Conversion Logic (`convertToAnthropicMessages`)

### Rules:
1. **system** messages → extracted to top-level `system` field (Anthropic requires this)
2. **tool** messages → converted to `user` role with `tool_result` content block
3. **assistant + tool_calls** → content blocks: optional text + tool_use blocks
4. **user/assistant (plain)** → passed through with string content

### Edge Cases:
- Multiple system messages: **last one wins** (no concatenation) -- each overwrites
- `safeParseArgs("")` returns `{}` (catches empty string JSON parse error)
- `safeParseArgs("invalid")` returns `{}` (catches malformed JSON)
- Assistant with tool_calls but empty content: text block is omitted (correct)
- Tool result content is passed as a string (not a content block array)

### Potential Issue:
- Multiple system messages: only the **last** system message is kept (variable is overwritten, not appended). This is probably intentional since the driver-agnostic format should only have one system message, but if multiple are passed, earlier ones are silently lost.

## Tool Definition Conversion (`convertToAnthropicTools`)

Simple 1:1 mapping:
- `DriverTool.name` → `AnthropicToolDef.name`
- `DriverTool.description` → `AnthropicToolDef.description`
- `DriverTool.parameters` → `AnthropicToolDef.input_schema`

Returns `undefined` when tools array is empty or absent (correctly omitted from body).

## Request Building (`buildAnthropicRequestBody`)

### Body fields:
- `model`, `max_tokens`, `temperature`, `stream: true` (always)
- `system`: from extracted messages OR `config.system_prompt` (messages take priority)
- `messages`, `tools` (if present)
- `thinking`: enabled when `config.extended_thinking` is true

### Extended thinking:
- `budget_tokens = Math.min(max_tokens * 4, 128_000)`
- This is a reasonable heuristic but hardcodes the 128K cap

### System prompt precedence:
- If a system message is found in the messages array, it takes priority
- `config.system_prompt` is used as fallback only when no system message exists in messages

## Headers (`buildAnthropicHeaders`)

- Always includes: Content-Type, x-api-key, anthropic-version (2023-06-01)
- Always includes prompt caching beta (`prompt-caching-2024-07-31`)
- Extended thinking beta added when `config.extended_thinking` is true
- Custom headers merged last (can override anything -- by design for proxies)

## Stream Parsing (`parseAnthropicStream`)

### SSE Protocol Implementation:
1. Reads response body as stream via `getReader()`
2. Splits on newlines, processes `data: ` lines
3. Ignores `[DONE]` sentinel (OpenAI-style, defensive)
4. Parses each line as JSON, skips malformed

### Event Types Handled:
| Event | Action |
|-------|--------|
| `content_block_start` (tool_use) | Initialize tool call accumulator |
| `content_block_delta` (text_delta) | Yield text chunk |
| `content_block_delta` (thinking_delta) | Yield thinking chunk |
| `content_block_delta` (input_json_delta) | Accumulate tool args |
| `content_block_stop` | Yield completed tool_call |
| `message_stop` | Yield done, return |
| `error` | Yield error chunk |

### Tool Call Accumulation:
- `content_block_start` with `type: "tool_use"` initializes `currentToolCall` (id, name)
- `input_json_delta` events concatenate `partial_json` into `toolCallArgs`
- `content_block_stop` finalizes: yields the complete tool_call with accumulated args
- Args are passed as raw string (not parsed) -- the agent layer handles parsing

### Edge Cases:
- `content_block_stop` without a current tool call: no-op (correctly guarded by `&& currentToolCall`)
- No body on response: yields error + done
- `finally` block releases reader lock (proper cleanup)
- Stream ends without `message_stop`: yields done after loop (line 132)

## Error Handling

### Network errors (fetch throws):
- Caught in try/catch around fetch
- Yields `{type: "error", content: "Anthropic request failed: <message>"}` + done
- No retry logic

### HTTP errors (non-200):
- Reads error body as text
- Yields `{type: "error", content: "Anthropic API error <status>: <body>"}` + done
- No retry logic, no rate-limit backoff

### Stream errors:
- Malformed JSON in SSE data: silently skipped (continue)
- `error` event type in stream: yields error chunk but does NOT stop parsing
- No body: yields error + done

### Missing/no retry:
- **No retry on 429 (rate limit)** -- relies on caller
- **No retry on 500/503** -- relies on caller
- This is intentional: drivers are stateless, retry belongs to the agent loop

## Token Counting

**No token counting in the driver itself.** The driver does not parse `message_delta` events which contain `usage` data (input_tokens, output_tokens). Token counting is handled at the agent layer by the `cost.ts` module which estimates based on message content.

### Potential Issue:
The stream parser ignores `message_delta` events entirely. These contain the `usage` field with actual token counts from the API. If precise token tracking is desired, the parser would need to yield usage metadata. Currently, cost estimation is approximate.

## Bugs Found

### Bug 1: `content_block_start` for text blocks not handled
When a `content_block_start` event has `type: "text"`, the parser ignores it. This is fine since text content comes via `text_delta`, but the parser doesn't track which block index is active. If two text blocks exist, they merge seamlessly (acceptable behavior).

### Bug 2: Stream error event does not terminate
When an `error` event type is received from the stream, the parser yields the error but continues processing. The Anthropic API typically sends `error` as a terminal event, so the stream should end naturally, but the parser doesn't explicitly `return` after an error event. If the stream continues sending data after an error, it would be processed. This is a minor robustness concern.

### Bug 3 (Minor): `[DONE]` sentinel handling
Line 68 checks for `[DONE]` which is an OpenAI convention, not Anthropic. Anthropic uses `message_stop`. The check is harmless (defensive) but indicates copy-paste from OpenAI driver. Not a bug, just noise.

### Bug 4 (Minor): System prompt precedence asymmetry
In `buildAnthropicRequestBody`, line 184-185:
```typescript
if (converted.system) body.system = converted.system;
if (config.system_prompt && !converted.system) body.system = config.system_prompt;
```
If `converted.system` is an empty string (falsy), `config.system_prompt` would take over. An empty system message in the conversation would be silently replaced by `config.system_prompt`. Unlikely in practice but technically incorrect.

## Summary

The Anthropic driver is well-structured with clean separation between message conversion, request building, and stream parsing. The shared modules enable code reuse with `AnthropicCompatibleDriver`. No critical bugs found. The main areas for improvement are:
1. Token usage data from `message_delta` events is not captured
2. No retry/backoff logic (intentionally delegated to agent layer)
3. Stream error events don't terminate parsing (minor)
