-- 0001_init.sql — Initial schema for Jeriko storage layer
-- Tables: session, message, part, audit_log, trigger_def, key_value

-- ─── Sessions ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS session (
  id          TEXT    PRIMARY KEY,
  slug        TEXT    NOT NULL,
  title       TEXT    NOT NULL,
  model       TEXT    NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  archived_at INTEGER,
  token_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_session_created_at  ON session(created_at);
CREATE INDEX IF NOT EXISTS idx_session_slug        ON session(slug);
CREATE INDEX IF NOT EXISTS idx_session_archived_at ON session(archived_at);

-- ─── Messages ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS message (
  id            TEXT    PRIMARY KEY,
  session_id    TEXT    NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  role          TEXT    NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content       TEXT    NOT NULL,
  tokens_input  INTEGER NOT NULL DEFAULT 0,
  tokens_output INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_message_session_id  ON message(session_id);
CREATE INDEX IF NOT EXISTS idx_message_created_at  ON message(created_at);
CREATE INDEX IF NOT EXISTS idx_message_session_time ON message(session_id, created_at);

-- ─── Parts ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS part (
  id           TEXT PRIMARY KEY,
  message_id   TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type IN ('text', 'tool_call', 'tool_result', 'error')),
  content      TEXT NOT NULL,
  tool_name    TEXT,
  tool_call_id TEXT,
  created_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_part_message_id ON part(message_id);
CREATE INDEX IF NOT EXISTS idx_part_tool_call_id ON part(tool_call_id);

-- ─── Audit Log ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT    PRIMARY KEY,
  lease_id    TEXT    NOT NULL,
  agent       TEXT    NOT NULL,
  command     TEXT    NOT NULL,
  risk        TEXT    NOT NULL,
  decision    TEXT    NOT NULL,
  reason      TEXT    NOT NULL,
  duration_ms INTEGER,
  exit_code   INTEGER,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_lease_id   ON audit_log(lease_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_agent      ON audit_log(agent);

-- ─── Triggers ───────────────────────────────────────────────────────────────
-- Named "trigger_def" to avoid collision with SQL reserved word "trigger".

CREATE TABLE IF NOT EXISTS trigger_def (
  id         TEXT    PRIMARY KEY,
  type       TEXT    NOT NULL CHECK (type IN ('cron', 'webhook', 'file', 'http')),
  config     TEXT    NOT NULL DEFAULT '{}',
  enabled    INTEGER NOT NULL DEFAULT 1,
  last_fired INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trigger_def_type    ON trigger_def(type);
CREATE INDEX IF NOT EXISTS idx_trigger_def_enabled ON trigger_def(enabled);

-- ─── Key-Value Store ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS key_value (
  key        TEXT    PRIMARY KEY,
  value      TEXT    NOT NULL,
  updated_at INTEGER NOT NULL
);

-- NOTE: _migrations table is created by runMigrations() in db.ts before
-- any migration files are executed. Do NOT create it here.
