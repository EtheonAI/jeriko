# Kernel Boot Sequence & Agent Loop Audit

## Boot Sequence (15 steps + sub-steps)

### Step 0: Load Secrets
- **File**: `src/shared/secrets.js` (dynamic import)
- **Action**: Loads `~/.config/jeriko/.env` into `process.env`
- **Failure mode**: If `.env` missing or unreadable, downstream config reads may fail. No try/catch — an exception here crashes boot entirely.
- **Risk**: HIGH — uncaught error terminates the entire daemon.

### Step 1: Load Configuration
- **Action**: `loadConfig()` reads `~/.config/jeriko/config.json`
- **Failure mode**: Throws if config is malformed or missing required fields.
- **Risk**: HIGH — uncaught, kills the boot. Intentional (daemon can't run without config).

### Step 2: Initialize Logger
- **Action**: `getLogger()` with config-driven level/rotation.
- **Failure mode**: Unlikely to fail (falls back to console).

### Steps 3-4: Database + Migrations
- **Action**: `initDatabase(config.storage.dbPath)` — opens SQLite, runs migrations.
- **Failure mode**: Throws if DB path is invalid, disk full, or migration SQL is broken.
- **Risk**: HIGH — uncaught, kills boot. Intentional.

### Step 5: Security Policies
- **Action**: Logs policy counts. No actual initialization — policies are read from config at exec time.
- **Failure mode**: None (just logging).

### Step 5.5: Billing License Refresh
- **Action**: Checks Stripe license if billing is configured and stale.
- **Failure mode**: Wrapped in try/catch. Logs warning on failure.
- **Risk**: LOW — non-fatal. Free tier continues to work.

### Step 6: Register Built-in Tools
- **Action**: `Promise.all([import("./agent/tools/*.js")])` — 16 tool modules.
- **Failure mode**: If any import fails, the entire `Promise.all` rejects. This is NOT caught — boot crashes.
- **Risk**: MEDIUM — a broken tool module kills the daemon. Could use `Promise.allSettled` instead to degrade gracefully.

### Step 7: LLM Drivers + Model Registry
- **Action**: `loadModelRegistry()` fetches from models.dev (non-fatal fallback), imports drivers, registers custom providers, discovers presets.
- **Failure mode**: `loadModelRegistry()` is noted as non-fatal. Custom provider registration could throw if config is malformed. `Promise.all` wraps both — if driver import fails, boot crashes.
- **Risk**: MEDIUM — model registry failure is expected to be non-fatal, but the `Promise.all` with driver import could fail.

### Step 8: Worker Pool
- **Action**: `new WorkerPool({ maxWorkers: 4 })`.
- **Failure mode**: Constructor — unlikely to fail.

### Step 9: Channel Registry + System Prompt + Router
- **Action**: Creates `ChannelRegistry`, conditionally registers Telegram/WhatsApp channels, loads system prompt from `agent.md`, injects skill summaries and persistent memory, starts channel router.
- **Failure mode**: System prompt loading wrapped in try/catch (non-fatal — agent runs without identity). Skill injection wrapped in try/catch. Memory injection wrapped in try/catch.
- **Risk**: LOW — all optional enrichments are guarded.

### Step 10: Trigger Engine
- **Action**: `new TriggerEngine()`.
- **Failure mode**: Constructor — unlikely to fail.

### Step 10.5: Connector Manager
- **Action**: Creates `ConnectorManager`, wires it to trigger engine and connector tool, sets up channel notification targets.
- **Failure mode**: Not wrapped — if dynamic imports fail, boot crashes.
- **Risk**: LOW — imports are internal modules.

### Step 10.6: Relay Client
- **Action**: Checks userId/relayToken/selfHosted, creates `RelayClient`, wires webhook/OAuth/share forwarding, calls `relay.connect()`.
- **Failure mode**: Entire block wrapped in try/catch. Logs warning on failure.
- **Risk**: LOW — non-fatal. All local features work without relay.

### Step 11: Plugins
- **Action**: `new PluginLoader(); await plugins.loadAll()`.
- **Failure mode**: Not wrapped — if plugin loading throws, boot crashes.
- **Risk**: MEDIUM — untrusted plugins could break boot. Should be wrapped.

### Step 12: Start Trigger Engine
- **Action**: `triggers.start()` loads persisted triggers from SQLite, registers webhook triggers with relay.
- **Failure mode**: Not wrapped — if start() throws, boot crashes.
- **Risk**: LOW — internal operations, unlikely to fail.

### Step 12.5: Prune Expired Shares
- **Action**: `pruneExpiredShares()`.
- **Failure mode**: Wrapped in try/catch. Logs warning.
- **Risk**: NONE — non-fatal housekeeping.

### Step 13: Connect Channels
- **Action**: `channels.connectAll()`.
- **Failure mode**: Not wrapped at kernel level. If `connectAll()` throws, boot crashes.
- **Risk**: MEDIUM — network failures (Telegram API down, WhatsApp auth expired) could prevent boot.

### Step 14: Socket IPC Server
- **Action**: `startSocketServer()` + registers ~40 IPC methods.
- **Failure mode**: Socket bind failure (stale socket, permissions) throws.
- **Risk**: MEDIUM — stale daemon.sock can block startup. Socket cleanup at start mitigates this.

### Step 15: HTTP Server
- **Action**: `startServer(app, { port })`.
- **Failure mode**: Port already in use throws.
- **Risk**: MEDIUM — common failure if another daemon instance is running.

### Post-boot: Signal Handlers
- **Action**: `installSignalHandlers()` — SIGINT, SIGTERM, uncaughtException, unhandledRejection.
- **Guard**: `signalsInstalled` flag prevents double-registration.

---

## Shutdown Sequence (7 steps)

1. **HTTP server stop** — `stopServer()`, nulls state.server
2. **Socket IPC stop** — `stopSocketServer()`, cleans up daemon.sock
3. **Channels disconnect** — `channels.disconnectAll()`, nulls state.channels
4. **Relay disconnect** — `relay.disconnect()`, nulls state.relay
5. **Connectors shutdown** — `connectors.shutdownAll()`, nulls state.connectors
6. **Trigger engine stop** — `triggers.stop()`, nulls state.triggers
7. **Plugins unload** — `plugins.unloadAll()`, nulls state.plugins
8. **Worker pool drain** — `workers.drain()`, nulls state.workers
9. **Database close** — `closeDatabase()`, nulls state.db
10. **Logger close** — `log.close()`

**Guard**: `state.phase` check — only runs from "running" or "booting" states. No double-shutdown.

**Signal handler**: Calls `shutdown()`, then runs registered `shutdownHooks`, then `process.exit(0)`.

**PID file**: Cleaned via `onShutdown()` hook registered externally.

**uncaughtException**: Triggers full shutdown + exit.

**unhandledRejection**: Logged only — does NOT crash the process.

---

## Agent Loop Lifecycle

### Entry: `runAgent(config, conversationHistory)`

1. **Resolve model** — alias to real ID via `resolveModel()`. Local models probed via Ollama.
2. **Detect capabilities** — `getCapabilities()` returns context window, tool support, reasoning, costs.
3. **Build driver config** — max_tokens capped at min(model maxOutput, 16384). Temperature defaults to 0.3.
4. **Compaction threshold** — 75% of model context window.
5. **Initialize ExecutionGuard** — per-run instance, no shared state.

### Loop (max 40 rounds by default):

For each round:
1. **Guard: duration check** — 10-minute wall-clock limit.
2. **Context compaction** — if tokens >= 75% of context window and messages > 4, compact to system + first + last 6.
3. **Stream LLM response** — yields text_delta, thinking, tool_call_start events.
4. **On stream error** — catches, yields error event, logs, returns.
5. **Persist assistant message** — `addMessage()` + `addPart()` to SQLite.
6. **No tool calls** — yield turn_complete, return.
7. **Execute tool calls**:
   - Unknown tool → error result sent back to LLM.
   - Rate-limited tool → error result sent back.
   - Tool throws → caught, error result sent back.
8. **Guard: circuit breaker** — if ALL tool calls failed for 5 consecutive rounds, stop.

### Post-loop:
- Max rounds exceeded → yields error event + turn_complete.
- `finally` block → `clearActiveContext()` always runs.

### Error Handling Summary:
- **Tool throws**: Caught, error sent to LLM as tool result (self-correction opportunity).
- **LLM stream error**: Caught, yields error event, terminates loop.
- **Malformed tool args**: `parseToolArgs()` has JSON repair (trailing commas, single quotes, unquoted keys, markdown fences). Falls back to raw parse on repair failure.
- **Infinite loop**: maxRounds (40) + ExecutionGuard duration (10 min) + circuit breaker (5 consecutive error rounds).
- **Session persistence**: Messages are persisted per-round (assistant + tool results). If crash occurs mid-round, all prior rounds are saved.

---

## Channel Router

### Message Flow:
1. **Event**: `channel:message` on ChannelRegistry bus.
2. **Slash commands** (`/` prefix): handled synchronously via `handleCommand()`.
3. **Normal messages**: queued per-chat (sequential processing).
4. **Timeout**: 5-minute per-message timeout via `Promise.race`.
5. **Stuck run cleanup**: on timeout, the active run's AbortController is aborted.

### processMessage():
1. Creates AbortController + typing indicator.
2. Sends "Processing..." tracked message for live editing.
3. Downloads attachments (if any), prepends to prompt.
4. Gets/creates session state (persisted in KV store).
5. Builds conversation history from DB.
6. Runs agent loop, streaming events with debounced edits (1s interval).
7. On completion: final edit with full response.
8. Scans response + tool results for file paths, sends as photo/document/audio/video.
9. On error: edits tracked message with error text.
10. Finally: clears typing indicator, deletes activeRun.

### Error Isolation:
- Each chat has its own queue — one chat's error doesn't affect others.
- Each processMessage has its own AbortController.
- safeSend/editSafe swallow errors to prevent cascading failures.
- 5-minute timeout prevents resource leaks from stuck LLM calls.

### Commands Routed:
`/help`, `/new`, `/stop`, `/clear`, `/kill`, `/session`, `/sessions` (switch/delete/rm/rename), `/switch`, `/archive`, `/model` (list/add/switch), `/status`, `/connect`, `/disconnect`, `/auth`, `/connectors`, `/providers`, `/channels`, `/billing`, `/notifications`, `/config`, `/sys`, `/skill`, `/task`, `/share`, `/history`

---

## Findings

### Critical Issues
1. **Step 0 (secrets) and Step 1 (config) have no try/catch** — if ~/.config/jeriko is missing or corrupt, the daemon crashes with an unhelpful stack trace. Should catch and provide actionable error messages.

2. **Step 6 (tools) uses `Promise.all`** — one broken tool import kills all tool registration. `Promise.allSettled` would allow the daemon to boot with degraded tool availability.

3. **Step 11 (plugins) has no try/catch** — a malicious or broken plugin crashes the daemon during boot.

4. **Step 13 (channel connect) has no try/catch** — network failures during channel connection prevent daemon startup entirely.

### Medium Issues
5. **No boot timeout** — if any step hangs (e.g., `loadModelRegistry()` fetching models.dev on a slow connection), the entire boot hangs indefinitely.

6. **Connector wiring (step 10.5)** — dynamic imports are not wrapped, but these are internal modules unlikely to fail.

7. **Signal handler race** — `uncaughtException` calls `handler()` which calls `shutdown()`. If `shutdown()` itself throws, the process may hang. The shutdown steps don't have individual try/catch guards.

### Low Issues
8. **Socket path hardcoded** — `~/.jeriko/daemon.sock` is not configurable. Multiple daemon instances would conflict.

9. **Shutdown order** — Channels are disconnected before triggers are stopped. If a trigger fires during this window, it may try to send a notification through a disconnected channel.

10. **Memory leak potential** — `chatQueues` Map entries are cleaned up after completion, but if a promise never resolves (stuck LLM), the entry persists. The 5-minute timeout mitigates this.
