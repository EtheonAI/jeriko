-- 0002_orchestrator.sql — Sub-agent orchestrator support.
-- Adds parent-child session linking and structured context return.

-- ─── Parent-child session linking ──────────────────────────────────────────
-- Nullable FK: top-level sessions have parent_session_id = NULL.
-- Sub-agent sessions point back to the parent that spawned them.

ALTER TABLE session ADD COLUMN parent_session_id TEXT REFERENCES session(id) ON DELETE SET NULL;
ALTER TABLE session ADD COLUMN agent_type       TEXT NOT NULL DEFAULT 'general';

CREATE INDEX IF NOT EXISTS idx_session_parent ON session(parent_session_id);
CREATE INDEX IF NOT EXISTS idx_session_agent_type ON session(agent_type);

-- ─── Agent context ─────────────────────────────────────────────────────────
-- Structured context returned by sub-agents — solves the "text-only return"
-- problem (Claude Code #5812). Each row captures one artifact from the
-- sub-agent's execution: tool calls, files created/modified, errors, etc.

CREATE TABLE IF NOT EXISTS agent_context (
  id              TEXT    PRIMARY KEY,
  session_id      TEXT    NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  kind            TEXT    NOT NULL CHECK (kind IN ('tool_call', 'file_write', 'file_edit', 'artifact', 'error', 'metric')),
  key             TEXT    NOT NULL,
  value           TEXT    NOT NULL,
  created_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_context_session ON agent_context(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_context_kind    ON agent_context(session_id, kind);
