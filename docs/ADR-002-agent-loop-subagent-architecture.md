# ADR-002: Agent Loop & Subagent Architecture for Jeriko Daemon

**Status:** APPROVED
**Date:** 2026-02-27
**Authors:** Khaleel Musleh (Etheon)
**Supersedes:** None
**Related:** ADR-001 (Unix-First Agent Paradigm), Claude Code Issue #5812

---

## 1. Context & Problem Statement

Jeriko's daemon (`server/router.js`) has a working unified agent loop: one loop, three API callers (Claude, OpenAI, Local/Ollama), nine tools, context compaction, and security validation. The `parallel_tasks` tool shells out to `jeriko parallel` which spawns a Go binary to run concurrent AI tasks—but these are **text-only, fire-and-forget workers** with no tool access, no context bridging, and no parent coordination.

We want to build a **Claude Code–grade subagent system** inside Jeriko's daemon that:

1. Solves the context isolation problem described in [Claude Code Issue #5812](https://github.com/anthropics/claude-code/issues/5812)
2. Works with open-source models (Qwen3, Llama 3.3, DeepSeek-V3.2, Devstral 2, gpt-oss, etc.)
3. Uses Node.js child workers for crash isolation
4. Passes structured context back to the parent agent
5. Ships as open-source so anyone running Ollama or any OpenAI-compatible endpoint can use it

This ADR analyzes Claude Code's architecture in depth, compares it to Jeriko's current state, evaluates feasibility, and proposes a concrete implementation plan.

---

## 2. Claude Code Architecture: Deep Analysis

*Source: Decompiled from `~/.local/share/claude/versions/2.1.62` — 183MB Mach-O Bun binary, minified JavaScript extracted and analyzed.*

### 2.1 Core Agent Loop: `kq()` Async Generator

Claude Code's agent loop is an **async generator function** called `kq()`:

```javascript
async function* kq({
  agentDefinition,
  promptMessages,
  toolUseContext,
  canUseTool,
  isAsync,
  canShowPermissionPrompts,
  forkContextMessages,
  querySource,
  model,
  maxTurns,
  availableTools,
  allowedTools,
  ...
})
```

This generator:
1. Makes Claude API calls via `Gk({messages, systemPrompt, tools, signal})`
2. Processes tool calls from the response
3. Yields streaming events (chunks, status, tool results)
4. Loops until the model stops calling tools or hits `maxTurns`

**Key insight: The main conversation and every subagent use the exact same `kq()` function.** A subagent is just another invocation with different parameters.

### 2.2 Subagent Architecture (The Real Mechanism)

Claude Code subagents are **NOT child OS processes. NOT threads. NOT recursive awaits.**

They are **additional `kq()` async generator instances** running concurrently in the **same single Bun process** via the JavaScript event loop.

There is:
- No `child_process.fork()`
- No `worker_threads`
- No separate OS process
- No IPC

#### The `Task` Tool (`call()` Method)

```javascript
async call({
  prompt: H,            // prompt sent to sub-agent
  subagent_type: A,     // "Explore", "Plan", "general-purpose", etc.
  description: L,       // short human-readable label
  model: I,             // optional model override
  resume: E,            // agent ID to resume from
  run_in_background: $, // boolean: async or blocking
  max_turns: M,         // max API round-trips
  name: f,              // teammate name
  team_name: D,         // team name
  mode: U,              // e.g. "plan"
  isolation: G          // "worktree" for git isolation
}, toolUseContext, canUseTool, contextMessages, abortSignal)
```

#### What Happens on `Task` Call

1. Looks up agent definition from `activeAgents` matching `subagent_type`
2. Resolves model via `KWA()` — can inherit parent, use agent-defined, or explicit override
3. If resuming — loads previous transcript via `zQH(wQ(E))`
4. If `forkContext: true` — **passes parent's full message history to the child**
5. Builds system prompt via `O.getSystemPrompt({toolUseContext})`
6. If `isolation === "worktree"` — creates a git worktree via `MyL()`
7. Invokes the core `kq()` async generator

#### Two Execution Modes

**Synchronous (foreground):**
```
Parent call() → kq() generator → iterate to completion → return result
```
Parent's `call()` awaits the entire generator. Parent conversation paused until subagent finishes.

**Asynchronous (background):**
```
Parent call() → register in app state via xO1() → kq() runs via event loop → return immediately
```
Task ID prefix `"a"` (for `local_agent`). Parent continues while generator runs concurrently:
```javascript
DmM = {
  local_bash: "b",
  local_agent: "a",
  remote_agent: "r",
  in_process_teammate: "t"
}
```

#### Context Isolation: `AsyncLocalStorage`

Each subagent runs inside Node.js `AsyncLocalStorage`:
```javascript
NQH().run({
  agentType: "subagent",
  subagentName: ...,
  isBuiltIn: true/false,
  agentId: ...,
  parentSessionId: ...
}, async () => { /* run kq() here */ })
```

No OS-level isolation. Just a context object on the async call stack.

#### Concurrency: `ZqA()` + `Promise.race()`

When the model outputs multiple `Task` tool calls in one response, Claude Code executes them concurrently using `ZqA()` — an async generator that runs multiple generators via `Promise.race()` with a configurable concurrency limit.

Each subagent makes its own independent Claude API calls. They run concurrently through the JS event loop — **true concurrency on I/O** (API calls, web fetches), **single-threaded on compute**.

#### Built-in Agent Types

| Type | Model | Tools | Read-Only |
|---|---|---|---|
| `general-purpose` | inherit | `["*"]` (all) | No |
| `Explore` | haiku | All except Task, Edit, Write | Yes |
| `Plan` | inherit | All except Task, Edit, Write | Yes |
| `statusline-setup` | sonnet | Read, Edit only | No |
| `claude-code-guide` | haiku | Glob, Grep, Read, WebFetch, WebSearch | Yes |

Plus: custom (user-defined from `.claude/agents/`), teammate, worker, magic-docs.

#### Result Handling

- Max result size: 100,000 characters (`maxResultSizeChars: 1e5`)
- Results extracted via `UyL()` which pulls text content and token counts
- Subagent transcripts saved and can be resumed by agent ID
- **Context return is text-only** — structured file/diff data is NOT returned

#### Architecture Diagram (Actual)

```
┌─────────────────────────────────────────────────┐
│              Single Bun Process (~183MB)         │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │  Main Conversation (kq() async generator) │   │
│  │  - System prompt, tools, messages         │   │
│  │  - Makes Claude API calls via Gk()        │   │
│  │                                           │   │
│  │  Tool call: Task(subagent_type="Explore") │   │
│  │  Tool call: Task(subagent_type="Explore") │   │
│  │            │                │              │   │
│  └────────────┼────────────────┼──────────────┘   │
│               │                │                  │
│    ┌──────────▼───────┐ ┌─────▼────────────┐    │
│    │ Sub-agent 1       │ │ Sub-agent 2       │    │
│    │ kq() generator    │ │ kq() generator    │    │
│    │ Own messages[]    │ │ Own messages[]    │    │
│    │ Own system prompt │ │ Own system prompt │    │
│    │ Own tool set      │ │ Own tool set      │    │
│    │ AsyncLocalStorage │ │ AsyncLocalStorage │    │
│    │                   │ │                   │    │
│    │ API call → Claude │ │ API call → Claude │    │
│    │ Tool use → loop   │ │ Tool use → loop   │    │
│    │ API call → Claude │ │ API call → Claude │    │
│    │ ...until done     │ │ ...until done     │    │
│    └───────────────────┘ └───────────────────┘    │
│                                                  │
│  All sharing the same event loop, same heap,     │
│  same process. Concurrency via async/await.      │
└─────────────────────────────────────────────────┘
```

### 2.3 Issue #5812: The Context Isolation Problem

**Filed:** 2025-08-15 | **Status:** Auto-closed (inactivity) | **Locked**

The core problem:
1. Parent delegates "create NewComponent.tsx" to a `frontend-dev` subagent
2. Subagent creates the file using `Write` tool
3. Parent regains control but has NO knowledge of what's in `NewComponent.tsx`
4. Parent cannot proceed with `import NewComponent from './NewComponent'` without reading the file again

**Root cause:** `kq()` returns text content via `UyL()`. There is no mechanism to return structured metadata (files created, files modified, diffs) from the child's `kq()` generator to the parent's `kq()` generator. The generators are isolated async contexts — they share the same heap but have no structured communication channel.

**Proposed solution:** Add `additionalParentContext` to the `SubagentStop` hook output, letting hooks inject structured context into the parent's next turn.

**Current status (Feb 2026):** `additionalContext` was added to `PostToolUse` and `SessionStart` hooks, but **NOT to `SubagentStop`**. The gap remains unsolved in Claude Code.

#### Community Workarounds

| Workaround | Mechanism | Reliability | Token Cost |
|---|---|---|---|
| `SubagentStop` block hack | `{"decision":"block","reason":"summary"}` | Fragile (transcript parsing) | Low |
| State file decoupling | Write to temp file, `UserPromptSubmit` reads | Medium (race conditions) | Medium |
| Git side-effects | Auto-commit, parent runs `git status` | Indirect, commit spam | High |
| Researcher-Implementer | Subagents read-only, parent writes | Works but defeats purpose | Very high |
| Plaintext scratchpads | Subagents write discovery files | Works well in practice | Medium |

### 2.4 Agent Teams (Experimental)

Claude Code also has an experimental **Agent Teams** feature (separate from subagents):
- Each teammate is a **separate Claude Code CLI instance** (actual OS process)
- Communication via **shared task list** (file-based) and **mailbox** (inter-process messaging)
- Teammates have **fully independent context windows**
- Coordination overhead is significant (15x token usage vs single chat)
- Requires tmux/iTerm2 for split pane display
- **Cannot be resumed** across sessions
- **No nested teams**

### 2.5 Why Claude Code's Approach Works (For Them)

| Factor | Claude Code Reality | Why It Works |
|---|---|---|
| Runtime | Single Bun process, single event loop | Claude API is I/O-bound — async/await gives real concurrency |
| Reliability | Claude API is 99.9%+ uptime | API calls don't hang indefinitely, don't OOM the process |
| Accuracy | Claude tool calling ~95%+ | Subagents rarely crash from malformed tool calls |
| User model | One user per CLI instance | No multi-tenancy — blocking one user is fine |
| Generator cleanup | AbortSignal propagation | Can cancel any subagent cleanly |
| Concurrency | `ZqA()` + `Promise.race()` | N concurrent API calls through event loop — no threads needed |
| Memory | Shared heap, ~183MB process | No per-subagent memory overhead |

### 2.6 Key Architectural Insights

| Aspect | Claude Code | Implication for Jeriko |
|---|---|---|
| Execution model | Async generators in same process | Simple, zero overhead — but no crash isolation |
| Concurrency | `Promise.race()` on I/O-bound API calls | Works because Claude API is reliable |
| Context isolation | `AsyncLocalStorage` + separate messages[] | Logical isolation, not OS isolation |
| Context return | Text-only (100K char max) | Issue #5812 unsolved — no structured bridging |
| Context forking | `forkContext: true` passes parent history | Jeriko can replicate this trivially |
| Subagent depth | 1 level only | Simplifies design significantly |
| Model per subagent | Configurable (inherit/override) | Must support in Jeriko |
| Tool restriction | Per-subagent allowlist | Must implement |
| Compaction | Independent per subagent | Each manages own context window |
| Resume | Agent ID → load transcript | Must support in Jeriko |
| Agent Teams | Separate processes, experimental | Too heavy for OSS models |

---

## 3. Jeriko Current State: What We Have

### 3.1 Agent Loop (`server/router.js` — 877 lines)

```
route(text, onChunk, onStatus, history)
  → executeLocal(command, onChunk, onStatus, history)
    → agentLoop(command, caller, onChunk, onStatus, history)
```

- **One unified loop**, 50 max turns
- **3 API callers:** Claude (prompt caching + extended thinking), OpenAI (reasoning models), Local (Ollama with graceful tool fallback)
- **Context compaction** at 75% of limit via `context.compactMessages()`
- **Conversation persistence** via mutated `history` array synced back to socket
- **Security:** path allowlist, command blocklist, log redaction, env stripping
- **Streaming:** Local models via SSE parsing with buffered flush

### 3.2 Tool System (`server/tools.js` — 512 lines)

9 tools in Anthropic-native format with `toOpenAIFormat()` auto-conversion:

| Tool | Timeout | Output Limit |
|---|---|---|
| `bash` | 120s | 10KB |
| `write_file` | sync | — |
| `read_file` | sync | 10KB |
| `edit_file` | sync | — |
| `list_files` | 10s | 200 files |
| `search_files` | 15s | 50 results |
| `web_search` | 30s | 10KB |
| `screenshot` | 15s | 10KB |
| `parallel_tasks` | 5min | 20KB |

### 3.3 Current `parallel_tasks` Implementation

```javascript
// tools.js line 404
function runParallelTasks(tasks, maxWorkers = 4) {
  const taskJson = JSON.stringify(tasks);
  const args = [JERIKO, 'parallel', '--tasks', taskJson, ...];
  const result = spawnSync('node', args, { timeout: 5 * 60 * 1000 });
  return { result: output.slice(0, 20000), success: result.status === 0 };
}
```

**Limitations of current `parallel_tasks`:**
1. **No tool access** — subagents get a prompt and return text only
2. **No context bridging** — parent gets a flat text blob, no structured output
3. **No conversation history** — each parallel task starts from scratch
4. **Synchronous blocking** — `spawnSync` blocks the entire agent loop
5. **External Go binary** — separate runtime, no shared infrastructure
6. **No security validation** — tasks run in a separate process without Jeriko's security layer
7. **No streaming** — parent waits for all tasks to complete
8. **No model selection** — all tasks use the same backend

### 3.4 Unix Socket IPC (`server/socket.js`)

```javascript
conversations = new Map();  // convId → [messages]

// On 'ask':
const history = conversations.get(convId) || [];
route(text, onChunk, onStatus, history);
// history mutated in-place by agentLoop, persists for next request
```

This is the foundation for subagent context persistence.

---

## 4. Feasibility Analysis: Can We Build This?

### 4.1 What We Need vs. What We Have

| Requirement | Current State | Gap |
|---|---|---|
| Agent loop in child process | `agentLoop()` is self-contained, stateless | Need worker entry script + IPC |
| Context isolation | Single `messages` array per invocation | Already isolated — zero changes |
| Structured context return | `parallel_tasks` returns text | Need ContextTracker + IPC bridge |
| Tool restriction per subagent | All 9 tools always available | Need allowlist filter |
| Model selection per subagent | Backend chosen at route level | Need per-child config via IPC |
| Crash isolation | In-process execution | `child_process.fork()` gives this |
| Security enforcement | `security.validateToolCall()` | Already works — child imports it |
| Real-time streaming | Only local models stream | IPC `process.send()` streams to parent |
| Context compaction per subagent | `compactMessages()` exists | Already works per-invocation |
| In-memory context in daemon | Socket `conversations` Map | Need SubagentStore (same pattern) |

### 4.2 Claude Code's Approach vs. Jeriko's Requirements

**Claude Code's real mechanism (confirmed from decompiled binary):**

Async generators (`kq()`) in the same process, concurrent via `ZqA()` + `Promise.race()`, context-isolated via `AsyncLocalStorage`. No fork. No IPC. No child process.

**This approach CAN work for API-only backends (Claude, OpenAI, Anthropic):** API calls are I/O-bound, the event loop handles concurrency naturally, and cloud APIs don't crash the local process.

**This approach CANNOT safely work when the daemon targets local models via Ollama:**

| Problem | Impact | Why fork() solves it |
|---|---|---|
| **Ollama hangs** — local models OOM, stall 60s+, return incomplete JSON | In-process: subagent's `fetch()` hangs, but event loop stays live. However, if Ollama causes a V8 heap OOM (loading 70B model context), the entire process dies. | Child OOM → child dies, daemon untouched |
| **Multi-tenant daemon** — serves socket, webhooks, triggers simultaneously | In-process subagents share the event loop — a CPU-heavy tool (screenshot, large file parse) blocks all clients | Child CPU-blocking doesn't affect daemon event loop |
| **OSS model crashes** — 7B models emit malformed JSON that `JSON.parse()` chokes on | try/catch handles most, but some edge cases (Buffer overflows, native module segfaults) kill the process | Child crash → daemon logs error, continues |
| **Memory isolation** — 4 concurrent subagents with 70B model each | In-process: shared V8 heap balloons to 8GB+, triggers garbage collection pauses | Each child has own V8 heap with `--max-old-space-size` cap |
| **Unrecoverable state** — a tool call corrupts global state (working directory, env vars) | In-process: all subagents and parent affected | Child has own process state, parent clean |

**Honest assessment — where Claude Code's approach IS better:**

| Aspect | Async generators (Claude Code) | fork() (proposed) |
|---|---|---|
| Startup overhead | Zero | ~50ms per child |
| Memory overhead | Zero (shared heap) | ~30-50MB per child (V8 baseline) |
| IPC serialization | Zero (same heap) | Structured clone, ~1-5ms per message |
| Code complexity | Lower (same async patterns) | Higher (IPC protocol, worker script) |
| Debugging | Single process stack traces | Multi-process trace correlation |
| API-only workloads | Perfect — I/O concurrency through event loop | Unnecessary overhead |

**Conclusion:** For a single-user CLI hitting cloud APIs, async generators are the right choice. For a multi-tenant daemon that must handle local models that can OOM/hang/crash, fork() provides the crash and memory isolation that generators cannot.

### 4.3 Decision: ALL Subagents Use `child_process.fork()` + IPC

**Every subagent — single or parallel — runs as a forked child process.**

No hybrid. No async generators in-process. One execution model.

Claude Code's `kq()` async generator pattern is elegant for a single-user CLI hitting cloud APIs. But we're building a multi-tenant daemon that targets Ollama and local models. We take Claude Code's design — same loop for parent and child, same tools, same context isolation — but give each subagent its own process for crash/memory isolation and structured context return (solving #5812).

```javascript
// This is the ONLY way subagents run
const { fork } = require('child_process');

const child = fork(path.join(__dirname, 'subagent-worker.js'), [], {
  env: buildChildEnv(config),
  stdio: ['pipe', 'pipe', 'pipe', 'ipc'],  // pipe + IPC channel
  timeout: config.timeout || 300000          // OS-level kill after 5min
});
```

**Why fork() is the right primitive:**

| Property | `fork()` gives us |
|---|---|
| Crash isolation | Child dies → parent untouched. `child.on('exit')` handles cleanup. |
| Memory isolation | Own V8 heap. 7B model's 2GB context doesn't bloat daemon. |
| True concurrency | Separate OS process = separate CPU core. 4 workers = 4 cores. |
| OS-level timeout | `setTimeout → child.kill('SIGTERM')` — guaranteed death. |
| Built-in IPC | `child.send()` / `process.send()` — structured clone, ~1-5ms. |
| Same codebase | Child `require('./tools')`, `require('./security')` — same code. |
| Event loop free | Daemon continues serving all clients while children work. |

**Overhead:** ~50ms startup per child. Subagent tasks take 10-60 seconds. That's 0.08-0.5% overhead. Negligible.

**File descriptors:** Each fork uses ~3 FDs. macOS default limit is 256, adjustable to 10240. Running 8 concurrent subagents uses 24 FDs. Not a concern.

### 4.4 The IPC Protocol

Real-time bidirectional communication between daemon and child:

```
DAEMON → CHILD (child.send()):
  { type: 'start', config, prompt, parentContext }   // Start agent loop
  { type: 'abort' }                                   // Cancel execution

CHILD → DAEMON (process.send()):
  { type: 'chunk', text }                             // Streaming text output
  { type: 'status', event, detail }                   // thinking, tool_call, reasoning
  { type: 'context_update', event, data }             // Real-time file/tool tracking
  { type: 'result', ok, result, context, metrics }    // Final structured result
  { type: 'error', error }                            // Failure
```

**Key insight: `context_update` streams in real-time.** The daemon doesn't wait for the child to finish to know what it did. Every `write_file`, `edit_file`, `bash` call is reported via IPC as it happens. The daemon's in-memory store is always current.

### 4.5 In-Memory Context Store (Daemon Side)

The daemon process holds all subagent state in memory. No disk. No database. Instant access from any part of the daemon.

```javascript
// In daemon memory — same pattern as socket.js conversations Map
const subagentStore = new Map();  // agentId → SubagentState

// SubagentState:
{
  id: 'sa-a1b2c3d4',
  status: 'running' | 'done' | 'error' | 'timeout',
  config: { prompt, tools, model, maxTurns, timeout },
  process: childProcess,          // Reference to fork'd process
  startedAt: Date.now(),

  // Real-time context (updated via IPC as child works)
  contextUpdates: [
    { event: 'file_created', path: 'src/auth.js', content: '...', ts: 1709... },
    { event: 'file_modified', path: 'src/index.js', diff: '+require...', ts: 1709... },
    { event: 'tool_call', tool: 'bash', command: 'npm install jwt', output: '...', ts: 1709... },
  ],

  // Final result (set when child sends 'result' message)
  result: null,
  metrics: null,

  // Promise resolution (for parent agent loop await)
  resolve: null,
  reject: null,
}
```

**Any part of the daemon can read this:**
- Parent agent loop → reads structured context after child completes
- Triggers → can check if a subagent is still running
- Socket clients → can query subagent status
- Logger → tracks per-subagent metrics

**Cleanup:** When a subagent completes and its context is injected into the parent, the entry is moved to a TTL cache (5 min default) then garbage collected. No memory leaks.

### 4.4 OSS Model Compatibility Analysis

#### Tool Calling Reliability by Model Family

| Model | BFCL Score | Multi-Turn | Parallel Calls | Jeriko Viability |
|---|---|---|---|---|
| Llama 3.1 405B | ~81% | Good | Strong | Excellent |
| Llama 3.3 70B | ~77% | Good | Strong | Excellent |
| Qwen3 8B-32B | ~65-70% | Medium | Medium | Good |
| Qwen3-Coder 30B | N/A | Good | Good | Excellent (purpose-built) |
| DeepSeek-V3.2 | ~70%+ | Medium | Weak | Good (integrated thinking+tools) |
| Devstral 2 (123B) | 72% SWE | Good | Good | Excellent |
| Devstral Small 2 (24B) | 68% SWE | Good | Good | Very Good |
| gpt-oss-120b | o3-level | Good | Good | Excellent |
| gpt-oss-20b | ~65% | Medium | Medium | Good |
| DeepSeek-R1 | N/A | N/A | N/A | **NO** (no tool calling) |
| Phi-4-mini | ~55% | Weak | Weak | Marginal |
| Gemma 2 9B | ~59% | Weak | Weak | Marginal |

#### Critical: Models Without Tool Calling

DeepSeek-R1, some Phi variants, and other pure reasoning models **cannot emit tool calls**. Jeriko's Local caller already handles this with graceful fallback:

```javascript
// router.js buildLocalCaller()
// If 400 "does not support tools":
//   Set toolsSupported = false
//   Retry WITHOUT tools (silent fallback)
```

For subagents, this means: **non-tool-calling models can only be text-only workers** (like current `parallel_tasks`). This is acceptable — the subagent system should degrade gracefully:

| Model Capability | Subagent Mode | Tool Access | Context Return |
|---|---|---|---|
| Full tool calling | **Agent subagent** | All allowed tools | Structured JSON + text |
| No tool calling | **Text-only worker** | None (prompt in, text out) | Text only |
| Reasoning-only (R1) | **Planner/Advisor** | None, but gets tool results | Text analysis |

#### Enforcing Reasoning Models

The user asked about enforcing reasoning models. Analysis:

**Should we require reasoning?** No. Here's why:

1. **Reasoning models are slower** — 3-10x latency vs standard models for each turn
2. **Some reasoning models can't tool-call** (DeepSeek-R1) — breaks the core loop
3. **Reasoning tokens are expensive** — 15x token usage in multi-agent systems
4. **Small reasoning models (7B) still hallucinate** — reasoning doesn't fix schema adherence
5. **Standard models with good tool training outperform** — Llama 3.3 70B (no reasoning) beats DeepSeek-R1 (reasoning-only) at tool calling

**What we should do instead:**
- **Recommend** models with native tool calling (Qwen3, Llama 3.3, Devstral, gpt-oss)
- **Detect** tool-calling capability at runtime (already implemented via 400 fallback)
- **Degrade gracefully** — non-tool models become text workers
- **Let users configure** — `LOCAL_MODEL` and model override per subagent

---

## 5. Solving Issue #5812: Structured Context Bridging

### 5.1 The Problem (Restated Precisely)

In Claude Code, when subagent B (child) creates file X, parent agent A does not have X's contents in its context window. A knows B finished, but not what B produced. A must explicitly `Read` the file, wasting a turn and tokens.

### 5.2 Why Claude Code Can't Easily Fix This

Claude Code's subagent returns are **text-only by design**. The parent receives the subagent's final response as a single assistant message. There's no mechanism to:
- Inject tool results into the parent's context
- Return structured metadata (files created, files modified, key decisions)
- Provide a "diff" of what changed

The hook system (`SubagentStop`) can run shell commands but cannot inject data into the parent's API context programmatically.

### 5.3 Jeriko's Advantage: We Control the Loop

Since we own the entire agent loop, we can build structured context return directly:

```javascript
// Subagent returns structured result
{
  ok: true,
  result: "Created auth module with JWT tokens",  // Text summary for LLM
  context: {
    filesCreated: [
      { path: "src/auth.js", content: "const jwt = require...", size: 1243 }
    ],
    filesModified: [
      { path: "src/index.js", diff: "+const auth = require('./auth');\n+app.use(auth.middleware);" }
    ],
    toolCallSummary: [
      { tool: "bash", command: "npm install jsonwebtoken", output: "added 1 package" },
      { tool: "write_file", path: "src/auth.js" },
      { tool: "edit_file", path: "src/index.js" }
    ],
    decisions: [
      "Used HS256 for JWT signing (fast, symmetric)",
      "Token expiry set to 24h with refresh rotation"
    ],
    metrics: {
      turns: 8,
      toolCalls: 12,
      tokensIn: 15000,
      tokensOut: 8000,
      durationMs: 45000
    }
  }
}
```

The parent agent loop receives this structured result and can:
1. **Inject file contents** directly into the context as tool results
2. **Surface decisions** so the parent understands the subagent's reasoning
3. **Track metrics** for logging and optimization
4. **Show diffs** so the parent knows exactly what changed

### 5.4 Context Injection Strategy

When a subagent completes, the parent's context gets:

```javascript
// Injected as a tool_result in parent's message history
{
  role: 'user',  // (or tool_result for Claude format)
  content: `[Subagent "${name}" completed — ${turns} turns, ${durationMs}ms]

Summary: ${result}

Files created:
${filesCreated.map(f => `- ${f.path} (${f.size} bytes)`).join('\n')}

Files modified:
${filesModified.map(f => `- ${f.path}\n${f.diff}`).join('\n')}

Key decisions:
${decisions.map(d => `- ${d}`).join('\n')}

Tool calls: ${toolCallSummary.length} (${toolCallSummary.map(t => t.tool).join(', ')})`
}
```

**Token budget management:** If the subagent's context payload exceeds a configurable threshold (default: 4000 tokens), we summarize instead of including raw content:

```javascript
if (estimateTokens(contextPayload) > SUBAGENT_CONTEXT_BUDGET) {
  // Summarize using the same compaction mechanism
  contextPayload = await summarizeSubagentOutput(contextPayload, caller);
}
```

### 5.5 Comparison: Claude Code vs Jeriko Approach

| Aspect | Claude Code (Current) | Jeriko (Proposed) |
|---|---|---|
| Context return | Text only | Structured JSON with files, diffs, decisions |
| Parent awareness | Knows task finished, not what was produced | Knows exactly what changed and why |
| File contents | Must re-read files (extra turn) | Injected directly (zero extra turns) |
| Decisions | Lost unless subagent explicitly narrates | Captured and surfaced automatically |
| Metrics | Basic (tokens, duration) | Detailed (per-tool, per-turn) |
| Token cost | Lower return, but higher follow-up | Higher return, but zero follow-up |
| OSS model support | Claude only | Any model with tool calling |

---

## 6. Proposed Architecture: All-Fork Concurrent with In-Memory IPC

### 6.1 System Overview

```
USER (Telegram / Socket / WebSocket / Webhook / Cron)
  │
  ▼
DAEMON PROCESS (persistent Node.js, always running)
  │
  ├── Event Loop (NEVER blocked by subagents)
  │   ├── Express HTTP (webhooks, API)
  │   ├── WebSocket (remote agents)
  │   ├── Unix Socket (local CLI)
  │   ├── Telegram Bot
  │   └── Trigger Engine (cron, email, file, http)
  │
  ├── Parent agentLoop() ← runs on event loop (async, non-blocking)
  │   │
  │   │  while (turn < maxTurns):
  │   │    1. compactMessages() if >75% context
  │   │    2. call LLM (user's model)
  │   │    3. if tool_calls:
  │   │       ├── normal tools → executeTool() (sync, fast)
  │   │       │
  │   │       ├── delegate tool → ORCHESTRATOR
  │   │       │   │
  │   │       │   ├── fork() → Child Process (subagent)
  │   │       │   │   ├── Own agentLoop() (same code)
  │   │       │   │   ├── Own V8 heap (own memory)
  │   │       │   │   ├── Own tools (filtered allowlist)
  │   │       │   │   ├── Own model (inherit or override)
  │   │       │   │   ├── IPC streams: chunks, status, context_updates
  │   │       │   │   └── On complete: sends structured result
  │   │       │   │
  │   │       │   ├── Daemon stores context_updates in-memory (real-time)
  │   │       │   ├── await result (non-blocking to event loop)
  │   │       │   └── Bridge context → inject into parent messages
  │   │       │
  │   │       └── fan_out tool → ORCHESTRATOR (concurrent)
  │   │           │
  │   │           ├── Wave 1: fork() N children simultaneously
  │   │           │   ├── Child A ──IPC──→ daemon memory
  │   │           │   ├── Child B ──IPC──→ daemon memory
  │   │           │   ├── Child C ──IPC──→ daemon memory
  │   │           │   └── Child D ──IPC──→ daemon memory
  │   │           │
  │   │           ├── Promise.all(wave1) → collect results
  │   │           ├── Wave 2: fork() remaining children
  │   │           ├── Promise.all(wave2) → collect results
  │   │           │
  │   │           └── Bridge ALL contexts → inject into parent
  │   │
  │   │    4. parent's next LLM call sees all subagent outputs
  │   │    5. if no tool_calls → return final response
  │
  ├── SubagentStore (Map in daemon memory)
  │   ├── sa-a1b2c3d4 → { process, status, contextUpdates[], result }
  │   ├── sa-e5f6g7h8 → { process, status, contextUpdates[], result }
  │   └── (TTL cleanup after parent consumes result)
  │
  └── Security (gates EVERY tool call — parent AND child processes)
```

### 6.2 New Tool Definitions

#### `delegate` — Spawn One Subagent (fork + await)

```javascript
{
  name: 'delegate',
  description: 'Delegate a task to a subagent that runs its own full agent loop in an isolated process. The subagent has tool access (bash, write_file, etc.) and returns structured results: files created, files modified, tool calls made, and a text summary. Parent sees everything the subagent did. Use for: focused research, code generation, code review, debugging, any task that benefits from isolation.',
  input_schema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'Task for the subagent to complete' },
      tools: {
        type: 'array',
        items: { type: 'string' },
        description: 'Allowed tools (default: all). Options: bash, write_file, read_file, edit_file, list_files, search_files, web_search, screenshot'
      },
      model: {
        type: 'string',
        description: 'Model override. "inherit" (default) uses parent model. Or: "claude", "openai", "local", or specific model name like "qwen3:14b"'
      },
      context: {
        type: 'string',
        description: 'Context to pass to the subagent (relevant file contents, decisions so far, constraints)'
      },
      max_turns: { type: 'number', description: 'Max agent loop turns (default: 25)' },
      workspace: { type: 'string', description: 'Working directory for subagent (default: current project)' }
    },
    required: ['prompt']
  }
}
```

#### `fan_out` — Spawn N Subagents Concurrently (wave-based)

```javascript
{
  name: 'fan_out',
  description: 'Run multiple subagents concurrently. Each gets its own isolated process with full agent loop and tool access. Results are collected and returned as structured context showing what each agent did. Use for: parallel research, multi-file generation, generating competing approaches, concurrent code review from different angles.',
  input_schema: {
    type: 'object',
    properties: {
      agents: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Unique agent identifier (e.g., "researcher", "builder-1")' },
            prompt: { type: 'string', description: 'Task for this agent' },
            tools: { type: 'array', items: { type: 'string' } },
            model: { type: 'string' },
            context: { type: 'string' },
            max_turns: { type: 'number' },
            workspace: { type: 'string' }
          },
          required: ['id', 'prompt']
        },
        description: 'Array of agents to run concurrently'
      },
      max_concurrent: { type: 'number', description: 'Max concurrent agents per wave (default: 4)' },
      timeout: { type: 'number', description: 'Timeout per agent in ms (default: 300000)' }
    },
    required: ['agents']
  }
}
```

### 6.3 Orchestrator (`server/orchestrator.js`)

The orchestrator manages child process lifecycle, IPC, and the in-memory store:

```javascript
const { fork } = require('child_process');
const path = require('path');
const crypto = require('crypto');
const { estimateTokens } = require('./context');
const { cleanEnv } = require('./env');

const WORKER_SCRIPT = path.join(__dirname, 'subagent-worker.js');

// ═══════════════════════════════════════════════════════════════
// IN-MEMORY SUBAGENT STORE (daemon-level, survives across requests)
// ═══════════════════════════════════════════════════════════════

const store = new Map();  // agentId → SubagentState
const TTL = 5 * 60 * 1000;  // Cleanup 5 min after consumption

// ═══════════════════════════════════════════════════════════════
// DELEGATE: Spawn one subagent, await result
// ═══════════════════════════════════════════════════════════════

async function delegate(config, parentCallbacks) {
  const agentId = `sa-${crypto.randomBytes(4).toString('hex')}`;
  const timeout = config.timeout || 300000;

  return new Promise((resolve, reject) => {
    const child = fork(WORKER_SCRIPT, [], {
      env: buildChildEnv(config),
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    });

    const state = {
      id: agentId,
      status: 'running',
      config,
      process: child,
      startedAt: Date.now(),
      contextUpdates: [],
      result: null,
      metrics: null,
    };
    store.set(agentId, state);

    // Timeout enforcement
    const timer = setTimeout(() => {
      state.status = 'timeout';
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000);  // Force kill after 5s
      reject(new Error(`Subagent ${agentId} timed out after ${timeout}ms`));
    }, timeout);

    // IPC message handler
    child.on('message', (msg) => {
      switch (msg.type) {
        case 'chunk':
          if (parentCallbacks.onChunk) parentCallbacks.onChunk(msg.text);
          break;
        case 'status':
          if (parentCallbacks.onStatus) parentCallbacks.onStatus(msg.status);
          break;
        case 'context_update':
          state.contextUpdates.push(msg.data);  // Real-time tracking
          break;
        case 'result':
          clearTimeout(timer);
          state.status = 'done';
          state.result = msg.result;
          state.metrics = msg.metrics;
          state.structuredContext = msg.context;
          resolve({
            ok: true,
            agentId,
            result: msg.result,
            context: msg.context,
            metrics: msg.metrics,
          });
          scheduleCleanup(agentId);
          break;
        case 'error':
          clearTimeout(timer);
          state.status = 'error';
          reject(new Error(msg.error));
          scheduleCleanup(agentId);
          break;
      }
    });

    // Process crash handler
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (state.status === 'running') {
        state.status = 'error';
        reject(new Error(`Subagent ${agentId} exited with code ${code}`));
        scheduleCleanup(agentId);
      }
    });

    // Start the agent loop in child
    child.send({
      type: 'start',
      config: {
        prompt: config.prompt,
        tools: config.tools || null,    // null = all tools
        model: config.model || null,    // null = inherit
        maxTurns: config.max_turns || 25,
        workspace: config.workspace || process.cwd(),
        systemPrompt: config.systemPrompt || null,
      },
      parentContext: config.context || null,
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// FAN_OUT: Spawn N subagents concurrently, wave-based
// ═══════════════════════════════════════════════════════════════

async function fanOut(agentConfigs, options, parentCallbacks) {
  const maxConcurrent = options.max_concurrent || 4;
  const timeout = options.timeout || 300000;
  const results = [];

  // Wave-based execution
  for (let i = 0; i < agentConfigs.length; i += maxConcurrent) {
    const wave = agentConfigs.slice(i, i + maxConcurrent);

    if (parentCallbacks.onStatus) {
      parentCallbacks.onStatus({
        type: 'fan_out',
        text: `Wave ${Math.floor(i / maxConcurrent) + 1}: starting ${wave.length} agents`,
      });
    }

    const waveResults = await Promise.allSettled(
      wave.map(cfg => delegate(
        { ...cfg, timeout },
        {
          // Stream status but not chunks (too noisy with N agents)
          onStatus: parentCallbacks.onStatus,
          onChunk: null,
        }
      ))
    );

    for (let j = 0; j < waveResults.length; j++) {
      const r = waveResults[j];
      results.push({
        id: wave[j].id,
        ok: r.status === 'fulfilled',
        ...(r.status === 'fulfilled' ? r.value : { error: r.reason.message }),
      });
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════
// CONTEXT BRIDGE: Build structured payload for parent injection
// ═══════════════════════════════════════════════════════════════

function bridgeContext(subagentResult, budget = 4000) {
  const { result, context, metrics, agentId } = subagentResult;
  const parts = [];

  parts.push(`[Agent ${agentId} completed — ${metrics?.turns || '?'} turns, ${metrics?.toolCalls || '?'} tool calls]`);
  parts.push(`\nSummary: ${result}`);

  if (context?.filesCreated?.length > 0) {
    parts.push('\n--- Files Created ---');
    for (const f of context.filesCreated) {
      parts.push(`${f.path} (${f.size} bytes)`);
      if (f.content) parts.push('```\n' + f.content + '\n```');
    }
  }

  if (context?.filesModified?.length > 0) {
    parts.push('\n--- Files Modified ---');
    for (const f of context.filesModified) {
      parts.push(`${f.path}`);
      if (f.diff) parts.push(f.diff);
    }
  }

  if (context?.toolCalls?.length > 0) {
    parts.push('\n--- Tool Calls ---');
    for (const t of context.toolCalls) {
      const status = t.success ? 'ok' : 'FAILED';
      parts.push(`${t.tool}: ${t.summary || ''} [${status}]`);
    }
  }

  let payload = parts.join('\n');

  // Budget enforcement: truncate if too large
  if (estimateTokens(payload) > budget) {
    // Keep summary + file list, drop contents
    const trimmed = [parts[0], parts[1]];
    if (context?.filesCreated?.length > 0) {
      trimmed.push('\nFiles created: ' + context.filesCreated.map(f => f.path).join(', '));
    }
    if (context?.filesModified?.length > 0) {
      trimmed.push('Files modified: ' + context.filesModified.map(f => f.path).join(', '));
    }
    trimmed.push(`\n[${metrics?.toolCalls || 0} tool calls, budget-trimmed]`);
    payload = trimmed.join('\n');
  }

  return payload;
}

function bridgeFanOutContext(results, budget = 8000) {
  const perAgentBudget = Math.floor(budget / Math.max(results.length, 1));
  return results.map(r => {
    if (!r.ok) return `[Agent ${r.id}: FAILED — ${r.error}]`;
    return bridgeContext(r, perAgentBudget);
  }).join('\n\n---\n\n');
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function buildChildEnv(config) {
  const env = cleanEnv();
  // Pass API keys the child needs
  if (config.model === 'claude' || (!config.model && process.env.AI_BACKEND === 'claude')) {
    env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  }
  if (config.model === 'openai' || (!config.model && process.env.AI_BACKEND === 'openai')) {
    env.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  }
  env.LOCAL_MODEL_URL = process.env.LOCAL_MODEL_URL || 'http://localhost:11434/v1';
  env.LOCAL_MODEL = process.env.LOCAL_MODEL || 'gpt-oss:120b-cloud';
  env.AI_BACKEND = config.model || process.env.AI_BACKEND || 'local';
  env.SUBAGENT_MODE = '1';  // Signal to worker that it's a subagent
  return env;
}

function scheduleCleanup(agentId) {
  setTimeout(() => store.delete(agentId), TTL);
}

function getStore() { return store; }

module.exports = { delegate, fanOut, bridgeContext, bridgeFanOutContext, getStore };
```

### 6.4 Worker Script (`server/subagent-worker.js`)

The child process entry point. Imports the same `agentLoop()` from `router.js`:

```javascript
/**
 * server/subagent-worker.js — Child Process Agent Worker
 *
 * Forked by orchestrator.js. Runs agentLoop() with IPC back to daemon.
 * Same code as parent loop — just in a separate process.
 */

const path = require('path');

// Import the SAME modules the parent uses
const { TOOL_DEFINITIONS, toOpenAIFormat, executeTool } = require('./tools');
const security = require('./security');
const context = require('./context');
const { createLogger } = require('./logger');

// Import caller builders from router
// (router.js must export these — currently doesn't, needs 1-line change)
const {
  agentLoop,
  buildClaudeCaller,
  buildOpenAICaller,
  buildLocalCaller,
} = require('./router');

// ═══════════════════════════════════════════════════════════════
// TOOL FILTERING
// ═══════════════════════════════════════════════════════════════

function filterTools(allTools, allowList) {
  if (!allowList || allowList.length === 0) return allTools;
  const allowed = new Set(allowList.map(t => t.toLowerCase()));
  return allTools.filter(t => allowed.has(t.name.toLowerCase()));
}

// ═══════════════════════════════════════════════════════════════
// CONTEXT TRACKER (intercepts tool calls, reports via IPC)
// ═══════════════════════════════════════════════════════════════

function createContextTracker() {
  const filesCreated = [];
  const filesModified = [];
  const toolCalls = [];
  let turns = 0;
  let totalTokensIn = 0;
  let totalTokensOut = 0;

  return {
    recordToolCall(name, input, result) {
      const summary = name === 'bash' ? (input.command || '').slice(0, 200) :
                      input.path || input.directory || input.query || name;

      toolCalls.push({ tool: name, summary, success: result.success });

      // Track file operations
      if (name === 'write_file' && result.success) {
        const entry = {
          path: input.path,
          content: (input.content || '').slice(0, 2000),
          size: (input.content || '').length,
        };
        filesCreated.push(entry);
        // Stream to daemon in real-time
        process.send({ type: 'context_update', data: { event: 'file_created', ...entry, ts: Date.now() } });
      }

      if (name === 'edit_file' && result.success) {
        const entry = {
          path: input.path,
          diff: `- ${(input.old_string || '').slice(0, 500)}\n+ ${(input.new_string || '').slice(0, 500)}`,
        };
        filesModified.push(entry);
        process.send({ type: 'context_update', data: { event: 'file_modified', ...entry, ts: Date.now() } });
      }

      // Stream all tool calls to daemon
      process.send({ type: 'context_update', data: { event: 'tool_call', tool: name, summary, success: result.success, ts: Date.now() } });
    },

    recordTurn(usage) {
      turns++;
      if (usage) {
        totalTokensIn += usage.input_tokens || 0;
        totalTokensOut += usage.output_tokens || 0;
      }
    },

    getStructuredContext() { return { filesCreated, filesModified, toolCalls }; },
    getMetrics() { return { turns, toolCalls: toolCalls.length, totalTokensIn, totalTokensOut }; },
  };
}

// ═══════════════════════════════════════════════════════════════
// MAIN: Listen for start message, run agentLoop, report back
// ═══════════════════════════════════════════════════════════════

process.on('message', async (msg) => {
  if (msg.type === 'abort') {
    process.exit(1);
  }

  if (msg.type !== 'start') return;

  const { config, parentContext } = msg;
  const tracker = createContextTracker();

  // Build caller based on config
  const backend = config.model || process.env.AI_BACKEND || 'local';
  let caller;
  if (backend === 'claude') caller = buildClaudeCaller();
  else if (backend === 'openai') caller = buildOpenAICaller();
  else caller = buildLocalCaller();

  // Filter tools
  const tools = config.tools
    ? filterTools(TOOL_DEFINITIONS, config.tools)
    : TOOL_DEFINITIONS;

  // Build prompt with optional parent context
  let prompt = config.prompt;
  if (parentContext) {
    prompt = `Context from parent:\n${parentContext}\n\nTask:\n${config.prompt}`;
  }

  // Change working directory if workspace specified
  if (config.workspace) {
    try { process.chdir(config.workspace); } catch {}
  }

  try {
    const result = await agentLoop(
      prompt,
      caller,
      (chunk) => process.send({ type: 'chunk', text: chunk }),
      (status) => process.send({ type: 'status', status }),
      [],  // Fresh history (isolated context)
      {
        tools,
        maxTurns: config.maxTurns || 25,
        tracker,
        systemPrompt: config.systemPrompt || undefined,
      }
    );

    process.send({
      type: 'result',
      ok: true,
      result,
      context: tracker.getStructuredContext(),
      metrics: tracker.getMetrics(),
    });
  } catch (err) {
    process.send({ type: 'error', error: err.message });
  }

  // Clean exit
  process.exit(0);
});

// Safety: if parent disconnects, die
process.on('disconnect', () => process.exit(0));
```

### 6.5 Changes to Existing Code

**Minimal. Non-breaking.**

#### `server/router.js` — 2 changes

```javascript
// Change 1: agentLoop signature gains optional 6th parameter
async function agentLoop(command, caller, onChunk, onStatus, history, options = {}) {
  const maxTurns = options.maxTurns || 50;
  // ... existing code uses maxTurns variable instead of hardcoded 50

  // Use options.tools if provided, otherwise default
  const tools = options.tools
    ? (isClaude ? options.tools : toOpenAIFormat(options.tools))
    : (isClaude ? TOOL_DEFINITIONS : toOpenAIFormat(TOOL_DEFINITIONS));

  // Use options.systemPrompt if provided
  const systemPrompt = options.systemPrompt || getSystemPrompt(backend);

  // ... rest of loop unchanged
}

// Change 2: Export caller builders + agentLoop
module.exports = {
  route,
  parseCommand,
  agentLoop,              // NEW
  buildClaudeCaller,      // NEW
  buildOpenAICaller,      // NEW
  buildLocalCaller,       // NEW
};
```

#### `server/tools.js` — Add 2 tools, replace parallel_tasks executor

```javascript
// Add delegate + fan_out to TOOL_DEFINITIONS array
// Replace runParallelTasks() with orchestrator calls
// ~30 lines changed
```

**That's it.** The existing `route()`, `executeLocal()`, socket handling, Telegram bot, webhooks, triggers — ALL unchanged.

### 6.6 Subagent Definition Format

Same as before — Markdown files with YAML frontmatter:

```
~/.jeriko/agents/          ← User-level agents
.jeriko/agents/            ← Project-level agents
plugins/*/agents/          ← Plugin agents
```

```markdown
---
name: code-reviewer
description: Reviews code for quality, security, and best practices
tools: [bash, read_file, list_files, search_files]
model: inherit
max_turns: 15
---

You are a senior code reviewer. When analyzing code:
1. Check for security vulnerabilities (OWASP top 10)
2. Identify performance bottlenecks
3. Flag code smells and maintenance risks
4. Suggest concrete improvements with examples

Return structured findings with severity ratings.
```

### 6.7 Enable/Disable Per Configuration

The subagent system is purely additive. If the model never calls `delegate` or `fan_out`, nothing happens. No overhead. No extra processes. But you can also explicitly control it:

```bash
# Disable subagents entirely (tools removed from tool array)
JERIKO_DISABLE_SUBAGENTS=1 jeriko server

# Limit concurrent children
JERIKO_MAX_SUBAGENTS=2 jeriko server

# Set per-subagent timeout
JERIKO_SUBAGENT_TIMEOUT=120000 jeriko server
```

In `.jeriko/config.json`:
```json
{
  "subagents": {
    "enabled": true,
    "maxConcurrent": 4,
    "defaultTimeout": 300000,
    "defaultMaxTurns": 25,
    "contextBudget": 4000
  }
}
```

---

## 7. OSS Model Strategy

### 7.1 Model Tier System

```
Tier 1 — Full Agent (tool calling + reasoning):
  Qwen3 14B+, Llama 3.3 70B, Devstral 2, gpt-oss-120b, DeepSeek-V3.2

Tier 2 — Capable Agent (tool calling, limited reasoning):
  Qwen3 8B, Qwen2.5 7B, Devstral Small 2 (24B), gpt-oss-20b,
  Command-R, Phi-4-mini

Tier 3 — Text Worker (no tool calling):
  DeepSeek-R1, Phi-3, Gemma 2 9B, Llama 3.2 1B/3B

Tier 4 — Not Recommended:
  Models below 3B parameters (too unreliable for any agent task)
```

### 7.2 Runtime Capability Detection

```javascript
async function detectModelCapabilities(caller) {
  const capabilities = {
    toolCalling: true,      // Assume yes, flip on 400
    reasoning: false,        // Detect from model name or response
    maxContext: 128000,      // Default, override per model
    streaming: true,         // Assume yes
    parallelCalls: false,    // Conservative default
  };

  // Model-specific detection
  const model = caller.model.toLowerCase();
  if (/r1|reasoning|think/.test(model)) capabilities.reasoning = true;
  if (/r1/.test(model) && !/tool/.test(model)) capabilities.toolCalling = false;
  if (/qwen3|llama.3\.[23]|devstral|gpt-oss/.test(model)) capabilities.parallelCalls = true;
  if (/qwen3-coder|devstral/.test(model)) capabilities.maxContext = 256000;

  return capabilities;
}
```

### 7.3 Adaptive Tool Calling

For models that don't support native tool calling, use structured output prompting:

```javascript
// Already implemented in buildLocalCaller():
// If 400 "does not support tools":
//   toolsSupported = false → retry without tools

// For text-only mode, append to system prompt:
const TEXT_TOOL_PROMPT = `
When you need to use a tool, output EXACTLY this format:
<tool_call>
{"name": "tool_name", "input": {"param": "value"}}
</tool_call>

Available tools:
${tools.map(t => `- ${t.name}: ${t.description}`).join('\n')}

After each tool call, wait for the result before proceeding.
`;
```

This is a fallback — native tool calling via OpenAI-compatible API is always preferred.

### 7.4 Hermes-Style Tool Calling for Reasoning Models

Per Qwen team's recommendation, reasoning models should NOT use ReAct-style (stopword-based) tool templates. Jeriko's OpenAI-compatible caller already uses the correct Hermes-style format:

```json
{
  "tools": [{ "type": "function", "function": { "name": "...", "parameters": {...} } }],
  "tool_choice": "auto"
}
```

This is the right approach. No changes needed.

---

## 8. Why This Works (And Why Claude Code's Approach Doesn't Scale)

### 8.1 Claude Code's Constraints

Claude Code uses async generators (`kq()`) in a single Bun process with `Promise.race()` concurrency. This works because:
- **Cloud API reliability** — Claude API doesn't OOM or crash the local process
- **Single-user CLI** — no multi-tenancy, blocking the event loop doesn't kill other clients
- **Text-only returns** — Claude generates excellent summaries, making structured bridging less critical (though Issue #5812 shows it's still a real pain point)
- **Tool-calling accuracy** — Claude's ~95%+ accuracy means subagents rarely produce garbage

But for **open-source models:**
- Ollama can hang, OOM, or return garbage
- Smaller models (7B) produce poor summaries — structured data is more reliable
- Tool calling accuracy varies from 55% to 81% — need defensive handling
- Context windows vary from 32K to 256K — need adaptive compaction

### 8.2 Jeriko's Advantages

| Advantage | Why It Matters |
|---|---|
| **Structured context return** | OSS models with poor summarization still produce structured tool results |
| **Child process isolation** | Ollama hangs won't kill the daemon |
| **Runtime capability detection** | Auto-adapts to any model's strengths |
| **Graceful degradation** | Non-tool-calling models become text workers |
| **Token budget enforcement** | Prevents context blowup on small-window models |
| **Unix-first subagent definitions** | Simple Markdown files, no complex config |
| **Three-tier execution** | In-process, child process, and text-only modes |

### 8.3 Why NOT to Do This

Honest assessment of risks:

| Risk | Severity | Mitigation |
|---|---|---|
| **Complexity** — Adding 500+ lines to an 877-line router | HIGH | Separate module (`server/subagent.js`), don't bloat router.js |
| **Token cost** — Multi-agent = 4-15x tokens | MEDIUM | Token budgets, aggressive compaction, model tier system |
| **OSS model unreliability** — Tool calling failures | HIGH | Defensive parsing, retry with text fallback, timeout enforcement |
| **Context blowup** — Subagent output flooding parent | MEDIUM | Budget-aware injection, compaction |
| **Debugging difficulty** — Nested loops harder to trace | MEDIUM | Structured logging per subagent, transcript persistence |
| **IPC overhead** — Child process serialization | LOW | Only for background agents, ~1-5ms per message |
| **User confusion** — When to use subagents vs parallel | LOW | Clear tool descriptions, AGENT.md guidance |

---

## 9. Implementation Plan

*Superseded by Section 13 (Revised Implementation Plan) which includes gateway, supervisor, and frontend separation phases.*

---

## 10. Architectural Separation: Pure Daemon + Frontend Protocol

### 10.1 Problem

`server/index.js` is a 204-line monolith wiring 7 unrelated concerns: Express, WebSocket, Unix Socket, Telegram (24KB), WhatsApp, QR routes, trigger engine, plugin webhooks, auth, rate limiting. A Telegram SDK crash kills the agent loop. A WhatsApp auth hang blocks webhooks. Everything shares one `process.on('uncaughtException')`.

### 10.2 Decision: Daemon = Pure AI Backend

The daemon contains ONLY the AI infrastructure:

```
server/
├── daemon.js           ← NEW entry point (replaces index.js)
├── gateway.js          ← NEW: unified 3-layer gateway
├── router.js           ← Agent loop, API callers (unchanged)
├── orchestrator.js     ← NEW: fork + IPC + SubagentStore + supervisor
├── subagent-worker.js  ← NEW: child process entry point
├── tools.js            ← Tool definitions + executors (+delegate/fan_out)
├── security.js         ← Path/command validation (unchanged)
├── context.js          ← Token estimation, compaction (unchanged)
├── logger.js           ← Structured JSONL logging (unchanged)
├── env.js              ← Environment sanitization (unchanged)
└── auth.js             ← Client token verification (unchanged)
```

Everything else moves to `frontends/`:

```
frontends/
├── telegram/index.js   ← Standalone process, connects to daemon via gateway
├── whatsapp/index.js   ← Standalone process, connects to daemon via gateway
├── triggers/index.js   ← Standalone process, sends ask on cron/webhook/etc
├── terminal/           ← jeriko chat (already exists as bin/jeriko-chat)
├── opencode/           ← OpenCode frontend (connects via WebSocket)
└── desktop/            ← Future: Electron/Tauri app
```

### 10.3 Benefits

| Benefit | Before | After |
|---|---|---|
| Telegram crash | Kills daemon | Kills Telegram only, daemon untouched |
| Add Discord | Modify index.js, restart daemon | Write 50-line frontend, daemon untouched |
| Test agent loop | Must load Telegram, WhatsApp, Express | `require('./router')` works in isolation |
| Resource isolation | Telegram's memory = daemon's memory | Telegram has own heap |
| Daemon startup | Load 7 modules, wait for Telegram poll | Load AI modules only, <100ms |
| Frontend versioning | Coupled to daemon version | Independent — protocol is stable |

### 10.4 Triggers Become a Frontend

The trigger engine (cron, webhook, email, file, http) is just another client:

```javascript
// frontends/triggers/index.js
// When cron fires or webhook received:
conn.write(JSON.stringify({
  type: 'ask',
  text: `[TRIGGER: ${trigger.name}] ${trigger.prompt}\n\nEvent: ${JSON.stringify(eventData)}`,
  conversation_id: `trigger-${triggerId}`,
}) + '\n');
```

Webhook signature verification stays in the triggers frontend. The daemon never sees Stripe/PayPal/GitHub SDKs.

---

## 11. Production Hardening: Supervisor Patterns

*Derived from analysis of Nginx master-worker, PostgreSQL postmaster, Erlang/OTP supervision trees, Redis, BullMQ sandboxed processors, Ollama Go subprocess management, and vLLM AsyncLLMEngine.*

### 13.1 Five Critical Gaps

Our fork + IPC design handles the happy path. Production daemons must also handle:

1. **Crash loops** — a subagent that keeps crashing and restarting burns CPU/memory
2. **Silent hangs** — child process is alive but stopped making progress
3. **Memory bloat** — child allocates unbounded memory (loading huge files, Ollama context)
4. **Overload** — too many concurrent subagents exhaust system resources
5. **Dirty shutdown** — daemon killed while children are running leaves orphans

### 13.2 Pattern 1: Max Restart Intensity (Erlang/OTP)

Erlang supervisors enforce `max_restarts` within `max_seconds`. If a child exceeds this, the supervisor stops restarting and escalates. Prevents crash loops from burning resources.

```javascript
// In orchestrator.js
const restartTracker = new Map(); // agentType → { count, windowStart }

function canRestart(agentType, maxRestarts = 5, windowSec = 60) {
  const now = Date.now();
  const tracker = restartTracker.get(agentType) || { count: 0, windowStart: now };

  // Reset window if expired
  if (now - tracker.windowStart > windowSec * 1000) {
    tracker.count = 0;
    tracker.windowStart = now;
  }

  tracker.count++;
  restartTracker.set(agentType, tracker);

  if (tracker.count > maxRestarts) {
    console.error(`[supervisor] ${agentType} exceeded ${maxRestarts} restarts in ${windowSec}s — circuit broken`);
    return false;
  }
  return true;
}
```

**Applied in `delegate()`:** Before fork, check `canRestart(config.agentType)`. If false, reject immediately with `Error('Subagent circuit broken — too many crashes')`.

### 13.3 Pattern 2: Health Heartbeat (PostgreSQL/systemd)

PostgreSQL's postmaster sends periodic `SIGALRM` and expects children to respond. systemd uses `sd_notify(WATCHDOG=1)`. If no heartbeat within timeout, the child is considered hung and killed.

```javascript
// In subagent-worker.js (child process)
const HEARTBEAT_INTERVAL = 10000; // 10s
const heartbeat = setInterval(() => {
  process.send({ type: 'heartbeat', ts: Date.now(), turn: currentTurn });
}, HEARTBEAT_INTERVAL);

// Clean up on exit
process.on('beforeExit', () => clearInterval(heartbeat));

// In orchestrator.js (daemon process)
function watchHealth(child, state, timeout = 30000) {
  let lastHeartbeat = Date.now();

  child.on('message', (msg) => {
    if (msg.type === 'heartbeat') {
      lastHeartbeat = Date.now();
      state.lastHeartbeat = lastHeartbeat;
      state.currentTurn = msg.turn;
    }
  });

  const checker = setInterval(() => {
    if (state.status !== 'running') {
      clearInterval(checker);
      return;
    }
    if (Date.now() - lastHeartbeat > timeout) {
      console.error(`[supervisor] ${state.id} no heartbeat for ${timeout}ms — killing`);
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL');
      }, 5000);
      state.status = 'timeout';
      clearInterval(checker);
    }
  }, timeout / 2);

  return checker;
}
```

### 13.4 Pattern 3: Memory Caps (V8 `--max-old-space-size`)

Each forked child gets a V8 heap limit. If it exceeds this, V8 throws an OOM and the child dies cleanly. The daemon is unaffected.

```javascript
// In orchestrator.js delegate()
const child = fork(WORKER_SCRIPT, [], {
  env: buildChildEnv(config),
  execArgv: ['--max-old-space-size=512'],  // 512MB cap per child
  stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
});
```

**Why 512MB:** A 14B model's context at 128K tokens ≈ 200-300MB in Node.js memory. 512MB gives headroom for tool execution. Configurable via `JERIKO_SUBAGENT_MEMORY_MB`.

### 13.5 Pattern 4: Backpressure Gate (BullMQ/Nginx)

BullMQ limits concurrent sandboxed processors. Nginx limits `worker_connections`. We limit total active children system-wide.

```javascript
// In orchestrator.js
const MAX_ACTIVE = parseInt(process.env.JERIKO_MAX_SUBAGENTS) || 8;

function getActiveCount() {
  let count = 0;
  for (const [, state] of store) {
    if (state.status === 'running') count++;
  }
  return count;
}

// In delegate() — before fork:
if (getActiveCount() >= MAX_ACTIVE) {
  throw new Error(`Backpressure: ${MAX_ACTIVE} subagents already running. Wait or increase JERIKO_MAX_SUBAGENTS.`);
}
```

**Why 8:** Each child ≈ 512MB max + 3 FDs + ~50ms CPU on fork. 8 children = 4GB max memory, 24 FDs, reasonable for a 16GB machine. Configurable.

### 13.6 Pattern 5: Graceful Shutdown (Erlang/OTP + systemd)

On daemon `SIGINT`/`SIGTERM`, give children time to finish their current turn, then force-kill.

```javascript
// In orchestrator.js
async function shutdownAll(gracePeriod = 10000) {
  const running = [];
  for (const [id, state] of store) {
    if (state.status === 'running' && state.process) {
      running.push({ id, state });
      state.process.kill('SIGTERM');
    }
  }

  if (running.length === 0) return;
  console.log(`[supervisor] Graceful shutdown: ${running.length} subagents, ${gracePeriod}ms grace`);

  // Wait for children to exit or force-kill after grace period
  await Promise.race([
    Promise.all(running.map(({ state }) =>
      new Promise(resolve => state.process.on('exit', resolve))
    )),
    new Promise(resolve => setTimeout(resolve, gracePeriod)),
  ]);

  // Force-kill any survivors
  for (const { id, state } of running) {
    if (state.status === 'running' && state.process && !state.process.killed) {
      console.error(`[supervisor] Force-killing ${id}`);
      state.process.kill('SIGKILL');
    }
  }
}

module.exports = { delegate, fanOut, bridgeContext, bridgeFanOutContext, getStore, shutdownAll };
```

**In daemon.js:**
```javascript
process.once('SIGINT', async () => {
  console.log('[daemon] Shutting down...');
  await shutdownAll(10000);
  server.close();
  process.exit(0);
});
```

### 13.7 Supervisor Summary

| Pattern | Source | What It Prevents | Lines |
|---|---|---|---|
| Restart intensity | Erlang/OTP | Crash loops burning CPU | ~20 |
| Health heartbeat | PostgreSQL/systemd | Silent hangs, zombie children | ~30 |
| Memory caps | V8 `execArgv` | Unbounded heap growth | 1 (one line in fork options) |
| Backpressure gate | BullMQ/Nginx | System overload, resource exhaustion | ~10 |
| Graceful shutdown | Erlang/OTP + systemd | Orphan children, data loss | ~30 |

**Total: ~90 lines of code for production-grade supervision.**

---

## 12. Unified Gateway Architecture

*Derived from analysis of: Ollama (Go HTTP + gRPC), vLLM (Python FastAPI + OpenAI-compat), LM Studio (Electron + local REST), LocalAI (Go REST + gRPC), OpenAI API (REST + SSE + WebSocket Realtime), Anthropic API (REST + SSE), Kong/Envoy/Traefik API gateways.*

### 14.1 How Every AI Inference Server Exposes Its API

| Server | Primary Protocol | Streaming | Secondary | WebSocket |
|---|---|---|---|---|
| **Ollama** | HTTP REST (`/api/generate`, `/api/chat`) | SSE (NDJSON) | — | No |
| **vLLM** | HTTP REST (OpenAI-compatible `/v1/chat/completions`) | SSE | — | No |
| **LM Studio** | HTTP REST (OpenAI-compatible) | SSE | — | No |
| **LocalAI** | HTTP REST (OpenAI-compatible) + gRPC | SSE | gRPC streaming | No |
| **OpenAI** | HTTP REST (`/v1/chat/completions`) | SSE | Realtime API (WebSocket) | Yes |
| **Anthropic** | HTTP REST (`/v1/messages`) | SSE | — | No |

**Universal pattern:** HTTP REST + SSE streaming is the industry standard. Every tool, SDK, and framework speaks this. OpenAI added WebSocket for their Realtime API and agent sessions (40% faster for tool-heavy workloads by eliminating HTTP overhead per turn).

### 14.2 Decision: 3-Layer Gateway

The daemon exposes three connection layers. Every layer speaks the same NDJSON protocol internally — the gateway translates between wire format and internal representation.

```
Layer 1: UNIX SOCKET (local, fastest)
  └─ For: CLI (jeriko chat), desktop app, local scripts
  └─ Path: ~/.local/share/jeriko/jeriko.sock
  └─ Protocol: raw NDJSON over TCP (already implemented in socket.js)
  └─ Latency: ~0.1ms per message
  └─ Auth: filesystem permissions (chmod 0600)

Layer 2: HTTP REST + SSE (universal, OpenAI-compatible)
  └─ For: Any HTTP client, curl, SDKs, webhooks, frontend apps
  └─ Endpoints: /v1/chat/completions (OpenAI-compatible), /api/ask, /api/agents
  └─ Streaming: SSE (text/event-stream) — same as OpenAI
  └─ Auth: Bearer token (existing auth.js)
  └─ Why: Every tool speaks HTTP. Maximum compatibility.

Layer 3: WEBSOCKET (persistent, agent sessions)
  └─ For: OpenCode frontend, web dashboards, long-running agent sessions
  └─ Endpoint: ws://localhost:3000/ws
  └─ Protocol: NDJSON over WebSocket frames
  └─ Auth: Token in first message or query param
  └─ Why: No HTTP overhead per message. 40% faster for multi-turn agent sessions.
         Bidirectional — server can push status, subagent updates, heartbeats.
```

### 14.3 OpenAI-Compatible REST Endpoint

Every SDK, tool, and frontend that works with OpenAI works with Jeriko. This is the universal adapter.

```javascript
// In daemon.js or gateway.js
app.post('/v1/chat/completions', requireAuth, async (req, res) => {
  const { messages, model, stream, tools, max_tokens } = req.body;

  // Extract the last user message as the prompt
  const lastUser = messages.filter(m => m.role === 'user').pop();
  if (!lastUser) return res.status(400).json({ error: 'No user message' });

  const conversationId = req.headers['x-conversation-id'] || crypto.randomUUID();

  if (stream) {
    // SSE streaming (matches OpenAI format exactly)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const result = await route(
      lastUser.content,
      (chunk) => {
        res.write(`data: ${JSON.stringify({
          id: conversationId,
          object: 'chat.completion.chunk',
          choices: [{ delta: { content: chunk }, index: 0 }],
        })}\n\n`);
      },
      (status) => {
        res.write(`data: ${JSON.stringify({
          id: conversationId,
          object: 'chat.completion.chunk',
          choices: [{ delta: { content: '' }, index: 0 }],
          jeriko: { event: status.type, detail: status.text || status.tool || '' },
        })}\n\n`);
      },
      conversations.get(conversationId) || []
    );

    res.write(`data: ${JSON.stringify({
      id: conversationId,
      object: 'chat.completion.chunk',
      choices: [{ delta: {}, finish_reason: 'stop', index: 0 }],
    })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  } else {
    // Non-streaming (matches OpenAI format)
    const result = await route(
      lastUser.content,
      null, null,
      conversations.get(conversationId) || []
    );

    res.json({
      id: conversationId,
      object: 'chat.completion',
      choices: [{
        message: { role: 'assistant', content: result },
        finish_reason: 'stop',
        index: 0,
      }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    });
  }
});
```

### 14.4 WebSocket Endpoint (Persistent Agent Sessions)

For frontends like OpenCode that maintain long-lived connections:

```javascript
// In daemon.js
const WebSocket = require('ws');
const wss = new WebSocket.Server({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  // Auth: token in query param or first message
  const token = new URL(req.url, 'http://localhost').searchParams.get('token');
  if (!verifyToken(token)) {
    ws.close(4001, 'Unauthorized');
    return;
  }

  ws.on('message', async (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch {
      ws.send(JSON.stringify({ type: 'error', error: 'Invalid JSON' }));
      return;
    }

    // Same handleMessage logic as socket.js — NDJSON protocol
    if (msg.type === 'ask') {
      const convId = msg.conversation_id || 'default';
      if (!conversations.has(convId)) conversations.set(convId, []);

      try {
        const result = await route(
          msg.text,
          (chunk) => ws.send(JSON.stringify({ type: 'chunk', text: chunk })),
          (status) => ws.send(JSON.stringify({
            type: 'status',
            event: status.type,
            detail: status.text || status.tool || '',
          })),
          conversations.get(convId)
        );
        ws.send(JSON.stringify({ type: 'done', text: result || '' }));
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', error: err.message }));
      }
    }

    if (msg.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong', uptime: process.uptime() }));
    }
  });
});
```

### 14.5 Gateway Architecture Diagram

```
                              ┌─────────────────────────────┐
                              │      JERIKO DAEMON           │
                              │                              │
                              │  ┌────────────────────────┐  │
                              │  │     UNIFIED GATEWAY     │  │
                              │  │                        │  │
 CLI / Desktop (local)        │  │  Layer 1: Unix Socket  │  │
 ─────────────────────────────┤  │    ~/.../jeriko.sock   │  │
   NDJSON over TCP            │  │    chmod 0600          │  │
                              │  │                        │  │
 curl / SDKs / webhooks       │  │  Layer 2: HTTP REST    │  │
 ─────────────────────────────┤  │    :3000/v1/chat/...   │  │
   HTTP + SSE                 │  │    OpenAI-compatible    │  │
                              │  │                        │  │
 OpenCode / web dashboard     │  │  Layer 3: WebSocket    │  │
 ─────────────────────────────┤  │    :3000/ws            │  │
   NDJSON over WS frames      │  │    persistent sessions │  │
                              │  └──────────┬─────────────┘  │
                              │             │                │
                              │  ┌──────────▼─────────────┐  │
                              │  │    ROUTER (agent loop)  │  │
                              │  │    ┌─────────────────┐  │  │
                              │  │    │ Orchestrator     │  │  │
                              │  │    │  fork() children │  │  │
                              │  │    │  IPC + store     │  │  │
                              │  │    └─────────────────┘  │  │
                              │  └────────────────────────┘  │
                              └─────────────────────────────┘
```

### 14.6 Why Not gRPC?

- **Not needed externally.** gRPC shines for inter-service communication in microservices (type safety, binary serialization, bidirectional streaming). Our daemon is one process, not a microservice mesh.
- **No browser support without proxy.** gRPC-web requires Envoy or a proxy. HTTP + WebSocket work natively.
- **No ecosystem advantage.** Every AI SDK speaks HTTP/SSE. Zero speak gRPC to inference servers.
- **Adds complexity.** Proto files, code generation, grpc-node native dependency.
- **If needed later:** Add as Layer 4. The gateway pattern makes this additive, not disruptive.

### 14.7 Protocol Comparison

| Protocol | Latency | Overhead | Streaming | Bidirectional | Browser | Use Case |
|---|---|---|---|---|---|---|
| Unix Socket | ~0.1ms | Zero | NDJSON | Yes | No | CLI, local desktop |
| HTTP REST + SSE | ~1-5ms | HTTP headers per request | SSE (server→client) | No (client polls) | Yes | Universal, SDKs |
| WebSocket | ~0.5ms | Frame header (2-14 bytes) | Yes | Yes | Yes | Persistent agent sessions |

---

## 13. Revised Implementation Plan

### Phase 1: Core Daemon Infrastructure (3-4 days)

1. **`server/daemon.js`** (~80 lines) — NEW entry point
   - Express + HTTP server (rate limiting, health check, auth)
   - Unix Socket server (existing `socket.js` logic)
   - WebSocket server (NDJSON over WS)
   - OpenAI-compatible REST endpoint (`/v1/chat/completions`)
   - Graceful shutdown with `orchestrator.shutdownAll()`
   - NO Telegram, WhatsApp, QR, plugins, triggers — those move to `frontends/`

2. **`server/orchestrator.js`** (~350 lines) — NEW
   - `delegate()` — fork child, IPC, structured result
   - `fanOut()` — wave-based concurrent fork
   - `bridgeContext()` / `bridgeFanOutContext()` — token-budget payload formatting
   - `SubagentStore` — in-memory Map with TTL cleanup
   - Supervisor patterns: restart intensity, heartbeat watcher, backpressure gate, graceful shutdown
   - `buildChildEnv()` — sanitized env per child

3. **`server/subagent-worker.js`** (~150 lines) — NEW
   - IPC message listener (`start`, `abort`)
   - Import + call `agentLoop()` from router.js
   - `createContextTracker()` — intercept tool calls, stream `context_update` via IPC
   - `filterTools()` — allowlist enforcement
   - Heartbeat interval (10s)
   - Graceful shutdown on parent disconnect

4. **Modify `server/router.js`** (~15 lines changed)
   - `agentLoop()` gains optional 6th param: `options = {}`
   - Export: `{ route, parseCommand, agentLoop, buildClaudeCaller, buildOpenAICaller, buildLocalCaller }`

5. **Modify `server/tools.js`** (~40 lines changed)
   - Add `delegate` and `fan_out` tool definitions
   - Add executor cases calling `orchestrator.delegate()` / `orchestrator.fanOut()`
   - Keep `parallel_tasks` as backward-compat alias

### Phase 2: Subagent Definitions & Discovery (1-2 days)

6. **`server/agents.js`** (~150 lines) — agent definition loader
7. **Update AGENT.md** — document `delegate` and `fan_out` tools
8. **Built-in agents** — `researcher.md`, `builder.md`, `reviewer.md`, `debugger.md`

### Phase 3: Frontend Separation (1-2 days)

9. **`frontends/telegram/index.js`** — standalone, connects to daemon via Unix Socket
10. **`frontends/triggers/index.js`** — standalone, sends `ask` on cron/webhook events
11. **Remove Telegram/WhatsApp/triggers from daemon.js**
12. **CLI integration** — `jeriko agents`, `jeriko agents create`

### Phase 4: Testing & Hardening (2-3 days)

13. **Unit tests** (~25 tests) — orchestrator, worker, tracker, bridge, supervisor
14. **Integration tests with Ollama** (~10 tests) — delegate, fan_out, timeout, crash recovery
15. **Stress tests** — 10 concurrent subagents, OOM child, hung child, crash loop
16. **Existing test suite** — all 22 tests must still pass

### Total: ~8-11 days for production-ready implementation

---

## 14. Decision (Final)

### What We Build

An **all-fork concurrent subagent system** with a **3-layer unified gateway** and **production-grade supervision**:

1. **ALL subagents run as `child_process.fork()`** — no in-process, no async generators, no hybrid
2. **IPC streams context in real-time** — daemon sees file creations as they happen
3. **In-memory SubagentStore** — `Map<agentId, state>`, instant access, no disk I/O
4. **Wave-based concurrency** — `fan_out` batches N children per wave
5. **Structured context bridging** — parent gets files, diffs, tool calls (solves #5812)
6. **Token budget enforcement** — prevents context blowup on small-window models
7. **Runtime model detection** — auto-adapts to any model, graceful degradation
8. **Supervisor patterns** — restart intensity, heartbeat, memory caps, backpressure, graceful shutdown
9. **3-layer gateway** — Unix Socket + HTTP REST/SSE (OpenAI-compatible) + WebSocket
10. **Daemon = pure AI backend** — frontends are separate processes
11. **Depth limit = 1** — children cannot spawn grandchildren
12. **Markdown agent definitions** — `~/.jeriko/agents/*.md`

### What We Do NOT Build

1. **Async generators in-process** — Claude Code's approach works for single-user CLI + cloud API. We're a multi-tenant daemon with local models. fork() gives crash/memory isolation they don't need and we do.
2. **Hybrid execution models** — Two code paths = twice the bugs. One model: fork + IPC.
3. **Agent Teams** — Too complex, too token-heavy
4. **Worker threads** — Partial crash isolation isn't worth it
5. **gRPC** — No ecosystem advantage, adds complexity. HTTP + WebSocket cover all use cases.
6. **Shared memory / blackboard** — Over-engineering. IPC + Map is sufficient.

### How This Improves on Claude Code

| Problem in Claude Code | How Jeriko Solves It |
|---|---|
| Issue #5812: parent blind to subagent's file operations | ContextTracker intercepts all tool calls, streams via IPC, ContextBridge injects structured payload into parent |
| No crash isolation — uncaught exception kills the process | `fork()` — child crash logged, daemon untouched |
| No memory isolation — shared heap balloons | `--max-old-space-size=512` per child, own V8 heap |
| Single-model lock-in (Claude only) | Any model: Claude, OpenAI, Ollama, any OpenAI-compatible |
| No multi-tenancy — one user per CLI instance | Daemon serves N clients concurrently, subagents don't block event loop |
| No real-time visibility into subagent progress | IPC `context_update` streams as child works |
| No daemon mode — starts/stops with terminal | LaunchAgent, always running, survives terminal close |
| No restart protection — crashed subagent can be retried infinitely | Restart intensity circuit breaker (Erlang pattern) |
| No health monitoring | Heartbeat every 10s, kill after 30s silence |

### Success Criteria

- [ ] `delegate` works with Claude, OpenAI, and Ollama backends
- [ ] `fan_out` runs 4 concurrent subagents across 2 waves without crashes
- [ ] IPC streams `context_update` events in real-time to daemon store
- [ ] Context bridge injects structured data within token budget (solving #5812)
- [ ] Subagent timeout kills child process cleanly via SIGTERM → SIGKILL
- [ ] Heartbeat detects hung child within 30s
- [ ] Restart intensity circuit-breaks after 5 crashes in 60s
- [ ] Backpressure rejects when 8 children are active
- [ ] Memory cap kills child that exceeds 512MB
- [ ] Graceful shutdown waits 10s then force-kills survivors
- [ ] Non-tool-calling models degrade to text-only workers
- [ ] Daemon event loop stays responsive during subagent execution
- [ ] OpenAI-compatible `/v1/chat/completions` endpoint works with standard SDKs
- [ ] WebSocket endpoint supports persistent agent sessions
- [ ] Unix Socket endpoint matches existing `socket.js` behavior
- [ ] All 22 existing tests still pass
- [ ] 25+ new tests for orchestrator, worker, supervisor, gateway
- [ ] Tested with 5+ Ollama models (Qwen3, Llama 3.3, Devstral, gpt-oss, DeepSeek-R1)

---

## 15. References

- [Claude Code Issue #5812](https://github.com/anthropics/claude-code/issues/5812) — Context bridging feature request
- [Claude Code Subagent Docs](https://code.claude.com/docs/en/sub-agents) — Official subagent documentation
- [Claude Code Agent Teams Docs](https://code.claude.com/docs/en/agent-teams) — Experimental agent teams
- [Claude Code Hooks Docs](https://code.claude.com/docs/en/hooks) — Hook system reference
- [Claude Code Decompiled Binary Analysis](internal) — v2.1.62, 183MB Mach-O Bun executable, `kq()` async generator, `ZqA()` concurrency limiter
- [Anthropic Multi-Agent Research System](https://www.anthropic.com/engineering/multi-agent-research-system) — 90% speedup with orchestrator-worker
- [Berkeley Function Calling Leaderboard](https://gorilla.cs.berkeley.edu/leaderboard.html) — BFCL v4 model scores
- [Qwen Function Calling Docs](https://qwen.readthedocs.io/en/latest/framework/function_call.html) — Hermes-style recommendation
- [Ollama Tool-Calling Models](https://ollama.com/search?c=tools) — Full model list
- [Devstral 2 Announcement](https://mistral.ai/news/devstral-2-vibe-cli) — 72.2% SWE-bench
- [OpenAI GPT-OSS](https://github.com/openai/gpt-oss) — Apache 2.0, MoE architecture
- [Nginx Architecture](https://www.nginx.com/blog/inside-nginx-how-we-designed-for-performance-scale/) — Master-worker prefork model
- [PostgreSQL Backend Architecture](https://www.postgresql.org/docs/current/connect-estab.html) — Postmaster fork-on-demand
- [Erlang/OTP Supervisor Behaviours](https://www.erlang.org/doc/design_principles/sup_princ.html) — Restart intensity, supervision trees
- [BullMQ Sandboxed Processors](https://docs.bullmq.io/guide/workers/sandboxed-processors) — child_process.fork() with IPC
- [OpenAI Realtime API](https://platform.openai.com/docs/guides/realtime) — WebSocket for agent sessions
- [Ollama API Reference](https://github.com/ollama/ollama/blob/main/docs/api.md) — HTTP REST + NDJSON streaming

---

*ADR-002 authored 2026-02-27. Finalized with: accurate Claude Code decompiled analysis (kq() async generators), all-fork child_process architecture, structured context bridging (solving Issue #5812), Erlang/OTP supervisor patterns, 3-layer unified gateway, daemon-frontend separation. Ready for implementation.*
