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
bun run test:unit:cli                # CLI components, handlers, hooks, UI primitives, flows, boot, themes, keybindings, permission
bun run test:unit:agent              # orchestrator, model system, tool registry, cache, usage, compaction, subagent, instructions
bun run test:unit:billing            # tiers, license, webhooks, store, stripe-events zod schemas
bun run test:unit:channels           # channel router, adapters
bun run test:unit:connectors         # 29 connector types, OAuth, base retry refactor
bun run test:unit:triggers           # cron, webhook, file, email triggers (safeSpawn-wrapped shell actions)
bun run test:unit:relay              # relay client, protocol, connections
bun run test:unit:security           # API auth (HMAC-canonicalized), escape functions, http-retry, secret-file, spawn-safe
bun run test:unit:shared             # config, output, bus, args, DB, env-parse, diagnostics
bun run test:unit:skills             # skill loader, skill tool
bun run test:unit:webdev             # webdev tool, browser scripts
bun run test:unit:streaming          # SSE parsers, socket stream, drivers (usage extraction)

# Integration suites
bun run test:integration:relay       # real Bun relay server + WebSocket
bun run test:integration:commands    # full daemon boot + HTTP API
bun run test:integration:connectors  # connector definitions + health
bun test test/integration/ollama-live.test.ts  # live LLM turn through Ollama
```

Test preload (`test/preload.ts`) forces `chalk.level = 3` for consistent ANSI output across all environments.

## Architecture (4 layers + platform)

```
Layer 4: Relay     → apps/relay/ (Bun, local dev) + apps/relay-worker/ (CF Worker, production)
Layer 3: Daemon    → src/daemon/kernel.ts (~21-step boot) → agent, API, services, storage
Layer 2: CLI       → src/cli/dispatcher.ts → 51 commands, Ink-based interactive REPL (UI v2 design system)
Layer 1: Shared    → src/shared/ (config, types, output, escape, relay-protocol, urls, skills,
                     http-retry, secret-file, spawn-safe, env-parse, diagnostics, version)
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
| `src/daemon/kernel.ts` | ~21-step daemon boot (incl. hooks step 6.4, MCP step 6.5, instructions discovery) |
| `src/cli/dispatcher.ts` | Command registry, global flags, fuzzy matching |
| `src/cli/app.tsx` | Root Ink component (useReducer state, callbacks) |
| `src/cli/backend.ts` | Backend interface — daemon IPC vs in-process agent |
| `src/cli/boot/` | UI v2 provider bridges (theme, keybindings, permission) |
| `src/cli/ui/` | Design-system primitives (types, tokens, layout, chrome, motion, data) |
| `src/shared/config.ts` | JerikoConfig schema, loader (defaults → user → project → env) |
| `src/shared/output.ts` | ok()/fail() output contract, format switching |
| `src/shared/http-retry.ts` | `withHttpRetry` — exponential backoff + Retry-After + jitter |
| `src/shared/secret-file.ts` | `writeSecretFile` — 0o600 + chmod belt-and-braces |
| `src/shared/spawn-safe.ts` | `safeSpawn` — timeout + signal + stderr cap + SIGTERM→SIGKILL |
| `src/shared/env-parse.ts` | `parseEnvInt` / `parseEnvBool` / `parseEnvString` |
| `src/shared/diagnostics.ts` | `VERSION` + `BUILD_REF` + platform facade |
| `src/daemon/agent/agent.ts` | Main agent loop (runAgent async generator, usage ledger, compaction) |
| `src/daemon/agent/cache/` | Anthropic prompt-cache strategy + decorator + composed builder |
| `src/daemon/agent/usage/` | Cross-provider UsageLedger, USD cost, budget gate |
| `src/daemon/agent/compaction/` | auto + reactive(413) + LLM summarize + policy |
| `src/daemon/agent/subagent/` | sync / async / fork / worktree spawn modes + store + notification |
| `src/daemon/agent/instructions/` | CLAUDE.md / AGENTS.md / .jeriko/instructions.md discovery |
| `src/daemon/agent/orchestrator.ts` | Legacy delegate/fanOut wrappers (still used by parallel_tasks tool) |
| `src/daemon/agent/tools/registry.ts` | Tool registry (19 tools, alias support) |
| `src/daemon/services/mcp/` | Zero-dep MCP client (STDIO + streamable HTTP + tool wrap) |
| `src/daemon/services/hooks/` | Pre/post-tool-use lifecycle runner, matcher, shell-out decisions |
| `src/daemon/exec/gateway.ts` | Single entry for all shell execution |
| `src/daemon/exec/broker.ts` | Permission broker bridging exec-gateway to CLI dialog |
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
- **Connectors** (29): airtable, asana, cloudflare, digitalocean, discord, dropbox, gdrive, github, gitlab, gmail, hubspot, instagram, jira, linear, mailchimp, notion, onedrive, outlook, paypal, salesforce, sendgrid, shopify, slack, square, stripe, threads, twilio, vercel, x. All inherit HTTP-status-aware retry from the `fetchWithRetry` method on `ConnectorBase` (not just exception-based).
- **Triggers** (6 types): cron, webhook, file, http, email, once. Shell-action triggers execute via `safeSpawn` with a 5-minute wall-clock ceiling.
- **Agent tools** (19): bash, browse, camera, connector, delegate, edit, generate_image, list, memory-tool, parallel, read, screenshot, search, skill, spawn_agent, task_status, web, webdev, write
- **Subagent subsystem** (`src/daemon/agent/subagent/`): four spawn modes — sync (blocking), async (fire-and-forget + task-notification re-injection), fork (shares parent's exact system-prompt bytes for prompt-cache hit), worktree (isolated git worktree). Per-agent tool pools assembled independently of parent restrictions. Auto-backgrounding transitions slow sync tasks to async at a configurable threshold (default 2 s). Task state is tracked in SQLite (`subagent_task` table, migration 0007).
- **Prompt caching** (`src/daemon/agent/cache/`): Anthropic `cache_control` breakpoints placed by a pluggable strategy at end-of-tools, end-of-system, and last-stable-assistant-turn. Usage deltas streamed as `StreamChunk{type:"usage"}` and folded into the per-run `UsageLedger`.
- **Usage + cost** (`src/daemon/agent/usage/`): `UsageLedger` tracks input / output / cache_creation / cache_read tokens. `computeCost()` converts to USD via `ModelCapabilities.costInput/costOutput` from the model registry (zero hardcoded price table). Optional `maxBudgetUsd` throws `BudgetExceededError` mid-run.
- **Compaction** (`src/daemon/agent/compaction/`): `autoCompact` (threshold-driven, LLM summarize + preserved markers) and `reactiveCompact` (HTTP 413 recovery, tighter 25% target). Policy shape in `types.ts`.
- **MCP client** (`src/daemon/services/mcp/`): JSON-RPC 2.0 over STDIO or streamable HTTP. Configured in `~/.config/jeriko/mcp.json`. Discovered tools register into the same `ToolDefinition` registry under `mcp_<server>_<tool>` namespace. Per-RPC timeouts (30 s initialize, 60 s calls) prevent hung MCP servers from blocking the agent loop.
- **Hooks** (`src/daemon/services/hooks/`): shell-out lifecycle runner. Six events (pre/post_tool_use, session_start/end, pre/post_compact). Configured in `~/.config/jeriko/hooks.json`. Hook decisions are zod-validated: `allow` / `modify args` / `block with message` / `prompt user`.
- **Instructions discovery** (`src/daemon/agent/instructions/`): walks CWD up to git root at daemon boot (and in `backend.ts` for CLI parity), collecting `CLAUDE.md` / `AGENTS.md` / `.jeriko/instructions.md`. Nearest first. Budget-capped at ~3 000 tokens so huge files can't crowd out tool schemas.
- **LLM drivers**: Anthropic, OpenAI, local (Ollama/LM Studio), Claude Code, custom providers (OpenAI-compat or Anthropic-compat). Every driver wraps `fetch` in `withHttpRetry` (429 / 502 / 503 / 504 + Retry-After). Every error body is passed through `redact()` before logging or yielding. Every driver surfaces provider-side token usage via `StreamChunk{type:"usage"}` — including OpenAI's `prompt_tokens_details.cached_tokens` normalized into `cache_read_input_tokens`.
- **Custom model list**: `config.agent.customModels` — user-curated models shown first in picker. Managed via `/model pin`/`unpin` or config file. `buildModelList()` in `models.ts` is the single source of truth for model listing. `pinnedOnly: true` option suppresses the full catalog.

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
- Timing-safe HMAC-canonicalized comparison at 15+ call sites — length-agnostic constant time via `src/daemon/api/middleware/auth.ts::safeCompare`
- Plugin sandbox strips sensitive env vars before subprocess execution
- Execution gateway: single entry for all shell commands (lease → sandbox → audit pipeline)
- Every secret file goes through `writeSecretFile()` — 0o600 + chmod, used in secrets.ts, daemon env snapshot, onboarding `.env`, plugin trust store, channels config, agent memory
- Every external HTTP call goes through `withHttpRetry()` and redacts `response.text()` error bodies
- Every `spawn()` goes through `safeSpawn()` with timeout + SIGTERM → SIGKILL escalation
- Stripe webhook payloads validated with zod schemas (`src/daemon/billing/stripe-events.ts`) — no unsafe `as string` coercion
- Build provenance: every binary embeds `__BAKED_BUILD_REF__` (git short SHA), surfaced by `renderDiagnosticsLine()` in `jeriko --version`, `/health`, telemetry, and uncaught-exception breadcrumbs
- See `docs/SECURITY.md`, `docs/SECURITY-AUDIT-2026-03-06.md`, and `docs/adr/002-production-hygiene-audit-2026-04.md`

## Backend Parity (Critical Invariant)

`src/cli/backend.ts` in-process mode MUST mirror `src/daemon/kernel.ts` boot sequence:
- `registerTools()` must match kernel step 6 (all 19 tools: the 17 base + `spawn_agent` + `task_status`)
- `loadSystemPrompt()` must load AGENT.md + inject skill summaries + inject memory + inject discovered project instructions (CLAUDE.md / AGENTS.md / .jeriko/instructions.md)
- `agentConfig` must pass `systemPrompt` to `runAgent()`
- Hook + MCP boot blocks (kernel steps 6.4 / 6.5) run in the daemon path; in-process mode currently skips them because CLI-session users don't typically wire external hooks/MCP at startup. If a CLI use case requires them, the boot hook can be added to `createInProcessBackend()` with the same `reloadHooks()` / `startMcpServers()` calls.

Without this parity, CLI mode silently has no system prompt and missing tools.

## CI Pipeline

5-stage progressive gate (`ci.yml`):
1. **Typecheck + Smoke** — fast fail (<30s)
2. **Unit tests** — 12 parallel jobs by subsystem (fail-fast: false)
3. **Integration tests** — relay, commands, connectors
4. **E2E tests** — full system
5. **Build verification** — Linux x64 binary

## Key Docs

- `AGENT.md` — system prompt for AI agents (all commands, flags, workflows, spawn modes)
- `docs/COMMANDS.md` — full CLI reference (51 commands)
- `docs/ARCHITECTURE.md` — system design, data flow
- `docs/CONTRIBUTING.md` — how to add commands, code style
- `docs/SECURITY.md` — security model
- `docs/PLUGINS.md` — plugin system, trust, env isolation
- `docs/TRIGGERS.md` — trigger types and configuration
- `docs/ADR-006-CLI-UX-V2.md` … `ADR-013-CLI-INTEGRATION.md` — UI v2 roadmap (primitives → theme → keybindings → wizard → rendering → permission → integration)
- `docs/adr/002-production-hygiene-audit-2026-04.md` — April 2026 retry / spawn / redaction / permissions / diagnostics audit
- `docs/adr/` — other architectural decision records
