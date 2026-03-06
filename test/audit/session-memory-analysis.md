# Session & Memory System Audit

## 1. Session Store (`src/daemon/agent/session/session.ts`)

### Schema
```
session (
  id                TEXT PRIMARY KEY,
  slug              TEXT NOT NULL,        -- human-readable short ID (e.g. "bold-agent-001")
  title             TEXT NOT NULL,
  model             TEXT NOT NULL,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  archived_at       INTEGER,              -- soft-delete timestamp
  token_count       INTEGER NOT NULL DEFAULT 0,
  parent_session_id TEXT REFERENCES session(id) ON DELETE SET NULL,
  agent_type        TEXT NOT NULL DEFAULT 'general'
)
```

### Operations
- **createSession(opts?)** - Creates session with UUID, auto-generated slug, default model "claude". Returns full row.
- **getSession(id)** / **getSessionBySlug(slug)** - Lookup by ID or slug.
- **listSessions(limit, includeArchived)** - Most recent first by `updated_at`. Default limit 50, excludes archived.
- **archiveSession(id)** - Soft-delete (sets `archived_at`).
- **deleteSession(id)** - Hard delete. FK CASCADE removes messages + parts.
- **updateSession(id, updates)** - Partial update for title, model, token_count. Each field runs a separate UPDATE.
- **touchSession(id)** - Updates `updated_at` only.

### Observations
- `updateSession` runs up to 3 separate SQL statements if all fields provided (not transactional). Low risk since updates are typically single-field, but a concurrent reader could see partial state.
- Slug generation uses 16 adjectives x 16 nouns x 1000 suffixes = 256,000 combinations. No uniqueness check. Collision probability is low but nonzero for high-volume use.
- `listSessions` filters only top-level sessions; no flag to filter by `parent_session_id IS NULL` (sub-agent sessions appear in listings).

## 2. Message Store (`src/daemon/agent/session/message.ts`)

### Schema
```
message (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content       TEXT NOT NULL,
  tokens_input  INTEGER NOT NULL DEFAULT 0,
  tokens_output INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
)
```

### Operations
- **addMessage(sessionId, role, content, tokens?)** - Inserts message, touches session `updated_at`, increments session `token_count`.
- **getMessages(sessionId, limit?)** - Oldest first. Optional limit (but limits oldest N, not newest N).
- **getRecentMessages(sessionId, count)** - Sub-select DESC then re-order ASC. Returns most recent N.
- **getSessionTokenCount(sessionId)** - SUM of all message tokens. Note: this recomputes from messages, while `session.token_count` is maintained incrementally.
- **deleteMessage(id)** - Deletes single message + parts (CASCADE).
- **clearMessages(sessionId)** - Deletes all messages, resets session `token_count` to 0.

### Part Operations
```
part (
  id           TEXT PRIMARY KEY,
  message_id   TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type IN ('text', 'tool_call', 'tool_result', 'error')),
  content      TEXT NOT NULL,
  tool_name    TEXT,
  tool_call_id TEXT,
  created_at   INTEGER NOT NULL
)
```
- **addPart(messageId, type, content, toolName?, toolCallId?)** - Structured sub-message.
- **getParts(messageId)** - All parts ordered by creation time.
- **getPartsByType(messageId, type)** - Filtered by type.

### Observations
- `addMessage` performs 2-3 SQL statements (INSERT + UPDATE updated_at + optional UPDATE token_count) without a transaction. Under concurrent writes, session token_count could lose increments.
- `getMessages` with `limit` returns the **oldest** N messages, not the newest. This is likely correct for full-history replay but could be confusing — `getRecentMessages` handles the "last N" case.
- Token counts on `session.token_count` can drift from the actual SUM if messages are individually deleted (deleteMessage does not decrement session token_count).

## 3. KV Store (`src/daemon/storage/kv.ts`)

### Schema
```
key_value (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,    -- JSON-encoded
  updated_at INTEGER NOT NULL
)
```

### Operations
- **kvSet(key, value)** - Upsert with JSON serialization.
- **kvGet<T>(key)** - Returns parsed JSON or null.
- **kvDelete(key)** - No-op if missing.
- **kvList(prefix?)** - Returns all key-value pairs, optionally filtered by prefix via SQL LIKE.

### Observations
- Clean and correct. Uses UPSERT (INSERT ... ON CONFLICT DO UPDATE).
- `kvList` uses LIKE with `|| '%'` concatenation in SQL, which is parameterized and safe.
- No TTL mechanism — entries persist forever unless explicitly deleted.

## 4. Agent Runner (`src/daemon/agent/agent.ts`)

### Session Management Flow
1. Receives `AgentRunConfig` with `sessionId` (session must already exist).
2. Copies `conversationHistory` into local `messages` array.
3. Sets active orchestrator context via `setActiveContext()`.
4. Runs iterative rounds (max 40 by default):
   - Checks in-memory token estimate; compacts `messages` array if >= 75% of context window.
   - Streams LLM response.
   - Persists assistant message + parts via `addMessage`/`addPart`.
   - Executes tool calls, persists tool messages.
   - Circuit breaker on consecutive errors.
5. Clears active context in `finally` block.

### Context Window Management
- **In-memory compaction** (`compactMessages`): Keeps system messages, first user message, compaction marker, and last 6 non-system messages. This is the in-flight compaction for the conversation array sent to the LLM.
- **Persistent compaction** (`compaction.ts`): `compactSession()` operates on the SQLite-stored messages. Same strategy but reads/writes from DB. Clears all messages and re-inserts the compacted set.
- Two separate compaction paths: the agent loop compacts the in-memory array, while `compactSession()` compacts the persisted messages. These can diverge.

### Observations
- The agent loop does NOT persist system messages. Only assistant and tool messages are saved via `addMessage`. The system prompt and initial user message are expected to be in `conversationHistory` which is passed in.
- In-memory compaction does not update SQLite. The persisted messages grow unbounded during a single agent run; only `compactSession()` (called externally) trims them.
- Token estimation is approximate (`estimateTokens` from shared/tokens.ts), not from the LLM's actual tokenizer.

## 5. Orchestrator (`src/daemon/agent/orchestrator.ts`)

### Parent/Child Sessions
- `delegate()` creates a child session with `parentSessionId` linking to the parent.
- Child sessions are typed (`agentType`: general, research, task, explore, plan).
- Tool filtering by agent type prevents scope creep.
- Max nesting depth = 2. At max depth, orchestrator tools (delegate, parallel_tasks) are filtered out.

### Structured Context (`agent_context` table)
```
agent_context (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('tool_call', 'file_write', 'file_edit', 'artifact', 'error', 'metric')),
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  created_at INTEGER NOT NULL
)
```
- Captures: tool calls with arguments and results, file writes/edits, artifacts, errors, token metrics.
- `readContext(sessionId)` / `readContextByKind(sessionId, kind)` — retrieval functions.
- `getChildSessions(parentSessionId)` — lists all child sessions.
- `buildContext()` reconstructs a `SubTaskContext` from rows, matching tool calls to their results.

### Re-entrancy
- Parent's active context is saved before child `runAgent()` call, restored after.
- Each `delegate()` call saves/restores via `getActiveContext()`/`setActiveContext()`.

### Fan-out
- `fanOut()` runs multiple sub-tasks in waves of `maxConcurrency` (default 4).
- Uses `Promise.allSettled` — partial failures don't abort the batch.
- Supports `AbortSignal` checked between waves.

## 6. Session Resumption (`src/daemon/api/routes/session.ts`)

- **GET /session** — Lists sessions (supports archived filter, pagination).
- **GET /session/:id** — Returns session + all messages.
- **POST /session/:id/resume** — Clears `archived_at`, updates `updated_at`.
- **DELETE /session/:id** — Archives (soft-delete).

### Resumption Flow
1. Client calls POST `/session/:id/resume`.
2. Route sets `archived_at = NULL, updated_at = now`.
3. Client retrieves session + messages via GET `/session/:id`.
4. Messages are passed as `conversationHistory` to a new `runAgent()` call.

### Observations
- Resumption is stateless — it just unarchives. The client must re-fetch messages and re-initialize the agent loop.
- No "active session" tracking. Multiple clients could resume the same session simultaneously.

## 7. Potential Bugs / Issues

### Bug 1: Token count drift on message deletion
`deleteMessage(id)` does not decrement `session.token_count`. Over time, the session's cached token count drifts upward from the actual sum. `getSessionTokenCount()` recomputes correctly, but `session.token_count` displayed in listings will be wrong.

### Bug 2: Non-transactional addMessage
`addMessage` runs INSERT + two UPDATEs without a transaction wrapper. Under concurrent access (unlikely in single-daemon but possible via API), token_count increments could be lost.

### Bug 3: Non-transactional updateSession
`updateSession` with multiple fields runs separate UPDATE statements. Partial updates are visible between statements.

### Bug 4: In-memory vs persistent compaction divergence
The agent loop compacts its in-memory `messages` array but does not update SQLite. If the session is resumed later, the full uncompacted history is loaded from SQLite. This means context windows are always rebuilt from the full history on resume, which is correct but means the session could have far more messages than the LLM ever sees.

### Bug 5: listSessions includes sub-agent sessions
`listSessions()` returns all non-archived sessions, including orchestrator child sessions. This could clutter session listings for users. A filter for `parent_session_id IS NULL` would improve UX.

### Bug 6: Slug collision potential
`generateSlug()` has no uniqueness check. With 256K possible slugs and SQLite's lack of a UNIQUE constraint on `slug`, duplicate slugs are theoretically possible (though unlikely at typical scale).

### Minor: writeContext uses truncated UUID
`writeContext()` uses `randomUUID().slice(0, 12)` for IDs — 12 hex chars = 48 bits of entropy. Sufficient for context rows but less than the full UUID used elsewhere.
