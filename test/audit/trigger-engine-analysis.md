# Trigger Engine Audit Analysis

Date: 2026-03-06
Files audited:
- `src/daemon/services/triggers/engine.ts`
- `src/daemon/services/triggers/store.ts`
- `src/daemon/services/triggers/webhook.ts`
- `src/daemon/services/triggers/email.ts`
- `src/daemon/services/triggers/cron.ts`
- `src/daemon/services/triggers/file-watch.ts`
- `src/shared/bus.ts`

---

## 1. Trigger Types and Flows

### 1.1 Cron Trigger
- **Creation**: `engine.add()` saves to store, calls `activateTrigger()` if enabled + running.
- **Activation**: Creates `CronTrigger` (wraps `croner` lib), calls `cron.start(onTick)`.
- **Firing**: croner invokes callback. Has overlap protection (`executing` flag skips if previous still running).
- **Error handling**: `executeTriggerAction` errors caught in `.catch()` -> `recordError(trigger)` + bus emit `trigger:error`.
- **Deactivation**: `cron.stop()` + delete from `cronTriggers` map.
- **Cleanup**: `stop()` iterates `cronTriggers` map and deactivates each.

### 1.2 Webhook Trigger
- **Creation**: Stored but NOT activated (passive). No timer/watcher created.
- **Activation**: No-op in `activateTrigger()` switch (webhooks are passive).
- **Firing**: `handleWebhook(id, payload, headers, rawBody?)` is the entry point.
  - Path 1: If `service` field set + ConnectorManager available -> `dispatchToConnector()` for service-specific verification + rich event parsing.
  - Path 2: If `secret` configured -> `WebhookTrigger.verify()` for built-in HMAC/service verification.
  - Path 3: If no secret -> warns but still fires (accepts without verification).
- **Deactivation**: No-op (nothing to clean up for passive triggers).

### 1.3 File Trigger
- **Creation**: Saved to store, calls `activateTrigger()` if enabled + running.
- **Activation**: Creates `FileWatchTrigger`, calls `watcher.start(onEvent)`. Uses `fs.watch` with `recursive: true`.
- **Firing**: fs.watch callback maps events (`rename` -> `create`, `change` -> `modify`). Debounce via `setTimeout` (default 500ms). Fires `executeTriggerAction` with `{event, path}` payload.
- **Error handling**: Errors in `executeTriggerAction` caught in `.catch()` -> `recordError` + bus emit.
- **Deactivation**: `watcher.stop()` closes all FSWatcher instances, clears debounce timers.
- **Cleanup**: `stop()` iterates `fileWatchTriggers` map.

### 1.4 HTTP Trigger
- **Creation**: Saved to store, calls `activateTrigger()` if enabled + running.
- **Activation**: Creates `poll()` async function. Fires immediately (`poll()`), then `setInterval(poll, intervalMs)`. Default interval: 60s.
- **Firing**:
  - Without `jqFilter`: fires on every poll with `{status, body}`.
  - With `jqFilter`: only fires when body changes vs previous (simplified, no actual jq). First poll seeds `lastValue` without firing.
- **Error handling**: fetch errors caught -> `recordError` + bus emit `trigger:error`.
- **Deactivation**: `clearInterval(timer)` + delete from `httpTimers` map.

### 1.5 Email Trigger
- **Creation**: Saved to store, calls `activateTrigger()` if enabled + running.
- **Activation**: Creates `EmailTrigger`, validates config, calls `emailTrigger.start(onMessage)`.
  - Connector mode: polls via connector API (Gmail/Outlook REST). First poll seeds `lastSeenIds` without firing.
  - IMAP mode: connects via TLS, polls INBOX for UNSEEN messages. Tracks `lastSeenUid`.
- **Firing**: `executeTriggerAction` with email metadata payload `{source, type, from, subject, date, snippet, uid}`.
- **Error handling**: Callback errors caught in EmailTrigger, poll errors logged. Engine-level: `.catch()` -> `recordError` + bus emit.
- **Deactivation**: `emailTrigger.stop()` clears interval.
- **Validation**: Requires `connector` name OR valid IMAP credentials (`user` + `password`). Skips activation on validation failure.

### 1.6 Once Trigger
- **Creation**: Saved to store, calls `activateTrigger()` if enabled + running.
- **Activation**:
  - Calculates delay = `max(0, fireAt - now)`.
  - If delay > 2,147,483,647 (~24.8 days, setTimeout limit): uses `setInterval(86400000)` daily checker.
  - Otherwise: uses `setTimeout(delay)`.
- **Firing**: Executes action, then calls `this.disable(trigger.id)` to auto-disable after firing.
- **Error handling**: `.catch()` -> `recordError` + bus emit.
- **Deactivation**: `clearTimeout` + `clearInterval` + delete from `onceTimers` map.

---

## 2. Error Recording and Auto-Disable

- **`recordError(trigger)`**: Increments `trigger.error_count`, saves to store.
- **Threshold**: `MAX_CONSECUTIVE_ERRORS = 5`. When `error_count >= 5`:
  - Calls `this.disable(trigger.id)` (deactivates + sets `enabled=false` + saves).
  - Emits `trigger:error` with message "Auto-disabled after N consecutive errors".
- **`resetErrorCount(trigger)`**: Sets `error_count = 0` and saves, but only if `error_count > 0` (avoids unnecessary writes).
- **Reset points**: Only in `shell` action path after successful exit (exitCode === 0). Agent actions do NOT call `resetErrorCount` on success (they fire-and-forget, errors caught in `.catch()`).
- **Observation/Bug**: The `resetErrorCount` is only called for `shell` actions with exitCode 0. For `agent` actions, errors are caught and `recordError` called, but successful agent completions never reset the counter. This means if an agent action has 4 consecutive errors then succeeds, the error_count stays at 4 and one more error will auto-disable.

---

## 3. Webhook Verification (WebhookTrigger)

### 3.1 Generic (default)
- Header: `x-signature` or `x-webhook-signature`
- Algorithm: HMAC-SHA256 of body, hex-encoded
- Timing-safe comparison

### 3.2 Stripe
- Header: `stripe-signature`
- Format: `t=<timestamp>,v1=<hmac>`
- Signed payload: `${timestamp}.${body}`
- Algorithm: HMAC-SHA256, hex-encoded
- Timestamp validation: rejects if > 300s (5 min) drift
- Timing-safe comparison

### 3.3 GitHub
- Header: `x-hub-signature-256`
- Format: `sha256=<hmac>`
- Algorithm: HMAC-SHA256 of body, hex-encoded
- Timing-safe comparison

### 3.4 PayPal
- Headers: `paypal-transmission-id`, `paypal-transmission-time`, `paypal-transmission-sig`
- Simplified: HMAC-SHA256 of `${transmissionId}|${transmissionTime}|${body}`
- Note: Full PayPal verification requires RSA cert download (not implemented)

### 3.5 Twilio
- Header: `x-twilio-signature`
- Simplified: HMAC-SHA1 of body, base64-encoded
- Note: Full Twilio verification requires URL + sorted params (not implemented)

### 3.6 Timing-Safe Comparison
- `timingSafeCompare(a, b)`: Converts to Buffer, returns false if lengths differ, then uses `timingSafeEqual`.
- **Security note**: Length check before `timingSafeEqual` leaks length info, but this is acceptable for HMAC hex digests which have fixed length.

---

## 4. File Watcher Setup and Teardown

- **Setup**: `FileWatchTrigger.start()` calls `fs.watch(path, {recursive: true}, callback)` for each path.
- **Event mapping**: `rename` -> `create`, `change` -> `modify`. No `delete` detection (noted limitation -- `rename` always maps to `create`).
- **Debounce**: Per-file path, configurable `debounceMs` (default 500ms). Clears previous timer on same file before setting new one.
- **Teardown**: `stop()` calls `watcher.close()` on all FSWatcher instances, clears debounce timers, resets `running` flag.
- **Error handling**: `fs.watch()` errors caught per-path (logged, doesn't prevent other paths from being watched).

---

## 5. HTTP Poll Logic

- **Initial poll**: Fires immediately on activation (not waiting for first interval).
- **Interval**: Default 60,000ms. `setInterval(poll, intervalMs)`.
- **Change detection** (with `jqFilter`):
  - First poll: sets `lastValue`, no fire.
  - Subsequent polls: fires only when body !== lastValue. Payload includes `{status, body, previous}`.
- **Without filter**: fires on every poll with `{status, body}`.
- **Note**: `jqFilter` is NOT actually applied -- the code just compares full body text. Comment says "simplified -- full jq would need a library".

---

## 6. Once Trigger

- **Immediate**: If `delay <= 0` (time already passed), fires immediately via `setTimeout(fn, 0)`.
- **Delayed**: Standard `setTimeout` for delays up to ~24.8 days.
- **Long delay**: For delays > 2,147,483,647ms, uses daily `setInterval` checker.
- **Post-fire**: Always calls `this.disable(trigger.id)` after successful execution.
- **Error path**: Errors still call `recordError` + bus emit, but do NOT disable (only success disables).

---

## 7. Bus Events Emitted

| Event | When | Payload |
|---|---|---|
| `trigger:added` | `add()` | Full `TriggerConfig` |
| `trigger:removed` | `remove()` | `{ id: string }` |
| `trigger:fired` | `executeTriggerAction()` | `TriggerFireEvent { triggerId, type, timestamp, payload }` |
| `trigger:error` | Various error paths | `{ triggerId, error: string }` |

- `trigger:error` is emitted in:
  1. `recordError()` when error_count reaches threshold (auto-disable message)
  2. Cron/file/http/email/once activation error `.catch()` blocks
  3. Agent action `.catch()` block
- Note: Some error paths emit `trigger:error` twice -- once from the `.catch()` block and once from `recordError()` when it hits threshold.

---

## 8. Store Persistence

- **DDL**: `trigger_config` table with CHECK constraint on type.
- **Upsert**: `save()` uses `INSERT ... ON CONFLICT(id) DO UPDATE`.
- **safeParse**: Returns `{}` on corrupt JSON instead of crashing. Used for `config` and `action` columns.
- **Row mapping**: `rowToConfig()` converts SQLite integers to booleans (`enabled`), nulls to undefined.
- **Migration**: `migrateCheckConstraint()` probes CHECK by inserting a dummy `'once'` row, recreates table if it fails.
- **Column migrations**: `run_count`, `error_count`, `max_runs` added via `ALTER TABLE ADD COLUMN` (idempotent with try/catch).
- **recordFire**: Updates `last_fired` timestamp + `run_count`. Accepts optional `runCount` parameter.

---

## 9. Potential Bugs and Issues

1. **Agent action never resets error_count**: `resetErrorCount()` is only called in the `shell` action path (line 791). Agent actions that succeed never reset `error_count`, so errors accumulate across successful runs.

2. **Double `trigger:error` emission on auto-disable**: When a cron/file/http trigger's callback `.catch()` runs, it calls `recordError(trigger)` AND emits `trigger:error`. If `recordError` hits the threshold, it also emits `trigger:error` with the auto-disable message. This results in two `trigger:error` events for the same failure.

3. **HTTP trigger `jqFilter` is a no-op**: The code comments say "simplified" but `jqFilter` is accepted in config and documented, yet only raw body comparison is performed.

4. **File watcher `delete` event never fires**: `mapEvent()` maps `rename` to `create` always. There's no way to detect deletions even though `delete` is a valid event type in `FileConfig.events`.

5. **`handleWebhook` rawBody fallback**: If `rawBody` is not provided, it falls back to `JSON.stringify(payload)`. This may produce a different string than the original HTTP body (different whitespace, key ordering), causing HMAC verification to fail silently.

6. **Once trigger with past time**: If `delay = 0` (time already passed), `setTimeout(fn, 0)` fires asynchronously. The trigger config is saved as `enabled: true` before it fires, so a daemon restart before the microtask runs would re-schedule it (which is actually correct behavior).

7. **`stop()` only iterates specific maps**: The `stop()` method iterates `cronTriggers`, `fileWatchTriggers`, `emailTriggers`, `httpTimers`, `onceTimers` separately. If a trigger type's map is not covered, cleanup would be missed (currently all 5 runtime types are covered, webhooks are passive).
