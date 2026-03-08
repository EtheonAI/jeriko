# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Jeriko

Unix-first CLI toolkit for AI agents. TypeScript + Bun runtime, compiled to standalone binary.
Model-agnostic: any AI with exec capability can control the machine.

**For AI agent command reference:** See `AGENT.md` — the system prompt sent to all AI models.
`CLAUDE.md` is for developers working on Jeriko's codebase.

## Build & Dev Commands

```bash
bun install                          # install deps (workspace root)
bun run dev                          # watch mode (bun --watch src/index.ts)
bun run build                        # compile to standalone binary (~66MB)
bun run typecheck                    # tsc --noEmit (strict mode)
```

## Testing

```bash
bun test                             # all tests
bun run test:smoke                   # fast gates (<100ms)
bun run test:unit                    # all unit tests
bun run test:integration             # all integration tests
bun run test:e2e                     # end-to-end tests

# Run a single test file
bun test test/unit/channel-router.test.ts

# Run a subsystem (12 parallel suites in CI)
bun run test:unit:cli                # CLI components, handlers, hooks, formatting
bun run test:unit:agent              # orchestrator, model system, tool registry
bun run test:unit:billing            # tiers, license, webhooks, store
bun run test:unit:channels           # channel router, adapters
bun run test:unit:connectors         # 14 connector types, OAuth
bun run test:unit:triggers           # cron, webhook, file, email triggers
bun run test:unit:relay              # relay client, protocol, connections
bun run test:unit:security           # API auth, escape functions
bun run test:unit:shared             # config, output, bus, args, DB
bun run test:unit:skills             # skill loader, skill tool
bun run test:unit:webdev             # webdev tool, browser scripts
bun run test:unit:streaming          # SSE parsers, socket stream, drivers

# Integration suites
bun run test:integration:relay       # real Bun relay server + WebSocket
bun run test:integration:commands    # full daemon boot + HTTP API
bun run test:integration:connectors  # connector definitions + health
```

Test preload (`test/preload.ts`) forces `chalk.level = 3` for consistent ANSI output across all environments.

## Architecture (4 layers + platform)

```
Layer 4: Relay     → apps/relay/ (Bun, local dev) + apps/relay-worker/ (CF Worker, production)
Layer 3: Daemon    → src/daemon/kernel.ts (16-step boot) → agent, API, services, storage
Layer 2: CLI       → src/cli/dispatcher.ts → 51 commands, Ink-based interactive REPL
Layer 1: Shared    → src/shared/ (config, types, output, escape, relay-protocol, urls, skills)
Platform: src/platform/ → OS abstraction (darwin/linux/win32) for native features
```

### Entry Points

- `src/index.ts` — routes to CLI dispatcher
- `jeriko` (no args) → interactive chat REPL (`src/cli/chat.tsx`)
- `jeriko <cmd>` → CLI command (`src/cli/dispatcher.ts` → `src/cli/commands/`)
- `jeriko serve` → daemon boot (`src/daemon/kernel.ts`)

### Key Files

| File | Purpose |
|------|---------|
| `src/daemon/kernel.ts` | 16-step daemon boot sequence |
| `src/cli/dispatcher.ts` | Command registry, global flags, fuzzy matching |
| `src/cli/app.tsx` | Root Ink component (useReducer state, callbacks) |
| `src/cli/backend.ts` | Backend interface — daemon IPC vs in-process agent |
| `src/shared/config.ts` | JerikoConfig schema, loader (defaults → user → project → env) |
| `src/shared/output.ts` | ok()/fail() output contract, format switching |
| `src/daemon/agent/orchestrator.ts` | Main agent loop (observe → think → act) |
| `src/daemon/agent/tools/registry.ts` | Tool registry (17 tools, alias support) |
| `src/daemon/exec/gateway.ts` | Single entry for all shell execution |
| `src/daemon/api/app.ts` | Hono HTTP server, middleware, route mounting |

### Workspace Structure

```
Root workspace:     src/         (main Jeriko CLI + daemon)
Apps:               apps/relay/           (Bun relay, local dev)
                    apps/relay-worker/    (CF Worker relay, production)
                    apps/website/         (Next.js marketing site)
Packages:           packages/protocol/    (wire protocol types)
                    packages/plugin-sdk/  (plugin developer types)
                    packages/sdk/         (daemon API client)
```

### Daemon Services

- **Channels** (2): Telegram (grammy), WhatsApp (Baileys)
- **Connectors** (14+): stripe, paypal, github, twilio, vercel, x, gdrive, onedrive, gmail, outlook, hubspot, shopify, instagram, threads
- **Triggers** (6 types): cron, webhook, file, http, email, once
- **Agent tools** (17): bash, browse, camera, connector, delegate, edit, list, memory-tool, parallel, read, screenshot, search, skill, web, webdev, write + registry
- **LLM drivers**: Anthropic, OpenAI, local (Ollama/LM Studio), Claude Code, custom providers (OpenAI-compat or Anthropic-compat)

## Output Contract

All CLI commands emit: `{"ok":true,"data":{...}}` or `{"ok":false,"error":"...","code":N}`
Three formats: `--format json` (default) | `--format text` | `--format logfmt`

Use `ok()` / `fail()` from `src/shared/output.ts` — never `console.log` in commands.

## Exit Codes

0=success, 1=general, 2=network, 3=auth, 5=not_found, 7=timeout
Use `EXIT.NETWORK`, `EXIT.AUTH`, etc. from `src/shared/types.ts`.

## Code Conventions

- **TypeScript** (strict mode, ESNext target, Bun runtime)
- **Imports use `.js` extensions** — always `import { X } from "./file.js"`, not `.ts`
- **Classes for services** — drivers, engines, registries, managers, relay infrastructure
- **Factory functions for CLI handlers** — return object of async methods (see `src/cli/handlers/session.ts`)
- **React + Ink for CLI** — functional components, centralized useReducer state (`src/cli/hooks/useAppReducer.ts`)
- **Raw SQL via bun:sqlite** — no ORM runtime; Drizzle used only for migration generation
- **No path aliases in imports** — tsconfig paths exist but always use relative imports with `.js`

### Naming

| What | Convention | Example |
|------|-----------|---------|
| CLI commands | `src/cli/commands/<category>/<name>.ts` | `src/cli/commands/agent/skill.ts` |
| Agent tools | `src/daemon/agent/tools/<name>.ts` | `src/daemon/agent/tools/browse.ts` |
| Connectors | `src/daemon/services/connectors/<name>.ts` | — |
| Flags | `--kebab-case` | `--kill-name` |
| JSON keys | `camelCase` | `{ runCount: 5 }` |
| Env vars | `UPPER_SNAKE_CASE` | `ANTHROPIC_API_KEY` |

## Security Rules

- `escapeAppleScript()` on ALL user input interpolated into AppleScript (30+ call sites)
- `escapeShellArg()` on ALL user input in shell commands (25+ call sites)
- SENSITIVE_KEYS redaction in exec gateway, plugin sandbox, and config (3 synchronized lists in `src/shared/secrets.ts`, `src/daemon/exec/gateway.ts`, `src/daemon/plugin/sandbox.ts`)
- Timing-safe HMAC comparison at 15+ call sites (daemon, relay Bun, relay CF Worker, webhooks)
- Plugin sandbox strips sensitive env vars before subprocess execution
- Execution gateway: single entry for all shell commands (lease → sandbox → audit pipeline)
- See `docs/SECURITY.md` and `docs/SECURITY-AUDIT-2026-03-06.md`

## Backend Parity (Critical Invariant)

`src/cli/backend.ts` in-process mode MUST mirror `src/daemon/kernel.ts` boot sequence:
- `registerTools()` must match kernel step 6 (all 17 tools including memory-tool)
- `loadSystemPrompt()` must load AGENT.md + inject skill summaries + inject memory
- `agentConfig` must pass `systemPrompt` to `runAgent()`

Without this, CLI mode silently has no system prompt and missing tools.

## CI Pipeline

5-stage progressive gate (`ci.yml`):
1. **Typecheck + Smoke** — fast fail (<30s)
2. **Unit tests** — 12 parallel jobs by subsystem (fail-fast: false)
3. **Integration tests** — relay, commands, connectors
4. **E2E tests** — full system
5. **Build verification** — Linux x64 binary

## Key Docs

- `AGENT.md` — system prompt for AI agents (all commands, flags, workflows)
- `docs/COMMANDS.md` — full CLI reference (51 commands)
- `docs/ARCHITECTURE.md` — system design, data flow
- `docs/CONTRIBUTING.md` — how to add commands, code style
- `docs/SECURITY.md` — security model
- `docs/PLUGINS.md` — plugin system, trust, env isolation
- `docs/TRIGGERS.md` — trigger types and configuration
- `docs/adr/` — architectural decision records
