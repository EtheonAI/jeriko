-- 0007_subagent_tasks.sql — Subagent task tracking.
--
-- Backs the agent subagent subsystem (src/daemon/agent/subagent/).
--
-- Each row represents a subagent spawn — sync, async (fire-and-forget),
-- fork (prompt-cache-sharing), or worktree-isolated. Async tasks emit a
-- task-notification message into the parent session on completion; the
-- `notified` column tracks which completions the parent has already seen
-- so notifications are injected exactly once.

CREATE TABLE IF NOT EXISTS subagent_task (
  id                 TEXT    PRIMARY KEY,
  parent_session_id  TEXT    NOT NULL,
  child_session_id   TEXT    NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  mode               TEXT    NOT NULL CHECK (mode IN ('sync', 'async', 'fork', 'worktree')),
  agent_type         TEXT    NOT NULL,
  label              TEXT    NOT NULL,
  prompt             TEXT    NOT NULL,
  status             TEXT    NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  worktree_path      TEXT,
  started_at         INTEGER NOT NULL,
  completed_at       INTEGER,
  tokens_in          INTEGER NOT NULL DEFAULT 0,
  tokens_out         INTEGER NOT NULL DEFAULT 0,
  error              TEXT,
  result_text        TEXT,
  notified           INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_subagent_task_parent ON subagent_task(parent_session_id);
CREATE INDEX IF NOT EXISTS idx_subagent_task_status ON subagent_task(parent_session_id, status);
CREATE INDEX IF NOT EXISTS idx_subagent_task_unnotified ON subagent_task(parent_session_id, notified);
