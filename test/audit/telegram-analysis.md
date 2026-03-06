# Telegram Channel Audit Analysis

## Full Message Flow

```
1. Grammy Bot SDK (long-polling) receives update from Telegram API
2. Type-specific handler fires (message:text, message:photo, etc.)
3. Handler extracts attachments/text, calls dispatchMessage()
4. dispatchMessage():
   a. Checks ctx.from exists (drops if missing)
   b. Admin ID filter: if adminIds is non-empty, sender must be in the set
   c. Builds MessageMetadata (channel, chat_id, is_group, sender_name, etc.)
   d. Calls all registered handlers (this.handlers[])
5. ChannelRegistry.onMessage wiring: adapter.onMessage() emits "channel:message" on bus
6. Router startChannelRouter() listens on bus "channel:message":
   a. Trims text, drops empty
   b. Slash commands ("/") dispatched to handleCommand() immediately
   c. Non-command text queued per-chat (chatQueues Map) for sequential processing
   d. processMessage() wraps with 5-minute timeout + AbortController
7. processMessage():
   a. Sends typing indicator (repeating every 4s)
   b. Sends tracked "Processing..." message for live edits
   c. Downloads file attachments, prepends paths to prompt
   d. Gets or creates session state (persisted in KV)
   e. Runs agent with streaming — debounced live edits every 1s
   f. Final response: edit tracked message or send new
   g. Scans response for file paths, auto-sends photos/documents/videos/audio
```

## All Handlers and Their Behavior

### Message Type Handlers (telegram.ts)

| Handler | Text passed | Attachments |
|---------|------------|-------------|
| message:text | ctx.message.text | none |
| message:photo | caption or "[photo]" | photo (largest resolution file_id) |
| message:document | caption or "[document: filename]" | document (file_id, filename, mime) |
| message:voice | "[voice message]" | voice (file_id, mime, duration) |
| message:video | caption or "[video]" | video (file_id, filename, mime, duration) |
| message:audio | caption or "[audio: title]" | audio (file_id, filename, mime, duration) |
| message:animation | caption or "[animation/GIF]" | animation (file_id, filename, mime, duration) |
| message:sticker | "[sticker: emoji]" | sticker (file_id, mime based on type) |
| callback_query:data | callback data string | none (dispatched via dispatchCallback) |

### Sending Methods

| Method | Behavior |
|--------|----------|
| send() | Markdown first, plain text fallback. Truncates at 4096. |
| sendLong() | Splits at 3900 char boundaries (newline-preferred) then calls send() per chunk |
| sendTracked() | Like send() but returns { messageId } for later editing |
| editMessage() | Markdown first, plain fallback, silent failure (best-effort) |
| sendPhoto() | Supports file path (InputFile) or URL string |
| sendDocument() | InputFile from path |
| sendVideo() | InputFile from path |
| sendAudio() | InputFile from path |
| sendVoice() | InputFile from path |
| sendKeyboard() | InlineKeyboard with url/data buttons, Markdown with plain fallback |
| deleteMessage() | Best-effort, silently fails |
| sendTyping() | Best-effort, silently fails |
| downloadFile() | getFile() -> fetch URL -> save to ~/.jeriko/data/files/ |

### Router Slash Commands

/help, /start, /commands, /new, /stop, /clear, /kill, /session, /sessions (hub + switch/delete/rm/rename),
/switch, /archive, /model (hub + list/add), /status, /connect, /disconnect, /connectors, /auth,
/health, /channels, /notifications, /share, /billing, /providers, /skill, /triggers, /tasks,
/history, /sys, /config

## Edge Cases and Findings

### 1. Empty Messages
- Router trims and drops empty text (`if (!text) return`). Good.
- But: photos/documents with no caption pass "[photo]" / "[document: file]" as text, so they are never empty. Good.

### 2. Oversized Messages
- send() truncates to 4096 chars (`message.slice(0, 4096)`). Correct for Telegram limit.
- sendLong() splits at 3900 chars at newline boundaries, then each chunk goes through send() which re-truncates at 4096.
- Captions truncated at 1024 chars (Telegram limit). Correct.

### 3. Unauthorized Users (Admin ID Filtering)
- dispatchMessage() checks `this.adminIds.size > 0 && !this.adminIds.has(senderId)`.
- Empty adminIds set means ALL users are allowed (open bot). This is by design.
- dispatchCallback() has the same check. Good.
- No rate limiting or feedback to blocked users (silent drop). Acceptable but noted.

### 4. Network Failures
- send(): If Markdown parse fails, retries as plain text. If plain text also fails, exception propagates.
- sendTracked(): Same pattern. Caller (router) wraps in try/catch.
- editMessage(): Double try/catch with silent failure on second attempt. Best-effort.
- sendTyping(): Silent catch. Good.
- deleteMessage(): Silent catch. Good.
- downloadFile(): Errors propagate — router catches and logs "download failed".

### 5. Malformed Grammy Context
- `ctx.from` checked in dispatchMessage() and dispatchCallback() — returns early if missing.
- `ctx.message` accessed with `!` (non-null assertion) — safe because Grammy guarantees it in specific handlers.

### 6. splitMessage() Edge Cases
- Empty string: returns `[""]` (length 0 <= maxLen). Minor: sends empty message.
- String exactly at maxLen: returns `[text]`. Correct.
- No newlines in long text: falls back to hard split at maxLen. Correct.
- `splitAt <= 0` check: handles case where newline is at position 0. Correct.
- Leading newline after split: stripped via `.replace(/^\n/, "")`. Only strips one newline. If text has multiple consecutive newlines at a split point, subsequent chunks may start with newlines.

### 7. connect() Lifecycle
- Idempotent: `if (this.connected) return`. Good.
- Token validation: throws if `!this.config.token`. Good.
- Deletes existing webhook before starting polling (`deleteWebhook`). Good.
- Registers bot commands via `setMyCommands`. Good.
- `bot.start()` is fire-and-forget (no await on the polling loop itself). This is Grammy's design.

### 8. disconnect() Lifecycle
- Idempotent: `if (!this.connected) return`. Good.
- `bot.stop()` is awaited. Good.

### 9. Message ID Handling
- `Number(target)` for chat IDs — could produce NaN for non-numeric strings. Telegram chat IDs are always numeric, so this is fine in practice.
- `Number(messageId)` in editMessage/deleteMessage — same consideration.

## Bugs or Missing Error Handling

### Bug 1: send() partial retry
If the Markdown send throws and the plain-text retry also throws, the error from the retry propagates, losing the original Markdown error context. Not a critical bug but diagnostic information is lost.

### Bug 2: No rate limiting
No Telegram API rate limiting is implemented. Telegram has a 30 messages/second limit per bot (1 message/second per chat for bulk). Rapid sendLong() calls for very long messages could hit rate limits. The splitMessage + sequential send pattern partially mitigates this but doesn't enforce delays.

### Bug 3: splitMessage returns [""] for empty input
`splitMessage("", 3900)` returns `[""]` because `"".length <= 3900` is true. This means sendLong("target", "") would send an empty message. However, the router's empty-text guard prevents this path from being reached via normal flow.

### Observation: No reconnection logic
If the Grammy polling loop fails (network outage), there is no automatic reconnection. Grammy's `bot.start()` has some built-in retry for polling errors, but a catastrophic auth failure (revoked token) would silently stop the bot without recovering. The daemon kernel would need to handle this externally.
