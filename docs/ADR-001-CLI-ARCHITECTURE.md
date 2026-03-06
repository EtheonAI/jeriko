# ADR-001: CLI Architecture Redesign

**Status**: Proposed
**Date**: 2026-03-06
**Author**: Architecture Review
**Scope**: CLI commands, REPL slash commands, channel commands, command parity

---

## 1. Context & Problem Statement

Jeriko's CLI has grown organically across three separate command surfaces that don't share code, naming, or behavior:

| Surface | Location | Commands | Handler |
|---------|----------|----------|---------|
| CLI dispatcher | `src/cli/dispatcher.ts` | 51 flat commands | Individual command files |
| REPL slash commands | `src/cli/app.tsx` | 37 slash commands | 600-line switch in `handleSlashCommand` |
| Channel commands | `src/daemon/services/channels/router.ts` | ~25 slash commands | 600+ line switch in `handleCommand` |

### Problems Identified

**P1: Three disconnected command systems**
Adding a new management feature requires changes in 3 places with 3 different interfaces. No shared handler, no shared validation, no shared formatting.

**P2: Flat CLI namespace — 51 top-level commands**
`jeriko sys`, `jeriko exec`, `jeriko stripe`, `jeriko init`, `jeriko server`, `jeriko skill` all compete at the same level. Users can't discover commands by domain. Compare: OpenClaw groups into `channels`, `models`, `agents`, `cron`, `nodes`. OpenCode groups into `session`, `auth`, `models`, `mcp`.

**P3: Agent tools mixed with management commands**
`jeriko exec` (agent tool — runs shell commands) lives next to `jeriko server` (management — starts daemon). These serve fundamentally different users (AI agents vs humans).

**P4: No command parity**
- CLI has `/share` but channels have no share command
- Channels have `/switch`, `/archive`, rich keyboard menus — CLI doesn't
- CLI has `/auth` — channels duplicate it differently
- CLI has `/tasks`, `/notifications` — channels don't

**P5: REPL slash handler is monolithic**
`handleSlashCommand` in `app.tsx` is a 600-line switch statement. Each case does its own error handling, formatting, and backend calls. This violates single-responsibility and makes testing per-command impossible.

**P6: Channel router is massive**
`router.ts` is 1000+ lines with inline keyboard layout construction, session management, and command handling all interleaved.

---

## 2. Key Insight: Two Command Classes

Analysis reveals Jeriko has two fundamentally different command types:

### Agent Tools (stay flat, stay fast)
These are the **core product** — Unix commands that any AI agent calls programmatically:
```
exec, sys, proc, net, fs, doc, browse, search, screenshot,
email, msg, notify, audio, notes, remind, calendar, contacts,
music, clipboard, window, camera, open, location, code, create,
dev, parallel, ask, memory, discover, prompt
```
- Called by AI models via `jeriko exec "ls -la"`
- Must be fast (no subcommand parsing overhead)
- Output: JSON (`{"ok":true,"data":{...}}`)
- Used in AGENT.md system prompt
- **Decision**: Keep flat. Don't touch. They work.

### Management Commands (need restructuring)
These are **human-facing** commands for managing the Jeriko platform:
```
session, model, provider, connector, channel, trigger, skill,
task, billing, server, config, init, setup, update, plugin
```
- Called by users interactively
- Need discoverability, help text, grouped listing
- Used in REPL, channels, and CLI
- **Decision**: Group hierarchically. Unify across surfaces.

---

## 3. Competitor Analysis

### OpenClaw CLI
- **Strengths**: Rich domain grouping (`channels list/status/logs/add/remove`), hub menus with keyboard navigation for channels, isolated agent workspaces, multi-account channel support
- **Weaknesses**: 60+ commands can overwhelm, some nesting too deep
- **Key pattern**: Every domain has `list`, `status`, `add/remove` subcommands consistently

### OpenCode CLI
- **Strengths**: Minimal surface area (~15 commands), session-first design (`--continue`, `--fork`), `run` for scripting, `serve` for headless, `attach` for remote
- **Weaknesses**: Less powerful management
- **Key pattern**: Progressive disclosure — simple by default, power via flags

### What we take from each
| Pattern | Source | Apply to Jeriko |
|---------|--------|----------------|
| Consistent subcommand verbs | OpenClaw | `list`, `add`, `remove`, `status` everywhere |
| Hub menus with keyboards | OpenClaw (channels) | Already in our channel router, extend to CLI |
| `run` for non-interactive | OpenCode | Add `jeriko run <prompt>` |
| Session continuation flags | OpenCode | `jeriko --continue`, `jeriko --session <id>` |
| `doctor` command | OpenClaw | Add `jeriko doctor` (health check everything) |
| Minimal defaults, power via flags | OpenCode | Don't over-nest agent tools |

---

## 4. Proposed Command Taxonomy

### Tier 1: Entry Modes
```bash
jeriko                          # Interactive REPL (default)
jeriko run "<prompt>"           # Non-interactive single turn (new)
  --model, --session, --format
jeriko serve                    # Alias for `jeriko server start`
```

### Tier 2: Management Commands (hierarchical)

**Session**
```bash
jeriko session                  # Show current session detail
jeriko session list             # List all sessions
jeriko session new              # Create new session
jeriko session resume <slug>    # Resume by slug or ID
jeriko session switch <slug>    # Alias for resume
jeriko session kill             # Destroy + create new
jeriko session archive          # Archive + create new
jeriko session clear            # Clear message history
jeriko session compact          # Compact context window
jeriko session history          # Show message history
jeriko session share            # Create share link
jeriko session share list       # List shares
jeriko session share revoke <id># Revoke share
jeriko session cost             # Token/cost breakdown
```

**Model**
```bash
jeriko model                    # Show current model info
jeriko model list [provider]    # List models (optional provider filter)
jeriko model switch <spec>      # Switch model (provider:model)
jeriko model info <spec>        # Model capabilities detail
```

**Provider**
```bash
jeriko provider                 # List all providers
jeriko provider list            # Same
jeriko provider add [id url key]# Add provider (interactive or inline)
jeriko provider remove <id>     # Remove provider
```

**Connector**
```bash
jeriko connector                # List with status
jeriko connector list           # Same
jeriko connector connect <name> # OAuth flow or API key setup
jeriko connector disconnect <n> # Remove credentials
jeriko connector auth [name]    # Show/manage auth details
jeriko connector health         # Health check all connectors
```

**Channel**
```bash
jeriko channel                  # List channels with status
jeriko channel list             # Same
jeriko channel connect <name>   # Connect (start listening)
jeriko channel disconnect <name># Disconnect
jeriko channel add <name>       # Add new channel config
jeriko channel remove <name>    # Remove channel config
```

**Trigger**
```bash
jeriko trigger                  # List triggers
jeriko trigger list             # Same
jeriko trigger add              # Add trigger (interactive)
jeriko trigger remove <id>      # Remove trigger
jeriko trigger enable <id>      # Enable
jeriko trigger disable <id>     # Disable
```

**Skill**
```bash
jeriko skill                    # List skills
jeriko skill list               # Same
jeriko skill info <name>        # Detail view
jeriko skill create <name>      # Scaffold new skill
jeriko skill remove <name>      # Remove skill
jeriko skill install <source>   # Install from URL/path
```

**Task**
```bash
jeriko task                     # List background tasks
jeriko task list                # Same
```

**Billing**
```bash
jeriko billing                  # Show plan + usage
jeriko billing plan             # Current plan detail
jeriko billing upgrade [email]  # Start upgrade flow
jeriko billing portal           # Open billing portal
jeriko billing cancel           # Cancel subscription
```

**Server (Daemon)**
```bash
jeriko server                   # Server status
jeriko server start             # Start daemon
jeriko server stop              # Stop daemon
jeriko server status            # Status detail
jeriko server health            # Full health check
```

**Config**
```bash
jeriko config                   # Show current config
jeriko config get <key>         # Get specific value
jeriko config set <key> <value> # Set value
```

**System / Meta**
```bash
jeriko init                     # First-time setup (keep as-is)
jeriko setup                    # Interactive setup wizard (keep)
jeriko update                   # Self-update (keep)
jeriko doctor                   # Health check everything (NEW)
jeriko version                  # Version info
```

**Plugin**
```bash
jeriko plugin                   # List plugins
jeriko plugin install <name>    # Install
jeriko plugin uninstall <name>  # Uninstall
jeriko plugin trust <name>      # Trust plugin
```

### Tier 3: Agent Tools (flat, unchanged)
```bash
# System
jeriko exec <cmd>               jeriko sys
jeriko proc                     jeriko net

# Files
jeriko fs                       jeriko doc

# Browser
jeriko browse                   jeriko search
jeriko screenshot

# Communication
jeriko email                    jeriko msg
jeriko notify                   jeriko audio

# OS Integration
jeriko notes    jeriko remind   jeriko calendar
jeriko contacts jeriko music    jeriko clipboard
jeriko window   jeriko camera   jeriko open
jeriko location

# Integrations (agent-callable)
jeriko stripe   jeriko github   jeriko paypal
jeriko vercel   jeriko twilio   jeriko x
jeriko gdrive   jeriko onedrive jeriko gmail
jeriko outlook

# Dev
jeriko code     jeriko create   jeriko dev
jeriko parallel
```

---

## 5. Unified Command Architecture

### Current (3 separate systems)
```
CLI dispatcher ─────────── 51 individual files
REPL slash handler ──────── 1 monolithic switch (app.tsx)
Channel command handler ─── 1 monolithic switch (router.ts)
```

### Proposed (1 shared registry, 3 adapters)
```
                    ┌─── CLI Adapter (dispatcher.ts)
                    │    Parses argv, calls handler.run(args)
                    │
Command Registry ───┼─── REPL Adapter (slash-handler.ts)
(shared handlers)   │    Parses /command args, calls handler.handle(ctx)
                    │
                    └─── Channel Adapter (channel-handler.ts)
                         Parses /command args, calls handler.handle(ctx)
                         Adds keyboard layouts for mobile
```

### Command Handler Interface
```typescript
// src/shared/command-handler.ts

interface CommandContext {
  /** Where this command is being executed */
  surface: "cli" | "repl" | "channel";
  /** Backend for daemon communication */
  backend: Backend;
  /** Arguments after the command name */
  args: string[];
  /** Raw argument string (for channels) */
  rawArgs: string;
  /** Channel metadata (only for channel surface) */
  channelMeta?: ChannelMetadata;
}

interface CommandResult {
  /** Formatted text response */
  text: string;
  /** Optional keyboard layout (channels only) */
  keyboard?: KeyboardLayout;
  /** Whether this was an error */
  isError?: boolean;
}

interface CommandHandler {
  /** Command name (e.g., "session", "model") */
  name: string;
  /** Subcommand name (e.g., "list", "new") — null for root */
  subcommand: string | null;
  /** One-line description */
  description: string;
  /** Which surfaces support this command */
  surfaces: Set<"cli" | "repl" | "channel">;
  /** Execute the command */
  handle(ctx: CommandContext): Promise<CommandResult>;
}
```

### Benefits
1. **Single handler per command** — write once, available everywhere
2. **Surface-aware** — same handler can return keyboard layouts for channels, ANSI for CLI
3. **Testable** — each handler is a pure function: context in, result out
4. **Discoverable** — registry knows all commands, can generate help for any surface
5. **Parity by default** — if a command exists, it's available on all supported surfaces

---

## 6. REPL Slash Command Changes

### Current REPL Commands (keep all, reorganize)
```
/help /new /session /sessions /resume /history /clear /compact
/share /model /models /channels /channel /connectors /connect
/disconnect /triggers /skills /skill /status /health /sys /config
/providers /provider /plan /upgrade /billing /cost /kill /archive
/auth /tasks /notifications /cancel
```

### Proposed REPL Commands (mirrors management taxonomy)
```
Session:     /new /session /sessions /resume /switch /kill /archive
             /history /clear /compact /share /cost
Model:       /model /models
Provider:    /provider /providers
Connector:   /connector /connectors /connect /disconnect /auth
Channel:     /channel /channels
Trigger:     /trigger /triggers
Skill:       /skill /skills
Task:        /tasks
Billing:     /billing /plan /upgrade /cancel
System:      /status /health /sys /config /doctor
Notifications: /notifications
```

Changes from current:
- Add: `/switch` (alias for /resume), `/doctor`, `/run` (execute tool inline)
- Rename: None (preserve backward compat)
- Remove: None

### Channel Command Changes
Add to channels (currently missing):
- `/share` — share current session
- `/cost` — session cost breakdown
- `/tasks` — list background tasks
- `/notifications` — notification preferences
- `/compact` — compact context
- `/doctor` — system health check

---

## 7. New Commands to Add

| Command | Type | Rationale |
|---------|------|-----------|
| `jeriko run "<prompt>"` | Entry mode | Non-interactive scripting (OpenCode pattern) |
| `jeriko doctor` | Management | Health check everything — config, connectors, channels, disk, model access |
| `jeriko session switch` | Management | Clearer name than "resume" for channels |
| `jeriko version` | Meta | Explicit version command (currently only `--version` flag) |

---

## 8. Implementation Plan

### Phase 1: Unified Command Registry (foundation)
1. Create `src/shared/command-handler.ts` — interfaces
2. Create `src/cli/handlers/` — one file per management domain:
   - `session.ts`, `model.ts`, `provider.ts`, `connector.ts`
   - `channel.ts`, `trigger.ts`, `skill.ts`, `task.ts`
   - `billing.ts`, `server.ts`, `config.ts`, `system.ts`
3. Each handler implements `CommandHandler` interface
4. Create `src/cli/handlers/registry.ts` — command registry with lookup

### Phase 2: Wire REPL to unified handlers
1. Create `src/cli/slash-handler.ts` — REPL adapter
2. Replace monolithic switch in `app.tsx` with registry lookup
3. Each slash command → `registry.get(name).handle(ctx)`
4. All tests pass, behavior identical

### Phase 3: Wire channels to unified handlers
1. Create `src/daemon/services/channels/command-adapter.ts` — channel adapter
2. Replace monolithic switch in `router.ts` with registry lookup
3. Add keyboard layout support to `CommandResult`
4. Add missing commands (share, cost, tasks, etc.)

### Phase 4: Wire CLI dispatcher to unified handlers
1. Update `dispatcher.ts` to use registry for management commands
2. Agent tools stay as individual command files (unchanged)
3. Management commands route through registry

### Phase 5: New features
1. Add `jeriko run` entry mode
2. Add `jeriko doctor` command
3. Add `jeriko session switch` alias

---

## 9. What We Do NOT Change

- **Agent tools** (exec, sys, fs, etc.) — flat, fast, working. Don't touch.
- **Ink component architecture** — App.tsx, components/, hooks/ are well-structured
- **Theme system** — PALETTE, `t.*`, ICONS are professional and consistent
- **Backend interface** — the Backend abstraction (daemon vs in-process) is clean
- **State management** — useAppReducer with discriminated union actions is solid
- **Output contract** — `{"ok":true}` / `{"ok":false}` stays

---

## 10. File Impact Matrix

| File | Change | Risk |
|------|--------|------|
| `src/cli/app.tsx` | Replace switch with registry call | Medium — core file |
| `src/cli/commands.ts` | Update SLASH_COMMANDS registry | Low |
| `src/cli/dispatcher.ts` | Route management cmds to registry | Low |
| `src/daemon/services/channels/router.ts` | Replace switch with adapter | Medium |
| `src/cli/handlers/*` (NEW) | New unified handler files | None — new code |
| `src/shared/command-handler.ts` (NEW) | New shared interfaces | None — new code |
| `src/cli/commands/agent/*` | Unchanged | None |
| `src/cli/commands/system/*` | Unchanged | None |
| `src/cli/commands/os/*` | Unchanged | None |
| `src/cli/commands/browser/*` | Unchanged | None |
| `src/cli/commands/comms/*` | Unchanged | None |
| `src/cli/components/*` | Unchanged | None |
| `src/cli/hooks/*` | Unchanged | None |

---

## 11. Command Parity Matrix

Which commands are available on which surface:

| Command | CLI | REPL | Channels | Notes |
|---------|-----|------|----------|-------|
| session (detail) | Y | Y | Y | |
| session list | Y | Y | Y | |
| session new | Y | Y | Y | |
| session resume/switch | Y | Y | Y | |
| session kill | Y | Y | Y | |
| session archive | Y | Y | Y | |
| session history | Y | Y | Y | |
| session clear | Y | Y | Y | |
| session compact | Y | Y | Y | NEW for channels |
| session share | Y | Y | Y | NEW for channels |
| session cost | Y | Y | Y | NEW for channels |
| model (show) | Y | Y | Y | |
| model list | Y | Y | Y | |
| model switch | Y | Y | Y | |
| provider list | Y | Y | Y | |
| provider add | Y | Y | N | Interactive — CLI/REPL only |
| provider remove | Y | Y | N | Destructive — CLI/REPL only |
| connector list | Y | Y | Y | |
| connector connect | Y | Y | Y | |
| connector disconnect | Y | Y | Y | |
| connector auth | Y | Y | Y | |
| connector health | Y | Y | Y | |
| channel list | Y | Y | Y | |
| channel connect | Y | Y | N | Meta — channels manage themselves |
| trigger list | Y | Y | Y | |
| skill list | Y | Y | Y | |
| skill info | Y | Y | Y | |
| task list | Y | Y | Y | NEW for channels |
| billing plan | Y | Y | Y | |
| billing upgrade | Y | Y | N | Payment — CLI/REPL only |
| billing cancel | Y | Y | N | Destructive — CLI/REPL only |
| server start/stop | Y | N | N | CLI-only daemon management |
| config show | Y | Y | Y | |
| status | Y | Y | Y | |
| health | Y | Y | Y | |
| sys | Y | Y | Y | |
| doctor | Y | Y | Y | NEW command |
| notifications | Y | Y | Y | NEW for channels |
| run (single turn) | Y | N | N | CLI-only scripting mode |

---

## 12. Patterns Adopted from Nanocoder-Main

Analysis of `/Desktop/Projects/Etheon/nanocoder-main/` (573 files, 143K LOC) reveals production-grade Ink patterns we should adopt:

### Adopt: Hook Composition over Monolithic Components
Nanocoder splits state across focused hooks: `useAppState()` (50+ vars), `useChatHandler()`, `useToolHandler()`, `useAppInitialization()`, `useModeHandlers()`, `useInputState()`.

**Apply to Jeriko**: Our `app.tsx` (947 LOC) handles slash commands, submit, interrupt, setup, and provider picker inline. Extract:
- `useSlashCommands(backend, state, dispatch)` — all slash command logic
- `useSubmitHandler(backend, dispatch)` — message submission + streaming callbacks
- `useSetupFlow(backend, dispatch)` — setup + provider picker

### Adopt: Global Message Queue for Deep Components
Nanocoder uses `setGlobalMessageQueue()` so deep tools (bash executor) can add chat messages without prop drilling.

**Apply to Jeriko**: Our tool calls and sub-agents currently communicate via callback chains. A global queue would simplify tool→UI communication.

### Adopt: Streaming Tools Outside Static
Nanocoder renders `liveComponent` (BashProgress) outside `<Static>` for real-time updates. Static pins history; live content updates below.

**Apply to Jeriko**: We already do this with `<StreamingText>` — confirm this pattern is correct and extend to tool call progress.

### Adopt: Custom Commands (Markdown + YAML frontmatter)
Nanocoder loads custom commands from `~/.config/nanocoder/commands/*.md` with YAML frontmatter (name, aliases, description, parameters) + markdown body with template variables.

**Apply to Jeriko**: Our skills system (`~/.jeriko/skills/`) already follows this pattern. Unify slash commands + skills into one system where skills can register as slash commands.

### Adopt: Paste Detection + Atomic Deletion
Nanocoder has sophisticated paste detection for VS Code terminals where large pastes arrive in chunks. Groups them into single operations.

**Apply to Jeriko**: Our Input.tsx should add paste detection for better multi-line handling.

### Consider but Don't Adopt
- **18 themes**: Our single theme (warm amber palette) is distinctive and professional. Adding theme selection adds UX complexity without clear value for an agent toolkit.
- **50+ useState calls**: Nanocoder's useAppState has 50+ state variables. Our useReducer with discriminated unions is cleaner and more maintainable.
- **Lazy Proxy config**: We use direct config loading which is simpler and explicit.

---

## 13. Decision Rationale (with evidence)

**Why hierarchical management commands?**
- Competitors prove the pattern works (OpenClaw: 50+ commands, still navigable)
- Discoverability: `jeriko session --help` shows all session subcommands
- Consistency: every domain has `list`, `add/remove`, `status`
- Reduces cognitive load: 15 top-level groups vs 51 flat commands

**Why keep agent tools flat?**
- AI models call them directly — `jeriko exec "command"` not `jeriko system exec "command"`
- They're documented in AGENT.md as the tool interface
- Performance: no subcommand routing overhead
- Already clean — they follow the output contract

**Why unified registry instead of keeping 3 systems?**
- DRY: one handler per command, not three
- Parity: impossible to forget a surface when adding commands
- Testing: test the handler once, not three implementations
- Consistency: same behavior guaranteed across surfaces

**Why not merge everything into the registry?**
- Agent tools have different concerns (JSON output, exit codes, piped stdin)
- Management commands have different concerns (interactive UI, keyboard layouts)
- Forcing them into one interface adds complexity without benefit

---

## 14. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Breaking existing REPL behavior | Medium | High | Phase 2 is pure refactor — test suite must pass |
| Breaking channel commands | Medium | High | Phase 3 includes regression tests |
| Performance regression from registry | Low | Low | Lazy loading preserved, registry is a Map lookup |
| Backward compat for `/model` vs `/model switch` | Low | Medium | Keep short forms as aliases |

---

## 15. Success Criteria

1. All 37 REPL slash commands work identically after migration
2. All channel commands work identically after migration
3. `jeriko --help` shows clean grouped output
4. Adding a new management command requires exactly 1 handler file
5. Command parity matrix has no gaps (every "Y" works)
6. All 1883+ existing tests pass
7. New `jeriko run`, `jeriko doctor` commands functional
