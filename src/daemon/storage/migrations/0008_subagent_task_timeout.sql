-- 0008_subagent_task_timeout.sql — Extend the subagent_task status
-- constraint to allow "timeout", the terminal state the reaper uses to
-- mark tasks orphaned by a crashed daemon.
--
-- SQLite can't ALTER a CHECK constraint in place, so we rebuild the
-- table. Row data, indexes, and the CASCADE reference to session(id)
-- are recreated verbatim. This migration is idempotent — re-running it
-- after it succeeds is a no-op because the final schema already has
-- the widened constraint.

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS subagent_task_new (
  id                 TEXT    PRIMARY KEY,
  parent_session_id  TEXT    NOT NULL,
  child_session_id   TEXT    NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  mode               TEXT    NOT NULL CHECK (mode IN ('sync', 'async', 'fork', 'worktree')),
  agent_type         TEXT    NOT NULL,
  label              TEXT    NOT NULL,
  prompt             TEXT    NOT NULL,
  status             TEXT    NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'timeout')),
  worktree_path      TEXT,
  started_at         INTEGER NOT NULL,
  completed_at       INTEGER,
  tokens_in          INTEGER NOT NULL DEFAULT 0,
  tokens_out         INTEGER NOT NULL DEFAULT 0,
  error              TEXT,
  result_text        TEXT,
  notified           INTEGER NOT NULL DEFAULT 0
);

INSERT INTO subagent_task_new (
  id, parent_session_id, child_session_id, mode, agent_type, label, prompt,
  status, worktree_path, started_at, completed_at, tokens_in, tokens_out,
  error, result_text, notified
)
SELECT
  id, parent_session_id, child_session_id, mode, agent_type, label, prompt,
  status, worktree_path, started_at, completed_at, tokens_in, tokens_out,
  error, result_text, notified
FROM subagent_task;

DROP TABLE subagent_task;
ALTER TABLE subagent_task_new RENAME TO subagent_task;

CREATE INDEX IF NOT EXISTS idx_subagent_task_parent ON subagent_task(parent_session_id);
CREATE INDEX IF NOT EXISTS idx_subagent_task_status ON subagent_task(parent_session_id, status);
CREATE INDEX IF NOT EXISTS idx_subagent_task_unnotified ON subagent_task(parent_session_id, notified);

PRAGMA foreign_keys = ON;
