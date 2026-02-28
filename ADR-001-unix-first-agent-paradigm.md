# ADR-001: Unix-First Agent Paradigm vs Tool-Abstraction Architecture

**Status:** Proposed
**Date:** 2026-02-23
**Author:** Khaleel Musleh (Etheon)
**Subject:** Jeriko's Unix-command-only architecture vs OpenClaw's tool-abstraction architecture for autonomous AI agents

---

## Context

Two competing paradigms are emerging for how AI agents interact with machines:

1. **Tool Abstraction Model** (OpenClaw): Define typed tool functions (`AgentTool<Input, Output>`) with JSON Schema, policy gates, and an orchestration runtime. The LLM calls tools through a structured API layer.

2. **Unix Command Model** (Jeriko): Expose all capabilities as CLI commands with JSON stdout, semantic exit codes, and stdin piping. The LLM executes shell commands through a system prompt listing available commands.

This ADR analyzes both approaches and argues for Jeriko's Unix-first paradigm as a superior foundation for autonomous machine agents.

---

## Detailed Analysis of Both Systems

### OpenClaw: What It Is

OpenClaw is a **full personal AI assistant platform** built in TypeScript (~50K+ lines). Its architecture:

```
User (Telegram/Discord/Slack/WhatsApp/...)
  → Gateway (WebSocket control plane)
    → Session (conversation state + vector memory)
      → Pi Agent RPC (reasoning loop)
        → Tool Executor (policy check → run → return)
          → 100+ tools (exec, read, write, browser, canvas, messaging, cron, ...)
```

**Core abstractions:**

| Layer | Purpose |
|-------|---------|
| `AgentTool<I, O>` | Typed tool definition with JSON Schema input/output |
| `ToolPolicy` | Profile-based allow/deny (minimal, coding, messaging, full) |
| `Session` | Long-lived conversation state with memory |
| `Gateway` | WebSocket RPC server routing messages to agents |
| `Plugins` | npm-based extension system adding tools/commands/skills |
| `Skills` | Markdown instruction files teaching the agent workflows |
| `Sandbox` | Docker container isolation for exec |

**What OpenClaw does well:**
- Multi-channel messaging (10+ platforms)
- Vector memory with hybrid search (BM25 + embeddings)
- Plugin ecosystem (40+ extensions)
- Subagent spawning (parallel tasks)
- Tool security (per-model policy, approval gates, sandboxing)
- macOS/iOS/Android native apps as device nodes
- Extensive system prompt assembly (identity, skills, memory, workspace, safety)

**What OpenClaw requires:**
- Node.js 22+, pnpm, TypeScript
- 50+ npm dependencies including `pi-agent-core`, `pi-coding-agent`
- Docker (for sandbox mode)
- Gateway daemon running persistently
- Interactive wizard for setup
- Per-tool policy configuration

### Jeriko: What It Is

Jeriko is a **Unix-native agent toolkit** built in plain JavaScript (~2K lines of core). Its architecture:

```
User (Telegram/WhatsApp/CLI)
  → Router (spawns claude with system prompt listing commands)
    → Claude Code (reads prompt, decides what to run)
      → jeriko <cmd> [flags] [args]
        → JSON stdout / semantic exit codes / stderr signals
```

**Core abstractions:**

| Layer | Purpose |
|-------|---------|
| `jeriko <cmd>` | Single-responsibility CLI command |
| JSON stdout | Universal machine-readable output |
| Exit codes | Semantic status (0=ok, 2=network, 3=auth, 5=notfound, 7=timeout) |
| Stdin pipes | Composability between commands |
| System prompt | Lists available commands — that's the entire "tool registry" |

**What Jeriko does well:**
- Zero abstraction between agent and machine — commands are the interface
- Every capability is independently testable from any shell
- Piping composes behaviors without code: `jeriko sys | jeriko notify`
- Remote agents run the same CLI on remote machines via WebSocket
- Reactive triggers (cron, webhook, email, http, file watch)
- Persistent browser profiles across sessions
- Under 2K lines for the entire tool layer

---

## The Core Philosophical Difference

### OpenClaw: Tools as Application-Layer Functions

```typescript
// OpenClaw tool definition (simplified)
const readTool: AgentTool<{ path: string }, { content: string }> = {
  name: "read",
  description: "Read a file",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path" }
    },
    required: ["path"]
  },
  handler: async ({ path }) => {
    const content = await fs.readFile(path, "utf-8");
    return { content };
  }
};
```

The model calls `read({ path: "/etc/hosts" })` through a typed function interface. The runtime validates input, checks policy, executes the handler, and returns structured output.

**This is RPC.** The agent speaks a proprietary protocol to a proprietary runtime.

### Jeriko: Commands as the Universal Interface

```bash
jeriko fs --cat /etc/hosts
# stdout: {"ok":true,"data":{"content":"127.0.0.1 localhost\n..."}}
# exit: 0
```

The model runs `jeriko fs --cat /etc/hosts` in a shell. It reads JSON from stdout. It checks the exit code.

**This is Unix.** The agent speaks the same language as every other program on the machine.

---

## Why Unix Commands Win for Autonomous Agents

### 1. No Runtime Lock-In

| | OpenClaw | Jeriko |
|--|----------|-----------|
| **Agent must run inside** | Pi Agent RPC runtime | Any shell |
| **Tool definitions live in** | TypeScript source code | The filesystem (binaries) |
| **Adding a capability requires** | Writing a TypeScript tool + registering + rebuilding | Dropping a script in PATH |
| **Works with** | OpenClaw's agent loop only | Claude Code, GPT, Gemini, any LLM with shell access |

OpenClaw's tools are **bound to its runtime**. If you want to use OpenClaw's browser tool from a different agent framework, you can't — it's a TypeScript function inside `pi-agent-core`'s execution loop.

Jeriko's commands work with **anything that can spawn a process**. Claude Code, a Python script, a Go binary, a cron job, another LLM runtime — they all speak shell.

### 2. Composability Is Free

OpenClaw composes tools through **agent reasoning**: the LLM decides to call tool A, reads the result, then calls tool B. Every composition step costs tokens and latency.

Jeriko composes through **pipes**:

```bash
# OpenClaw: Agent calls search tool, reads result, calls message tool (2 LLM turns)
# Jeriko: One shell command, zero LLM turns
jeriko search "weather in NYC" | jeriko notify
```

Pipes are **zero-cost composition**. The agent can choose to pipe (no reasoning needed) or to reason between steps (when logic is required). OpenClaw forces reasoning for every composition.

### 3. Testability and Debuggability

Every Jeriko capability is testable from a terminal:

```bash
# Test the tool directly
jeriko sys --battery
# {"ok":true,"data":{"percent":87,"charging":true}}

# Test the pipe
jeriko sys --battery | jeriko notify
# Sends battery status to Telegram

# Test error handling
jeriko fs --cat /nonexistent
# stderr: {"ok":false,"error":"ENOENT: no such file"}
# exit: 5
```

OpenClaw tools require the agent runtime to test. You can't run `openclaw-read /etc/hosts` from bash — the tool only exists inside the TypeScript process.

### 4. The Machine Already Has Tools

A Linux/macOS machine already ships with hundreds of capable programs: `curl`, `git`, `docker`, `ffmpeg`, `python`, `jq`, `ssh`, `rsync`. OpenClaw wraps some of these in TypeScript tool definitions. Jeriko's `jeriko exec` makes them **all** available immediately.

More importantly: any new capability added to the system (a new CLI tool installed via `apt`, `brew`, `npm -g`) is **instantly available** to a Jeriko agent. OpenClaw would need a new tool definition, rebuild, and restart.

### 5. Multi-Machine Is Natural

Jeriko's remote agent protocol is elegant because commands are self-contained:

```
Telegram → Proxy → WebSocket → Remote Agent → claude → jeriko <cmd> → JSON → WebSocket → Proxy → Telegram
```

The remote agent runs the **exact same commands** as the local machine. No special remote tool variants. No RPC serialization beyond the shell command string and JSON output.

OpenClaw's remote execution requires its full Gateway + Agent runtime on every node, or uses `system.run` on device nodes (macOS/iOS/Android apps) — a much heavier deployment.

### 6. Size and Complexity

| Metric | OpenClaw | Jeriko |
|--------|----------|-----------|
| Core tool code | ~15,000 lines (TypeScript) | ~800 lines (JavaScript) |
| Dependencies | 50+ npm packages | 12 npm packages |
| Setup | Interactive wizard + daemon + config | `npm install` + `.env` |
| Configuration | 200+ config keys in JSON5 | 8 env vars in `.env` |
| Runtime requirements | Node 22+, pnpm, TypeScript build, Gateway daemon | Node 18+, `npm start` |

Jeriko is **20x smaller** for comparable core functionality. This isn't a weakness — it's the point. Unix tools are small because the OS provides the runtime.

---

## What OpenClaw Has That Jeriko Should Study (Not Copy)

### Worth Adopting (as Unix commands, not abstractions)

| OpenClaw Feature | Jeriko Equivalent |
|------------------|---------------------|
| Memory search (vector + BM25) | `jeriko memory --search "query"` — a new command wrapping sqlite-vec |
| Subagent spawning | `jeriko agent --spawn "task"` — fork a new claude process with isolated context |
| Canvas/visual workspace | `jeriko canvas --push "data"` — serve a local HTML page the agent can update |
| Image generation | `jeriko image --prompt "..."` — wrap an API call in a command |
| TTS | `jeriko speak --text "..."` — wrap ElevenLabs/OpenAI TTS |
| Cron scheduling | Already exists in triggers — but could be `jeriko cron --add "0 9 * * *" "jeriko sys \| jeriko notify"` |

### Worth Studying (architectural patterns)

| Pattern | Value for Jeriko |
|---------|-------------------|
| **Tool policy profiles** | Could become `jeriko --profile minimal exec ...` — restrict what commands are available per agent context |
| **Session compaction** | Not applicable (Jeriko is stateless by design — state lives in the shell session) |
| **Plugin system** | `jeriko plugin install @user/tool` → drops a new `jeriko-<name>` binary in PATH |
| **Heartbeat protocol** | Useful for long-running remote tasks: `jeriko agent --heartbeat 30s` |
| **Approval gates** | `jeriko exec --approve "rm -rf /"` → prompts user before execution |

### NOT Worth Adopting

| OpenClaw Feature | Why Skip It |
|------------------|-------------|
| TypeScript tool definitions | The whole point is to avoid this |
| Gateway daemon | Jeriko's proxy server already handles routing |
| JSON Schema for tool inputs | CLI flags are the schema — `--help` is the documentation |
| Plugin manifest format | Unix already has a plugin system: PATH |
| Multi-provider model routing | That's the LLM runtime's job, not the tool layer's |
| SOUL.md / AGENTS.md / IDENTITY.md | The system prompt in `router.js` handles this |

---

## The Paradigm Argument

### OpenClaw's Worldview

> "AI agents need a structured runtime with typed tools, security policies, session management, and an orchestration layer."

This is the **application server** model. It mirrors how web backends evolved: define endpoints, validate input, authorize, execute, respond. It works. It's proven. But it creates a **walled garden** — every capability must be purpose-built for the runtime.

### Jeriko's Worldview

> "AI agents need a machine with a shell. Everything else is a command."

This is the **operating system** model. It mirrors how Unix evolved: small programs, text streams, composition via pipes, the filesystem as the universal namespace. It works. It's proven. And it creates an **open ecosystem** — any program on the machine is a capability.

### The Historical Precedent

This is the same debate as **monolithic application vs Unix pipeline**:

```
# Monolithic (OpenClaw)
PhotoEditor.open("image.png").resize(800,600).convert("jpg").save("out.jpg")

# Unix (Jeriko)
convert image.png -resize 800x600 out.jpg
```

The monolithic approach has better type safety, integrated UX, and richer features. The Unix approach is more composable, more interoperable, and survives longer because it doesn't couple capabilities to a specific runtime.

**Every successful computing platform converged on the Unix model eventually.** Docker containers run shell commands. Kubernetes pods execute binaries. CI/CD pipelines are shell scripts. GitHub Actions are shell steps. Even OpenClaw's `exec` tool — its most powerful tool — is just a shell command runner.

The question isn't whether agents will use shell commands. They already do. The question is whether the shell command **is the primary interface** (Jeriko) or a **fallback escape hatch** (OpenClaw).

---

## Jeriko's Architecture: What Makes It Good

### 1. The Dispatcher Pattern

```
jeriko <cmd> → spawns bin/jeriko-<cmd> → calls tools/<cmd>.js → JSON stdout
```

This is the `git` model. `git` is a dispatcher for `git-commit`, `git-push`, `git-log`. Each subcommand is independently executable. Jeriko does the same thing, and it means:

- New commands = new files in `bin/` (no registration, no rebuilding)
- Each command is a separate process (isolation, no shared state corruption)
- Piping works because stdio flows naturally between processes

### 2. The Three-Layer Separation

```
bin/jeriko-*   → CLI interface (flags, JSON output, exit codes)
tools/*.js     → Library logic (reusable by Telegram, triggers, future UIs)
server/*.js    → Orchestration (routing, messaging, triggers)
```

The tools layer is **independent of the CLI**. Telegram bot handlers call the same functions. Triggers call the same functions. A future web UI would call the same functions. The CLI is just one interface.

### 3. The System Prompt as Tool Registry

```javascript
// server/router.js
const SYSTEM_PROMPT = `You are Jeriko...
jeriko sys --info
jeriko screenshot
jeriko browse --navigate <url>
...`;
```

No JSON Schema. No tool registration API. The LLM reads a text description of available commands and uses them. This works because:

- LLMs are better at understanding text descriptions than JSON Schema
- Adding a command = adding a line to the prompt
- The prompt **is** the documentation
- The same prompt works for Claude, GPT, Gemini — any model

### 4. Remote Agents Are Lightweight

```bash
# Remote machine needs:
# 1. Node.js
# 2. Claude Code CLI
# 3. Jeriko repo
# 4. A WebSocket URL + token

# That's it. Same commands, same capabilities, same interface.
```

OpenClaw's remote nodes need the full Gateway runtime or purpose-built native apps (SwiftUI for macOS, Kotlin for Android). Jeriko's remote agent is **55 lines of JavaScript**.

### 5. Triggers as Event → Command Mapping

```
Event (cron tick, webhook POST, email arrival, file change, HTTP status)
  → Claude invocation with event context
    → jeriko commands as needed
      → jeriko notify to report results
```

This is **event-driven Unix**: events trigger command pipelines. No custom automation framework — just shell commands orchestrated by an LLM.

---

## What Jeriko Should Build Next (Roadmap Implications)

Based on this analysis, Jeriko's growth should stay on the Unix path:

### Phase 1: Strengthen the Core

| Command | Purpose |
|---------|---------|
| `jeriko env` | Manage environment variables safely |
| `jeriko log` | Structured logging (append-only JSONL) |
| `jeriko auth` | Credential management (keychain integration) |
| `jeriko health` | Self-diagnostic (check deps, connectivity, auth) |

### Phase 2: Expand Capabilities (as commands)

| Command | Purpose |
|---------|---------|
| `jeriko memory --store "key" "value"` | Persistent key-value memory |
| `jeriko memory --search "query"` | Semantic search over stored memories |
| `jeriko image --generate "prompt"` | Image generation API wrapper |
| `jeriko speak --text "hello"` | Text-to-speech |
| `jeriko listen --file audio.mp3` | Speech-to-text |
| `jeriko api --get "url" --header "..."` | HTTP client with auth management |
| `jeriko git --status` | Git operations with JSON output |
| `jeriko docker --run "image"` | Container management |

### Phase 3: Multi-Agent Orchestration

| Command | Purpose |
|---------|---------|
| `jeriko agent --list` | List connected remote nodes |
| `jeriko agent --spawn "task"` | Fork a new Claude process |
| `jeriko agent --send node1 "command"` | Send task to remote node |
| `jeriko pipe --from node1 --to node2` | Cross-machine piping |

### Phase 4: The Agent OS

| Feature | How |
|---------|-----|
| Command discovery | `jeriko --list` shows all available commands (like `compgen -c`) |
| Permission profiles | `jeriko --profile safe exec "cmd"` — restrict dangerous operations |
| Audit log | All command invocations logged to JSONL (who, what, when, exit code) |
| Plugin system | `jeriko plugin install <npm-package>` → installs `jeriko-<name>` binary |

---

## Decision

**Jeriko's Unix-first, command-only architecture is the correct paradigm for autonomous AI agents.**

### Reasons:

1. **Universality** — Shell commands work with any LLM, any runtime, any language. Tool abstractions lock you into one ecosystem.

2. **Composability** — Pipes are free. Tool-to-tool composition through LLM reasoning is expensive (tokens + latency).

3. **Extensibility** — Adding a capability = adding a binary to PATH. No framework code, no registration, no rebuild.

4. **Testability** — Every capability is testable from a terminal by a human or a CI pipeline.

5. **Simplicity** — 800 lines of core tool code vs 15,000+. The OS is the runtime.

6. **Interoperability** — Every existing CLI tool on the machine is already a capability.

7. **Deployability** — Remote agents are 55 lines. The full system is 12 dependencies.

8. **Longevity** — Unix has been the computing substrate for 50 years. Tool abstraction frameworks come and go.

### Trade-offs Accepted:

| OpenClaw Advantage | Jeriko's Answer |
|-------------------|-------------------|
| Type safety on tool inputs | CLI flags + JSON output provide a contract; the LLM handles the rest |
| Granular security policies | Permission profiles on commands (Phase 4) |
| Rich plugin ecosystem | npm packages that install `jeriko-*` binaries |
| Multi-channel messaging | Already has Telegram + WhatsApp; channels are just message delivery |
| Vector memory | `jeriko memory` command (Phase 2) |
| Subagent orchestration | `jeriko agent --spawn` (Phase 3) |

---

## Conclusion

OpenClaw asks: *"How do we build a runtime that gives AI agents structured access to capabilities?"*

Jeriko asks: *"How do we give AI agents a machine?"*

The second question is better. An agent that can run commands on a machine can do anything that machine can do. An agent locked into a tool runtime can only do what someone built a tool for.

Jeriko isn't a simpler OpenClaw. It's a **different category**: an agent OS, not an agent application. The Unix philosophy — small tools, text streams, composition — is the right foundation for machines that think.

**Build the OS. Not the app.**

---

## References

- OpenClaw source: `~/Downloads/openclaw-main/`
- Jeriko source: `~/Desktop/Projects/Etheon/Jeriko/`
- Unix Philosophy: McIlroy, "A Quarter Century of Unix" (1994)
- The Art of Unix Programming: Raymond, E.S. (2003)
