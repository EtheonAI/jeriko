// Layer 0 — Database schema types and DDL. Zero runtime imports.

// ─── Row Interfaces ─────────────────────────────────────────────────────────

/** A conversation session. */
export interface Session {
  id: string;
  slug: string;
  title: string;
  model: string;
  created_at: number;
  updated_at: number;
  archived_at: number | null;
  token_count: number;
  /** Parent session ID for sub-agent sessions. NULL for top-level. */
  parent_session_id: string | null;
  /** Agent type preset: general, research, task, explore, plan. */
  agent_type: string;
}

/** A single message within a session. */
export interface Message {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tokens_input: number;
  tokens_output: number;
  created_at: number;
}

/** A structured part of a message (text, tool call, tool result, or error). */
export interface Part {
  id: string;
  message_id: string;
  type: "text" | "tool_call" | "tool_result" | "error";
  content: string;
  tool_name: string | null;
  tool_call_id: string | null;
  created_at: number;
}

/** Audit trail for agent command execution decisions. */
export interface AuditLog {
  id: string;
  lease_id: string;
  agent: string;
  command: string;
  risk: string;
  decision: string;
  reason: string;
  duration_ms: number | null;
  exit_code: number | null;
  created_at: number;
}

/**
 * Trigger configuration — managed by TriggerStore (trigger_config table).
 * See TriggerConfig in daemon/services/triggers/engine.ts for the runtime type.
 * The trigger_config table is self-bootstrapped by TriggerStore.ensureTable().
 */

/** Generic key-value pair. */
export interface KeyValue {
  key: string;
  value: string; // JSON-encoded
  updated_at: number;
}

/** Structured context artifact from a sub-agent execution. */
export interface AgentContext {
  id: string;
  session_id: string;
  kind: "tool_call" | "file_write" | "file_edit" | "artifact" | "error" | "metric";
  key: string;
  value: string;
  created_at: number;
}

// ─── DDL Constants ──────────────────────────────────────────────────────────

export const SQL_CREATE_SESSION = `
CREATE TABLE IF NOT EXISTS session (
  id                TEXT    PRIMARY KEY,
  slug              TEXT    NOT NULL,
  title             TEXT    NOT NULL,
  model             TEXT    NOT NULL,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  archived_at       INTEGER,
  token_count       INTEGER NOT NULL DEFAULT 0,
  parent_session_id TEXT    REFERENCES session(id) ON DELETE SET NULL,
  agent_type        TEXT    NOT NULL DEFAULT 'general'
);` as const;

export const SQL_CREATE_MESSAGE = `
CREATE TABLE IF NOT EXISTS message (
  id            TEXT    PRIMARY KEY,
  session_id    TEXT    NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  role          TEXT    NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content       TEXT    NOT NULL,
  tokens_input  INTEGER NOT NULL DEFAULT 0,
  tokens_output INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);` as const;

export const SQL_CREATE_PART = `
CREATE TABLE IF NOT EXISTS part (
  id           TEXT PRIMARY KEY,
  message_id   TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type IN ('text', 'tool_call', 'tool_result', 'error')),
  content      TEXT NOT NULL,
  tool_name    TEXT,
  tool_call_id TEXT,
  created_at   INTEGER NOT NULL
);` as const;

export const SQL_CREATE_AUDIT_LOG = `
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
);` as const;

export const SQL_CREATE_KEY_VALUE = `
CREATE TABLE IF NOT EXISTS key_value (
  key        TEXT    PRIMARY KEY,
  value      TEXT    NOT NULL,
  updated_at INTEGER NOT NULL
);` as const;

/** All CREATE TABLE statements in dependency order.
 * Note: trigger_config is self-bootstrapped by TriggerStore — not included here. */
export const ALL_CREATE_TABLES = [
  SQL_CREATE_SESSION,
  SQL_CREATE_MESSAGE,
  SQL_CREATE_PART,
  SQL_CREATE_AUDIT_LOG,
  SQL_CREATE_KEY_VALUE,
] as const;
