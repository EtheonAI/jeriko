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
Jeriko infra:     JERIKO_ROOT, JERIKO_DATA_DIR, JERIKO_FORMAT, JERIKO_QUIET,
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
  "name": "Jeriko",
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
npm install -g Jeriko

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

---

## Future Direction: OS-Centric Memory + Thin Gateway

This section captures the planned architecture direction for future Jeriko development.

### Principle

Keep the Node.js server as a thin control gateway. Make Unix/OS + CLI the primary execution and state plane.

- Gateway handles transport: Telegram, WhatsApp, webhook ingress, node connectivity.
- Runtime handles actions, state, memory, and policy enforcement locally.

### OS Connectivity as First-Class Primitive

Jeriko should treat OS-native connectivity as core capability, not an add-on:

1. SSH (`secure remote execution`)
- Execute commands on remote machines using OS-native trust and key management.
- Reuse existing fleet practices (keys, bastions, host policies, audit forwarding).

2. WebSocket (`streaming control plane`)
- Use WebSocket for live task streaming, status updates, chunked output, and node presence.
- Keep WS focused on transport and session routing, not heavy execution logic.

3. Local OS networking/process primitives
- Use native process, filesystem, and network primitives for action reliability.
- Prefer deterministic command wrappers over custom in-app reimplementations.

Target model:
- OS/CLI is the data plane.
- SSH/WS are the connectivity plane.
- Policy/trust/audit are the safety plane.

This preserves Unix leverage while keeping control and observability explicit.

### Memory Model

Use layered memory, not one memory bucket:

1. RAM (`short-term`, volatile)
- Active task context
- Scheduler queues and multitask state
- Recent tool outputs and temporary summaries

2. Disk (`durable`, long-term)
- Append-only event journal (source of truth)
- Periodic snapshots (restart recovery)
- Curated knowledge store (facts/preferences), separate from raw telemetry

Why not cache-only memory:
- Cache expiry loses critical history
- Cache does not provide audit truth
- Raw log streams are too noisy for direct prompt context

### Filesystem Layout (Proposed)

```text
data/
  events/
    events-YYYY-MM-DD.jsonl       # append-only event journal
  snapshots/
    snapshot-latest.json          # last known runtime state
    snapshot-<ts>.json            # periodic checkpoints
  facts/
    memory.json                   # curated long-term facts/preferences
  replay/
    jobs/
      replay-<id>.json            # replay plan + status
  indexes/
    events.idx                    # optional index for fast replay/debug lookup
```

User-level security and plugin state remains under:

```text
~/.jeriko/
  plugins/registry.json
  audit.log
```

### Event Schema (Proposed)

Each line in `events-*.jsonl` should be self-contained:

```json
{
  "ts": "2026-02-23T18:00:00Z",
  "traceId": "trc_abc123",
  "sessionId": "sess_42",
  "type": "command.exec",
  "actor": "router.local",
  "command": "jeriko sys --format text",
  "cwd": "/Users/me/project",
  "envHash": "sha256:...",
  "stdinHash": "sha256:...",
  "stdoutHash": "sha256:...",
  "stderrHash": "sha256:...",
  "exitCode": 0,
  "durationMs": 184
}
```

Suggested event types:
- `command.exec`
- `trigger.fire`
- `webhook.receive`
- `webhook.verify`
- `plugin.install`
- `plugin.trust.grant`
- `plugin.trust.revoke`
- `policy.decision`
- `replay.start`
- `replay.finish`

### Snapshot Schema (Proposed)

`snapshot-latest.json` should prioritize recovery-critical state only:

```json
{
  "ts": "2026-02-23T18:05:00Z",
  "scheduler": {
    "running": ["task_1"],
    "queued": ["task_2", "task_3"]
  },
  "triggers": {
    "enabled": ["trig_a", "trig_b"]
  },
  "memory": {
    "recentSummaries": [
      "checked cpu usage",
      "processed payment webhook"
    ]
  }
}
```

### Context Assembly Rules (Proposed)

When building AI context:

1. Pull recent RAM summaries first (low latency, task-relevant).
2. Pull curated facts from `data/facts/memory.json`.
3. Pull only a bounded window of events by relevance (not raw full logs).
4. Keep chain-of-thought non-persistent by default.

### Audit, Debug, Replay

Audit:
- Append-only records for all security and trust lifecycle actions.
- Include actor, action, status, and trace IDs.

Debug:
- End-to-end traceability: request -> tool call -> output -> user response.
- Error taxonomy and retries captured as events.

Replay:
- Event-driven replay for incident analysis and regression checks.
- Reproducibility bounds should be explicit (cwd/env/inputs may differ over time).

### Thin Gateway Boundary

Target gateway responsibilities:
- Channel adapters and transport
- Authentication and rate limiting
- Webhook intake and routing
- Node connectivity and fanout

Avoid pushing runtime-heavy business logic into gateway services.

### Risks and Mitigations

Risk: Unsafe autonomy from tighter AI-Unix coupling.  
Mitigation: policy gates, trust model, approvals, least-privilege env.

Risk: Unbounded log growth.  
Mitigation: retention windows, compaction, rotation, archive tiers.

Risk: Long-term memory pollution.  
Mitigation: keep curated fact store separate from event telemetry.

### Implementation Study Plan

Phase 1: Design
- Finalize event/snapshot/fact schemas.
- Define retention and compaction policies.
- Define replay contract and determinism boundaries.

Phase 2: Runtime
- In-memory scheduler/task store.
- Append-only event journal writer.
- Snapshot write + restore path.

Phase 3: AI Integration
- Context assembler (RAM summaries + facts + selective events).
- Bounded memory injection and redaction rules.

Phase 4: Ops
- `jeriko audit` and `jeriko replay` tooling.
- Integrity checks and recovery conformance tests.

### Engineering Note: Why Jeriko Ships Faster Than Larger Platforms

Jeriko can ship feature work quickly because it is currently optimized for focused execution paths, while larger platforms often carry broad compatibility and operational guarantees.

Key reasons:

1. Scope profile
- Jeriko: narrower feature surface and fewer abstraction layers.
- Large platforms: many channels/providers/deployment modes for the same user-visible feature.

2. Guarantee profile
- Jeriko can prioritize fast iteration.
- Mature platforms must preserve backward compatibility, migration safety, and stable behavior across versions.

3. Governance overhead
- Production-scale systems implement approvals, policy enforcement, audit surfaces, and security checks across every feature path.

4. Normalization cost
- Supporting one feature across multiple providers and runtimes requires adapters, retries, schema transforms, and fallback handling.

5. Test and ops footprint
- Large systems include extensive test matrices, observability hooks, and incident hardening, which increases code volume significantly.

Practical guidance for Jeriko:
- Keep the command-first architecture lean.
- Add complexity only where real failures require it.
- Preserve fast shipping in core runtime, but treat security-critical paths (auth/webhooks/plugins/memory) with strict test coverage and hardening.
