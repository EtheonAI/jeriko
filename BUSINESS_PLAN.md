# JerikoBot — Technical Business Plan

**Version:** 1.0
**Date:** February 23, 2026
**Author:** Khaleel Musleh — Etheon
**Classification:** Confidential

---

## 1. Executive Summary

JerikoBot is a **unified CLI toolkit that gives any AI model full control over any machine** through structured Unix commands. Instead of building proprietary tool abstractions (like MCP servers, OpenAI plugins, or runtime functions), JerikoBot exposes machine capabilities as composable CLI commands with standardized JSON output — consumable by Claude, GPT, Gemini, Llama, or any future AI model.

**The thesis:** The operating system is the only runtime AI agents need. Every capability — files, browser, camera, email, calendar, contacts, audio, messaging, notifications, shell access — is a command. Any AI that can execute a command can control the machine. No runtime. No framework. No lock-in.

**Market position:** No competitor occupies this space. 30+ projects analyzed. Every existing solution either bundles the AI inside (OpenClaw, Open Interpreter, Goose) or covers only one domain (agent-browser, Pantalk, Composio). Nobody has built a unified, model-agnostic CLI toolkit designed for AI agent consumption.

**Market timing:** The "CLI vs MCP" debate exploded in February 2026. Industry consensus is shifting toward CLI as the agent interface — 35x more token-efficient than tool schemas, zero lock-in, infinite extensibility via the Unix ecosystem. Every major AI company (Anthropic, OpenAI, Google, Cognition, Cursor, Windsurf) already converged on shell execution as their primary agent mechanism.

**Projected market:** Agentic AI — $7.84B in 2025, projected $52.62B by 2030 (Gartner: 40% of enterprise apps will feature AI agents by 2026).

---

## 2. Problem Statement

### The Current State (Broken)

Every AI company builds its own tool layer:

```
Anthropic → tool_use { name: "read", input: { path: "/file" } }
OpenAI    → function_call { name: "read", arguments: "{\"path\":\"/file\"}" }
Google    → functionCall { name: "read", args: { path: "/file" } }
```

Three schemas. Three runtimes. Three tool registries. Every capability reimplemented per platform. Every third-party integration rebuilt for each ecosystem.

**Problems this creates:**

1. **Vendor lock-in** — Tools built for Claude don't work with GPT or Gemini
2. **Token waste** — 30,000-60,000 tokens consumed by tool schemas per turn (measured)
3. **Duplication** — Every framework rebuilds read, write, exec, browse
4. **Fragmentation** — Companies must build separate integrations for each AI platform (MCP server for Claude, plugin for GPT, extension for Gemini)
5. **Complexity** — Tool runtimes add 50+ dependencies, TypeScript builds, persistent daemons
6. **Limited reach** — Only capabilities someone built a tool for are available

### What JerikoBot Solves

```
Any AI model → jeriko <command> → JSON output → done
```

One interface. Every model. Every capability. Zero runtime overhead. The OS provides everything.

---

## 3. Product Definition

### What JerikoBot Is

A CLI toolkit of 20+ commands (and growing) that exposes machine capabilities through a standardized JSON interface:

**Output contract:**
```json
{ "ok": true, "data": { ... } }     // Success → stdout, exit 0
{ "ok": false, "error": "..." }     // Error → stderr, exit 1-7
```

**Semantic exit codes:**
```
0 = Success
1 = General error
2 = Network error
3 = Authentication error
5 = Not found
7 = Timeout
```

### Current Command Set (v1.0)

| Category | Commands | Capabilities |
|----------|----------|-------------|
| **System** | `sys`, `screenshot`, `location` | CPU/RAM/disk/battery, display capture, geolocation |
| **Files** | `fs` | list, read, write, append, find, grep, info |
| **Shell** | `exec` | Run any program with timeout and cwd |
| **Web** | `search`, `browse` | DuckDuckGo search, Playwright browser automation |
| **Communication** | `notify`, `msg`, `email` | Telegram notifications, iMessage, IMAP email |
| **Media** | `camera`, `audio`, `music`, `screenshot` | Webcam, mic, TTS, volume, Music/Spotify control |
| **Productivity** | `notes`, `remind`, `calendar`, `contacts` | Apple Notes, Reminders, Calendar, Contacts |
| **Utility** | `clipboard`, `location` | System clipboard, IP geolocation |

**20 commands. ~2,000 lines of core code. 15 dependencies.**

### Architecture

```
bin/
  jeriko              # Dispatcher: jeriko <cmd> → spawns bin/jeriko-<cmd>
  jeriko-sys          # Each command is an independent executable
  jeriko-fs           # Parses flags, calls tools/*.js, outputs JSON
  jeriko-exec         # Exits with semantic code
  jeriko-browse
  jeriko-notify
  jeriko-camera
  jeriko-email
  jeriko-notes
  jeriko-remind
  jeriko-calendar
  jeriko-contacts
  jeriko-clipboard
  jeriko-audio
  jeriko-music
  jeriko-msg
  jeriko-location
  jeriko-screenshot
  jeriko-search

lib/
  cli.js              # 83 lines: parseArgs, ok, fail, readStdin, run, EXIT codes

tools/
  *.js                # Library layer: reusable by CLI, Telegram bot, triggers

server/
  index.js            # Express server: health, API, WebSocket
  router.js           # AI connector: spawns model with system prompt
  telegram.js         # Telegram bot: commands + free-text → Claude
  whatsapp.js         # WhatsApp integration
  websocket.js        # Remote agent protocol
  auth.js             # HMAC token generation/validation
  triggers/
    engine.js          # Cron, webhook, email, HTTP, file watch
    executor.js        # Claude or shell action execution
    store.js           # Persistent trigger storage
    webhooks.js        # POST /hooks/:id receiver
    pollers/email.js   # IMAP polling with deduplication

agent/
  agent.js            # 55-line remote node: WebSocket → Claude → commands
  install.sh          # One-liner remote machine setup
```

### The Three-Layer Design

```
Layer 1: CLI Commands (jeriko-*)
  Self-contained executables. JSON in, JSON out.
  Work from any terminal, any script, any AI model.

Layer 2: Tool Libraries (tools/*.js)
  Pure functions. No CLI concerns.
  Used by CLI, Telegram bot, triggers, future UIs.

Layer 3: Orchestration (server/*)
  AI connectors, messaging, triggers, multi-machine.
  The glue between AI models, channels, and commands.
```

---

## 4. Market Analysis

### Competitive Landscape

**30+ projects analyzed. No direct competitor.**

#### Category 1: AI Agents (brain + tools bundled)

| Product | What it is | Why it's not JerikoBot |
|---------|-----------|----------------------|
| OpenClaw | Personal AI assistant, 217K GitHub stars | Tools locked inside runtime. CLI is for humans, not AI consumption. Monolithic. |
| Open Interpreter | LLM that generates/executes code | IS the agent, not a toolkit. No structured output. No triggers. No mobile. |
| Goose (Block/AAIF) | Open-source AI agent framework | Agent-first, extends via MCP servers. Not a CLI toolkit. |
| Manus (Meta) | Cloud AI agent with Telegram | Proprietary, cloud-only. Not self-hosted. Not a toolkit. |
| Claude Code | Anthropic's CLI agent (this product) | Runtime with built-in tools. Tools not portable. |
| Codex CLI | OpenAI's terminal agent | Shell agent in sandbox. Not a toolkit for other agents. |
| Devin | Autonomous coding agent | Proprietary cloud agent. Not a toolkit. |

#### Category 2: Single-Domain Tools (partial overlap)

| Product | Domain | Missing |
|---------|--------|---------|
| agent-browser (Vercel) | Browser automation only | No sys/fs/exec/search/notify/camera/email/audio |
| Pantalk | Messaging only | No system operations at all |
| Composio | Cloud API integrations only | No local machine operations |
| E2B | Execution sandbox only | No tool commands, just infrastructure |
| Codehooks | Serverless backend only | No local operations |
| Frankenterm | Terminal pane management only | No machine control commands |

#### Category 3: JerikoBot (the gap)

```
Unified CLI toolkit:
  sys + fs + exec + browse + search + screenshot +
  notify + camera + email + notes + remind + calendar +
  contacts + clipboard + audio + music + msg + location

  + Structured JSON output standard
  + Model-agnostic (any LLM)
  + Composable via Unix pipes
  + Autonomous triggers (cron/webhook/email/HTTP/file)
  + Multi-machine orchestration
  + Mobile access (Telegram/WhatsApp)

  NOBODY IS HERE.
```

### Market Validation

**Industry trend (February 2026):**

- OneUptime: "CLI is the New MCP for AI Agents"
- Jannik Reinhard: "CLI tools achieved 35x token reduction vs MCP"
- rentierdigital: "MCP ate 40% of my context window for something done with a one-liner"
- Cobus Greyling: "Replace MCP with CLI — six integration layers collapse into one"
- Dead Neurons: "Companies should ship CLIs, not MCPs"
- InfoQ: "Keep the Terminal Relevant: Patterns for AI Agent-Driven CLIs"
- shareAI-lab: Rebuilt Claude Code in 50 lines with a single bash tool

**Major player convergence:** Anthropic (Claude Code), OpenAI (Codex CLI), Google (Jules), Cognition (Devin), Cursor, Windsurf — all use shell execution as primary mechanism.

**Market size:** Agentic AI projected at $52.62B by 2030 (source: Fluid AI industry analysis).

### Target Users

**Phase 1 — Developers & Power Users:**
- Individual developers who want AI-controlled machines
- DevOps engineers managing multi-machine infrastructure
- AI researchers experimenting with autonomous agents

**Phase 2 — Teams & Small Companies:**
- Startups using AI for automation (monitoring, alerting, deployment)
- Development teams with multi-machine setups
- Freelancers who want AI assistants accessible from mobile

**Phase 3 — Enterprise & Platform:**
- Companies building AI agents on top of JerikoBot
- SaaS providers shipping CLIs following the JerikoBot standard
- Platform integrators connecting multiple AI models to machine infrastructure

---

## 5. Technical Architecture (Deep)

### The Output Standard

Every `jeriko` command follows this contract:

```
STDOUT (success):
  {"ok":true,"data":<any JSON value>}

STDERR (error):
  {"ok":false,"error":"<human-readable error message>"}

STDERR (signals):
  SCREENSHOT:/absolute/path/to/file.png
  FILE:/absolute/path/to/file.ext

EXIT CODES:
  0  Success
  1  General error
  2  Network error (ENOTFOUND, ECONNREFUSED, fetch failed)
  3  Auth error (401, 403, unauthorized)
  5  Not found (ENOENT, no such file)
  7  Timeout (ETIMEDOUT, deadline exceeded)
```

### The Shared Infrastructure (lib/cli.js — 83 lines)

```javascript
parseArgs(argv)       // --flag value → { flags: {flag: "value"}, positional: [...] }
ok(data)              // JSON to stdout, exit 0
fail(error, code)     // JSON to stderr, exit with semantic code
readStdin(timeout)    // Read piped input, null if TTY
run(asyncFn)          // Wrap main with error→exit code mapping
EXIT                  // { OK:0, GENERAL:1, NETWORK:2, AUTH:3, NOT_FOUND:5, TIMEOUT:7 }
```

### The Dispatcher (bin/jeriko)

```
jeriko <cmd> [flags] [args]
  ↓
  Reads cmd from argv[2]
  Resolves bin/jeriko-<cmd>
  Spawns child process: node bin/jeriko-<cmd> [flags] [args]
  Inherits stdio (pipes work transparently)
  Forwards exit code
```

### Command Anatomy (standard pattern)

```javascript
// bin/jeriko-<cmd> — typically 15-30 lines
const { parseArgs, ok, fail, readStdin, run } = require('../lib/cli');
const { doThing } = require('../tools/<cmd>');

run(async () => {
  const { flags, positional } = parseArgs(process.argv);
  const input = positional[0] || await readStdin();
  if (!input && !flags.someFlag) fail('Usage: jeriko <cmd> <input>');
  ok(await doThing(input, flags));
});
```

### AI Connector Architecture

```
                    ┌──────────────────────┐
                    │    TRIGGER ENGINE     │
                    │  cron · webhook ·     │
                    │  email · http · file  │
                    └──────────┬───────────┘
                               │ fires autonomously
┌──────────┐                   │
│ Telegram  │──┐               │
│ WhatsApp  │──┤               │
│ Future    │──┤     ┌─────────▼──────────┐
└──────────┘  ├────▶│   JERIKOBOT ROUTER   │
               │     │                      │
               │     │  @local → connector  │
               │     │  @node1 → WebSocket  │
               │     │  @node2 → WebSocket  │
               │     └─────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                 ▼
        ┌──────────┐   ┌──────────┐      ┌──────────┐
        │  LOCAL    │   │  NODE 1  │      │  NODE 2  │
        │ connector │   │ connector│      │ connector│
        │ + jeriko  │   │ + jeriko │      │ + jeriko │
        └──────────┘   └──────────┘      └──────────┘

Connectors (pluggable):
  claude.js  — spawns claude CLI
  openai.js  — OpenAI API with exec function
  gemini.js  — Gemini API with exec function
  ollama.js  — local model with exec function
```

### Multi-Machine Protocol

```
PROXY SERVER                    REMOTE NODE
─────────────                   ───────────
WebSocket server ◄──────────── WebSocket client (agent.js, 55 lines)
  │                              │
  │  { taskId, command }  ──►   │  spawn('claude', ['-p', command])
  │                              │
  │  ◄──  { taskId,             │  stdout.on('data', ...)
  │        type: 'chunk',        │
  │        data: '...' }         │
  │                              │
  │  ◄──  { taskId,             │  proc.on('close', ...)
  │        type: 'result' }      │

Auth: HMAC-SHA256 token per node name
Heartbeat: ping/pong every 30s
Timeout: 5 minutes per task
Reconnect: exponential backoff 1s→30s
```

### Trigger Engine Architecture

```
TRIGGER TYPES:

  CRON         → croner library, fires on schedule
  WEBHOOK      → POST /hooks/:id, signature verification (GitHub/Stripe/HMAC)
  EMAIL        → IMAP polling, deduplication by UID
  HTTP_MONITOR → periodic fetch, fires on status change
  FILE_WATCH   → fs.watch(), optional pattern filtering

EXECUTION FLOW:

  Event fires
    ↓
  engine.fireTrigger(trigger, eventData)
    ↓
  buildPrompt(trigger, eventData)  → combines event context + trigger action
    ↓
  executeAction(trigger, prompt)   → spawns AI model (Claude or shell)
    ↓
  store.logExecution(id, result)   → appends to data/trigger-log.json
    ↓
  notifyUser(trigger, result)      → Telegram message + macOS notification
    ↓
  Update trigger state (runCount, lastRunAt, lastStatus, consecutiveErrors)
    ↓
  Auto-disable on 5 consecutive errors

STORAGE:
  data/triggers.json     → trigger definitions (JSON, persistent)
  data/trigger-log.json  → execution history (last 500 entries)
```

---

## 6. The JerikoBot Standard (v1.0)

The core intellectual property — the specification that companies and developers follow to make their CLIs AI-consumable:

### 6.1 Output Format

```
All commands MUST output JSON to stdout on success:
  { "ok": true, "data": <any valid JSON> }

All commands MUST output JSON to stderr on error:
  { "ok": false, "error": "<human-readable message>" }
```

### 6.2 Exit Codes

```
0  Success — operation completed
1  General — unclassified error
2  Network — DNS, connection, fetch failures
3  Auth — unauthorized, forbidden, invalid credentials
5  Not found — file, resource, endpoint missing
7  Timeout — operation exceeded time limit
```

### 6.3 Input Convention

```
Flags:         --flag value (key-value), --flag (boolean)
Positional:    jeriko <cmd> <arg1> <arg2>
Stdin:         echo "data" | jeriko <cmd> (piped input)
Priority:      flags > positional > stdin
```

### 6.4 Signal Protocol

```
Media signals on stderr (not stdout, to preserve JSON pipe):
  SCREENSHOT:<absolute-path>   → image file created
  FILE:<absolute-path>         → file created for delivery
```

### 6.5 Discovery

```
jeriko --help           → list all available commands
jeriko <cmd> --help     → usage, flags, examples (machine-readable JSON)
jeriko discover         → auto-generate system prompt from all installed commands
```

### 6.6 Composability

```
Commands MUST be composable via Unix pipes:
  jeriko search "topic" | jeriko notify
  jeriko sys --battery | jeriko notify --message -

Commands MUST be independently executable:
  node bin/jeriko-sys --info    → works without dispatcher
```

---

## 7. Security Plan

### Threat Model

```
TRUST BOUNDARY: The AI model is semi-trusted.
  If the model is compromised (jailbreak/injection), it has machine access.
  This is the same threat model as Claude Code, Codex CLI, Jules, and Devin.

ATTACKER VECTORS:
  1. Prompt injection via user input or webhook payload
  2. Telegram bot token compromise
  3. Unauthenticated webhook triggering
  4. Environment variable leakage to child processes
  5. Command injection via unsanitized inputs
```

### Security Controls (Implementation Plan)

#### Critical (Before Public Release)

| Control | Implementation | Status |
|---------|---------------|--------|
| Strong default secret | Generate random NODE_AUTH_SECRET on first run if unset | TODO |
| Mandatory admin IDs | Refuse to start if ADMIN_TELEGRAM_IDS is empty | TODO |
| Environment stripping | Remove secrets (API keys, tokens) from child process env | TODO |
| Command injection fix | Use spawn() with args array, not string interpolation in files.js | TODO |
| HTTPS enforcement | Require TLS for production deployments | TODO |

#### High Priority (Week 1)

| Control | Implementation |
|---------|---------------|
| Rate limiting | Per-user command throttle (10/min Telegram, 5/min webhooks) |
| Webhook auth mandatory | Require signature verification on all webhook triggers |
| UUID trigger IDs | Replace 32-bit hex with 128-bit UUIDs |
| Audit logging | Append every command to data/audit.jsonl with user, timestamp, result |
| Output sanitization | Strip known secret patterns from logs and outputs |

#### Medium Priority (Month 1)

| Control | Implementation |
|---------|---------------|
| Docker sandboxing | Optional: run `jeriko exec` inside containers |
| Permission profiles | `--profile minimal\|coding\|full` restricts available commands |
| Browser isolation | Don't seed with real Chrome profile by default |
| Approval gates | High-risk commands (rm, kill, shutdown) require user confirmation |
| Token rotation | Node tokens include timestamp, expire after configurable TTL |

### Security Philosophy

```
Personal use (your machine):     Current security + critical fixes = sufficient
Multi-user (shared machines):    Add Docker sandboxing + permission profiles
Production (internet-facing):    Add all controls + HTTPS + audit logging + rate limiting
Enterprise:                      All of the above + SSO + RBAC + compliance logging
```

---

## 8. Development Roadmap

### Phase 1: Foundation (Weeks 1-2) — CURRENT

**Goal:** Ship the core CLI with 20+ commands and critical security fixes.

```
Tasks:
  [x] Core CLI infrastructure (lib/cli.js)
  [x] Dispatcher pattern (bin/jeriko)
  [x] System commands: sys, screenshot, location
  [x] File commands: fs (ls, cat, write, find, grep, info)
  [x] Shell: exec
  [x] Web: search, browse
  [x] Communication: notify (Telegram), msg (iMessage), email (IMAP)
  [x] Media: camera, audio, music
  [x] Productivity: notes, remind, calendar, contacts, clipboard
  [x] Server: Express + Telegram bot + WhatsApp
  [x] Multi-machine: WebSocket agents
  [x] Triggers: cron, webhook, email, HTTP, file watch
  [ ] Security hardening (critical fixes)
  [ ] Auto-generated system prompt (jeriko discover)
  [ ] Session memory (auto-log + inject recent history)
```

### Phase 2: Multi-Model & Standard (Weeks 3-4)

**Goal:** Prove model-agnostic works. Publish the standard.

```
Tasks:
  [ ] OpenAI connector (connectors/openai.js)
  [ ] Gemini connector (connectors/gemini.js)
  [ ] Ollama connector (connectors/ollama.js)
  [ ] jeriko discover — auto-generate system prompt from installed commands
  [ ] jeriko <cmd> --help — machine-readable JSON usage
  [ ] Publish JerikoBot Output Standard v1.0
  [ ] Demo: same task executed by Claude, GPT, Gemini, local Llama
  [ ] jeriko memory — persistent key-value + text search
```

### Phase 3: Ecosystem (Weeks 5-8)

**Goal:** Enable third-party command creation. Grow the toolkit.

```
Tasks:
  [ ] @jerikobot/cli-sdk — npm package for building commands
  [ ] Plugin system: npm install -g jeriko-<name> → auto-discovered
  [ ] More trigger types: RSS, Slack events, Discord events, database changes
  [ ] More notification channels: Discord, Slack, email SMTP, push notifications
  [ ] jeriko monitor — unified monitoring command (HTTP, file, process)
  [ ] jeriko git — Git operations with JSON output
  [ ] jeriko docker — Container management with JSON output
  [ ] jeriko ssh — Remote command execution with JSON output
  [ ] Windows support: shell.js platform detection, PowerShell/cmd.exe
```

### Phase 4: Platform (Weeks 9-16)

**Goal:** Become the standard for AI-consumable CLIs.

```
Tasks:
  [ ] jeriko cloud — AWS/GCP/Azure operations
  [ ] jeriko db — Database queries with JSON output
  [ ] jeriko api — HTTP client with auth management
  [ ] Cross-machine piping: @node1 jeriko sys | @node2 jeriko notify
  [ ] Agent marketplace: community-built commands
  [ ] Web dashboard for trigger management
  [ ] SDK for other languages (Python, Go, Rust)
  [ ] Enterprise features: SSO, RBAC, compliance logging
  [ ] Sandbox modes: Docker, Firecracker microVM
```

### Phase 5: Scale (Months 5-12)

**Goal:** Industry adoption. Company partnerships. Revenue.

```
Tasks:
  [ ] Partner with SaaS companies to ship JerikoBot-compatible CLIs
  [ ] AI model fine-tuning dataset: jeriko command patterns
  [ ] Certification program: "JerikoBot Compatible" CLI badge
  [ ] Enterprise platform with managed infrastructure
  [ ] Mobile app (iOS/Android) as remote node
  [ ] Voice interface: speak commands, hear results
```

---

## 9. Revenue Model

### Open Core

```
FREE (Open Source — MIT):
  Core CLI (all commands)
  lib/cli.js infrastructure
  Trigger engine
  Multi-machine agents
  AI connectors (Claude, GPT, Gemini, Ollama)
  The JerikoBot Standard specification
  @jerikobot/cli-sdk

PAID (JerikoBot Pro):
  Hosted trigger management dashboard
  Cloud-hosted remote nodes (no self-hosting needed)
  Enterprise security (SSO, RBAC, audit logging, compliance)
  Priority support
  Custom command development
  SLA guarantees
```

### Potential Revenue Streams

| Stream | Model | Target |
|--------|-------|--------|
| **JerikoBot Pro** | $29/mo individual, $99/mo team | Developers, small teams |
| **Enterprise** | Custom pricing | Companies with compliance requirements |
| **CLI SDK License** | Free (MIT) + paid support | Companies building compatible CLIs |
| **Marketplace** | Revenue share on premium commands | Third-party developers |
| **Consulting** | Hourly/project | Companies building AI agent infrastructure |
| **Certification** | One-time fee per CLI | SaaS companies wanting "JerikoBot Compatible" badge |

---

## 10. Go-to-Market Strategy

### Phase 1: Developer Adoption

```
1. Open source on GitHub (MIT license)
2. npm install -g jerikobot
3. README with "5-minute quickstart"
4. Demo video: "Control your Mac from Telegram with AI"
5. Hacker News launch post
6. Dev.to / Medium technical articles
7. Discord/Slack community
```

### Phase 2: Content & Positioning

```
1. "The JerikoBot Standard" — publish as specification
2. "CLI vs MCP" comparison articles (ride the trend)
3. "Why Unix is the AI Agent Runtime" — technical deep dive
4. Conference talks: "Building the Command Layer for AI Agents"
5. YouTube tutorials: per-command walkthroughs
6. Twitter/X threads on CLI-first AI architecture
```

### Phase 3: Ecosystem Growth

```
1. Partner with CLI-heavy companies (Stripe, GitHub, Vercel)
2. Publish @jerikobot/cli-sdk on npm
3. Community command marketplace
4. "JerikoBot Compatible" certification for third-party CLIs
5. Integration guides for popular AI frameworks
```

### Phase 4: Enterprise

```
1. SOC 2 compliance path
2. Enterprise security features (SSO, RBAC, audit)
3. Managed hosting option
4. Dedicated support tiers
5. Custom development partnerships
```

---

## 11. Technical Differentiators (Why We Win)

### 1. Token Efficiency

```
OpenClaw/MCP: ~145,000 tokens per task (tool schemas)
JerikoBot:    ~4,150 tokens per task (command descriptions)

35x more efficient. This directly translates to:
  - Faster responses
  - Lower API costs
  - More context for actual reasoning
  - Longer conversations before context exhaustion
```

### 2. Zero Lock-In

```
Commands work with:
  - Claude Code (now)
  - GPT via function calling (connector)
  - Gemini via function declarations (connector)
  - Ollama / local models (connector)
  - Any future model with exec capability
  - Bash scripts (no AI needed)
  - CI/CD pipelines
  - Cron jobs
  - Other CLI tools via pipes
```

### 3. Infinite Extensibility

```
Every existing CLI tool is instantly available:
  brew install gh       → AI can manage GitHub repos
  brew install awscli   → AI can manage AWS infrastructure
  pip install stripe    → AI can process payments
  apt install ffmpeg    → AI can process video
  npm install -g vercel → AI can deploy websites

No plugins. No tool definitions. No rebuilds. Just install and use.
```

### 4. Lightweight Deployment

```
OpenClaw remote node:  Full Gateway daemon + 50 dependencies + TypeScript build
JerikoBot remote node: 55 lines of JavaScript + npm install

Deployed in seconds. Runs on anything with Node.js.
```

### 5. Autonomous Operation

```
5 trigger types fire without human intervention:
  Cron      → scheduled actions
  Webhook   → event-driven (Stripe, GitHub, any service)
  Email     → IMAP polling, process incoming mail
  HTTP      → monitor URLs, alert on changes
  File      → watch filesystem, react to modifications

Each trigger spawns a full AI reasoning loop → commands → notification.
True autonomy, not just scheduled reminders.
```

### 6. Training Data Advantage

```
AI models trained on billions of CLI interactions.
They already know: git, curl, docker, grep, ssh, etc.
Learning curve for jeriko: near zero (same patterns).

vs. OpenClaw tool schemas: never seen in training data.
Must be re-learned every conversation. 30K+ tokens of context wasted.
```

---

## 12. Risk Analysis

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Security breach via prompt injection** | Medium | Critical | Sandboxing, approval gates, env stripping |
| **AI companies build their own unified CLI** | Low | High | First-mover advantage, community ecosystem, published standard |
| **OpenClaw adds CLI-consumable interface** | Medium | Medium | Our CLI is native; theirs would be a wrapper. Architectural advantage. |
| **MCP becomes dominant standard** | Low (trend is away from MCP) | High | Support MCP as optional bridge, maintain CLI as primary |
| **Windows adoption limited** | Medium | Medium | WSL support now, native PowerShell support planned |
| **Enterprise security requirements unmet** | High (initially) | Medium | Phased security roadmap (Section 7) |
| **Model capabilities plateau** | Low | Low | CLI commands work regardless of model intelligence |
| **Competitor with VC funding** | Medium | Medium | Open source moat, community, standard specification |

---

## 13. Key Metrics

### North Star

**Number of AI agent invocations per day across all connected models.**

### Growth Metrics

| Metric | Phase 1 Target | Phase 2 Target | Phase 3 Target |
|--------|---------------|---------------|---------------|
| GitHub stars | 500 | 5,000 | 25,000 |
| npm installs/week | 100 | 1,000 | 10,000 |
| Active machines | 50 | 500 | 5,000 |
| Third-party commands | 0 | 20 | 200 |
| AI models supported | 1 (Claude) | 4 | 10+ |
| Trigger executions/day | 10 | 100 | 10,000 |
| Discord community | 50 | 500 | 5,000 |

---

## 14. Team Requirements

### Immediate (Phase 1-2)

```
1 Founder/Lead Developer (Khaleel Musleh)
  - Core CLI development
  - Architecture decisions
  - Community building
```

### Growth (Phase 3-4)

```
+ 1 Security Engineer       → Sandboxing, audit, compliance
+ 1 Frontend Developer      → Web dashboard, docs site
+ 1 Developer Advocate      → Content, community, partnerships
+ 1 Backend Engineer        → Enterprise features, scaling
```

### Scale (Phase 5)

```
+ Sales team (enterprise)
+ Support team
+ Additional engineers
+ Product manager
```

---

## 15. Conclusion

JerikoBot is the right product at the right time:

1. **The industry needs it** — every major AI company converged on shell execution, but nobody built the unified command layer
2. **The market validates it** — Feb 2026 articles overwhelmingly favor CLI over MCP/tool schemas
3. **No competitor exists** — 30+ projects analyzed, zero occupy this space
4. **The architecture is proven** — Unix philosophy, 50 years of battle-testing
5. **The ecosystem is free** — thousands of existing CLIs work immediately
6. **The moat is deep** — published standard + community + first-mover advantage

**The operating system is the only runtime AI agents need. JerikoBot proves it.**

---

*JerikoBot — Build the OS. Not the app.*

*Etheon — 2026*
