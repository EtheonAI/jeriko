# Jeriko — Technical Architecture

> Version 2.0.0-alpha.0 · Bun runtime · Single compiled binary

## Overview

Jeriko is a Unix-first AI agent platform. Every capability is a CLI command — no proprietary tool abstractions. Any AI model with shell access (Claude, GPT, Llama, DeepSeek, local models) can control the machine through the same command interface.

**Design principles:**
- **Model-agnostic** — LLM drivers for Anthropic, OpenAI, Ollama, Claude Code, and any OpenAI-compatible provider
- **Single binary** — `bun build --compile` produces a ~66MB self-contained executable (564 modules bundled)
- **Three layers** — CLI → Daemon → Shared, with zero circular dependencies
- **Unix-first** — commands pipe via JSON stdout, exit codes are semantic, stdin is supported everywhere

```
┌──────────────────────────────────────────────────────────────────┐
│                         CLI Layer                                │
│  dispatcher.ts → 51 commands across 10 categories                │
│  chat.tsx → Ink-based interactive REPL                           │
│  backend.ts → daemon (socket IPC) or in-process (direct agent)   │
└──────────────┬───────────────────────────────────────────────────┘
               │ Unix socket (daemon.sock) or direct import
┌──────────────▼───────────────────────────────────────────────────┐
│                        Daemon Layer                              │
│  kernel.ts → 15-step boot sequence                               │
│  agent/ → runAgent() loop, 5 LLM drivers, 19 tools, orchestrator│
│  api/ → Hono HTTP server + Unix socket IPC                       │
│  services/ → channels, connectors, triggers                      │
│  storage/ → SQLite (bun:sqlite) + Drizzle ORM + KV store         │
│  workers/ → parallel execution pool                              │
│  plugin/ → plugin loader                                         │
└──────────────┬───────────────────────────────────────────────────┘
               │
┌──────────────▼───────────────────────────────────────────────────┐
│                        Shared Layer                              │
│  config.ts, args.ts, output.ts, logger.ts, escape.ts             │
│  skill.ts, skill-loader.ts, connector.ts, env-ref.ts             │
│  bus.ts, tokens.ts, secrets.ts, urls.ts, prompt.ts               │
│  Zero internal dependencies — pure functions + types             │
└──────────────────────────────────────────────────────────────────┘
```

---

## Build & Distribution

### Compilation (`scripts/build.ts`)

Jeriko compiles to a single binary using Bun's `--compile` flag.

```bash
bun run build              # current platform → ./jeriko
bun run build:all          # cross-compile all 8 targets → dist/
```

**8 platform targets:**

| Target | OS | Arch | Notes |
|--------|----|------|-------|
| `darwin-arm64` | macOS | Apple Silicon | Post-build: `codesign --force --sign -` |
| `darwin-x64` | macOS | Intel | Post-build: `codesign --force --sign -` |
| `linux-arm64` | Linux | ARM64 | glibc |
| `linux-x64` | Linux | x86_64 | glibc |
| `linux-arm64-musl` | Linux | ARM64 | musl (Alpine) |
| `linux-x64-musl` | Linux | x86_64 | musl (Alpine) |
| `windows-x64` | Windows | x86_64 | |
| `windows-arm64` | Windows | ARM64 | |

**Build configuration:**
- Entry: `src/index.ts`
- Minify: enabled by default (`--no-minify` to disable)
- External packages: `qrcode-terminal`, `link-preview-js`, `jimp`, `sharp`, `playwright-core`, `electron`
- DevShim plugin: replaces `react-devtools-core` with a no-op at compile time
- macOS post-build: re-signs binary with ad-hoc signature (fixes hardened runtime issue)
- Output size: ~66MB per platform

### Install Scripts

**`scripts/install.sh`** — Binary downloader (production):
- Platform detection: darwin/linux, x64/arm64, musl detection, Rosetta 2
- Version resolution: `latest` tag → CDN → `gh` CLI → GitHub API
- SHA-256 checksum verification via `manifest.json`
- Fallback chain: CDN → `gh` CLI → direct GitHub URL
- Self-installs: runs `jeriko install <version>` post-download

**`scripts/unix-install.sh`** — Build from source (development):
- Requires Bun ≥ 1.1
- Installs to `~/.local/bin/jeriko` (customizable prefix)
- Creates: config dir, data dir, shell completions (Bash + Zsh), man page
- Services: macOS LaunchAgent or Linux systemd user service
- Templates copied to `~/.local/lib/jeriko/`

### Package Configuration

**`package.json`**: version `2.0.0-alpha.0`, `type: "module"`, engines `bun >= 1.1.0`

**Dependencies (11):** chalk, ink, react, croner, drizzle-orm, grammy, hono, playwright-core, ws, zod, @whiskeysockets/baileys

**`tsconfig.json`**: ESNext target, bundler module resolution, strict mode, JSX via react-jsx, path aliases (`@jeriko/shared`, `@jeriko/exec`, `@jeriko/security`, `@jeriko/storage`, `@jeriko/connectors`, `@jeriko/platform`, `@jeriko/protocol`)

---

## CLI Layer (`src/cli/`)

### Entry & Dispatch (`dispatcher.ts`)

The dispatcher is the single entry point for all CLI commands. It handles:
- Global flag extraction: `--format`, `--quiet`, `--version` (stripped before command routing)
- `--help` is NOT stripped — passed to commands for per-command help
- Fuzzy matching: Levenshtein distance ≤ 2 for typo suggestions
- Plugin resolution: core commands → plugin commands → "Unknown command" error

**51 built-in commands across 10 categories:**

| Category | Commands |
|----------|----------|
| **System** (4) | `sys`, `exec`, `proc`, `net` |
| **Files** (2) | `fs`, `doc` |
| **Browser** (3) | `browse`, `search`, `screenshot` |
| **Comms** (4) | `email`, `msg`, `notify`, `audio` |
| **OS** (10) | `notes`, `remind`, `calendar`, `contacts`, `music`, `clipboard`, `window`, `camera`, `open`, `location` |
| **Integrations** (11) | `stripe`, `github`, `paypal`, `vercel`, `twilio`, `x`, `gdrive`, `onedrive`, `gmail`, `outlook`, `connectors` |
| **Dev** (4) | `code`, `create`, `dev`, `parallel` |
| **Agent** (6) | `ask`, `memory`, `discover`, `prompt`, `skill`, `share` |
| **Automation** (5) | `init`, `server`, `task`, `job`, `setup` |
| **Plugin** (3) | `install`, `trust`, `uninstall` |

Each command is a `CommandHandler`: `{ name, description, run(args) }`.

### Interactive Chat (`chat.tsx` → `app.tsx`)

The interactive REPL is built with [Ink](https://github.com/vadimdemedes/ink) (React for the terminal).

**Entry flow:**
1. `startChat()` prints the Jeriko banner (logo + model + cwd)
2. Detects backend mode: daemon (if `daemon.sock` exists) or in-process
3. Checks if first-launch setup is needed (no config + no API keys in env)
4. Renders `<App />` via Ink

**Phase state machine:**

```
idle → thinking → streaming → idle
                ↘ tool-executing → idle
                ↘ sub-executing → idle
setup → idle (after first-launch wizard)
```

**11 Ink components** (`src/cli/components/`):
- `Banner.tsx` — Welcome header with version, model, cwd
- `Messages.tsx` — Static message history via Ink `<Static>`
- `StreamingText.tsx` — Live text output during streaming
- `Input.tsx` — Prompt with Ctrl+C handling
- `StatusBar.tsx` — Model, tokens, duration, session slug
- `ToolCall.tsx` — Running/completed tool call display
- `SubAgent.tsx` — Delegate/parallel sub-agent visualization
- `Spinner.tsx` — Animated thinking/streaming indicator
- `Setup.tsx` — First-launch provider selection wizard
- `Markdown.tsx` — Markdown-to-terminal renderer
- `ContextBar.tsx` — Context window usage display
- `Autocomplete.tsx` — Slash command completion UI

**State management** (`hooks/useAppReducer.ts`):
- Pure reducer with 28 action types (discriminated union)
- Single `AppState` object: phase, messages, streamText, liveToolCalls, subAgents, stats, context, model, sessionSlug
- Actions: SET_PHASE, ADD_MESSAGE, APPEND_STREAM_TEXT, TOOL_CALL_START, TOOL_CALL_RESULT, SUB_AGENT_STARTED/COMPLETE, FREEZE_ASSISTANT_MESSAGE, RESET_TURN, etc.

### 29 Slash Commands (`commands.ts`)

Interactive REPL meta-commands (not CLI args):

| Category | Commands |
|----------|----------|
| **Session** (7) | `/help`, `/new`, `/sessions`, `/resume <slug>`, `/history`, `/clear`, `/compact` |
| **Model** (5) | `/model [name]`, `/model list`, `/model pin <spec>`, `/model unpin <spec>`, `/model pins` |
| **Channels** (2) | `/channels`, `/channel connect\|disconnect <name>` |
| **Management** (6) | `/connectors`, `/connect <name>`, `/disconnect <name>`, `/triggers`, `/skills`, `/skill <name>` |
| **System** (4) | `/status`, `/health`, `/sys`, `/config` |

Exit detection: `exit`, `quit`, `.exit`, `/exit`, `/quit`.

### Backend Abstraction (`backend.ts`)

Unified `Backend` interface with two implementations:

**Daemon backend** (`createDaemonBackend()`):
- Connects via Unix socket at `~/.jeriko/daemon.sock`
- Newline-delimited JSON wire protocol
- Streaming events forwarded to callbacks in real-time

**In-process backend** (`createInProcessBackend()`):
- Direct `runAgent()` call — no daemon needed
- Tool registration mirrors kernel.ts step 6 (all 19 tools)
- System prompt loaded with skill summaries
- Orchestrator bus subscriptions for sub-agent events

**Backend interface** (34 methods):
- `send(message, callbacks)` — streaming agent interaction
- `abort()` — cancel in-progress generation
- `newSession()`, `listSessions()`, `resumeSession()`, `getHistory()`, `clearHistory()`, `compact()`
- `listModels()`, `listChannels()`, `connectChannel()`, `disconnectChannel()`
- `listConnectors()`, `connectService()`, `disconnectService()`, `checkHealth()`
- `listTriggers()`, `enableTrigger()`, `disableTrigger()`
- `listSkills()`, `getSkill()`
- `getStatus()`, `getConfig()`

**Streaming callbacks** (`BackendCallbacks`):
- `onThinking`, `onTextDelta`, `onToolCallStart`, `onToolResult`, `onTurnComplete`
- `onCompaction`, `onError`
- `onSubAgentStarted`, `onSubAgentTextDelta`, `onSubAgentToolCall`, `onSubAgentToolResult`, `onSubAgentComplete`

### Theme (`theme.ts`)

Centralized color palette with semantic chalk wrappers:

```
Brand:     #e8a468 (warm amber)
Text:      #e4e4e7 (primary), #9ca3af (muted), #4b5563 (dim), #374151 (faint)
Semantic:  #7aa2f7 (blue), #73daca (green), #f7768e (red), #e0af68 (yellow)
           #89ddff (cyan), #bb9af7 (purple), #2dd4bf (teal), #fb923c (orange)
```

Chalk wrappers: `t.brand`, `t.text`, `t.muted`, `t.dim`, `t.success`, `t.error`, `t.warning`, `t.info`, `t.bold`, `t.header`.

### Formatters (`format.ts`)

882 lines of pure string formatters (no side effects):

- **Token/cost**: `formatTokens()`, `estimateCost()`, `formatCost()`, `formatDuration()`, `formatAge()`
- **Tool calls**: `formatToolCall()`, `formatToolResult()` — with `⏺` and `⎿` connectors
- **Status**: `formatThinkingDone()`, `formatCompaction()`, `formatTurnComplete()`, `formatCancelled()`, `formatError()`
- **Welcome**: `formatWelcome()` — ASCII logo + info panel
- **Lists**: `formatSessionList()`, `formatChannelList()`, `formatModelList()`, `formatConnectorList()`, `formatTriggerList()`, `formatSkillList()`, `formatHealth()`
- **Sub-agents**: `formatDelegateStart()`, `formatParallelStart()`, `formatDelegateResult()`, `formatParallelResult()`
- **Help/config**: `formatHelp()`, `formatStatus()`, `formatSysInfo()`, `formatConfig()`, `formatHistory()`

### Library Utilities (`src/cli/lib/`)

| File | Purpose |
|------|---------|
| `setup.ts` | First-launch detection + 3 provider options (Anthropic, OpenAI, Ollama) |
| `autocomplete.ts` | Slash command tab completion logic |
| `history.ts` | Session history management |
| `markdown.ts` | Markdown-to-terminal renderer |
| `syntax.ts` | Syntax highlighting for code blocks |
| `mascot.ts` | ASCII art bot/mascot |
| `cost.ts` | Token cost estimation tables |

---

## Daemon Layer (`src/daemon/`)

### Kernel Boot Sequence (`kernel.ts`)

The daemon boots in 16 steps. Each step depends on previous steps completing.

```
Step 0:    Load secrets         ~/.config/jeriko/.env → process.env
Step 1:    Load configuration   defaults → config.json → env overrides
Step 2:    Initialize logger    JSONL file rotation + console transport
Step 3:    Open database        SQLite at ~/.jeriko/data/jeriko.db
Step 4:    Run migrations       0001_init → 0002_orchestrator → 0003_trigger → 0004_share
Step 5:    Security policies    Path allowlisting, command blocklisting
Step 5.5:  License refresh      Billing license check (Stripe or relay API)
Step 6:    Register tools       Import all 15 tool files (self-register on import)
Step 7:    Initialize drivers   Load model registry (models.dev) + register custom providers
Step 8:    Create worker pool   Max 4 concurrent workers
Step 9:    Create channels      Telegram, WhatsApp (config-conditional)
           Load system prompt   ~/.config/jeriko/agent.md + skill summary injection
           Wire channel router  Slash commands + agent message routing
Step 10:   Create trigger engine
Step 10.5: Create ConnectorManager + wire into triggers and agent tools
Step 10.6: Connect relay client (non-fatal — see Relay Infrastructure below)
Step 11:   Load plugins         ~/.jeriko/plugins/
Step 12:   Start trigger engine  Activate enabled cron/webhook/file/http triggers
Step 13:   Connect channels      Establish platform connections
Step 14:   Start socket IPC     Unix domain socket at ~/.jeriko/daemon.sock
Step 15:   Start HTTP server     Hono on Bun.serve(), port 7741 (or JERIKO_PORT)
```

**Shutdown sequence** (reverse order):
1. Stop HTTP server
1.5. Stop socket IPC server
2. Disconnect channels
2.5. Disconnect relay client
2.6. Shut down connectors
3. Stop trigger engine
4. Unload plugins
5. Drain worker pool
6. Close database
7. Close logger

**KernelState interface:**
```typescript
interface KernelState {
  phase: "idle" | "booting" | "running" | "shutting_down" | "stopped";
  config: JerikoConfig | null;
  db: Database | null;
  channels: ChannelRegistry | null;
  triggers: TriggerEngine | null;
  connectors: ConnectorManager | null;
  workers: WorkerPool | null;
  plugins: PluginLoader | null;
  server: ReturnType<typeof Bun.serve> | null;
  startedAt: number | null;
}
```

Signal handlers: SIGINT + SIGTERM → graceful shutdown. `onShutdown()` hook for PID cleanup without signal handler race conditions.

### Agent System (`src/daemon/agent/`)

#### Core Loop (`agent.ts`)

`runAgent()` is an async generator that yields `AgentEvent` objects in real-time.

**AgentRunConfig:**
```typescript
interface AgentRunConfig {
  sessionId: string;
  backend: string;          // "anthropic", "openai", "local", "claude-code", or custom provider
  model: string;            // model ID (e.g. "claude-sonnet-4-6")
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  extendedThinking?: boolean;
  toolIds?: string[] | null; // null = all tools, [] = no tools
  maxRounds?: number;        // default 40
  signal?: AbortSignal;
  depth?: number;            // sub-agent nesting level
}
```

**AgentEvent types:**
```typescript
{ type: "text_delta";      content: string }
{ type: "thinking";        content: string }
{ type: "tool_call_start"; toolCall: ToolCall }
{ type: "tool_result";     toolCallId: string; result: string; isError: boolean }
{ type: "turn_complete";   tokensIn: number; tokensOut: number }
{ type: "compaction";      beforeTokens: number; afterTokens: number }
{ type: "error";           message: string }
```

**Loop logic:**
1. Resolve model alias → real API model ID via `resolveModel()`
2. Detect capabilities (tools, reasoning, context window, max output)
3. Build driver config with dynamic capabilities
4. Stream response from LLM driver
5. If tool calls → execute them, append results, loop back to step 4
6. If text-only → yield final text, return
7. Context compaction when usage exceeds 75% threshold
8. Circuit breaker: 5 consecutive errors → abort

#### Orchestrator (`orchestrator.ts`)

Manages sub-agent spawning with structured context capture (not text-only return).

**5 agent types** (tool-scoped presets):

| Type | Allowed Tools |
|------|--------------|
| `general` | All 19 tools (full tool registry) |
| `research` | web_search, browser, read_file, list_files, search_files, use_skill |
| `task` | bash, browser, read_file, write_file, edit_file, list_files, search_files, camera, screenshot, connector, use_skill |
| `explore` | read_file, list_files, search_files |
| `plan` | read_file, list_files, search_files, web_search, browser, use_skill |

**Key functions:**
- `delegate(prompt, opts)` — spawn single sub-agent, returns `SubTaskContext`
- `fanOut(tasks, opts)` — spawn multiple sub-agents in waves (max 4 concurrent)
- `readContext(sessionId)` — retrieve structured artifacts from SQLite

**SubTaskContext** (returned from sub-agents):
```typescript
interface SubTaskContext {
  toolCalls: Array<{ name: string; arguments: string; result: string; isError: boolean }>;
  filesWritten: string[];
  filesEdited: string[];
  artifacts: Array<{ key: string; value: string }>;
  errors: string[];
  metrics: { tokensIn: number; tokensOut: number; rounds: number };
}
```

**Depth control:** MAX_DEPTH = 2. At max depth, delegate/parallel_tasks tools are filtered out to prevent infinite recursion.

**Event bus** (`orchestratorBus`): emits `sub:started`, `sub:text_delta`, `sub:tool_call`, `sub:tool_result`, `sub:complete` for real-time CLI visualization.

#### LLM Drivers (`src/daemon/agent/drivers/`)

All drivers implement the `LLMDriver` interface:

```typescript
interface LLMDriver {
  readonly name: string;
  chat(messages: DriverMessage[], config: DriverConfig): AsyncGenerator<StreamChunk>;
}
```

**5 built-in drivers:**

| Driver | File | Provider | Models | Notes |
|--------|------|----------|--------|-------|
| `AnthropicDriver` | `anthropic.ts` | Anthropic | Claude Sonnet, Opus, Haiku | Extended thinking support |
| `OpenAIDriver` | `openai.ts` | OpenAI | GPT-4o, GPT-5, o1, o3 | Streaming via OpenAI API |
| `LocalDriver` | `local.ts` | Ollama | Any local model | Probes capabilities via `/api/show` |
| `ClaudeCodeDriver` | `claude-code.ts` | Claude Code CLI | Claude via CC | Disables tool calling by design |
| `OpenAICompatDriver` | `openai-compat.ts` | Any OpenAI-compatible | Provider-defined | Used by custom providers |

**Custom providers** (via `config.providers[]`):
```json
{
  "id": "openrouter",
  "name": "OpenRouter",
  "baseUrl": "https://openrouter.ai/api/v1",
  "apiKey": "{env:OPENROUTER_API_KEY}",
  "type": "openai-compat",
  "models": ["deepseek/deepseek-r1", "meta-llama/llama-3.3-70b"]
}
```

Usage: `--model openrouter:deepseek` or `/model openrouter:deepseek` in channels.

**Shared SSE parser** (`openai-stream.ts`): Used by `openai.ts`, `local.ts`, and `openai-compat.ts` for unified streaming.

#### Model Registry (`drivers/models.ts`)

Dynamic capability detection from [models.dev](https://models.dev) (fetched at boot, non-fatal fallback to static aliases).

**ModelCapabilities:**
```typescript
interface ModelCapabilities {
  id: string;
  provider: string;
  family: string;
  context: number;       // context window size
  maxOutput: number;     // max output tokens
  toolCall: boolean;     // supports function calling
  reasoning: boolean;    // supports extended thinking
  costInput: number;     // $/1M input tokens
  costOutput: number;    // $/1M output tokens
}
```

**Functions:**
- `parseModelSpec("openrouter:deepseek")` → `{ backend: "openrouter", model: "deepseek" }`
- `resolveModel(provider, alias)` → real model ID
- `getCapabilities(provider, modelId)` → capability struct
- `probeLocalModel(modelId)` → Ollama-specific detection
- `buildModelList(opts)` → unified model list for picker and IPC (single source of truth)
- `buildPinnedSpecSet(customModels)` → Set of pinned "provider:model" specs

**User-curated models** (`config.agent.customModels`):
When set, the model picker shows the user's pinned models first, then "Browse all...". Each entry is a `"provider:model"` string or an object with optional capability overrides (`context`, `maxOutput`, `toolCall`, `reasoning`, `vision`). Managed via `/model pin`, `/model unpin`, or config file directly.

**Static fallback aliases:**
```typescript
anthropic: { claude → claude-sonnet-4-6, opus → claude-opus-4-6 }
openai:    { gpt → gpt-4o, gpt5 → gpt-5 }
```

### 19 Agent Tools (`src/daemon/agent/tools/`)

Tools self-register on import via `registerTool()`. The registry supports aliases for resilient name resolution across different LLMs.

**ToolDefinition interface:**
```typescript
interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  parameters: JSONSchema;
  execute: (args: Record<string, unknown>) => Promise<string>;
  aliases?: string[];
}
```

| # | Tool ID | Aliases | Parameters | Description |
|---|---------|---------|------------|-------------|
| 1 | `bash` | exec, shell, run, execute, run_command, terminal | `command`, `timeout?`, `cwd?` | Execute shell commands |
| 2 | `read_file` | — | `path`, `start_line?`, `end_line?` | Read file contents |
| 3 | `write_file` | — | `path`, `content` | Write/create files |
| 4 | `edit_file` | — | `path`, `start_line`, `end_line`, `content` | Edit specific lines |
| 5 | `list_files` | — | `path`, `recursive?` | List directory contents |
| 6 | `search_files` | search, grep | `pattern`, `path?`, `type?`, `count_only?`, `context?` | Search file contents (ripgrep) |
| 7 | `web_search` | — | `query`, `count?`, `safe_search?` | Search the web |
| 8 | `screenshot` | — | `format?`, `quality?` | Capture screen |
| 9 | `camera` | — | `format?`, `quality?` | Capture from webcam |
| 10 | `parallel_tasks` | — | `tasks[]` (label, prompt, agent_type?) | Run multiple agents in parallel |
| 11 | `delegate` | — | `prompt`, `agent_type?`, `include_context?` | Spawn a typed sub-agent |
| 12 | `browse` | browser | `action`, `url?`, `js?`, `selector?`, etc. | Headless browser control |
| 13 | `connector` | — | `name`, `method`, `params` | Call connector APIs |
| 14 | `use_skill` | skill, call_skill | `action`, `skill_name?`, `script?`, `args?` | Load and execute skills |
| 15 | `webdev` | web_dev, dev_tools, project | `action`, `project?`, `dir?`, + action params | Manage web projects |

**Browse tool actions:** `navigate`, `screenshot`, `click`, `type`, `scroll`, `wait`, `extract`, `execute_js`

**Webdev tool actions:** `status`, `debug_logs`, `save_checkpoint`, `rollback`, `versions`, `restart`, `push_schema`, `execute_sql`

**Skill tool actions:** `list`, `load`, `info`, `read_reference`, `run_script`, `list_files`

### Browser Engine (`src/daemon/agent/tools/browser/`)

Playwright-based headless browser with stealth mode:
- Fingerprint spoofing (WebGL, navigator overrides, canvas noise)
- Anti-bot detection evasion
- Script injection for: scroll, click, type, extract, screenshot
- Action queue with retry logic

### Storage (`src/daemon/storage/`)

#### Database (`db.ts`)

SQLite via `bun:sqlite` with Drizzle ORM. Singleton pattern via `getDatabase()`.

**Location:** `~/.jeriko/data/jeriko.db`

**PRAGMA settings:** WAL mode, NORMAL sync, 64MB cache, foreign keys ON

**Migration system:** SQL files in `src/daemon/storage/migrations/`, applied lexicographically at boot.

| Migration | Description |
|-----------|-------------|
| `0001_init.sql` | session, message, part, audit_log, key_value tables |
| `0002_orchestrator.sql` | agent_context table, parent_session_id + agent_type columns |
| `0003_trigger_consolidate.sql` | Trigger table cleanup |
| `0004_share.sql` | shared_session table for public sharing |

#### Schema (`schema.ts`)

**7 tables:**

```sql
session (
  id                TEXT PRIMARY KEY,
  slug              TEXT NOT NULL,        -- human-readable: "session-abc123"
  title             TEXT NOT NULL,
  model             TEXT NOT NULL,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  archived_at       INTEGER,
  token_count       INTEGER DEFAULT 0,
  parent_session_id TEXT REFERENCES session(id),  -- sub-agent sessions
  agent_type        TEXT DEFAULT 'general'         -- general/research/task/explore/plan
)

message (
  id            TEXT PRIMARY KEY,
  session_id    TEXT REFERENCES session(id) ON DELETE CASCADE,
  role          TEXT CHECK (role IN ('user','assistant','system','tool')),
  content       TEXT NOT NULL,
  tokens_input  INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  created_at    INTEGER NOT NULL
)

part (
  id           TEXT PRIMARY KEY,
  message_id   TEXT REFERENCES message(id) ON DELETE CASCADE,
  type         TEXT CHECK (type IN ('text','tool_call','tool_result','error')),
  content      TEXT NOT NULL,
  tool_name    TEXT,
  tool_call_id TEXT,
  created_at   INTEGER NOT NULL
)

agent_context (
  id         TEXT PRIMARY KEY,
  session_id TEXT REFERENCES session(id) ON DELETE CASCADE,
  kind       TEXT CHECK (kind IN ('tool_call','file_write','file_edit','artifact','error','metric')),
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  created_at INTEGER NOT NULL
)

audit_log (
  id          TEXT PRIMARY KEY,
  lease_id    TEXT NOT NULL,
  agent       TEXT NOT NULL,
  command     TEXT NOT NULL,
  risk        TEXT NOT NULL,    -- low/medium/high/critical
  decision    TEXT NOT NULL,
  reason      TEXT NOT NULL,
  duration_ms INTEGER,
  exit_code   INTEGER,
  created_at  INTEGER NOT NULL
)

key_value (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,     -- JSON-encoded
  updated_at INTEGER NOT NULL
)

shared_session (
  id         TEXT PRIMARY KEY,
  share_id   TEXT NOT NULL,
  session_id TEXT REFERENCES session(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  model      TEXT NOT NULL,
  messages   TEXT NOT NULL,     -- JSON array snapshot
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  revoked_at INTEGER
)
```

**trigger_config** table is self-bootstrapped by `TriggerStore.ensureTable()` (not in migrations).

#### Key-Value Store (`kv.ts`)

Simple KV interface backed by SQLite:

```typescript
kvSet(key, value): void     // upsert, JSON-serialized
kvGet<T>(key): T | null     // JSON-parsed
kvDelete(key): void
kvList(prefix?): Array<{ key, value }>
```

Key patterns: `state:last_session_id`, `session:*`, `trigger:*`

### Services

#### Channels (`src/daemon/services/channels/`)

Multi-channel messaging with a unified adapter interface.

**ChannelAdapter interface:**
```typescript
interface ChannelAdapter {
  readonly name: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  send(target, message): Promise<void>;
  sendLong?(target, message): Promise<void>;
  sendPhoto?(target, photo, caption?): Promise<void>;
  sendDocument?(target, path, caption?): Promise<void>;
  sendTyping?(target): Promise<void>;
  sendTracked?(target, message): Promise<SentMessage>;
  editMessage?(target, messageId, text): Promise<void>;
  downloadFile?(fileId, filename?): Promise<string>;
  deleteMessage?(target, messageId): Promise<void>;
  sendKeyboard?(target, text, keyboard): Promise<void>;
  onMessage(handler): void;
}
```

**2 channel implementations:**

| Channel | Library | Config Key | Features |
|---------|---------|------------|----------|
| **Telegram** | grammy | `channels.telegram.token` + `adminIds` | Full media (photo, doc, video, audio, voice), keyboard, edit, typing |
| **WhatsApp** | @whiskeysockets/baileys | `channels.whatsapp.enabled` | Text, media, QR code pairing |

**Channel Router** (`router.ts`):
- Binds inbound messages → agent loop with streaming responses
- Live response editing (debounced at 1 second)
- Typing indicator every 4 seconds
- File receive: downloads attachments, prepends paths to prompt
- File send: scans responses for file paths, sends as photo/document
- Slash commands: `/stop`, `/clear`, `/kill`, `/sessions`, `/connectors`, `/sys`, `/model`, `/new`, `/help`
- Session persistence across daemon restarts

**ChannelRegistry API:**
- `register(adapter)`, `get(name)`, `connectAll()`, `disconnectAll()`
- `connect(name)`, `disconnect(name)`, `send(name, target, message)`, `status()`

#### Connectors (`src/daemon/services/connectors/`)

14 external service integrations with lazy initialization and health caching.

**Two base classes:**
- `ConnectorBase` — API key authentication (Stripe, PayPal, Twilio)
- `BearerConnector` — OAuth2 token flow (GitHub, X, GDrive, OneDrive, Gmail, Outlook, Vercel, Instagram, Threads, HubSpot, Shopify)

**29 connectors** (see `src/daemon/services/connectors/` for the authoritative list; a representative subset is shown below):

| Connector | Type | Required Env |
|-----------|------|-------------|
| `stripe` | API Key | STRIPE_SECRET_KEY |
| `paypal` | API Key | PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET |
| `twilio` | API Key | TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN |
| `github` | OAuth | GITHUB_TOKEN (or GH_TOKEN) |
| `x` | OAuth | X_API_KEY, X_API_SECRET |
| `gdrive` | OAuth | GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET |
| `onedrive` | OAuth | MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET |
| `gmail` | OAuth | GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET |
| `outlook` | OAuth | MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET |
| `vercel` | OAuth | VERCEL_TOKEN |
| `hubspot` | OAuth | HUBSPOT_CLIENT_ID, HUBSPOT_CLIENT_SECRET |
| `shopify` | OAuth | SHOPIFY_API_KEY, SHOPIFY_API_SECRET |
| `instagram` | OAuth | INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET |
| `threads` | OAuth | THREADS_APP_ID, THREADS_APP_SECRET |

**ConnectorManager API:**
- `get(name)` — lazy init + cache
- `call(name, method, params)` — shorthand call
- `listAll()` — status list
- `healthCheck(name?)` — with 30s TTL cache
- `connect(name)`, `disconnect(name)`, `shutdownAll()`

**Registry:** `CONNECTOR_FACTORIES` map in `registry.ts`. `CONNECTOR_DEFS` in `shared/connector.ts` for metadata.

#### Triggers (`src/daemon/services/triggers/`)

6 trigger types, SQLite-persisted, with auto-disable on failure. Shell-action triggers run through `safeSpawn` with a 5-minute wall-clock cap.

**TriggerConfig:**
```typescript
interface TriggerConfig {
  id: string;
  type: "cron" | "webhook" | "file" | "http" | "email" | "once";
  enabled: boolean;
  config: CronConfig | WebhookConfig | FileConfig | HttpConfig | EmailConfig | OnceConfig;
  action: TriggerAction;   // { type: "shell"|"agent", command?, prompt?, notify? }
  label?: string;
  run_count?: number;
  error_count?: number;
  max_runs?: number;
  last_fired?: string;
}
```

**6 trigger types:**

| Type | Config | Description |
|------|--------|-------------|
| `cron` | `{ expression, timezone? }` | Scheduled execution (croner library) |
| `webhook` | `{ secret?, service? }` | HTTP webhook with signature verification |
| `file` | `{ paths[], events?, debounceMs? }` | File system watcher |
| `http` | `{ url, method?, headers?, intervalMs?, jqFilter? }` | Polling HTTP endpoint |
| `email` | `{ connector?, user?, password?, host?, port?, intervalMs? }` | Email monitoring (IMAP or connector-backed) |
| `once` | `{ at: ISO datetime }` | Fire once at a specific time, then auto-disable |

**Webhook verification:** HMAC-SHA256 + 5 service-specific formats:
- **Stripe:** `Stripe-Signature` header
- **GitHub:** `X-Hub-Signature-256` header
- **PayPal:** PayPal webhook verification API
- **Twilio:** Twilio request signature
- **Generic:** HMAC-SHA256 against raw body

**TriggerEngine API:**
- `add(config)`, `remove(id)`, `update(id, config)`, `get(id)`, `listAll()`
- `enable(id)`, `disable(id)`, `start()`, `stop()`
- `handleWebhook(id, payload, headers, rawBody)`
- `setConnectorManager(manager)`, `setChannelRegistry(registry, targets)`, `setSystemPrompt(prompt)`

**Auto-disable:** 5 consecutive errors or `max_runs` reached.

**Agent actions:** trigger fires → `runAgent()` with session + payload context. Notifications via Telegram admin IDs.

#### MCP Client (`src/daemon/services/mcp/`)

Zero-dep Model Context Protocol client — any MCP server configured at
`~/.config/jeriko/mcp.json` auto-registers its tools into the shared
`ToolDefinition` registry under an `mcp_<server>_<tool>` namespace.

- **Protocol:** JSON-RPC 2.0 (no `@modelcontextprotocol/sdk` — ~500 lines of typed code keeps the single-binary build lean).
- **Transports:** STDIO (child process) + streamable-HTTP (SSE or plain JSON response).
- **Startup:** kernel boot step 6.5 calls `startMcpServers()`; per-server failures are isolated (one broken server doesn't block the others).
- **Safety:** per-RPC timeouts — 30 s for `initialize`, 60 s for `tools/call` — prevent hung MCP servers from blocking the agent loop.

#### Hooks (`src/daemon/services/hooks/`)

User-extensible lifecycle gates. Six events today: `pre_tool_use`,
`post_tool_use`, `session_start`, `session_end`, `pre_compact`, `post_compact`.

Hook entries live in `~/.config/jeriko/hooks.json`:

```json
{
  "hooks": [
    {
      "event": "pre_tool_use",
      "matcher": { "tool": "bash", "argumentsPattern": "rm\\s+-rf" },
      "command": "/usr/local/bin/review-bash.sh",
      "timeoutMs": 3000
    }
  ]
}
```

The runner shells out, writes the payload to stdin as JSON, and expects a
zod-validated decision on stdout:

- `{"decision":"allow"}` — continue unchanged
- `{"decision":"modify","arguments":{...}}` — replace the tool args
- `{"decision":"block","message":"..."}` — short-circuit with the message
- `{"decision":"prompt","question":"..."}` — ask the user yes/no before continuing

Default is `allow` on timeout / crash / malformed JSON so broken hooks can never block the agent.

#### Billing (`src/daemon/billing/`)

Stripe-backed subscription gate. Kernel step 5.5 boots the license refresh, falling back to a 7-day grace period when the relay is offline. Webhook payloads validated through `src/daemon/billing/stripe-events.ts` (zod). Four tables (`billing_subscription`, `billing_event`, `billing_consent`, `billing_license`) record everything needed for chargeback defense.

### HTTP API (`src/daemon/api/`)

#### Routes (`app.ts`)

Hono framework on `Bun.serve()`.

**Middleware:**
- CORS: `http://localhost:*`, `tauri://localhost`
- Rate limit: 100 requests per 60 seconds
- Auth: skipped for `/health`, `/hooks/*`, `/oauth/*`, `/s/*`

**Route table:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Health check |
| POST | `/agent/chat` | Yes | Send message, streaming response |
| GET | `/session` | Yes | List sessions (archived?, limit?, offset?) |
| GET | `/session/:id` | Yes | Get session + messages |
| POST | `/session/:id/resume` | Yes | Unarchive session |
| POST | `/session/:id/archive` | Yes | Archive session |
| POST | `/hooks/:triggerId` | No | Webhook receiver |
| GET | `/channel` | Yes | List channel statuses |
| POST | `/channel/:name/connect` | Yes | Connect channel |
| POST | `/channel/:name/disconnect` | Yes | Disconnect channel |
| GET | `/connector` | Yes | List connector statuses |
| POST | `/connector/:name/connect` | Yes | Connect connector |
| POST | `/connector/:name/call` | Yes | Call connector method |
| POST | `/triggers` | Yes | Create trigger |
| GET | `/triggers` | Yes | List triggers |
| PUT | `/triggers/:id` | Yes | Update trigger |
| DELETE | `/triggers/:id` | Yes | Delete trigger |
| POST | `/triggers/:id/enable` | Yes | Enable trigger |
| POST | `/triggers/:id/disable` | Yes | Disable trigger |
| GET | `/scheduler` | Yes | Cron-only trigger facade |
| POST | `/oauth/:provider/start` | Yes | Start OAuth flow |
| GET | `/oauth/:provider/callback` | No | OAuth callback |
| POST | `/share` | Yes | Create share link |
| GET | `/s/:shareId` | No | Public share view |
| DELETE | `/share/:shareId` | Yes | Revoke share |

**AppContext** (injected into routes):
```typescript
interface AppContext {
  channels: ChannelRegistry;
  triggers: TriggerEngine;
  connectors: ConnectorManager;
}
```

#### Socket IPC (`socket.ts`)

CLI ↔ daemon communication via Unix domain socket at `~/.jeriko/daemon.sock`.

**Wire protocol:** Newline-delimited JSON
```
Request:  { id, method, params? }
Stream:   { id, stream: true, event: {...} }
Final:    { id, ok: true/false, data?, error? }
```

**IPC methods** (30 total):

| Category | Methods |
|----------|---------|
| **Agent** | `ask` (streaming), `status`, `stop` |
| **Sessions** | `sessions`, `new_session`, `resume_session`, `history`, `clear_history`, `compact` |
| **Channels** | `channels`, `channel_connect`, `channel_disconnect` |
| **Connectors** | `connectors`, `connector_connect`, `connector_disconnect`, `connector_health` |
| **Models** | `models` |
| **Triggers** | `triggers`, `trigger_enable`, `trigger_disable` |
| **Skills** | `skills`, `skill_detail` |
| **Config** | `config` |
| **Share** | `share`, `share_revoke`, `shares` |

The `ask` method is a streaming method — it subscribes to `orchestratorBus` events and forwards them to the CLI in real-time for sub-agent visualization.

---

## Shared Layer (`src/shared/`)

17 TypeScript files with zero internal dependencies (only Node/Bun builtins + types).

| File | Exports | Purpose |
|------|---------|---------|
| `config.ts` | `JerikoConfig`, `loadConfig()`, `getConfigDir()`, `getDataDir()`, `getUserId()` | Configuration loading, merge cascade, user identity |
| `args.ts` | `parseArgs()`, `flagStr()`, `flagBool()`, `requireFlag()` | Argument parsing (`--flag value`, `-f`, `--no-*`) |
| `output.ts` | `ok()`, `fail()`, `EXIT`, `setOutputFormat()` | Output envelope + exit codes (0,1,2,3,5,7) |
| `logger.ts` | `getLogger()`, `Logger` class | JSONL file rotation + console logger |
| `escape.ts` | `escapeAppleScript()`, `escapeShellArg()`, `escapeDoubleQuoted()`, `stripAnsi()` | Injection prevention |
| `prompt.ts` | `loadSystemPrompt()` | Load AGENT.md from config dir or dev fallback |
| `skill.ts` | `SkillMeta`, `SkillManifest`, `SkillSummary` | Skill type definitions + constants |
| `skill-loader.ts` | `loadSkill()`, `listSkills()`, `validateSkill()`, `scaffoldSkill()`, `removeSkill()`, `formatSkillSummaries()` | Skill CRUD with hand-rolled YAML parser |
| `connector.ts` | `CONNECTOR_DEFS`, `getConnectorDef()`, `resolveMethod()`, `collectFlags()` | Connector metadata + CLI helpers |
| `env-ref.ts` | `resolveEnvRef()`, `isEnvRef()` | `{env:VAR}` syntax resolution |
| `relay-protocol.ts` | `RelayOutboundMessage`, `RelayInboundMessage`, `RelayConnection`, constants | Relay wire protocol types + constants (single source of truth) |
| `urls.ts` | `getPublicUrl()`, `buildWebhookUrl()`, `buildOAuthCallbackUrl()`, `buildOAuthStartUrl()`, `buildShareLink()` | Relay-aware URL builders for webhooks, OAuth, shares |
| `bus.ts` | `Bus<EventMap>`, `globalBus` | Type-safe event bus with `on`, `once`, `emit`, `waitFor` |
| `tokens.ts` | `estimateTokens()`, `shouldCompact()`, `contextUsagePercent()` | Token estimation heuristics |
| `secrets.ts` | `loadSecrets()`, `saveSecret()`, `deleteSecret()` | Persistent secret storage (`.env`, mode 0o600) |
| `types.ts` | `JerikoResult<T>`, `ExitCode`, `OutputFormat`, `LogLevel`, `RiskLevel` | Core shared types |
| `index.ts` | — | Barrel re-exports |

### Configuration (`config.ts`)

**JerikoConfig interface:**
```typescript
interface JerikoConfig {
  agent: AgentConfig;              // model, maxTokens, temperature, extendedThinking
  channels: ChannelsConfig;        // telegram, whatsapp
  connectors: ConnectorsConfig;    // stripe, paypal, github, twilio, etc.
  security: SecurityConfig;        // allowedPaths, blockedCommands, sensitiveKeys
  storage: StorageConfig;          // dbPath, memoryPath
  logging: LoggingConfig;          // level, maxFileSize, maxFiles
  providers?: ProviderConfig[];    // custom OpenAI-compatible providers
}
```

**Config load cascade** (highest priority last):
1. Built-in defaults
2. `~/.config/jeriko/config.json` (user-level)
3. `./jeriko.json` (project-level)
4. Environment variables (`JERIKO_*`, `TELEGRAM_BOT_TOKEN`, etc.)

Supports XDG Base Directory Specification on Linux.

### Output Contract (`output.ts`)

Every command returns a `JerikoResult<T>` envelope:

```json
// Success
{"ok": true, "data": {...}}

// Failure
{"ok": false, "error": "message", "code": 1}
```

**Three output formats** (via `--format` global flag):
- `json` (default) — raw JSON
- `text` — human-readable key-value
- `logfmt` — structured `key=value` pairs

**Semantic exit codes:**

| Code | Constant | Meaning |
|------|----------|---------|
| 0 | `EXIT.OK` | Success |
| 1 | `EXIT.GENERAL` | General error |
| 2 | `EXIT.NETWORK` | Network error |
| 3 | `EXIT.AUTH` | Authentication error |
| 5 | `EXIT.NOT_FOUND` | Resource not found |
| 7 | `EXIT.TIMEOUT` | Timeout |

---

## Skills System

### Overview

Skills are reusable knowledge packages that extend agent capabilities. They live at `~/.jeriko/skills/<name>/SKILL.md`.

**Structure:** YAML frontmatter + Markdown body

```markdown
---
name: my-skill
description: Does something useful
user-invocable: true
allowed-tools: [bash, read_file, write_file]
---

## Instructions

Detailed instructions for the agent...
```

### Progressive Loading

1. **Boot time:** Skill summaries (name + description) injected into system prompt
2. **On demand:** Full SKILL.md body loaded via `use_skill` tool
3. **As needed:** Bundled resources (scripts, references, templates) accessed via tool actions

### CLI Commands

```bash
jeriko skill list              # list installed skills
jeriko skill info <name>       # show skill metadata
jeriko skill create <name>     # scaffold new skill
jeriko skill validate <name>   # check skill for errors
jeriko skill remove <name>     # delete skill
jeriko skill install <url>     # install from URL/git
jeriko skill edit <name>       # open in $EDITOR
```

### Agent Tool Actions

| Action | Parameters | Returns |
|--------|-----------|---------|
| `list` | — | All skill summaries |
| `load` | `skill_name` | Full SKILL.md body |
| `info` | `skill_name` | Metadata only |
| `read_reference` | `skill_name`, `path` | Bundled file contents |
| `run_script` | `skill_name`, `script`, `args?` | Script execution result |
| `list_files` | `skill_name` | Files in skill directory |

### Validation

- Name: `^[a-z0-9][a-z0-9-]{1,49}$`
- Description: minimum 10 characters
- `allowed-tools`: must be an array (if present)
- Scripts: must be executable (`chmod +x`)

---

## Templates

### Overview

34+ pre-built templates for instant project scaffolding. No download — templates are copied from local storage.

```bash
jeriko create <template> <name>       # scaffold project
jeriko create web-static my-app       # Vite + React + Tailwind + shadcn/ui
jeriko create web-db-user my-app      # + Express + Drizzle + tRPC + JWT auth
```

### Template Categories

**Web Development** (`templates/webdev/`):

| Template | Stack |
|----------|-------|
| `web-static` | Vite + React 19 + Tailwind 4 + shadcn/ui (50+ components) + Wouter + Framer Motion + Recharts |
| `web-db-user` | Everything in web-static + Express + Drizzle ORM + tRPC + JWT auth + database |
| `app` | Minimal web app |

**Deploy Templates** (`templates/deploy/`, 30+):

Portfolios, dashboards, event pages, landing pages — ready to deploy:

| Category | Templates |
|----------|-----------|
| Portfolios | emoji, freelance, loud, minimal, neo, prologue, tech |
| Dashboards | bold, cyber, dark, standard |
| Events | charity, dynamic, elegant-wedding, minimal, night, whimsical, zen |
| Landing Pages | bnw, mobile, pixel, professional, services, tech |
| Frameworks | flask, next, react, react-js |

**Inline Scaffolds** (no template directory):
- `node` — Node.js project
- `api` — REST API project
- `cli` — CLI tool project
- `plugin` — Jeriko plugin

### Project Location

All scaffolded projects live at `~/.jeriko/projects/<name>/`.

---

## Security Model

### Injection Prevention
- `escapeAppleScript()` — escapes `\` and `"` for AppleScript strings (used in 9+ files)
- `escapeShellArg()` — single-quote wrapping with `'\''` idiom
- `spawnSync` with args arrays — no shell interpolation
- Path traversal prevention in skill tool (blocks `..` in paths)

### Execution Guard
- Per-tool rate limiting
- Duration caps on long-running commands
- Circuit breaker: 5 consecutive errors → abort agent loop
- Lease-based execution model with audit trail

### Webhook Security
- HMAC-SHA256 signature verification
- 5 service-specific verification formats (Stripe, GitHub, PayPal, Twilio, generic)
- Fail-closed: unverified webhooks rejected

### Secret Management
- `~/.config/jeriko/.env` (mode 0o600)
- `SENSITIVE_KEYS` stripped from subprocess environments
- OAuth token rotation via `BearerConnector`
- `{env:VAR}` deferred resolution (secrets never stored in config.json)

### Authentication
- HTTP API: rate limited (100 req/60s), auth on all non-public routes
- Socket IPC: local only (Unix domain socket)
- Channels: admin ID filtering (Telegram, WhatsApp)

---

## Relay Infrastructure (`apps/relay/` + `apps/relay-worker/` + `src/daemon/services/relay/`)

### Problem

Jeriko is a personal AI assistant — one daemon per user, on their own machine. External services (Stripe, GitHub, PayPal, etc.) send webhooks and OAuth callbacks to a public URL. When thousands of users each run their own daemon behind NAT/firewall, a relay server at `jeriko.ai` must route external events to the correct user's machine.

### Architecture

```
External Service (Stripe, GitHub, etc.)
  │
  POST https://bot.jeriko.ai/hooks/:userId/:triggerId
  │
  ▼
┌──────────────────────────────────────────────────────────────┐
│  Relay Server (apps/relay/)                                   │
│  Bun + Hono — WebSocket + HTTP                                │
│                                                                │
│  connections.ts: Map<userId, ManagedConnection>                │
│  routes/webhook.ts:  POST /hooks/:userId/:triggerId            │
│  routes/oauth.ts:    GET  /oauth/:userId/:provider/callback    │
│  routes/billing.ts:  POST /billing/webhook (centralized)       │
│  routes/health.ts:   GET  /health, /health/status              │
│                                                                │
│  relay.ts: createRelayApp() + createRelayServer(opts)          │
│  server.ts: thin entry point (no module-level side effects)    │
└────────────────────────┬─────────────────────────────────────┘
                         │ WebSocket (wss://bot.jeriko.ai/relay)
                         ▼
┌──────────────────────────────────────────────────────────────┐
│  Daemon (on user's machine, behind NAT)                       │
│                                                                │
│  services/relay/client.ts: RelayClient class                   │
│  ┌─ Connects outbound to relay on boot (kernel step 10.6)     │
│  ├─ Authenticates with userId + NODE_AUTH_SECRET               │
│  ├─ Registers webhook trigger IDs                              │
│  ├─ Receives forwarded webhooks → TriggerEngine.handleWebhook  │
│  ├─ Receives OAuth callbacks → local token exchange            │
│  └─ Exponential backoff reconnection (1s → 2s → 4s → ... 60s) │
└──────────────────────────────────────────────────────────────┘
```

### User ID System

Every Jeriko install gets a globally unique, stable user ID (UUID v4).

- **Generation**: `setupUserId()` in `src/cli/commands/automation/install-utils.ts` — runs during `jeriko install`
- **Storage**: `JERIKO_USER_ID` in `~/.config/jeriko/.env` via `saveSecret()`
- **Retrieval**: `getUserId()` in `src/shared/config.ts` — reads `process.env.JERIKO_USER_ID`
- **Exposure**: Health endpoint returns `user_id` for verification

### Wire Protocol (`src/shared/relay-protocol.ts`)

Single source of truth for all messages exchanged between daemons and relay.

**Outbound (daemon → relay):**

| Message | Fields | Purpose |
|---------|--------|---------|
| `auth` | `userId`, `token`, `version?` | Authenticate after WebSocket connect |
| `register_triggers` | `triggerIds[]` | Register webhook triggers for routing |
| `unregister_triggers` | `triggerIds[]` | Remove triggers (deleted/disabled) |
| `webhook_ack` | `requestId`, `status` | Acknowledge forwarded webhook |
| `oauth_result` | `requestId`, `statusCode`, `html` | Return OAuth callback HTML to browser |
| `ping` | — | Client heartbeat |

**Inbound (relay → daemon):**

| Message | Fields | Purpose |
|---------|--------|---------|
| `auth_ok` | — | Authentication succeeded |
| `auth_fail` | `error` | Authentication rejected |
| `webhook` | `requestId`, `triggerId`, `headers`, `body` | Forwarded webhook from external service |
| `oauth_callback` | `requestId`, `provider`, `params` | Forwarded OAuth callback from provider |
| `pong` | — | Server heartbeat response |
| `error` | `message` | Server-initiated error |

**Constants:**

| Constant | Value | Purpose |
|----------|-------|---------|
| `DEFAULT_RELAY_URL` | `wss://bot.jeriko.ai/relay` | Default WebSocket endpoint |
| `RELAY_HEARTBEAT_INTERVAL_MS` | 30,000 | Heartbeat ping every 30s |
| `RELAY_HEARTBEAT_TIMEOUT_MS` | 10,000 | Max wait for pong before disconnect |
| `RELAY_MAX_BACKOFF_MS` | 60,000 | Max reconnection delay |
| `RELAY_INITIAL_BACKOFF_MS` | 1,000 | First reconnection delay |
| `RELAY_BACKOFF_MULTIPLIER` | 2 | Exponential backoff factor |
| `RELAY_AUTH_TIMEOUT_MS` | 15,000 | Close if auth not received in 15s |
| `RELAY_MAX_PENDING_OAUTH` | 10 | Max concurrent OAuth callbacks per user |
| `RELAY_MAX_TRIGGERS_PER_CONNECTION` | 10,000 | Max triggers a single daemon can register |

### Relay Server — Two Implementations

The relay has two implementations sharing the same wire protocol (`src/shared/relay-protocol.ts`):

1. **Bun relay** (`apps/relay/`) — for local development and testing
2. **CF Worker relay** (`apps/relay-worker/`) — production deployment at `bot.jeriko.ai`

The daemon client (`src/daemon/services/relay/client.ts`) is unchanged — same URL, same protocol, regardless of which relay implementation serves it.

#### Bun Relay (`apps/relay/`) — Local Development

Lightweight Bun + Hono server. Used for `bun test` and local `JERIKO_RELAY_URL=ws://localhost:8080/relay`.

**File structure:**
```
apps/relay/
  src/
    relay.ts           — createRelayApp() + createRelayServer(opts) factory
    server.ts          — thin entry point (calls createRelayServer(), signal handlers)
    connections.ts     — WebSocket connection manager (Map<userId, ManagedConnection>)
    routes/
      webhook.ts       — POST /hooks/:userId/:triggerId + POST /hooks/:triggerId (legacy)
      oauth.ts         — GET /oauth/:userId/:provider/callback
      billing.ts       — POST /billing/webhook + GET /billing/license/:userId
      health.ts        — GET /health (public) + GET /health/status (authenticated)
  package.json
  tsconfig.json
```

#### CF Worker Relay (`apps/relay-worker/`) — Production

Cloudflare Worker + Durable Object deployed at `bot.jeriko.ai`. Uses a single global Durable Object (`idFromName("global")`) with Hibernatable WebSockets API.

**File structure:**
```
apps/relay-worker/
  wrangler.toml        — Worker + DO binding, bot.jeriko.ai custom domain, secrets
  package.json         — hono, @cloudflare/workers-types, wrangler
  tsconfig.json        — ESNext strict, CF Workers types
  src/
    index.ts           — Worker entry (routes all requests to global DO)
    relay-do.ts        — RelayDO class (Hibernatable WebSocket + Hono HTTP)
    connections.ts     — ConnectionManager class (adapted from Bun relay)
    crypto.ts          — Web Crypto API helpers (replaces node:crypto)
    lib/
      types.ts         — Env bindings, WebSocketAttachment type
      html.ts          — OAuth error/success HTML templates
    routes/
      webhook.ts       — POST /hooks/:userId/:triggerId + legacy
      oauth.ts         — GET /oauth/:userId/:provider/callback
      billing.ts       — POST /billing/webhook + GET /billing/license/:userId
      health.ts        — GET /health + GET /health/status
```

**Key adaptations from Bun relay:**

| Bun (node:crypto) | CF Worker (Web Crypto) |
|---|---|
| `createHmac("sha256", key).update(data).digest()` | `crypto.subtle.sign("HMAC", importedKey, data)` (async) |
| `timingSafeEqual(a, b)` | HMAC both values + XOR-accumulate bytes (constant-time) |
| `randomUUID()` from node:crypto | `crypto.randomUUID()` (native in Workers) |
| Module-level Maps | ConnectionManager class (instance per DO) |
| `ws.data = { userId }` | `ws.serializeAttachment({ userId })` (survives hibernation) |
| `process.env.X` | `env.X` (wrangler bindings) |
| `Bun.serve({ websocket: {...} })` | `DurableObject.webSocketMessage/Close/Error()` |

**Hibernation resilience:** WebSocket attachments (`serializeAttachment`/`deserializeAttachment`) store userId, triggerIds, auth state. On DO wake-up, the constructor iterates `state.getWebSockets()` and calls `ConnectionManager.restore()` to rebuild the in-memory Maps.

**Deployment:**
```bash
cd apps/relay-worker
npx wrangler secret put RELAY_AUTH_SECRET
npx wrangler secret put STRIPE_BILLING_WEBHOOK_SECRET
npx wrangler deploy
```

**CF Account:** Set via `CLOUDFLARE_ACCOUNT_ID` environment variable (CI secrets)

**Route table:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Basic health check (load balancers, monitoring) |
| GET | `/health/status` | Yes | Detailed status (connection count, user list, memory) |
| POST | `/hooks/:userId/:triggerId` | No | Forward webhook to user's daemon |
| POST | `/hooks/:triggerId` | No | Legacy format — looks up trigger owner |
| GET | `/oauth/:userId/:provider/callback` | No | Forward OAuth callback to daemon, return HTML |
| POST | `/billing/webhook` | Stripe sig | Centralized Stripe billing webhook |
| GET | `/billing/license/:userId` | Yes | Daemon license check (cached from Stripe events) |

**Connection manager** (`connections.ts`):
- `addPending(ws)` — register unauthenticated WebSocket
- `authenticate(ws, userId, token, version?)` — HMAC timing-safe auth, evicts existing connection for same userId
- `registerTriggers(userId, triggerIds[])` — map trigger IDs to user (limit: 10,000 per connection)
- `unregisterTriggers(userId, triggerIds[])` — remove triggers
- `getConnection(userId)` — lookup by user ID
- `findByTriggerId(triggerId)` — reverse lookup for legacy webhook route
- `sendTo(userId, message)` — forward message over WebSocket
- `removeByWs(ws)` — race-safe cleanup (only deletes if stored WS matches — prevents superseded connection eviction)
- `getStats()` — connection count, user list with versions

**Security:**
- HMAC-based timing-safe string comparison (prevents length oracle attacks)
- Auth timeout: connections closed after 15s without auth
- Max 3 auth failures before connection is force-closed
- Trigger ownership validation: webhooks only forwarded if trigger is registered for the target user
- Authenticated endpoints use HMAC comparison on Bearer token vs RELAY_AUTH_SECRET
- 10MB max request body size (Bun.serve `maxRequestBodySize`)

**Server factory** (`relay.ts`):
```typescript
createRelayApp(): Hono          // HTTP app without side effects (testable)
createRelayServer(opts): RelayServer  // Start server, return handle

interface RelayServer {
  app: Hono;                    // For route testing via app.fetch()
  server: ReturnType<typeof Bun.serve>;
  port: number;                 // Actual port (useful when port=0 for tests)
  url: string;                  // http://host:port
  wsUrl: string;                // ws://host:port/relay
  stop(): void;                 // Graceful shutdown
}
```

### Relay Client (`src/daemon/services/relay/client.ts`)

Outbound WebSocket connection from daemon to relay. Entirely non-fatal — Jeriko works fully offline. Only needed for receiving webhooks from external services and OAuth callbacks.

**RelayClient class:**
- `connect()` — connect to relay, auto-reconnect with exponential backoff
- `disconnect()` — clean disconnect
- `registerTrigger(id)` / `unregisterTrigger(id)` — dynamic trigger management
- `onWebhook(callback)` — register handler for forwarded webhooks
- `isConnected` — connection state

**Connection lifecycle:**
1. Boot → connect to `wss://bot.jeriko.ai/relay`
2. Auth → send `{type:"auth", userId, token, version}`
3. Auth timeout → close if `auth_ok`/`auth_fail` not received within 15s
4. Register → send trigger IDs for all enabled webhook triggers
5. Heartbeat → ping every 30s, close if pong not received within 10s
6. Receive → relay forwards webhooks and OAuth callbacks
7. Reconnect → exponential backoff (1s, 2s, 4s, 8s, ... max 60s)

**Kernel wiring (step 10.6):**
```typescript
// Skipped when:
//   - No user ID (run `jeriko install` first)
//   - No NODE_AUTH_SECRET (security token not configured)
//   - JERIKO_PUBLIC_URL is set (self-hosted tunnel — webhooks go directly)

relay.onWebhook(async (triggerId, headers, body) => {
  triggers.handleWebhook(triggerId, JSON.parse(body), headers, body);
});

triggers.bus.on("trigger:added", (t) => relay.registerTrigger(t.id));
triggers.bus.on("trigger:removed", ({ id }) => relay.unregisterTrigger(id));
```

### URL Routing (`src/shared/urls.ts`)

Three routing modes for public-facing URLs:

| Mode | Condition | Webhook URL | OAuth URL |
|------|-----------|-------------|-----------|
| **Relay** (default) | No `JERIKO_PUBLIC_URL` | `https://bot.jeriko.ai/hooks/:userId/:triggerId` | `https://bot.jeriko.ai/oauth/:userId/:provider/callback` |
| **Self-hosted** | `JERIKO_PUBLIC_URL` set | `https://my-tunnel.com/hooks/:triggerId` | `https://my-tunnel.com/oauth/:provider/callback` |
| **Local dev** | No userId | `http://127.0.0.1:3000/hooks/:triggerId` | `http://127.0.0.1:3000/oauth/:provider/callback` |

**URL builder functions:**
- `buildWebhookUrl(triggerId, localBaseUrl?)` — webhook URL with mode-aware routing
- `buildOAuthCallbackUrl(provider)` — OAuth redirect_uri with mode-aware routing
- `buildOAuthStartUrl(provider, stateToken)` — OAuth authorization start URL (state token URI-encoded)
- `getPublicUrl()` — base URL (`JERIKO_PUBLIC_URL` or `https://bot.jeriko.ai`)
- `isSelfHosted()` — whether `JERIKO_PUBLIC_URL` is set
- `getShareUrl()` — share link base URL
- `buildShareLink(shareId)` — full share link URL

### Centralized Billing

Stripe sends billing webhooks to ONE endpoint — you cannot configure per-user endpoints.

**Relay handles billing centrally:**
1. `POST /billing/webhook` — receives Stripe events, verifies signature, extracts `jeriko_user_id` from subscription metadata
2. Updates in-memory license cache (30-day TTL eviction)
3. Forwards event to connected daemon (if online)
4. `GET /billing/license/:userId` — daemons check subscription status via authenticated API

**Daemon billing integration:**
- `stripe.ts`: includes `jeriko_user_id` in Stripe checkout session metadata
- `license.ts`: `refreshFromRelay()` fetches license from relay API (authenticated with `NODE_AUTH_SECRET`)
- Billing URLs configurable via `JERIKO_BILLING_URL` env var
- Falls through to direct Stripe API if relay unavailable

### Environment Variables

| Variable | Required By | Purpose |
|----------|------------|---------|
| `JERIKO_USER_ID` | Daemon | Globally unique user identifier (UUID v4) |
| `RELAY_AUTH_SECRET` | Relay server | Shared secret for daemon authentication |
| `NODE_AUTH_SECRET` | Daemon | Auth token sent to relay (same as daemon HTTP auth) |
| `JERIKO_RELAY_URL` | Daemon | Override relay WebSocket URL (default: `wss://bot.jeriko.ai/relay`) |
| `JERIKO_PUBLIC_URL` | Daemon | Self-hosted tunnel URL (bypasses relay entirely) |
| `JERIKO_BILLING_URL` | Daemon | Override billing API base URL |
| `STRIPE_BILLING_WEBHOOK_SECRET` | Relay server | Stripe signature verification for billing webhooks |

### Backward Compatibility

- **Self-hosted tunnel**: Set `JERIKO_PUBLIC_URL=https://your-tunnel.example.com`. Webhooks go directly to daemon. Relay client does not connect.
- **Offline mode**: Works fully without relay. Cron, file, HTTP poll triggers fire locally. Only webhook triggers need relay.
- **Local dev**: `localhost:3000` still works. URLs fall back to `http://127.0.0.1:3000/hooks/:triggerId`.
- **Legacy webhook route**: `POST /hooks/:triggerId` (no userId) still works — relay looks up trigger owner via `findByTriggerId()`.

---

## Testing

**72 test files · 1876 test cases**

Framework: `bun:test` with `describe`/`it`/`expect`.

**Categories:**

| Category | Location | Coverage |
|----------|----------|----------|
| CLI unit | `test/unit/cli/` | Format, autocomplete, backend, commands, types, spinner, chat, components (messages, context-bar, tool-call), hooks (reducer, sub-agents) |
| Daemon unit | `test/unit/` | Security, dispatcher, database, bus, env-ref, skill-loader, skill-tool, webdev-tool, browser-scripts, share, relay-connections, relay-protocol, urls, install-user-id |
| Billing unit | `test/unit/billing/` | Config, store, license, webhook |
| Relay integration | `test/integration/relay-e2e.test.ts` | Full pipeline E2E — real server, real WebSocket, real HTTP (20 tests) |
| Commands integration | `test/integration/commands.test.ts` | Channel router slash commands (81 tests) |
| Integration | `test/live/` | Live agent, browser actions, browser scenarios, skills |

**Relay E2E tests** (`test/integration/relay-e2e.test.ts`):

Starts a REAL relay server on a random port, connects REAL WebSocket clients simulating daemons, sends REAL HTTP requests. Verifies the full pipeline:

| Test | Description |
|------|-------------|
| Health (public) | `GET /health` returns service status |
| Health (auth) | `GET /health/status` requires auth, returns connection details |
| WebSocket auth | Valid credentials → `auth_ok`, invalid → `auth_fail` |
| Webhook forwarding | `POST /hooks/:userId/:triggerId` → WebSocket → daemon receives payload |
| Webhook 503 | Returns 503 when daemon is not connected |
| Webhook 404 | Returns 404 for unregistered trigger (ownership validation) |
| Legacy webhook | `POST /hooks/:triggerId` fallback route (backward compatibility) |
| OAuth proxy | Full round-trip: browser → relay → daemon → relay → browser HTML |
| OAuth 503 | Returns 503 when daemon is not connected for OAuth |
| Multi-user isolation | Webhooks route to correct user, other users unaffected |
| Cross-user rejection | User A cannot receive webhooks for user B's triggers |
| Trigger registration | Dynamic add/remove verified via HTTP |
| Connection superseding | New connection evicts old, webhooks route to new |
| Heartbeat | Ping/pong round-trip |
| Billing license auth | `GET /billing/license/:userId` requires auth |
| Billing free tier | Unknown users default to free tier |
| 404 handling | Unknown routes return 404 |
| Status reflection | Connected daemons appear in `/health/status` |

**Test setup** (`test/preload.ts`):
```typescript
import chalk from "chalk";
chalk.level = 3; // force 24-bit color in all environments
```

**Test patterns:**
- Temp directories for filesystem isolation
- Tool registry cleanup between tests
- Mock `HOME` for skill/config tests
- `bun:sqlite` in-memory databases for storage tests
- Real WebSocket servers on port 0 for relay integration tests

---

## File System Layout

```
~/.config/jeriko/
  config.json          # JerikoConfig
  agent.md             # System prompt (AGENT.md copy)
  .env                 # Secrets (mode 0o600) — includes JERIKO_USER_ID

~/.jeriko/
  data/
    jeriko.db          # SQLite database
    agent.log          # JSONL log (with rotation)
  skills/
    <name>/SKILL.md    # Installed skills
  projects/
    <name>/            # Scaffolded web projects
  plugins/
    registry.json      # Plugin registry
    <plugin>/          # Installed plugins

~/.local/
  bin/jeriko           # Compiled binary
  lib/jeriko/          # Templates, support files
  share/
    bash-completion/   # Bash completions
    zsh/site-functions/ # Zsh completions
    man/man1/jeriko.1  # Man page
```

---

## Data Flow Diagrams

### CLI → Daemon (Interactive Chat)

```
User types message
  → Input component captures text
  → handleSubmit() dispatches
  → backend.send(message, callbacks)
      ├─ Daemon mode: write to daemon.sock
      │    → kernel registerStreamMethod("ask")
      │    → runAgent() async generator
      │    → stream events back over socket
      └─ In-process mode: direct runAgent() call
  → callbacks update AppState via reducer
  → Ink re-renders: StreamingText, ToolCall, SubAgent, StatusBar
  → Phase: idle → thinking → streaming/tool-executing → idle
```

### Webhook → Agent (via Relay)

```
External service POST → https://bot.jeriko.ai/hooks/:userId/:triggerId
  → Relay server receives request
  → Looks up userId in connections map
  → Validates trigger ownership (triggerIds.has(triggerId))
  → Returns 200 to external service immediately
  → Forwards {type:"webhook", triggerId, headers, body} over WebSocket
  → Daemon relay client receives webhook message
  → RelayClient.onWebhook callback fires
  → TriggerEngine.handleWebhook(triggerId, payload, headers, rawBody)
  → Signature verification (service-specific — secrets stay on daemon)
  → TriggerAction dispatch:
      ├─ type: "shell" → spawnSync(command) with TRIGGER_EVENT env
      └─ type: "agent" → runAgent() with payload context
  → Update run_count, error_count in SQLite
  → Notify admin via Telegram (if configured)
  → Auto-disable on 5 consecutive errors or max_runs
```

**Direct mode** (self-hosted with JERIKO_PUBLIC_URL):
```
External service POST → https://my-tunnel.example.com/hooks/:triggerId
  → Daemon HTTP server receives directly (no relay)
  → Same TriggerEngine.handleWebhook() flow as above
```

### OAuth Callback (via Relay)

```
Provider redirects browser → https://bot.jeriko.ai/oauth/:userId/:provider/callback?code=...&state=...
  → Relay server receives GET request
  → Looks up userId in connections map
  → Forwards {type:"oauth_callback", provider, params, requestId} over WebSocket
  → Daemon relay client receives callback
  → Daemon performs token exchange locally (secrets stay on daemon)
  → Daemon sends {type:"oauth_result", requestId, statusCode, html} over WebSocket
  → Relay returns HTML to browser
```

### Channel Message → Agent

```
Telegram/WhatsApp message received
  → ChannelAdapter.onMessage(handler)
  → Channel Router:
      ├─ Slash command? → handle locally (/stop, /model, /new, etc.)
      └─ Free text → runAgent() with session context
  → Stream response:
      → sendTyping() every 4 seconds
      → editMessage() every 1 second (debounced)
      → Final message on completion
  → File attachments: download → prepend path to prompt
  → Response files: detect paths → sendPhoto/sendDocument
```
