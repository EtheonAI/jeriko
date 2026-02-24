# ADR-002: Conversation Persistence Strategy — In-Memory vs On-Disk

**Status:** Proposed
**Date:** 2026-02-24
**Author:** Khaleel Musleh (Etheon)
**Subject:** How Jeriko should persist multi-turn conversation history in `jeriko chat`

---

## Context

Jeriko's interactive chat (`jeriko chat`) routes user messages to an AI backend (Claude, OpenAI, local models) via an agentic loop. Each turn includes user messages, AI responses, tool calls, and tool results.

**Prior state:** Zero persistence. Every call to `route()` created a fresh `messages` array. The AI forgot everything after each prompt — including what it just said 5 seconds ago.

**Current state (ADR trigger):** In-memory array (`conversationHistory[]`) maintained for the duration of the terminal session. The AI now remembers prior turns within a single `jeriko chat` session. History dies when the terminal closes.

**The question:** Is in-memory sufficient, or should Jeriko persist conversations to disk? This matters because Jeriko is evolving into an AI-native operating system (JerikoOS) where the conversation IS the primary interface. The persistence model directly affects UX, security, and architecture.

---

## Decision Drivers

1. **UX continuity** — Users expect to resume where they left off (like browser tabs, terminal history, chat apps)
2. **Security** — Conversations contain tool results with API keys, file contents, system info, passwords
3. **Performance** — Latency per message matters in interactive chat
4. **Context window limits** — Claude: 200K tokens, GPT-4o: 128K, local models: 8-32K. History must be bounded regardless
5. **OS vision** — JerikoOS = AI as the interface. If the interface forgets, the OS is broken
6. **Privacy** — Plaintext conversation logs on disk are a liability
7. **Multi-session** — User may have multiple concurrent chat sessions (different projects, different machines)
8. **Simplicity** — Less code = fewer bugs = ships faster

---

## Considered Options

### Option A: In-Memory Only (Current)

Conversation history lives in a JavaScript array. Dies when the process exits.

```
jeriko chat
  ├── conversationHistory = []
  ├── User: "List my files"
  │   └── history: [{user: "List my files"}, {assistant: "...", tool_calls: [...]}]
  ├── User: "Now delete temp.txt"
  │   └── history: [{...prev...}, {user: "Now delete temp.txt"}, {assistant: "Done"}]
  └── Ctrl+C → history = gone forever
```

**Strengths:**
- Zero I/O overhead (array push/splice only)
- Zero config (works out of the box)
- Zero security risk (nothing on disk)
- Zero cleanup needed (GC handles it)
- 3 lines of code to implement
- Natural bound: session lifetime = memory lifetime

**Weaknesses:**
- Terminal crash = total amnesia
- Cannot resume conversations after restart
- Cannot search past conversations
- Cannot share context between sessions
- For an OS, this is like RAM with no disk — volatile

**Performance:** O(1) per message. No I/O. Best possible.

**Security:** Perfect. Nothing persisted. Nothing to steal.

---

### Option B: On-Disk Plaintext (JSON/JSONL)

Write conversation history to `~/.jeriko/sessions/<id>.jsonl` after each turn.

```
~/.jeriko/sessions/
  ├── 2026-02-24-abc123.jsonl    ← today's chat
  ├── 2026-02-23-def456.jsonl    ← yesterday
  └── index.json                  ← session metadata
```

**Strengths:**
- Survives crashes and restarts
- `jeriko chat --resume` loads last session
- Searchable (`jeriko chat --search "deploy"`)
- Simple implementation (fs.appendFileSync per turn)

**Weaknesses:**
- **Critical security flaw:** Tool results contain raw command output — API keys, file contents, system info, env vars, passwords all stored in plaintext
- Grows unbounded without cleanup (a 50-turn conversation with tool results = 500KB+)
- Disk I/O per message (minor but real)
- Stale sessions accumulate (needs TTL/garbage collection)
- Privacy: anyone with filesystem access reads full AI conversations

**Performance:** ~1ms per write (appendFileSync). Acceptable.

**Security:** Unacceptable for production. A `cat ~/.jeriko/sessions/*.jsonl | grep -i key` exposes every secret the AI ever touched.

---

### Option C: On-Disk Encrypted (AES-256-GCM)

Same as Option B, but encrypted at rest using a key derived from the OS keychain.

```
~/.jeriko/sessions/
  ├── 2026-02-24-abc123.enc      ← AES-256-GCM encrypted
  ├── 2026-02-24-abc123.meta     ← unencrypted metadata (timestamp, turns, title)
  └── index.json                  ← session index

Key storage:
  macOS: Keychain → "jeriko-session-key"
  Linux: libsecret/GNOME Keyring → "jeriko-session-key"
  Fallback: PBKDF2 from NODE_AUTH_SECRET
```

**Strengths:**
- Survives crashes
- Resumable sessions
- Secrets protected at rest
- OS keychain integration aligns with JerikoOS vision (daemon will use keychain natively)

**Weaknesses:**
- Adds `crypto` dependency (Node.js built-in, but still complexity)
- Keychain access varies by OS (macOS Keychain API vs Linux libsecret vs Windows Credential Manager)
- Encryption adds ~0.5ms per write (negligible for chat, but real)
- Key management: what if keychain is locked? What if user changes password?
- More code to audit for security correctness
- Encrypted data is opaque — can't grep/debug without decryption tooling

**Performance:** ~1.5ms per write. Acceptable.

**Security:** Strong. Filesystem access alone doesn't expose conversations. Requires keychain access (which requires user authentication or root).

---

### Option D: Hybrid — In-Memory Primary + Encrypted Disk Optional

In-memory as default. Encrypted disk persistence opt-in via flag or config.

```
Default:        jeriko chat              → in-memory (current behavior)
Resume:         jeriko chat --resume     → load last encrypted session
Save always:    JERIKO_SAVE_SESSIONS=1   → auto-persist encrypted
New session:    jeriko chat --new        → ignore saved, start fresh
List sessions:  jeriko chat --sessions   → show past sessions
```

In-memory cache sits in front of disk. Reads from memory during session, writes to disk periodically (not every message — batch writes every 30s or on graceful exit).

**Strengths:**
- Zero-config default (in-memory, just works)
- Opt-in persistence for power users
- Batch writes reduce I/O (30s intervals, not per-message)
- Graceful degradation: if encryption fails, falls back to in-memory silently
- Separates casual use (quick questions) from project work (long sessions worth saving)
- Best security posture: nothing on disk unless explicitly requested

**Weaknesses:**
- Two code paths to maintain (memory + disk)
- "Opt-in" means most users never discover it
- Batch writes mean up to 30s of data loss on crash (acceptable for chat)
- Still need keychain integration for encryption key

**Performance:** O(1) in-memory reads, ~1.5ms batched writes every 30s. Best of both worlds.

**Security:** Strong default (nothing on disk). Encrypted when persisted.

---

### Option E: SQLite Database

Single SQLite file at `~/.jeriko/chat.db` with tables for sessions, messages, tool calls.

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  created_at INTEGER,
  title TEXT,
  backend TEXT,
  turns INTEGER DEFAULT 0
);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT REFERENCES sessions(id),
  role TEXT,        -- user | assistant | tool
  content TEXT,     -- encrypted blob
  tool_call_id TEXT,
  created_at INTEGER
);
```

**Strengths:**
- Structured queries (search by date, keyword, session)
- Atomic writes (no corruption on crash)
- Single file (easy backup/migration)
- SQLite is battle-tested (billions of deployments)
- FTS5 for full-text search across conversations
- Natural fit for JerikoOS dashboard (web UI can query sessions)

**Weaknesses:**
- Adds `better-sqlite3` or similar native dependency (C compilation, platform issues)
- Heavier than JSONL for simple append operations
- Schema migrations if format changes
- Encryption requires SQLCipher (another native dep) or application-level encryption
- Overkill for v1.0 — premature complexity

**Performance:** ~0.5ms per write (WAL mode). Excellent.

**Security:** Requires additional encryption layer. SQLite files are trivially readable without it.

---

## Comparison Matrix

| Criteria | A: Memory | B: Plaintext | C: Encrypted | D: Hybrid | E: SQLite |
|----------|-----------|-------------|--------------|-----------|-----------|
| **Persistence** | None | Full | Full | Opt-in | Full |
| **Resume sessions** | No | Yes | Yes | Yes | Yes |
| **Security** | Perfect | Terrible | Strong | Strong | Needs work |
| **Performance** | Best | Good | Good | Best | Good |
| **Complexity** | Minimal | Low | Medium | Medium | High |
| **Dependencies** | None | None | None (crypto built-in) | None | Native C lib |
| **Search** | No | Grep | Decrypt+grep | Decrypt+grep | FTS5 |
| **OS vision fit** | Weak | Weak | Good | Good | Best |
| **Ship speed** | Fastest | Fast | Medium | Medium | Slow |
| **Privacy default** | Best | Worst | Good | Best | Needs config |

---

## Analysis

### What matters most for JerikoOS?

**The conversation is the interface.** In a traditional OS, the desktop persists — your windows, files, and state survive reboots. In JerikoOS, the conversation IS that state. If it dies on terminal close, it's equivalent to an OS that wipes your desktop every time you restart. That's fundamentally broken for an OS.

**But security cannot be compromised.** AI conversations are the most sensitive data on the system. They contain everything the AI saw and did — including raw output of commands that may expose credentials, file contents, and system configuration. Storing this in plaintext is negligent.

### Why not in-memory only (Option A)?

For a CLI tool, in-memory is fine. For an OS, it's unacceptable. The user says "build me a website" — the AI scaffolds it across 15 tool calls over 5 minutes. The user's laptop lid closes. Session lost. They reopen and have to re-explain everything. That's not an OS. That's a toy.

### Why not plaintext (Option B)?

Security disqualifier. A single `grep -r "sk_live" ~/.jeriko/sessions/` exposes every Stripe key the AI ever processed. Non-starter.

### Why not SQLite (Option E)?

Premature. SQLite is the right answer for JerikoOS v1.0 when the Rust daemon has a web dashboard that needs to display session history. It's wrong for today — adding a native C dependency (better-sqlite3) to a Node.js CLI tool adds build complexity and platform issues for zero immediate benefit.

### The real choice is between C (encrypted disk) and D (hybrid)

Option C is simpler but forces disk persistence on everyone, including users who just want a quick one-off chat. Option D respects both use cases.

---

## Decision

**Option D: Hybrid — In-Memory Primary + Encrypted Disk Optional**

### Rationale

1. **Security first:** Default is in-memory. Nothing on disk unless the user explicitly enables it. This is the principle of least surprise for a tool with root-level access.

2. **OS-ready:** The `--resume` and `--sessions` flags lay the groundwork for JerikoOS, where session persistence becomes the default (managed by the daemon with keychain integration).

3. **Graceful migration path:**
   - Today (Node.js): In-memory default, encrypted JSONL opt-in
   - JerikoOS (Rust daemon): SQLite with SQLCipher, sessions persist by default, web dashboard for session management
   - The API (`route(text, onChunk, onStatus, history)`) stays the same — only the storage backend changes

4. **Performance:** In-memory for reads (zero latency), batched encrypted writes every 30s (minimal I/O). Crash loses at most 30s of conversation — acceptable for chat.

5. **Simplicity:** No new dependencies. Node.js `crypto.createCipheriv('aes-256-gcm', ...)` is built-in. JSONL is append-only. Key from `NODE_AUTH_SECRET` via PBKDF2 (already required by the system).

### Implementation Spec

```
Phase 1 (now): In-memory only — DONE
  conversationHistory[] passed to route()
  /clear resets history
  Terminal close = history gone

Phase 2 (next): Encrypted disk opt-in
  jeriko chat --save           → persist this session encrypted
  jeriko chat --resume         → load last session
  jeriko chat --resume <id>    → load specific session
  jeriko chat --sessions       → list saved sessions
  JERIKO_SAVE_SESSIONS=1       → always persist (for OS mode)

  Storage: ~/.jeriko/sessions/<id>.enc (AES-256-GCM)
  Metadata: ~/.jeriko/sessions/<id>.meta (title, turns, timestamp — unencrypted)
  Key: PBKDF2(NODE_AUTH_SECRET, salt=sessionId, iterations=100000)
  Batch writes: every 30s + on SIGINT/SIGTERM
  Auto-expire: sessions older than 30 days deleted on startup
  Max history: truncate to last 100 turns (prevent unbounded growth)

Phase 3 (JerikoOS daemon): SQLite + SQLCipher
  Daemon owns session storage
  Web dashboard displays session history
  Sessions persist by default (OS mode)
  Keychain for encryption key (not NODE_AUTH_SECRET)
```

---

## Consequences

### Positive
- Users get conversation memory immediately (Phase 1 shipped)
- Security-conscious default (nothing on disk)
- Power users can resume sessions when Phase 2 ships
- Clean migration to JerikoOS daemon (Phase 3)
- No new dependencies in any phase (crypto is built-in, SQLite comes with Rust daemon)

### Negative
- Phase 1 loses history on crash (acceptable for CLI, not for OS — fixed in Phase 2)
- Encrypted sessions can't be grepped/debugged without tooling
- Two storage backends to eventually maintain (JSONL → SQLite migration)
- 30-second batch window means potential data loss on kill -9

### Risks
- Key derivation from NODE_AUTH_SECRET means changing the secret invalidates all saved sessions (mitigated: sessions auto-expire anyway)
- PBKDF2 adds ~100ms on session load (one-time cost, acceptable)
- Users may expect persistence by default (document clearly, add hint on exit: "Use --save to keep this conversation")

---

## References

- ADR-001: Unix-First Agent Paradigm (architectural context)
- Jeriko-Web `show_plan` tool (conversation state management in web UI)
- Node.js `crypto.createCipheriv` documentation
- SQLCipher (for Phase 3 Rust daemon)
- macOS Keychain Services / Linux libsecret (for Phase 3 key storage)
