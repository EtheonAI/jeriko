# System Architecture

## Design Philosophy

1. **Unix-first**: every capability is a CLI command. No proprietary tool abstractions.
2. **Model-agnostic**: any AI with shell access works. Claude, GPT, Llama, Gemini -- all use the same commands.
3. **Composable**: commands pipe into each other via stdout JSON. `jeriko search "topic" | jeriko notify`.
4. **Zero-runtime**: no daemon needed for CLI commands. The server is optional (for Telegram/WebSocket/triggers).

## Three Layers

```
Layer 3: Server Orchestration
  server/index.js    Express + WebSocket + Telegram + WhatsApp + Triggers
  server/router.js   AI routing (Claude/OpenAI agent loop)
  server/telegram.js 35+ slash commands + free-text -> AI
  server/websocket.js Multi-machine WebSocket hub
  server/triggers/   Reactive automation (cron, webhook, email, http, file)

Layer 2: CLI Commands
  bin/jeriko          Dispatcher (resolves core + plugin commands)
  bin/jeriko-*        Individual commands (28+ core)
  lib/cli.js          Shared infrastructure (parseArgs, ok, fail, run)
  lib/plugins.js      Plugin SDK (registry, trust, env isolation, audit)

Layer 1: Tool Libraries
  tools/system.js     System info functions
  tools/browser.js    Playwright browser control
  tools/files.js      File operations
  tools/shell.js      Shell execution (env-stripped)
  tools/search.js     DuckDuckGo search
  tools/screenshot.js Desktop screenshot
  tools/index.js      Tool registry for Telegram slash commands
```

Layer 1 is pure JavaScript functions. Layer 2 wraps them in CLI commands with arg parsing and formatted output. Layer 3 orchestrates them across machines and messaging platforms.

## Command Execution Flow

```
User types: jeriko sys --format text

bin/jeriko (dispatcher)
  |-- Extract global flags (--format text)
  |-- Resolve command: "sys" -> bin/jeriko-sys (core)
  |-- Set env: JERIKO_FORMAT=text, JERIKO_ROOT=<project>
  |-- Spawn: node bin/jeriko-sys
      |
      bin/jeriko-sys
        |-- parseArgs(process.argv)    -> { flags: {}, positional: [] }
        |-- getSystemInfo()             -> tools/system.js
        |-- ok(data)                    -> formatText(data) -> stdout
        |-- process.exit(0)
```

For plugin commands:

```
User types: jeriko greet Alice

bin/jeriko (dispatcher)
  |-- Resolve command: "greet" -> not in bin/ -> check plugin registry
  |-- resolvePluginBin("greet") -> ~/.jeriko/plugins/.../bin/greet
  |-- Build restricted env via buildPluginEnv()
  |-- Detect shebang (#!/usr/bin/env node)
  |-- Spawn: node <plugin-bin> Alice
```

## AI Execution Flow

```
Telegram message: "What's my system info?"

server/telegram.js
  |-- Auth middleware: isAdminTelegramId(userId)
  |-- Not a slash command -> free text handler
  |-- route(text) -> server/router.js
      |
      server/router.js
        |-- parseCommand(text)           -> { target: "local", command: text }
        |-- getSystemPrompt()            -> BASE_PROMPT + memory context
        |-- executeClaude(command)
            |-- spawn('claude', ['-p', '--output-format', 'text',
            |         '--dangerously-skip-permissions',
            |         '--system-prompt', prompt, command])
            |
            |   Claude reads system prompt (auto-discovered from CLAUDE.md)
            |   Claude runs: jeriko sys --format text
            |   Claude reads output, formulates response
            |
        |-- logSession(command, result)  -> jeriko memory --log
        |-- Return result to Telegram
```

For OpenAI backend:

```
router.js -> executeOpenAI(command)
  |-- POST https://api.openai.com/v1/chat/completions
  |       tools: [{ name: "bash", parameters: { command: string } }]
  |-- Model returns tool_call: bash("jeriko sys --format text")
  |-- router.js executes: execSync("jeriko sys --format text")
  |-- Sends result back as tool response
  |-- Model returns final text
  |-- Loop continues up to 15 turns
```

## Trigger Execution Flow

```
Cron fires: "0 9 * * MON"

server/triggers/engine.js
  |-- Cron callback fires
  |-- fireTrigger(trigger, { type: "cron", time: "..." })
      |
      |-- buildPrompt(trigger, eventData)
      |       "[Trigger Event: cron]\nTrigger: Weekly Report\n..."
      |
      |-- executeAction(trigger, prompt, eventData)
      |   server/triggers/executor.js
      |     |-- mode = trigger.actionType  ("claude" or "shell")
      |     |-- If "claude":
      |     |     spawn('claude', ['-p', prompt])
      |     |     Claude runs jeriko commands, returns result
      |     |-- If "shell":
      |     |     spawn('bash', ['-c', trigger.shellCommand])
      |     |     env includes TRIGGER_EVENT=<json>
      |
      |-- store.update(trigger.id, { runCount++, lastRunAt, lastStatus: 'ok' })
      |-- store.logExecution(trigger.id, { status, output, durationMs })
      |-- notifyUser(trigger, result)
      |       -> Telegram message
      |       -> macOS notification (node-notifier)
      |
      |-- If consecutiveErrors >= 5: auto-disable trigger
      |-- If runCount >= maxRuns: auto-disable trigger
```

Webhook trigger flow:

```
POST /hooks/<triggerId>

server/triggers/webhooks.js
  |-- Verify trigger exists and is enabled
  |-- Optional: verify webhook signature (GitHub, Stripe, HMAC)
  |-- Respond 200 immediately
  |-- Async: fireTrigger(trigger, { type: "webhook", body, headers })
```

## Plugin Architecture

### Directory Layout

```
~/.jeriko/
  plugins/
    registry.json                          # { plugins: { name: meta } }
    jeriko-plugin-example/
      node_modules/
        jeriko-plugin-example/
          jeriko-plugin.json               # manifest
          COMMANDS.md                      # docs for discovery
          PROMPT.md                        # AI context
          bin/mycmd                        # executable
  audit.log                                # JSON Lines audit trail
```

### Registry (`registry.json`)

```json
{
  "plugins": {
    "jeriko-plugin-example": {
      "version": "1.2.0",
      "namespace": "example",
      "path": "/Users/you/.jeriko/plugins/jeriko-plugin-example/node_modules/jeriko-plugin-example",
      "commands": ["mycmd", "myother"],
      "permissions": ["network"],
      "integrity": "sha512-...",
      "trusted": true,
      "trustedAt": "2026-02-23T...",
      "installedAt": "2026-02-20T..."
    }
  }
}
```

### Resolution Order

```
jeriko <command>
  1. Core: bin/jeriko-<command> exists?  -> run it (full env)
  2. Plugin: registry has command name?  -> run plugin bin (restricted env)
  3. Neither: "Unknown command" error
```

Core always wins. A plugin cannot shadow a core command.

### Environment Isolation

Core commands get the full process environment. Plugin commands get a restricted environment:

```
Safe system vars:    PATH, HOME, USER, SHELL, TERM, NODE_ENV, LANG, LC_ALL, TZ
JerikoBot infra:     JERIKO_ROOT, JERIKO_DATA_DIR, JERIKO_FORMAT, JERIKO_QUIET,
                     JERIKO_PLUGIN, JERIKO_NAMESPACE
Declared vars only:  whatever manifest.env[] lists
```

Built by `lib/plugins.js:buildPluginEnv()`. The dispatcher calls it before spawning the plugin process.

---

## Memory System

### Session Log (`data/session.jsonl`)

JSON Lines file. Each entry:

```json
{"ts":"2026-02-23T10:00:00Z","command":"jeriko sys","summary":"hostname=macbook..."}
```

Written by `router.js:logSession()` after every AI command execution. Fire-and-forget (failures don't break routing).

### Key-Value Store (`data/memory.json`)

```json
{"deploy_target":"production","last_backup":"2026-02-22"}
```

Read/write via `jeriko memory --set key --value val` and `jeriko memory --get key`.

### Context Injection

On every AI call, `router.js:getSystemPrompt()` runs:

```bash
jeriko memory --context --raw --limit 5
```

This appends the last 5 session entries and all key-value pairs to the system prompt. The AI sees what it did recently and any persistent state.

---

## Security Model

### Authentication

**WebSocket (multi-machine)**:
- HMAC-SHA256 tokens generated from `NODE_AUTH_SECRET`
- `auth.js:generateToken(nodeName)` creates token
- `auth.js:validateToken(nodeName, token)` uses `crypto.timingSafeEqual`
- Tokens are name-bound -- a token for "macbook" cannot auth as "server"
- If `NODE_AUTH_SECRET` is not set, `generateToken()` throws (refuses insecure tokens)

**Telegram**:
- `auth.js:isAdminTelegramId(userId)` checks against `ADMIN_TELEGRAM_IDS`
- Returns `false` when no IDs are configured (deny-all by default)
- Every message goes through auth middleware before reaching any handler

### Shell Execution Safety

- `tools/shell.js` strips sensitive env vars before spawning child processes
- `SENSITIVE_KEYS` array prevents API keys from leaking to executed commands

### AppleScript Injection Prevention

- `lib/cli.js:escapeAppleScript(str)` sanitizes all user input before AppleScript interpolation
- Used by: notes, remind, calendar, contacts, msg, music, audio

### Plugin Security

See [PLUGINS.md](PLUGINS.md) for full details:
- Untrusted by default
- Env isolation (only declared vars)
- Webhook gating (trusted only)
- Prompt safety (on-demand, non-authoritative)
- Audit log (all actions)
- Integrity hashes (SHA-512)

### Rate Limiting

- Express rate limiter: 120 requests per 60 seconds per IP
- Applied to all HTTP endpoints

---

## Cross-Platform

### Binary Detection

The dispatcher reads the shebang of each command file:

```javascript
const head = fs.readFileSync(bin, { encoding: 'utf-8' }).slice(0, 256);
if (head.startsWith('#!/usr/bin/env node') || head.startsWith('#!/usr/bin/node')) {
  spawn(process.execPath, [bin, ...args]);  // Use current Node.js
} else {
  spawn(bin, args);  // Execute directly (compiled binary, bash script, etc.)
}
```

This means plugins can be written in any language, not just Node.js.

### Platform-Specific Commands

Commands that require macOS (AppleScript) check `process.platform` and fail with a clear message on unsupported platforms. Core commands like `sys`, `fs`, `exec`, `net`, `proc` work everywhere.

---

## HTTP API

The server exposes these endpoints:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Health check: name, status, uptime, node count, active triggers |
| `GET` | `/api/nodes` | List connected WebSocket nodes |
| `GET` | `/api/token/:name` | Generate HMAC auth token for a node |
| `GET` | `/api/triggers` | List all triggers |
| `GET` | `/hooks` | List webhook trigger URLs |
| `POST` | `/hooks/:id` | Receive webhook for trigger |
| `POST` | `/hooks/plugin/:ns/:name` | Receive webhook for plugin (trusted only) |

### Health Check Response

```json
{
  "name": "jerikobot",
  "status": "running",
  "uptime": 3600.5,
  "nodes": 2,
  "activeTriggers": 5
}
```

---

## WebSocket Protocol

### Connection

```
ws://host:3000/ws?name=<nodeName>&token=<hmacToken>

Upgrade path: /ws
Auth: query params name + token
Token validation: HMAC-SHA256 via auth.js
```

### Hub -> Node: Task

```json
{"taskId": "1", "command": "What's the system load?"}
```

### Node -> Hub: Chunk (streaming)

```json
{"taskId": "1", "type": "chunk", "data": "The system load is..."}
```

### Node -> Hub: Result (complete)

```json
{"taskId": "1", "type": "result", "data": ""}
```

### Node -> Hub: Error

```json
{"taskId": "1", "type": "error", "data": "claude exited with code 1"}
```

### Heartbeat

- Hub pings all nodes every 30 seconds
- Nodes respond with pong (automatic in WebSocket protocol)
- `lastPing` timestamp updated on pong

### Timeout

- Tasks timeout after 5 minutes
- If timeout, partial output (accumulated chunks) is returned

---

## Telegram Bot Commands

### Core Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message with command list |
| `/nodes` | List connected WebSocket nodes |
| `/status` | Server health (uptime, memory, nodes, triggers) |
| `/token <name>` | Generate auth token for a node |
| `/tools` | List all registered tool commands |

### Trigger Commands

| Command | Description |
|---------|-------------|
| `/watch <spec>` | Create a new trigger (natural language) |
| `/triggers` | List all triggers with status |
| `/trigger_delete <id>` | Remove a trigger |
| `/trigger_pause <id>` | Pause a trigger |
| `/trigger_resume <id>` | Resume a trigger |
| `/trigger_log` | Recent trigger execution log |

### Tool Commands (35+)

All tools from `tools/index.js` are registered as slash commands:

`/browse`, `/screenshot_web`, `/click`, `/type`, `/links`, `/js`, `/screenshot`, `/ls`, `/cat`, `/write`, `/find`, `/grep`, `/info`, `/sysinfo`, `/ps`, `/net`, `/battery`, `/exec`, `/search`, `/camera`, `/email`, `/notes`, `/remind`, `/calendar`, `/contacts`, `/clipboard`, `/audio`, `/music`, `/msg`, `/location`, `/memory`, `/discover`, `/window`, `/proc`, `/netutil`, `/open`, `/stripe`, `/x`, `/tools`

### Free Text

Any non-slash message is routed to the AI backend (Claude or OpenAI) via `router.js`. The AI uses `jeriko` commands to fulfill the request and the response is sent back to the Telegram chat.

---

## Multi-Machine Architecture

```
                    +------------------+
                    |   Hub (Server)   |
                    |  Express + WS    |
                    |  Telegram Bot    |
                    |  Trigger Engine  |
                    +--------+---------+
                             |
              +--------------+--------------+
              |              |              |
        +-----+-----+  +----+------+  +----+------+
        | Node:      |  | Node:     |  | Node:     |
        | macbook    |  | server    |  | pi        |
        | agent.js   |  | agent.js  |  | agent.js  |
        +------------+  +-----------+  +-----------+
```

### Hub Setup

```bash
# On the hub machine
cp .env.example .env
# Edit .env: set NODE_AUTH_SECRET, TELEGRAM_BOT_TOKEN, etc.
npm start
```

### Node Setup

```bash
# On each remote machine
npm install -g jerikobot

# Generate token (on hub via Telegram):
#   /token macbook
# Or via API:
#   curl http://hub:3000/api/token/macbook

# Configure node
export NODE_NAME=macbook
export NODE_TOKEN=<generated-token>
export PROXY_URL=wss://hub.example.com/ws

# Start agent
npm run agent
# Or: node agent/agent.js
```

### Targeting Nodes

From Telegram or any client:

```
@macbook what's the system load?
@server restart nginx
@pi check temperature
```

Without a prefix, commands run on `DEFAULT_NODE` (default: `local`).

### Token Management

```bash
# Generate via API
curl http://localhost:3000/api/token/mynode

# Generate via Telegram
/token mynode

# Tokens are deterministic: same name + same secret = same token
# Rotate by changing NODE_AUTH_SECRET (invalidates ALL tokens)
```

### Plugin Commands on Remote Nodes

If a remote node has plugins installed, the AI on that node can use them. The hub doesn't need to know about node-specific plugins -- it sends natural language commands to the node's Claude instance, which discovers available commands locally via `jeriko discover`.

### Agent Architecture

The agent (`agent/agent.js`) is 55 lines:
1. Connect to hub via WebSocket with name + token
2. Receive task: `{taskId, command}`
3. Spawn `claude -p` with the command
4. Stream stdout/stderr chunks back to hub
5. Send final result or error
6. Auto-reconnect on disconnect (exponential backoff, max 30s)
