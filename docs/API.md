# Jeriko Server API Reference

Complete reference for the Jeriko server: HTTP endpoints, WebSocket protocol, Telegram bot commands, AI routing, and webhook receivers.

## Overview

The Jeriko server is a unified runtime combining four interfaces:

| Interface  | Transport          | Purpose                          |
|------------|--------------------|----------------------------------|
| HTTP API   | Express on `:3000` | Health, admin endpoints, webhooks |
| WebSocket  | `/ws` upgrade      | Remote node orchestration        |
| Telegram   | Telegraf polling    | User-facing bot commands + AI    |
| WhatsApp   | Baileys            | Alternative messaging interface  |

Default port: `PROXY_PORT` environment variable (default `3000`).
Rate limit: 120 requests per minute per IP.

## Starting the Server

```bash
# Foreground (development)
npm start

# Background (daemonized)
jeriko server --start

# Check status
jeriko server --status

# Stop
jeriko server --stop

# Restart
jeriko server --restart
```

On startup the server:
1. Loads `.env` configuration
2. Auto-discovers available commands via `jeriko discover --raw` to build the AI system prompt
3. Registers Express routes + webhook receivers
4. Sets up plugin webhook routes for trusted plugins
5. Attaches WebSocket upgrade handler
6. Starts Telegram bot (which initializes the trigger engine)
7. Starts WhatsApp integration
8. Begins listening on `PROXY_PORT`

## Authentication

### Bearer Token (HTTP Admin Endpoints)

Admin API endpoints require a Bearer token matching `NODE_AUTH_SECRET` from `.env`.

```
Authorization: Bearer <NODE_AUTH_SECRET>
```

**Requirements:**
- `NODE_AUTH_SECRET` must be set in `.env`. If unset, admin endpoints return `500 {"error": "NODE_AUTH_SECRET not configured"}`.
- Comparison uses `crypto.timingSafeEqual` to prevent timing attacks.
- Missing header returns `401 {"error": "Authorization required"}`.
- Invalid token returns `403 {"error": "Invalid credentials"}`.

### Telegram Allowlist

Telegram access is controlled by `ADMIN_TELEGRAM_IDS` in `.env` (comma-separated numeric IDs).

```
ADMIN_TELEGRAM_IDS=123456789,987654321
```

**Deny-all default:** If `ADMIN_TELEGRAM_IDS` is empty or unset, ALL Telegram users are denied. This prevents accidental open access.

Unauthorized users receive a single "Unauthorized." reply.

### WebSocket Auth (HMAC-SHA256)

Remote nodes authenticate via HMAC tokens:

```
token = HMAC-SHA256(NODE_AUTH_SECRET, nodeName)
```

Generate tokens via the API or Telegram:
```bash
# HTTP
curl -H "Authorization: Bearer $SECRET" http://localhost:3000/api/token/my-node

# Telegram
/token my-node
```

Validation uses `crypto.timingSafeEqual`. If `NODE_AUTH_SECRET` is unset, all token validation fails (deny-all).

### Webhook Signature Verification

Webhooks support three signature formats, all using `crypto.timingSafeEqual`:

| Format  | Header                  | Signature Value                          |
|---------|-------------------------|------------------------------------------|
| GitHub  | `x-hub-signature-256`   | `sha256=<hex HMAC of body>`              |
| Stripe  | `stripe-signature`      | `t=<timestamp>,v1=<HMAC of "ts.body">`   |
| Raw     | `x-webhook-signature`   | Plain hex HMAC of body                   |

**Fail-closed behavior:** If a trigger or plugin webhook has a secret configured but the incoming request has no signature header (or an invalid signature), the request is rejected. A missing secret configuration means the webhook accepts all requests without verification.

## HTTP Endpoints

### GET /

Health check. No authentication required.

**Response:**
```json
{
  "name": "Jeriko",
  "status": "running",
  "uptime": 3600.123,
  "nodes": 2,
  "activeTriggers": 5
}
```

| Field            | Type   | Description                        |
|------------------|--------|------------------------------------|
| `name`           | string | Always `"Jeriko"`               |
| `status`         | string | Always `"running"`                 |
| `uptime`         | number | Server uptime in seconds           |
| `nodes`          | number | Count of connected WebSocket nodes |
| `activeTriggers` | number | Count of enabled triggers          |

---

### GET /api/nodes

List connected WebSocket nodes. **Requires Bearer auth.**

**Response:**
```json
[
  {
    "name": "macbook-pro",
    "connectedAt": "2026-02-23T10:30:00.000Z",
    "lastPing": "2026-02-23T10:35:00.000Z",
    "alive": true
  }
]
```

| Field         | Type    | Description                              |
|---------------|---------|------------------------------------------|
| `name`        | string  | Node name (from connection query string) |
| `connectedAt` | string  | ISO timestamp of initial connection      |
| `lastPing`    | string  | ISO timestamp of last pong received      |
| `alive`       | boolean | Whether the WebSocket is in OPEN state   |

---

### GET /api/token/:name

Generate an auth token for a named node. **Requires Bearer auth.**

**Parameters:**
- `:name` (path) — Node name to generate a token for.

**Response:**
```json
{
  "name": "my-node",
  "token": "a1b2c3d4e5f6..."
}
```

The returned token is `HMAC-SHA256(NODE_AUTH_SECRET, name)` as a hex string.

---

### GET /api/triggers

List all triggers (enabled and disabled). **Requires Bearer auth.**

**Response:**
```json
[
  {
    "id": "abc123",
    "name": "Cron: daily report",
    "type": "cron",
    "schedule": "0 9 * * *",
    "action": "run daily report and send to me",
    "actionType": "claude",
    "enabled": true,
    "runCount": 14,
    "lastRunAt": "2026-02-23T09:00:00.000Z"
  }
]
```

---

### GET /hooks

List registered webhook endpoints. No authentication required.

**Response:**
```json
[
  {
    "id": "abc123",
    "name": "Webhook: stripe",
    "url": "/hooks/abc123",
    "source": "stripe",
    "enabled": true
  }
]
```

---

### POST /hooks/:triggerId

Receive a webhook for a core trigger. Signature verification applies if `trigger.config.secret` is set.

**Parameters:**
- `:triggerId` (path) — The trigger ID.

**Request body:** Any JSON payload from the external service.

**Validation:**
1. Trigger must exist and be of type `webhook` — otherwise `404 {"error": "Trigger not found"}`.
2. Trigger must be enabled — otherwise `200 {"status": "ignored", "reason": "disabled"}`.
3. If `trigger.config.secret` is set, a valid signature header is required — otherwise `401`.

**Response (success):**
```json
{
  "status": "received",
  "triggerId": "abc123"
}
```

The trigger fires asynchronously after the response is sent. The event data passed to the trigger includes:
```json
{
  "type": "webhook",
  "source": "stripe",
  "headers": { "content-type": "...", "x-github-event": "...", "user-agent": "..." },
  "body": { ... },
  "receivedAt": "2026-02-23T12:00:00.000Z"
}
```

Only safe headers are forwarded: `content-type`, `x-github-event`, `x-github-delivery`, `stripe-signature`, `user-agent`.

---

### POST /hooks/plugin/:namespace/:name

Receive a webhook for a trusted plugin. Only registered for plugins that are trusted and declare webhooks in their manifest.

**Parameters:**
- `:namespace` (path) — Plugin namespace from manifest.
- `:name` (path) — Webhook name from manifest.

**Signature verification:** If the webhook config specifies `verify` (not `"none"`), the secret is read from the environment variable named in `secretEnv`. Fail-closed: rejects if secret is configured but missing from env, or if signature header is missing/invalid.

**Response (success):**
```json
{
  "status": "accepted",
  "plugin": "jeriko-weather",
  "endpoint": "update"
}
```

Returns `202 Accepted` immediately. The plugin handler is spawned asynchronously with a restricted environment (only declared env vars + safe system vars). The handler receives the webhook body on stdin and the `TRIGGER_EVENT` environment variable:
```json
{
  "type": "webhook",
  "source": "namespace",
  "body": "...",
  "receivedAt": "2026-02-23T12:00:00.000Z"
}
```

Handler timeout: 60 seconds. Handler interpreter is auto-detected from shebang (supports any-language plugins).

**Error responses:**
- `500` — Webhook secret env var not configured.
- `401` — Missing or invalid signature header.

All plugin webhook activity is written to the security audit log.

---

### GET /qr

WhatsApp QR code for device pairing. No authentication required.

## WebSocket Protocol

### Connection

**URL:** `ws://host:port/ws?name=<nodeName>&token=<token>`

**Query parameters:**
| Parameter | Required | Description                        |
|-----------|----------|------------------------------------|
| `name`    | Yes      | Unique node name                   |
| `token`   | Yes      | HMAC-SHA256 auth token for this name |

**Upgrade path:** Must be `/ws`. Other paths are rejected (socket destroyed).

**Auth errors:**
- Missing `name` or `token`: `401 Unauthorized` (socket destroyed).
- Invalid token: `403 Forbidden` (socket destroyed).

**Duplicate names:** If a node connects with a name that is already connected, the old connection is terminated and the new one takes over.

### Message Protocol

All messages are JSON over WebSocket text frames.

#### Hub -> Node: Task Assignment

```json
{
  "taskId": "1",
  "command": "check disk usage"
}
```

| Field     | Type   | Description               |
|-----------|--------|---------------------------|
| `taskId`  | string | Unique task identifier    |
| `command` | string | Natural language command   |

#### Node -> Hub: Streaming Chunk

```json
{
  "taskId": "1",
  "type": "chunk",
  "data": "Checking disk usage..."
}
```

Chunks are accumulated in order. Multiple chunks may be sent for a single task.

#### Node -> Hub: Task Complete

```json
{
  "taskId": "1",
  "type": "result",
  "data": "Disk usage: 45% of 500GB"
}
```

On `result`, accumulated chunks are joined and returned as the final output.

#### Node -> Hub: Task Error

```json
{
  "taskId": "1",
  "type": "error",
  "data": "Permission denied"
}
```

On `error`, the task promise is rejected with the error data.

### Heartbeat

- Hub sends WebSocket `ping` every 30 seconds.
- Node responds with `pong` (handled automatically by the ws library).
- `lastPing` is updated on each pong for liveness tracking.

### Task Timeout

- Each task has a 5-minute (300 second) timeout.
- On timeout: if any chunks were accumulated, they are joined and returned as the result.
- If no chunks were received: returns `"(timeout -- no output)"`.
- The task is removed from the pending queue.

## Telegram Bot Commands

All Telegram commands require the sender's ID to be in `ADMIN_TELEGRAM_IDS`. The bot also captures the chat ID from any authorized message for trigger notification delivery.

### System Commands

| Command         | Description                                       |
|-----------------|---------------------------------------------------|
| `/start`        | Welcome message with full command list             |
| `/nodes`        | List connected remote machines (name, connected time, last ping) |
| `/status`       | Server health (uptime, node count, trigger count, memory usage in MB) |
| `/token <name>` | Generate WebSocket auth token for a named node     |

### Trigger Commands

| Command                 | Description                                   |
|-------------------------|-----------------------------------------------|
| `/watch <description>`  | Create a trigger via natural language syntax   |
| `/triggers`             | List all triggers (status, type, runs, last run) |
| `/trigger_delete <id>`  | Delete a trigger permanently                  |
| `/trigger_pause <id>`   | Pause (disable) a trigger                     |
| `/trigger_resume <id>`  | Resume (re-enable) a paused trigger           |
| `/trigger_log`          | Show the 10 most recent trigger executions    |

#### /watch Syntax

The `/watch` command parses natural language trigger definitions:

```
/watch cron "0 9 * * MON" run weekly report
/watch cron every 5m check server health
/watch email from:boss@co.com summarize and notify me
/watch webhook stripe log payment details
/watch http https://mysite.com alert me if it goes down
/watch file /var/log/app.log alert on errors
```

| Type          | Syntax                                    | Config                      |
|---------------|-------------------------------------------|-----------------------------|
| `cron`        | `cron "<schedule>" <action>`              | Standard cron expression    |
| `cron`        | `cron every <N><s\|m\|h> <action>`        | Shorthand interval          |
| `email`       | `email [from:<addr>] <action>`            | IMAP polling every 2 minutes |
| `webhook`     | `webhook <source> <action>`               | Creates POST `/hooks/<id>`  |
| `http_monitor`| `http <url> <action>`                     | Polls every 60 seconds      |
| `file_watch`  | `file <path> <action>`                    | Recursive file watcher      |

All triggers use `actionType: "claude"` by default (the action is processed by the AI backend).

### Tool Commands

All tools from `tools/index.js` are registered as Telegram slash commands. There are 38 tool commands:

| Command             | Description                                      |
|---------------------|--------------------------------------------------|
| `/browse <url>`     | Navigate to URL and get page content             |
| `/screenshot_web [url]` | Take browser screenshot                      |
| `/click <selector>` | Click element on browser page                    |
| `/type <sel> \| <text>` | Type text into input field                   |
| `/links`            | Get all links on current browser page            |
| `/js <code>`        | Execute JavaScript in browser                    |
| `/screenshot`       | Take desktop screenshot                          |
| `/ls <path>`        | List files in directory                          |
| `/cat <path>`       | Read file contents                               |
| `/write <path> \| <content>` | Write content to file                  |
| `/find <dir> <pattern>` | Find files by name pattern                  |
| `/grep <dir> <pattern>` | Search file contents                        |
| `/info <path>`      | Get file metadata                                |
| `/sysinfo`          | Full system information                          |
| `/ps [count]`       | Top processes by CPU usage                       |
| `/net`              | Network interface information                    |
| `/battery`          | Battery status                                   |
| `/exec <command>`   | Execute shell command                            |
| `/search <query>`   | Web search via DuckDuckGo                        |
| `/camera [flags]`   | Webcam photo or video                            |
| `/email [flags]`    | Read emails via IMAP                             |
| `/notes [flags]`    | Apple Notes operations                           |
| `/remind [flags]`   | Apple Reminders operations                       |
| `/calendar [flags]` | Apple Calendar operations                        |
| `/contacts [flags]` | Apple Contacts search/list                       |
| `/clipboard [flags]`| System clipboard read/write                      |
| `/audio [flags]`    | Mic recording, TTS, volume control               |
| `/music [flags]`    | Control Apple Music or Spotify                   |
| `/msg [flags]`      | iMessage send/read                               |
| `/location`         | IP-based geolocation                             |
| `/memory [flags]`   | Session memory view/search/store                 |
| `/discover`         | List available jeriko commands                   |
| `/window [flags]`   | Window and app management (macOS)                |
| `/proc [flags]`     | Process management                               |
| `/netutil [flags]`  | Network utilities (ping, DNS, curl, download)    |
| `/open <target>`    | Open URLs, files, or apps                        |
| `/stripe [flags]`   | Stripe payments, customers, invoices             |
| `/x [flags]`        | X.com (Twitter) operations                       |
| `/twilio [flags]`   | Twilio voice calls, SMS/MMS, recordings          |
| `/install_plugin [flags]` | Install a Jeriko plugin               |
| `/trust_plugin [flags]`  | Trust or revoke a plugin                  |
| `/tools`            | List all available tool commands                 |

Tool commands that return screenshots (desktop, browser, camera) are sent as Telegram photos. Other results are sent as text (truncated to 4000 characters for Telegram's message limit).

### Free Text (AI Routing)

Any non-slash-command text message is routed to the AI backend via `router.js`. The flow:

1. "Processing..." placeholder message is sent immediately.
2. Text is passed to `route()` which parses `@target` and dispatches to the appropriate AI backend.
3. Screenshots (`SCREENSHOT:<path>`) and files (`FILE:<path>`) in the response are extracted and sent as Telegram photos/documents.
4. The "Processing..." message is edited with the final text response.

Target a remote node with `@nodeName` prefix:
```
@macbook-pro check disk usage
```

## AI Router (router.js)

### Routing Logic

1. **Parse target:** Extract `@<target>` from the beginning of the message. Default: `DEFAULT_NODE` env var, or `"local"`.
2. **Remote + connected:** Dispatch via `sendTask()` over WebSocket.
3. **Remote + disconnected:** Throw error: `Node "<name>" is not connected. Use /nodes to see available machines.`
4. **Local:** Execute via the configured `AI_BACKEND`.

### Backends

| `AI_BACKEND`   | Implementation                          | Required Env Vars             |
|----------------|-----------------------------------------|-------------------------------|
| `claude-code`  | Spawns `claude` CLI with system prompt  | (Claude Code must be installed) |
| `claude`       | Anthropic Messages API + bash tool      | `ANTHROPIC_API_KEY`           |
| `openai`       | OpenAI Chat Completions API + bash tool | `OPENAI_API_KEY`              |
| `local`        | Any OpenAI-compatible endpoint          | `LOCAL_MODEL_URL`, `LOCAL_MODEL` |

Default backend: `claude-code`.

#### claude-code Backend

Spawns the `claude` CLI as a subprocess:
```
claude -p --output-format text --dangerously-skip-permissions --system-prompt <prompt> <command>
```
- Timeout: 5 minutes.
- Streams stdout chunks via `onChunk` callback.
- Includes stderr in output.

#### claude Backend (Anthropic API)

Uses the Anthropic Messages API (`/v1/messages`) with a `bash` tool:
- Model: `CLAUDE_MODEL` env var (default: `claude-sonnet-4-20250514`).
- Max tokens: 4096 per response.
- Agent loop: up to 15 turns of tool use.
- Each tool call executes a bash command locally with a 60-second timeout and 1MB max buffer.
- Output truncated to 10,000 characters per tool result.
- Returns `"(max tool call turns reached)"` if the 15-turn limit is hit.

#### openai Backend

Uses the OpenAI Chat Completions API (`/v1/chat/completions`) with a `bash` function tool:
- Model: `OPENAI_MODEL` env var (default: `gpt-4o`).
- Max tokens: 4096.
- Agent loop: up to 15 turns.
- Same bash execution constraints as the claude backend.

#### local Backend

Uses any OpenAI-compatible endpoint (Ollama, LM Studio, vLLM, llama.cpp):
- URL: `LOCAL_MODEL_URL` env var (default: `http://localhost:11434/v1`).
- Model: `LOCAL_MODEL` env var (default: `llama3.2`).
- Optional API key: `LOCAL_API_KEY` env var.
- Uses `stream: false` to avoid the Ollama tool_calls streaming bug.
- Pings `/models` endpoint on first call to verify reachability (3-second timeout).
- Agent loop: up to 15 turns.

### System Prompt

The system prompt is auto-generated on server startup:
```javascript
execSync('node <jeriko-path> discover --raw')
```

This produces a prompt describing all available commands. Before each AI call, session context is injected:
```javascript
execSync('node <jeriko-path> memory --context --raw --limit 5')
```

The final prompt is: `<base prompt>\n\n<session context>`.

### Session Logging

Every routed command and its result are auto-logged to session memory (fire-and-forget):
```javascript
execSync('node <jeriko-path> memory --log --command "..." --summary "..."')
```

The summary is truncated to 300 characters. Logging failures are silently ignored (non-critical).

### Bash Tool Execution

Both the `claude` and `openai` backends share a common `runBash()` function:
- Uses `execSync` with a 60-second timeout.
- Max buffer: 1MB.
- Working directory: project root.
- Inherits `process.env`.
- Output truncated to 10,000 characters.
- On error, combines stdout + stderr (or falls back to error message).

### Status Callbacks

All backends emit status events via `onStatus` callback:

| Event Type      | Description                          |
|-----------------|--------------------------------------|
| `thinking`      | AI is processing                     |
| `responding`    | AI is generating final text response |
| `thinking_text` | AI emitted reasoning text alongside tool calls |
| `tool_call`     | AI requested a bash command (includes `command` field) |
| `tool_result`   | Bash command completed               |

## Rate Limiting

Applied globally via `express-rate-limit`:
- **Window:** 60 seconds.
- **Max requests:** 120 per IP per window.
- **Response on limit:**
```json
{
  "error": "Too many requests"
}
```

The raw body is preserved during JSON parsing (`req.rawBody`) for webhook signature verification.

## Graceful Shutdown

On `SIGINT` or `SIGTERM`:
1. All triggers are stopped (`triggerEngine.stopAll()`).
2. Telegram bot is stopped.
3. HTTP server is closed.
4. Process exits with code 0.

## Error Handling

The server installs global error handlers to prevent crashes:

```javascript
process.on('uncaughtException', (err) => { /* logged, continues */ });
process.on('unhandledRejection', (reason) => { /* logged, continues */ });
```

Both are logged to console but do not terminate the process.

## Environment Variables

| Variable              | Required | Default                         | Description                          |
|-----------------------|----------|---------------------------------|--------------------------------------|
| `PROXY_PORT`          | No       | `3000`                          | HTTP + WebSocket port                |
| `NODE_AUTH_SECRET`    | Yes      | (none, fails if unset)          | Master secret for auth               |
| `ADMIN_TELEGRAM_IDS`  | Yes      | (none, denies all if unset)     | Comma-separated Telegram user IDs    |
| `TELEGRAM_BOT_TOKEN`  | No       | (skips Telegram if unset)       | Telegram Bot API token               |
| `AI_BACKEND`          | No       | `claude-code`                   | AI backend: claude-code/claude/openai/local |
| `DEFAULT_NODE`        | No       | `local`                         | Default target for AI routing        |
| `ANTHROPIC_API_KEY`   | If claude| (none)                          | Anthropic API key                    |
| `CLAUDE_MODEL`        | No       | `claude-sonnet-4-20250514`      | Anthropic model name                 |
| `OPENAI_API_KEY`      | If openai| (none)                          | OpenAI API key                       |
| `OPENAI_MODEL`        | No       | `gpt-4o`                        | OpenAI model name                    |
| `LOCAL_MODEL_URL`     | If local | `http://localhost:11434/v1`     | Local model API endpoint             |
| `LOCAL_MODEL`         | No       | `llama3.2`                      | Local model name                     |
| `LOCAL_API_KEY`       | No       | (none)                          | Optional API key for local endpoint  |
| `IMAP_HOST`           | No       | `imap.gmail.com`                | IMAP host for email triggers         |
| `IMAP_PORT`           | No       | `993`                           | IMAP port for email triggers         |
| `IMAP_USER`           | No       | (none)                          | IMAP username for email triggers     |
| `IMAP_PASSWORD`       | No       | (none)                          | IMAP password for email triggers     |
