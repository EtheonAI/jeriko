# Storage Layer Audit Analysis

**Date:** 2026-03-06
**Scope:** `src/daemon/storage/`, session/message/part stores, KV store, share store, trigger store, billing store

---

## 1. Database Initialization Flow

```
getDatabase() [singleton]
  -> initDatabase(dbPath?)
    -> mkdirSync(dir, { recursive: true })  [ensures parent dir]
    -> new Database(dbPath, { create: true })
    -> PRAGMA journal_mode = WAL
    -> PRAGMA synchronous = NORMAL
    -> PRAGMA busy_timeout = 5000
    -> PRAGMA cache_size = -64000  (64 MB)
    -> PRAGMA foreign_keys = ON
    -> runMigrations(db)
      -> CREATE TABLE IF NOT EXISTS _migrations
      -> SELECT applied; for each unapplied: transaction { exec(sql); INSERT _migrations }
    -> _db = db  [set singleton]
```

**Key observations:**
- Singleton pattern via module-level `_db` variable (safe in single-process Bun)
- WAL mode enables concurrent reads during writes
- `busy_timeout = 5000` prevents immediate SQLITE_BUSY errors
- Foreign keys explicitly enabled (SQLite default is OFF)
- `closeDatabase()` nulls singleton, allowing re-init

---

## 2. Migrations (in order)

| # | File | Purpose | Tables affected |
|---|------|---------|-----------------|
| 1 | `0001_init.sql` | Initial schema | session, message, part, audit_log, trigger_def, key_value |
| 2 | `0002_orchestrator.sql` | Sub-agent support | session (ADD COLUMN x2), agent_context (CREATE) |
| 3 | `0003_trigger_consolidate.sql` | Drop unused table | trigger_def (DROP) |
| 4 | `0004_share.sql` | Shared sessions | shared_session (CREATE) |
| 5 | `0005_billing.sql` | Billing subsystem | billing_subscription, billing_event, billing_license (CREATE) |
| 6 | `0006_billing_consent.sql` | Chargeback defense | billing_consent (CREATE) |

**Migration mechanism:**
- Tracked in `_migrations` table by filename
- Each runs inside a transaction
- Idempotent: `CREATE TABLE IF NOT EXISTS` / `IF EXISTS` guards
- Embedded as text via Bun's `import ... with { type: "text" }` for compiled binary

---

## 3. All Tables and Schemas

### Core tables (0001_init.sql):

**session** — Conversation sessions
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PRIMARY KEY |
| slug | TEXT | NOT NULL |
| title | TEXT | NOT NULL |
| model | TEXT | NOT NULL |
| created_at | INTEGER | NOT NULL |
| updated_at | INTEGER | NOT NULL |
| archived_at | INTEGER | nullable |
| token_count | INTEGER | NOT NULL DEFAULT 0 |
| parent_session_id | TEXT | FK->session(id) ON DELETE SET NULL (added in 0002) |
| agent_type | TEXT | NOT NULL DEFAULT 'general' (added in 0002) |

Indexes: idx_session_created_at, idx_session_slug, idx_session_archived_at, idx_session_parent, idx_session_agent_type

**message** — Messages within sessions
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PRIMARY KEY |
| session_id | TEXT | NOT NULL FK->session(id) ON DELETE CASCADE |
| role | TEXT | NOT NULL CHECK (role IN ('user','assistant','system','tool')) |
| content | TEXT | NOT NULL |
| tokens_input | INTEGER | NOT NULL DEFAULT 0 |
| tokens_output | INTEGER | NOT NULL DEFAULT 0 |
| created_at | INTEGER | NOT NULL |

Indexes: idx_message_session_id, idx_message_created_at, idx_message_session_time

**part** — Structured parts of messages
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PRIMARY KEY |
| message_id | TEXT | NOT NULL FK->message(id) ON DELETE CASCADE |
| type | TEXT | NOT NULL CHECK (type IN ('text','tool_call','tool_result','error')) |
| content | TEXT | NOT NULL |
| tool_name | TEXT | nullable |
| tool_call_id | TEXT | nullable |
| created_at | INTEGER | NOT NULL |

Indexes: idx_part_message_id, idx_part_tool_call_id

**audit_log** — Agent command execution audit trail
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PRIMARY KEY |
| lease_id | TEXT | NOT NULL |
| agent | TEXT | NOT NULL |
| command | TEXT | NOT NULL |
| risk | TEXT | NOT NULL |
| decision | TEXT | NOT NULL |
| reason | TEXT | NOT NULL |
| duration_ms | INTEGER | nullable |
| exit_code | INTEGER | nullable |
| created_at | INTEGER | NOT NULL |

Indexes: idx_audit_log_created_at, idx_audit_log_lease_id, idx_audit_log_agent

**key_value** — Generic KV store
| Column | Type | Constraints |
|--------|------|-------------|
| key | TEXT | PRIMARY KEY |
| value | TEXT | NOT NULL |
| updated_at | INTEGER | NOT NULL |

### Added by migrations:

**agent_context** (0002) — Sub-agent structured context
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PRIMARY KEY |
| session_id | TEXT | NOT NULL FK->session(id) ON DELETE CASCADE |
| kind | TEXT | NOT NULL CHECK (kind IN ('tool_call','file_write','file_edit','artifact','error','metric')) |
| key | TEXT | NOT NULL |
| value | TEXT | NOT NULL |
| created_at | INTEGER | NOT NULL |

Indexes: idx_agent_context_session, idx_agent_context_kind

**shared_session** (0004) — Public share links
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PRIMARY KEY |
| share_id | TEXT | NOT NULL UNIQUE |
| session_id | TEXT | NOT NULL FK->session(id) ON DELETE CASCADE |
| title | TEXT | NOT NULL |
| model | TEXT | NOT NULL |
| messages | TEXT | NOT NULL DEFAULT '[]' |
| created_at | INTEGER | NOT NULL |
| expires_at | INTEGER | nullable |
| revoked_at | INTEGER | nullable |

Indexes: idx_shared_session_share_id (UNIQUE), idx_shared_session_session_id, idx_shared_session_created_at

**trigger_config** (self-bootstrapped by TriggerStore, NOT in migrations)
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PRIMARY KEY |
| type | TEXT | NOT NULL CHECK (type IN ('cron','webhook','file','http','email','once')) |
| enabled | INTEGER | NOT NULL DEFAULT 1 |
| config | TEXT | NOT NULL DEFAULT '{}' |
| action | TEXT | NOT NULL DEFAULT '{}' |
| label | TEXT | nullable |
| run_count | INTEGER | NOT NULL DEFAULT 0 |
| error_count | INTEGER | NOT NULL DEFAULT 0 |
| max_runs | INTEGER | NOT NULL DEFAULT 0 |
| last_fired | TEXT | nullable |
| created_at | TEXT | NOT NULL |

**billing_subscription** (0005)
**billing_event** (0005)
**billing_license** (0005)
**billing_consent** (0006)

---

## 4. Store Operations

### Session Store (`src/daemon/agent/session/session.ts`)
- `createSession(opts?)` — INSERT with UUID, auto-generated slug, defaults
- `getSession(id)` — SELECT by ID
- `getSessionBySlug(slug)` — SELECT by slug
- `listSessions(limit?, includeArchived?)` — SELECT ORDER BY updated_at DESC
- `archiveSession(id)` — UPDATE archived_at
- `deleteSession(id)` — DELETE (CASCADE handles children)
- `updateSession(id, updates)` — Partial update (title, model, token_count) with separate statements
- `touchSession(id)` — UPDATE updated_at only

### Message Store (`src/daemon/agent/session/message.ts`)
- `addMessage(sessionId, role, content, tokens?)` — INSERT + touch session + increment token_count
- `getMessages(sessionId, limit?)` — SELECT ORDER BY created_at ASC
- `getRecentMessages(sessionId, count)` — Subquery: last N desc, re-order asc
- `getSessionTokenCount(sessionId)` — SUM(tokens_input + tokens_output)
- `deleteMessage(id)` — DELETE
- `clearMessages(sessionId)` — DELETE all + reset token_count
- `addPart(messageId, type, content, toolName?, toolCallId?)` — INSERT
- `getParts(messageId)` — SELECT ORDER BY created_at ASC
- `getPartsByType(messageId, type)` — SELECT filtered

### KV Store (`src/daemon/storage/kv.ts`)
- `kvSet(key, value)` — UPSERT (INSERT ... ON CONFLICT DO UPDATE), JSON.stringify
- `kvGet<T>(key)` — SELECT + JSON.parse
- `kvDelete(key)` — DELETE
- `kvList(prefix?)` — SELECT with optional LIKE prefix + '%'

### Share Store (`src/daemon/storage/share.ts`)
- `createShare(opts)` — INSERT with UUID + random base64url share_id
- `getShare(shareId)` — SELECT + filter revoked/expired
- `getShareRaw(shareId)` — SELECT without filtering
- `revokeShare(shareId)` — UPDATE revoked_at
- `listSharesBySession(sessionId)` — SELECT active shares
- `listShares(limit?)` — SELECT all
- `pruneExpiredShares()` — DELETE expired + revoked >7d

---

## 5. WAL Mode and Journal Settings

- **journal_mode = WAL**: Write-Ahead Logging allows concurrent reads during writes
- **synchronous = NORMAL**: Good balance of durability vs. performance (safe with WAL)
- **busy_timeout = 5000**: 5-second retry on contention
- **cache_size = -64000**: 64 MB page cache (negative = KiB)
- **foreign_keys = ON**: Enforces FK constraints (critical for CASCADE deletes)

---

## 6. Error Handling

- `initDatabase()` does not catch errors — exceptions propagate to caller (appropriate for boot)
- `runMigrations()` wraps each migration in a transaction — failure rolls back that migration only
- `TriggerStore.ensureTable()` catches and re-throws with logging
- `TriggerStore.migrateCheckConstraint()` uses manual BEGIN/ROLLBACK for table recreation
- KV store operations have no error handling — relies on caller
- Share store operations have no error handling — relies on caller
- `safeParse()` in TriggerStore prevents corrupt JSON from crashing

---

## 7. Potential Issues and Bugs

### Issue 1: `kvList` SQL injection via LIKE pattern
In `kv.ts` line 61, the prefix is passed as a parameter to `LIKE ? || '%'`. This is safe from SQL injection because it uses parameterized queries, BUT the LIKE pattern characters `%` and `_` in the prefix are NOT escaped. If a user stores keys like `session_%`, calling `kvList("session_")` would match `session_x` as well (since `_` is a LIKE wildcard). **Severity: Low** — unlikely to cause issues in practice since keys are internal.

### Issue 2: Non-atomic session update in `updateSession`
`updateSession()` issues separate UPDATE statements for each field (title, model, token_count). If multiple fields are updated simultaneously, each gets its own `updated_at` timestamp and they're not atomic. **Severity: Low** — the time difference is negligible and there's no concurrent writer concern in a single-process daemon.

### Issue 3: `addMessage` non-atomic session touch + token increment
`addMessage()` performs 3 separate SQL statements (INSERT message, UPDATE updated_at, UPDATE token_count) without a transaction. If the process crashes between them, the session metadata could be inconsistent. **Severity: Low** — WAL mode makes partial writes unlikely, and the token_count is advisory.

### Issue 4: Schema DDL constant divergence from migration
The `SQL_CREATE_SESSION` in `schema.ts` includes `parent_session_id` and `agent_type` columns (added by migration 0002), but the actual 0001_init.sql does not. These DDL constants are exported but NOT used at runtime (migrations handle schema creation). **Severity: None** — the constants are informational/for tests, not used for actual table creation.

### Issue 5: `_migrations` table has no index on `name`
The `_migrations.name` column has a UNIQUE constraint which implicitly creates an index. **Severity: None** — this is correct.

### Issue 6: `trigger_def` created then dropped
Migration 0001 creates `trigger_def`, migration 0003 drops it. This is harmless but creates unnecessary work for fresh databases. **Severity: None** — migration ordering is correct and `DROP IF EXISTS` is safe.

### Issue 7: `shared_session` has redundant UNIQUE index
`share_id` has both `UNIQUE` constraint on the column AND a `CREATE UNIQUE INDEX`. The column constraint creates an implicit index, making the explicit one redundant. **Severity: None** — SQLite handles this gracefully (the explicit index just exists as a duplicate).

### Issue 8: TriggerStore CHECK constraint migration uses manual transaction
`migrateCheckConstraint()` uses `db.exec("BEGIN TRANSACTION")` / `db.exec("COMMIT")` instead of `db.transaction()`. This works but is less idiomatic. The error handling properly does ROLLBACK. **Severity: None** — works correctly.

### Issue 9: `getRecentMessages` non-deterministic ordering with same-ms timestamps
`getRecentMessages()` uses a subquery with `ORDER BY created_at DESC LIMIT ?` then re-orders `ASC`. When multiple messages share the same `created_at` timestamp (common in fast loops), both the inner selection and outer ordering are non-deterministic. The function may return an unpredictable subset and order. **Severity: Low** — in practice messages from different turns have different timestamps; only rapid automated inserts trigger this.

---

## Summary

The storage layer is well-designed:
- Clean singleton pattern with proper cleanup
- WAL mode with appropriate PRAGMAs for a single-process daemon
- Migrations are properly ordered, tracked, and transactional
- Foreign keys with CASCADE ensure referential integrity
- All stores follow consistent patterns

No critical bugs found. The minor issues (non-atomic multi-statement updates, LIKE wildcard in kvList) are low-severity given the single-process architecture.
