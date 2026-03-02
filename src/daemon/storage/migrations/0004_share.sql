-- 0004_share.sql — Shared session links for public conversation viewing.
-- Sessions can be shared via a short link (jeriko.ai/s/<share_id>).
-- Messages are snapshotted at share time for immutability.

CREATE TABLE IF NOT EXISTS shared_session (
  id          TEXT    PRIMARY KEY,
  share_id    TEXT    NOT NULL UNIQUE,
  session_id  TEXT    NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  title       TEXT    NOT NULL,
  model       TEXT    NOT NULL,
  messages    TEXT    NOT NULL DEFAULT '[]',
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER,
  revoked_at  INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_shared_session_share_id   ON shared_session(share_id);
CREATE INDEX IF NOT EXISTS idx_shared_session_session_id        ON shared_session(session_id);
CREATE INDEX IF NOT EXISTS idx_shared_session_created_at        ON shared_session(created_at);
