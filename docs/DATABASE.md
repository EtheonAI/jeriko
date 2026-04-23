# Jeriko Database Schema

SQLite database at `~/.jeriko/data/jeriko.db`. Managed by `bun:sqlite` with WAL mode.

## Configuration

```sql
PRAGMA journal_mode = WAL;       -- concurrent reads
PRAGMA synchronous = NORMAL;     -- balanced durability
PRAGMA busy_timeout = 5000;      -- 5s retry on lock
PRAGMA cache_size = -64000;      -- 64 MB cache
PRAGMA foreign_keys = ON;        -- enforce relationships
```

## Entity Relationship

```
session 1──* message 1──* part
  │  (parent_session_id, agent_type for sub-agent sessions)
  └── role: user | assistant | system | tool

session 1──* agent_context    (structured sub-agent artifacts: tool calls, files, errors, metrics)
session 1──* subagent_task    (sync/async/fork/worktree spawn tracking — migration 0007)
session 1──* shared_session   (public snapshot for /share)

trigger_config       (trigger runtime state, 6 types)
audit_log            (security audit trail)
key_value            (general-purpose KV store)
billing_subscription (Stripe subscription state, tier, status)
billing_event        (webhook events for chargeback defense)
billing_consent      (checkout consent evidence: IP, UA, ToS acceptance)
billing_license      (local license cache, grace periods)
_migrations          (schema version tracking)
```

---

## Tables

### session

Conversation sessions between user and AI agent.

```sql
CREATE TABLE session (
  id                TEXT    PRIMARY KEY,          -- UUID
  slug              TEXT    NOT NULL,             -- human-readable slug ("chat-about-api")
  title             TEXT    NOT NULL,             -- display title
  model             TEXT    NOT NULL,             -- LLM model used ("claude", "gpt4", "local")
  created_at        INTEGER NOT NULL,             -- epoch ms
  updated_at        INTEGER NOT NULL,             -- epoch ms (last activity)
  archived_at       INTEGER,                      -- epoch ms (NULL = active)
  token_count       INTEGER NOT NULL DEFAULT 0,   -- running total of tokens used
  parent_session_id TEXT    REFERENCES session(id) ON DELETE SET NULL,  -- sub-agent linkage (0002)
  agent_type        TEXT    NOT NULL DEFAULT 'general'                  -- role preset (0002)
);
```

**Indexes:** `created_at`, `slug`, `archived_at`, `parent_session_id`, `agent_type`

**Example data:**

| id | slug | title | model | created_at | updated_at | archived_at | token_count |
|----|------|-------|-------|------------|------------|-------------|-------------|
| `a1b2c3d4-...` | `debug-auth-flow` | Debug authentication flow | claude | 1709136000000 | 1709137200000 | NULL | 4820 |
| `e5f6g7h8-...` | `refactor-api` | Refactor API routes | gpt4 | 1709130000000 | 1709131000000 | 1709135000000 | 12400 |
| `i9j0k1l2-...` | `quick-question` | Quick question | local | 1709140000000 | 1709140500000 | NULL | 890 |

**Operations:**
```sql
-- Create new session
INSERT INTO session (id, slug, title, model, created_at, updated_at, token_count)
VALUES ('a1b2c3d4-...', 'debug-auth-flow', 'Debug authentication flow', 'claude', 1709136000000, 1709136000000, 0);

-- List active sessions (most recent first)
SELECT * FROM session WHERE archived_at IS NULL ORDER BY updated_at DESC LIMIT 20;

-- Archive a session (soft delete)
UPDATE session SET archived_at = 1709135000000 WHERE id = 'e5f6g7h8-...';

-- Resume an archived session
UPDATE session SET archived_at = NULL, updated_at = 1709140000000 WHERE id = 'e5f6g7h8-...';

-- Hard delete (cascades to messages and parts)
DELETE FROM session WHERE id = 'e5f6g7h8-...';
```

---

### message

Individual messages within a session.

```sql
CREATE TABLE message (
  id            TEXT    PRIMARY KEY,                                           -- UUID
  session_id    TEXT    NOT NULL REFERENCES session(id) ON DELETE CASCADE,     -- parent session
  role          TEXT    NOT NULL CHECK (role IN ('user','assistant','system','tool')),
  content       TEXT    NOT NULL,                                              -- message text
  tokens_input  INTEGER NOT NULL DEFAULT 0,                                   -- input tokens consumed
  tokens_output INTEGER NOT NULL DEFAULT 0,                                   -- output tokens generated
  created_at    INTEGER NOT NULL                                              -- epoch ms
);
```

**Indexes:** `session_id`, `created_at`, composite `(session_id, created_at)`

**Example data:**

| id | session_id | role | content | tokens_input | tokens_output | created_at |
|----|-----------|------|---------|-------------|--------------|------------|
| `msg-001-...` | `a1b2c3d4-...` | user | Can you check the auth middleware? | 12 | 0 | 1709136000000 |
| `msg-002-...` | `a1b2c3d4-...` | assistant | I'll read the auth middleware file... | 12 | 245 | 1709136001000 |
| `msg-003-...` | `a1b2c3d4-...` | tool | {"ok":true,"content":"import { timingSafe..."} | 0 | 0 | 1709136002000 |
| `msg-004-...` | `a1b2c3d4-...` | assistant | The auth middleware uses timing-safe comparison... | 245 | 380 | 1709136003000 |

**Operations:**
```sql
-- Add a message (also updates session timestamp and token count)
INSERT INTO message (id, session_id, role, content, tokens_input, tokens_output, created_at)
VALUES ('msg-001-...', 'a1b2c3d4-...', 'user', 'Can you check the auth middleware?', 12, 0, 1709136000000);

UPDATE session SET updated_at = 1709136000000 WHERE id = 'a1b2c3d4-...';
UPDATE session SET token_count = token_count + 12 WHERE id = 'a1b2c3d4-...';

-- Get conversation history (chronological)
SELECT * FROM message WHERE session_id = 'a1b2c3d4-...' ORDER BY created_at ASC;

-- Get last N messages (for context window)
SELECT * FROM (
  SELECT * FROM message WHERE session_id = 'a1b2c3d4-...' ORDER BY created_at DESC LIMIT 10
) sub ORDER BY created_at ASC;

-- Calculate total tokens for a session
SELECT COALESCE(SUM(tokens_input + tokens_output), 0) AS total FROM message WHERE session_id = 'a1b2c3d4-...';
```

---

### part

Structured components of a message (text blocks, tool calls, tool results).

```sql
CREATE TABLE part (
  id           TEXT PRIMARY KEY,                                          -- UUID
  message_id   TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,    -- parent message
  type         TEXT NOT NULL CHECK (type IN ('text','tool_call','tool_result','error')),
  content      TEXT NOT NULL,                                             -- JSON or plain text
  tool_name    TEXT,                                                      -- tool name (for tool_call/tool_result)
  tool_call_id TEXT,                                                      -- links tool_result to tool_call
  created_at   INTEGER NOT NULL                                           -- epoch ms
);
```

**Indexes:** `message_id`, `tool_call_id`

**Example data:**

| id | message_id | type | content | tool_name | tool_call_id | created_at |
|----|-----------|------|---------|-----------|-------------|------------|
| `p-001-...` | `msg-002-...` | text | I'll read the auth middleware file. | NULL | NULL | 1709136001000 |
| `p-002-...` | `msg-002-...` | tool_call | {"path":"src/daemon/api/middleware/auth.ts"} | read_file | `tc-001` | 1709136001500 |
| `p-003-...` | `msg-003-...` | tool_result | {"ok":true,"content":"import { timing..."} | read_file | `tc-001` | 1709136002000 |
| `p-004-...` | `msg-004-...` | text | The auth middleware uses timing-safe... | NULL | NULL | 1709136003000 |
| `p-005-...` | `msg-004-...` | error | Rate limit exceeded | NULL | NULL | 1709136003500 |

**Operations:**
```sql
-- Store a tool call part
INSERT INTO part (id, message_id, type, content, tool_name, tool_call_id, created_at)
VALUES ('p-002-...', 'msg-002-...', 'tool_call', '{"path":"src/daemon/api/middleware/auth.ts"}', 'read_file', 'tc-001', 1709136001500);

-- Get all parts for a message
SELECT * FROM part WHERE message_id = 'msg-002-...' ORDER BY created_at ASC;

-- Get only tool calls
SELECT * FROM part WHERE message_id = 'msg-002-...' AND type = 'tool_call' ORDER BY created_at ASC;
```

---

### audit_log

Security audit trail for all command executions through the exec gateway.

```sql
CREATE TABLE audit_log (
  id          TEXT    PRIMARY KEY,    -- UUID
  lease_id    TEXT    NOT NULL,       -- execution lease ID
  agent       TEXT    NOT NULL,       -- agent identifier ("agent:daemon", "agent:remote:xyz")
  command     TEXT    NOT NULL,       -- shell command executed
  risk        TEXT    NOT NULL,       -- risk level ("low", "medium", "high", "critical")
  decision    TEXT    NOT NULL,       -- "allow" or "deny"
  reason      TEXT    NOT NULL,       -- why allowed/denied
  duration_ms INTEGER,               -- execution time (NULL if denied)
  exit_code   INTEGER,               -- process exit code (NULL if denied)
  created_at  INTEGER NOT NULL        -- epoch ms
);
```

**Indexes:** `created_at`, `lease_id`, `agent`

**Example data:**

| id | lease_id | agent | command | risk | decision | reason | duration_ms | exit_code | created_at |
|----|---------|-------|---------|------|----------|--------|------------|----------|------------|
| `aud-001-...` | `lease-abc` | agent:daemon | ls -la /tmp | low | allow | standard fs read | 45 | 0 | 1709136000000 |
| `aud-002-...` | `lease-def` | agent:daemon | rm -rf / | critical | deny | blocked by policy | NULL | NULL | 1709136001000 |
| `aud-003-...` | `lease-ghi` | agent:remote:node1 | curl https://api.stripe.com | medium | allow | network access permitted | 1200 | 0 | 1709136002000 |

---

### trigger_config

Runtime trigger configuration. `trigger_config` is the canonical trigger
table — the legacy `trigger_def` was consolidated into it in migration 0003
(see `0003_trigger_consolidate.sql`). Supports 6 trigger types:
`cron`, `webhook`, `file`, `http`, `email`, `once`.

```sql
CREATE TABLE trigger_config (
  id         TEXT    PRIMARY KEY,
  type       TEXT    NOT NULL,       -- "cron", "webhook", "file", "http"
  enabled    INTEGER NOT NULL DEFAULT 1,
  config     TEXT    NOT NULL,       -- JSON: schedule, endpoint, path, etc.
  action     TEXT    NOT NULL,       -- JSON: what to execute when triggered
  label      TEXT,                   -- human-readable label
  last_fired INTEGER,               -- epoch ms
  created_at INTEGER NOT NULL
);
```

**Example data:**

| id | type | enabled | config | action | label | last_fired | created_at |
|----|------|---------|--------|--------|-------|-----------|------------|
| `trig-001` | cron | 1 | {"schedule":"0 9 * * *"} | {"command":"jeriko email unread"} | Morning email check | 1709136000000 | 1709100000000 |
| `trig-002` | webhook | 1 | {"path":"/hooks/stripe","secret":"whsec_..."} | {"command":"jeriko stripe hook"} | Stripe webhook | 1709135000000 | 1709100000000 |
| `trig-003` | file | 1 | {"watch":"/tmp/inbox","pattern":"*.csv"} | {"command":"jeriko doc read"} | CSV watcher | NULL | 1709100000000 |
| `trig-004` | http | 0 | {"url":"https://api.example.com/status","interval":300} | {"command":"jeriko notify"} | API health poll | 1709130000000 | 1709100000000 |

**Operations:**
```sql
-- Upsert a trigger
INSERT INTO trigger_config (id, type, enabled, config, action, label, created_at)
VALUES ('trig-001', 'cron', 1, '{"schedule":"0 9 * * *"}', '{"command":"jeriko email unread"}', 'Morning email check', 1709100000000)
ON CONFLICT(id) DO UPDATE SET config = excluded.config, action = excluded.action, enabled = excluded.enabled;

-- List all enabled triggers
SELECT * FROM trigger_config WHERE enabled = 1 ORDER BY created_at;

-- Record when a trigger fires
UPDATE trigger_config SET last_fired = 1709136000000 WHERE id = 'trig-001';
```

---

### key_value

General-purpose key-value store for memory, settings, and state.

```sql
CREATE TABLE key_value (
  key        TEXT    PRIMARY KEY,    -- namespaced key
  value      TEXT    NOT NULL,       -- JSON-encoded value
  updated_at INTEGER NOT NULL        -- epoch ms
);
```

**Example data:**

| key | value | updated_at |
|-----|-------|------------|
| `memory:user_preferences` | {"timezone":"America/New_York","model":"claude"} | 1709136000000 |
| `memory:project_context` | {"name":"jeriko","lang":"typescript","runtime":"bun"} | 1709135000000 |
| `state:last_session_id` | "a1b2c3d4-..." | 1709137200000 |
| `auth:telegram_chat_id` | "123456789" | 1709100000000 |
| `connector:stripe:last_event` | "evt_1T4f45..." | 1709136500000 |

**Operations:**
```sql
-- Set a key (upsert)
INSERT INTO key_value (key, value, updated_at) VALUES ('memory:user_preferences', '{"timezone":"America/New_York"}', 1709136000000)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;

-- Get a key
SELECT value FROM key_value WHERE key = 'memory:user_preferences';

-- List all keys with prefix
SELECT key, value FROM key_value WHERE key LIKE 'memory:%' ORDER BY key;

-- Delete a key
DELETE FROM key_value WHERE key = 'state:last_session_id';
```

---

### _migrations

Schema version tracking (auto-managed by `runMigrations()` in db.ts).

```sql
CREATE TABLE _migrations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL UNIQUE,    -- migration filename
  applied_at INTEGER NOT NULL             -- epoch ms
);
```

**Example data:**

| id | name | applied_at |
|----|------|------------|
| 1 | 0001_init.sql | 1709100000000 |
| 2 | 0002_orchestrator.sql | 1709200000000 |
| 3 | 0003_trigger_consolidate.sql | 1709300000000 |
| 4 | 0004_share.sql | 1709400000000 |
| 5 | 0005_billing.sql | 1709500000000 |
| 6 | 0006_billing_consent.sql | 1709600000000 |
| 7 | 0007_subagent_tasks.sql | 1709700000000 |

---

### agent_context

Structured artifacts captured from sub-agent runs (fix for the "text-only return" problem). Added in migration 0002.

```sql
CREATE TABLE agent_context (
  id         TEXT    PRIMARY KEY,
  session_id TEXT    NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  kind       TEXT    NOT NULL CHECK (kind IN ('tool_call','file_write','file_edit','artifact','error','metric')),
  key        TEXT    NOT NULL,
  value      TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);
```

**Indexes:** `(session_id)`, `(session_id, kind)`.

Written by `orchestrator.writeContext()` during every sub-agent round; the parent reads it back via `readContext(sessionId)` to see what the child actually did (tool calls, files touched, errors) without re-parsing conversation text.

---

### shared_session

Public snapshots produced by the `/share` command. Added in migration 0004.

```sql
CREATE TABLE shared_session (
  id         TEXT    PRIMARY KEY,
  share_id   TEXT    NOT NULL UNIQUE,        -- short URL-safe identifier
  session_id TEXT    NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  title      TEXT    NOT NULL,
  model      TEXT    NOT NULL,
  messages   TEXT    NOT NULL,                -- JSON-encoded snapshot at share time
  created_at INTEGER NOT NULL,
  expires_at INTEGER,                         -- NULL = no expiry
  revoked_at INTEGER                          -- NULL = still live
);
```

The relay's share-page renderer fetches by `share_id`; CSP on those pages is covered in `docs/SECURITY.md`.

---

### subagent_task

Sync / async / fork / worktree subagent spawn tracking. Added in migration 0007.

```sql
CREATE TABLE subagent_task (
  id                TEXT    PRIMARY KEY,
  parent_session_id TEXT    NOT NULL,
  child_session_id  TEXT    NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  mode              TEXT    NOT NULL CHECK (mode IN ('sync','async','fork','worktree')),
  agent_type        TEXT    NOT NULL,
  label             TEXT    NOT NULL,
  prompt            TEXT    NOT NULL,
  status            TEXT    NOT NULL CHECK (status IN ('pending','running','completed','failed','cancelled')),
  worktree_path     TEXT,
  started_at        INTEGER NOT NULL,
  completed_at      INTEGER,
  tokens_in         INTEGER NOT NULL DEFAULT 0,
  tokens_out        INTEGER NOT NULL DEFAULT 0,
  error             TEXT,
  result_text       TEXT,
  notified          INTEGER NOT NULL DEFAULT 0   -- 1 once the parent has seen the completion notification
);
```

**Indexes:** `(parent_session_id)`, `(parent_session_id, status)`, `(parent_session_id, notified)`.

The `notified = 0` column drives the fire-and-forget async-subagent re-injection flow: once a task completes, the parent's next agent-loop round calls `injectPendingNotifications()`, writes a synthetic `<task-notification>` user message into the parent session, and flips `notified = 1`.

---

### billing_subscription

Stripe subscription state. Added in migration 0005.

```sql
CREATE TABLE billing_subscription (
  id                    TEXT    PRIMARY KEY,   -- Stripe sub_xxx
  customer_id           TEXT    NOT NULL,
  email                 TEXT,
  tier                  TEXT    NOT NULL,      -- free | pro | team | enterprise
  status                TEXT    NOT NULL,      -- active | past_due | canceled | paused | ...
  current_period_start  INTEGER,
  current_period_end    INTEGER,
  cancel_at_period_end  INTEGER NOT NULL DEFAULT 0,
  terms_accepted_at     INTEGER,
  created_at            INTEGER NOT NULL DEFAULT (unixepoch())
);
```

---

### billing_event

Full Stripe webhook payloads (audit trail / chargeback defense). Added in migration 0005.

```sql
CREATE TABLE billing_event (
  id              TEXT    PRIMARY KEY,   -- Stripe evt_xxx
  type            TEXT    NOT NULL,      -- e.g. "invoice.paid"
  subscription_id TEXT,
  payload         TEXT    NOT NULL,      -- full raw body
  created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);
```

---

### billing_consent

Consent evidence collected at checkout. Added in migration 0006.

```sql
CREATE TABLE billing_consent (
  id                        TEXT    PRIMARY KEY,
  subscription_id           TEXT,
  customer_id               TEXT,
  email                     TEXT,
  client_ip                 TEXT,
  user_agent                TEXT,
  terms_url                 TEXT,
  terms_version             TEXT,
  terms_accepted_at         INTEGER,
  privacy_url               TEXT,
  billing_address_collected INTEGER NOT NULL DEFAULT 0,
  stripe_consent_collected  INTEGER NOT NULL DEFAULT 0,
  checkout_session_id       TEXT,
  created_at                INTEGER NOT NULL DEFAULT (unixepoch())
);
```

---

### billing_license

Local license cache. Written by webhook handlers via `syncLicenseFromTier()`; the grace-period math (7 days past-due before downgrade) lives in `src/daemon/billing/config.ts`. Added in migration 0005.

---

## File Locations

| Component | Path |
|-----------|------|
| Database file | `~/.jeriko/data/jeriko.db` |
| DB lifecycle | `src/daemon/storage/db.ts` |
| Migration SQL | `src/daemon/storage/migrations/0001_init.sql` |
| Schema constants | `src/daemon/storage/schema.ts` |
| Session CRUD | `src/daemon/agent/session/session.ts` |
| Message CRUD | `src/daemon/agent/session/message.ts` |
| KV store | `src/daemon/storage/kv.ts` |
| Trigger store | `src/daemon/services/triggers/store.ts` |
| Audit logging | `src/daemon/exec/audit.ts` |
| Compaction | `src/daemon/agent/session/compaction.ts` |

## Data Integrity

- **Cascade deletes:** Deleting a session removes all its messages; deleting a message removes all its parts
- **Check constraints:** `role` must be one of 4 values; `type` must be one of 4 values per table
- **Foreign keys enforced** at the PRAGMA level
- **WAL mode** for concurrent read access during agent execution
- **Upsert pattern** on `key_value` and `trigger_config` to prevent duplicates
