# Error Handling & Logging Audit

**Date:** 2026-03-06
**Scope:** All files under `src/`
**Method:** Exhaustive grep + manual review of critical paths

---

## 1. Global Process Error Handlers

**Status: PRESENT (in daemon mode only)**

`src/daemon/kernel.ts:1756-1766` installs handlers via `installSignalHandlers()`:

- `process.on("uncaughtException")` — logs with stack trace, then initiates graceful shutdown
- `process.on("unhandledRejection")` — logs with stack trace, does NOT crash (continues running)

**Gap:** These handlers are only installed when the daemon boots (`jeriko serve`). CLI commands (`jeriko ask`, `jeriko sys`, etc.) run in standalone processes WITHOUT these handlers. An unhandled rejection in CLI mode will use Node/Bun defaults (which may silently swallow in some versions).

**Severity: MEDIUM** — CLI commands are short-lived, but an unhandled rejection could cause silent data loss.

---

## 2. Empty / Silent Catch Blocks

### Fully Empty `catch {}` (no logging, no action)

| File | Line | Context | Severity |
|------|------|---------|----------|
| `src/cli/commands/files/doc.ts` | 278 | `try { unlinkSync(tmp); } catch {}` | LOW — temp file cleanup |
| `src/cli/commands/files/doc.ts` | 315 | `try { unlinkSync(tmp); } catch {}` | LOW — temp file cleanup |
| `src/cli/commands/files/doc.ts` | 524 | `try { unlinkSync(tmpHtml); } catch {}` | LOW — temp file cleanup |
| `src/cli/commands/files/doc.ts` | 527 | `try { unlinkSync(tmpHtml); } catch {}` | LOW — temp file cleanup |
| `src/daemon/agent/drivers/claude-code.ts` | 129 | `try { proc.kill(); } catch {}` — abort handler | LOW — process already dying |
| `src/daemon/agent/tools/browser/stealth.ts` | 27,36,48,57,64 | 5x `catch (e) {}` in browser init script | LOW — stealth patches, failure is expected in some browsers |
| `src/shared/logger.ts` | 80 | `try { fs.closeSync(this.fd); } catch {}` | LOW — fd close on shutdown |
| `src/shared/logger.ts` | 118 | `catch {}` on write failure — closes fd | LOW — documented best-effort |
| `src/shared/logger.ts` | 138 | `catch {}` on fstatSync — defaults currentSize to 0 | LOW |
| `src/shared/logger.ts` | 141 | `catch {}` on openSync — sets fd to null | LOW — logger goes silent |
| `src/shared/logger.ts` | 172 | `catch {}` on rotation — keeps writing | LOW — best-effort rotation |
| `src/daemon/api/socket.ts` | 163 | `catch {}` on stale socket unlink | LOW — throws a new Error instead |
| `src/daemon/api/socket.ts` | 200 | `try { fs.chmodSync(...); } catch {}` | LOW — best-effort permissions |
| `src/daemon/api/socket.ts` | 222 | Socket cleanup on stop | LOW |
| `src/daemon/api/socket.ts` | 296 | `catch {}` on JSON.parse of IPC line — skips malformed | MEDIUM — silently drops data |
| `src/daemon/api/socket.ts` | 422 | Same pattern in stream handler | MEDIUM |
| `src/daemon/api/websocket.ts` | 114 | `try { ws.close(...); } catch {}` on disconnect | LOW |
| `src/daemon/kernel.ts` | 1747 | `try { await hook(); } catch {}` — shutdown hooks | LOW — best-effort shutdown |
| `src/shared/config.ts` | 251 | `catch {}` in mergeFromFile — silently skips malformed config | MEDIUM — user won't know config is broken |
| `src/daemon/services/relay/client.ts` | 187 | `try { this.ws.close(...); } catch {}` | LOW |

### Catch blocks that swallow with comment but no logging

| File | Line | Context | Severity |
|------|------|---------|----------|
| `src/daemon/agent/orchestrator.ts` | 380 | `catch { /* ignore parse errors */ }` — tool arg parse | LOW — non-critical tracking |
| `src/daemon/agent/orchestrator.ts` | 385 | Same pattern for edit_file tracking | LOW |

**Total: 24 empty/silent catch blocks** (5 MEDIUM, 19 LOW)

---

## 3. Promise Swallowing (`.catch(() => {})` or `.catch(() => null)`)

| File | Line | Pattern | Severity |
|------|------|---------|----------|
| `src/daemon/services/channels/telegram.ts` | 163 | `.catch(() => {})` on answerCallbackQuery | LOW — Telegram API best-effort |
| `src/daemon/services/channels/router.ts` | 383 | `.catch(() => {})` on sendTyping | LOW — typing indicators non-critical |
| `src/daemon/services/channels/router.ts` | 385 | `.catch(() => {})` on sendTyping | LOW |
| `src/shared/oauth-exchange.ts` | 233 | `.catch(() => "")` on response.text() | LOW — fallback for error body |
| `src/shared/oauth-exchange.ts` | 309 | `.catch(() => "")` on response.text() | LOW |
| `src/daemon/services/connectors/base.ts` | 546 | `.catch(() => "")` on res.text() | LOW — fallback for error body |
| `src/daemon/agent/tools/browse.ts` | 556 | `.catch(() => null)` on evaluate | LOW — browser page may be gone |

**Total: 7 promise swallowing instances** (all LOW)

---

## 4. Unprotected JSON.parse Calls

JSON.parse without try-catch in critical paths:

| File | Line | Context | Severity |
|------|------|---------|----------|
| `src/daemon/storage/kv.ts` | 30 | `JSON.parse(row.value)` in kvGet — DB data could be corrupt | HIGH |
| `src/daemon/storage/kv.ts` | 74 | `JSON.parse(row.value)` in kvList — same issue | HIGH |
| `src/cli/backend.ts` | 1028 | `JSON.parse(s.messages).length` — session messages | MEDIUM |
| `src/cli/backend.ts` | 1591 | `JSON.parse(readFs(configPath))` — config file | MEDIUM |
| `src/cli/backend.ts` | 1634 | `JSON.parse(readFs(configPath))` — config file | MEDIUM |
| `src/daemon/agent/orchestrator.ts` | 607 | `JSON.parse(row.value)` — context data | MEDIUM |
| `src/daemon/agent/orchestrator.ts` | 616 | `JSON.parse(resultRow.value)` — result data | MEDIUM |
| `src/daemon/api/routes/share.ts` | 115 | `JSON.parse(s.messages).length` | MEDIUM |
| `src/daemon/api/routes/share.ts` | 143 | `JSON.parse(share.messages).length` | MEDIUM |
| `src/daemon/api/routes/share.ts` | 205 | `JSON.parse(share.messages)` | MEDIUM |
| `src/daemon/services/channels/lifecycle.ts` | 230 | `JSON.parse(readFileSync(configPath))` | MEDIUM |
| `src/daemon/kernel.ts` | 382 | Protected by try-catch | OK |
| `src/daemon/kernel.ts` | 1001 | `JSON.parse(readFileSync(configPath))` | MEDIUM |
| `src/daemon/kernel.ts` | 1050 | `JSON.parse(readFileSync(configPath))` | MEDIUM |
| `src/daemon/kernel.ts` | 1391 | `JSON.parse(s.messages).length` | MEDIUM |
| `src/daemon/services/channels/router.ts` | 3078,3131,3190,3247 | `JSON.parse(readFs(configPath))` (4 instances) | MEDIUM |
| `src/daemon/agent/tools/webdev.ts` | 105,133 | `JSON.parse(readFileSync(pkgPath))` — package.json | MEDIUM |
| `src/daemon/plugin/loader.ts` | 120 | `JSON.parse(raw)` — plugin manifest | MEDIUM |
| `src/cli/commands/plugin/trust.ts` | 92 | `JSON.parse(readFileSync(REGISTRY_FILE))` | MEDIUM |
| `src/cli/commands/plugin/install.ts` | 97 | `JSON.parse(readFileSync(REGISTRY_FILE))` | MEDIUM |
| `src/cli/commands/plugin/uninstall.ts` | 74 | `JSON.parse(readFileSync(REGISTRY_FILE))` | MEDIUM |
| `src/cli/commands/agent/provider.ts` | 33 | `JSON.parse(readFileSync(configPath))` | MEDIUM |
| `src/daemon/services/connectors/slack/connector.ts` | 144 | Protected by try-catch | OK |
| `src/daemon/services/connectors/square/connector.ts` | 54 | Protected by try-catch | OK |

**Total: 26 unprotected JSON.parse** (2 HIGH, 24 MEDIUM)

---

## 5. Critical Path Error Handling Analysis

### Kernel Boot (src/daemon/kernel.ts)

The boot function is a single async function — if any step throws, the entire boot fails and propagates the error. Individual non-fatal steps (billing step 5.5, relay step 10.6, share pruning step 12.5) have try-catch with logging.

**Assessment:** GOOD — Non-fatal steps are isolated; fatal steps (DB, config) are allowed to crash since the daemon can't operate without them.

### Agent Loop (src/daemon/agent/agent.ts)

- LLM streaming errors are caught and yield `{ type: "error" }` events (line 221-226)
- Tool execution errors are caught and returned as error results (line 277-283)
- Circuit breaker (ExecutionGuard) prevents infinite error loops
- Context is always cleaned up via `finally` block

**Assessment:** GOOD — Robust error boundaries with circuit breaking.

### WebSocket (src/daemon/api/websocket.ts)

- JSON.parse protected (line 170-176)
- Auth failures tracked with attempt counter + auto-disconnect
- Message send failures caught and logged

**Assessment:** GOOD

### Relay Client (src/daemon/services/relay/client.ts)

- All JSON.parse calls protected
- All handlers have `.catch()` with logging + error responses
- WebSocket errors logged, automatic reconnection
- Auth timeout prevents hung connections

**Assessment:** GOOD

### Database (src/daemon/storage/db.ts)

- `initDatabase()` has NO try-catch — if SQLite fails, the error propagates
- `runMigrations()` runs in a transaction — partial migration won't corrupt
- `getDatabase()` lazy-inits on first call — errors propagate to caller

**Assessment:** ACCEPTABLE — DB errors should crash the daemon since it can't operate without it. However, `kvGet`/`kvList` have unprotected JSON.parse on stored values (HIGH severity).

### IPC Socket (src/daemon/api/socket.ts)

- Server-side handleMessage has try-catch around JSON.parse AND handler execution
- Client-side sendRequest has timeout + error + close handlers
- Stream handler has event queue + idle timeout + abort signal support

**Assessment:** GOOD — However, malformed JSON lines in both client modes are silently skipped (MEDIUM).

### HTTP Routes (src/daemon/api/app.ts)

- Global `app.onError()` handler catches and logs unhandled route errors
- Individual routes wrap in try-catch where needed

**Assessment:** GOOD

---

## 6. Logging Consistency

### Logger (src/shared/logger.ts)

- Structured JSONL logging with rotation (10MB, 5 files)
- Levels: debug, info, warn, error + audit
- Lazy singleton via `getLogger()`
- Stack traces included when `extra` contains `{ stack }` — NOT automatic

**Gap:** Errors are often logged as just `${err}` which gives only the message, NOT the stack trace. Many catch blocks do `log.error(\`...${err}\`)` instead of `log.error(\`...\`, { stack: err instanceof Error ? err.stack : undefined })`.

### console.log/error/warn Usage

- **487 total** `console.log/error/warn` calls across 54 files in `src/`
- **All in `src/cli/`** — this is CORRECT for CLI commands which output to stdout
- **2 in `src/shared/bus.ts`** — used `console.error` for Bus handler errors (doc comments + actual error reporting)
- **1 in `src/index.ts`** — top-level error handler for dispatcher
- **0 in `src/daemon/`** — daemon code consistently uses the structured logger

**Assessment:** GOOD — CLI uses console for user output; daemon uses structured logger.

---

## 7. Missing Stack Traces in Error Logging

Many error catch blocks log only the message, losing the stack trace:

```typescript
// Pattern found throughout kernel.ts, relay/client.ts, etc.
} catch (err) {
  log.warn(`Something failed: ${err}`);  // loses stack trace
}
```

This makes debugging production issues harder. Should be:
```typescript
} catch (err) {
  log.warn(`Something failed: ${err}`, {
    stack: err instanceof Error ? err.stack : undefined
  });
}
```

**Files with this pattern:** kernel.ts (8 instances), relay/client.ts (5 instances), various route files.

**Severity: MEDIUM** — Information loss in production debugging.

---

## 8. Summary

| Category | Count | Critical | High | Medium | Low |
|----------|-------|----------|------|--------|-----|
| Empty/silent catch blocks | 24 | 0 | 0 | 5 | 19 |
| Promise swallowing | 7 | 0 | 0 | 0 | 7 |
| Unprotected JSON.parse | 26 | 0 | 2 | 24 | 0 |
| Missing process handlers (CLI) | 1 | 0 | 0 | 1 | 0 |
| Missing stack traces | ~13 | 0 | 0 | 13 | 0 |
| **Total** | **71** | **0** | **2** | **43** | **26** |

### HIGH Severity Items (fix recommended)

1. **`src/daemon/storage/kv.ts:30`** — `kvGet()` JSON.parse unprotected. Corrupt DB value crashes daemon.
2. **`src/daemon/storage/kv.ts:74`** — `kvList()` JSON.parse unprotected. Same issue.

### Key Positive Findings

- Daemon has uncaughtException + unhandledRejection handlers
- Hono app has global error handler with stack trace logging
- Agent loop has comprehensive error boundaries + circuit breaker
- Bus.emit() catches handler errors (won't break emit loop)
- Relay client handles all WebSocket lifecycle errors gracefully
- Console vs Logger usage is consistent (CLI=console, daemon=logger)
- All streaming drivers (openai, anthropic, claude-code) protect JSON.parse in SSE parsing
