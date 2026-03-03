# Jeriko — Developer Guide

Unix-first CLI toolkit for AI agents. Commands replace proprietary tool abstractions.
Model-agnostic: any AI with exec capability can control the machine.

**For AI agent command reference:** See `AGENT.md` — this is the system prompt sent to all AI models (GPT-4o, Claude API, local models). It contains every command, flag, workflow, and integration. `CLAUDE.md` is for Claude Code developers working on Jeriko's codebase.

## Quick Start

```bash
npm install
export PATH="$(pwd)/bin:$PATH"
jeriko init --yes
jeriko sys --format text          # verify it works
```

## Architecture (4 layers)

```
Layer 4: Relay     → apps/relay/ (Bun, local dev) + apps/relay-worker/ (CF Worker, production)
Layer 3: Daemon    → src/daemon/kernel.ts (16-step boot) → agent, API, services, storage
Layer 2: CLI       → src/cli/dispatcher.ts → 51 commands, Ink-based interactive REPL
Layer 1: Shared    → src/shared/ (config, urls, relay-protocol, output, escape, skills)
```

Relay: `apps/relay/` (local) + `apps/relay-worker/` (prod) — routes webhooks/OAuth to user daemon
Daemon: `src/daemon/` — agent loop, triggers, connectors, channels, storage
Shared: `src/shared/` — pure types, relay protocol, URL builders, config

## Output Contract

All commands emit: `{"ok":true,"data":{...}}` or `{"ok":false,"error":"..."}`
Three formats: `--format json` (default) | `--format text` | `--format logfmt`

## Exit Codes

0=success, 1=general, 2=network, 3=auth, 5=not_found, 7=timeout
Use `EXIT.NETWORK`, `EXIT.AUTH`, etc. from `lib/cli.js`.

## Adding a New Command

1. Create `tools/myfeature.js` (library functions)
2. Create `bin/jeriko-mycommand` (CLI wrapper using `parseArgs`, `ok`, `fail`, `run`)
3. `chmod +x bin/jeriko-mycommand`
4. Register Telegram handler in `tools/index.js`
5. Add command name to `RESERVED` in `lib/plugins.js`
6. Document in `docs/COMMANDS.md`

See `docs/CONTRIBUTING.md` for full template with stdin support and error handling.

## Code Conventions

- **Plain JavaScript** — no TypeScript, no build step
- **No classes** — plain functions + module exports
- **`ok()` / `fail()`** — never `console.log` in commands
- **Minimal deps** — prefer Node.js built-ins
- **`escapeAppleScript()`** — always escape user input in AppleScript strings
- **`readStdin()`** — support piped input where it makes sense
- **No global state** — each command is a fresh process

### Naming

| What | Convention | Example |
|------|-----------|---------|
| CLI commands | `bin/jeriko-lowercase` | `bin/jeriko-mycommand` |
| Tool libraries | `tools/lowercase.js` | `tools/myfeature.js` |
| Flags | `--kebab-case` | `--kill-name` |
| JSON keys | `camelCase` | `{ runCount: 5 }` |
| Env vars | `UPPER_SNAKE_CASE` | `IMAP_HOST` |

## Security Rules

- `escapeAppleScript()` on ALL user input interpolated into AppleScript
- `SENSITIVE_KEYS` in `tools/shell.js` stripped from exec subprocesses
- Plugins untrusted by default — no webhooks, no prompt injection until `jeriko trust`
- `NODE_AUTH_SECRET` required — server refuses to start without it
- Timing-safe token comparison in `server/auth.js`
- See `docs/SECURITY.md` for full model

## Testing

```bash
jeriko mycommand --format json    # valid JSON with ok field?
jeriko mycommand --format text    # NOT JSON?
jeriko mycommand --format logfmt  # key=value pairs?
echo "input" | jeriko mycommand   # stdin works?
jeriko mycommand --bad-input; echo "Exit: $?"  # correct exit code?
```

## PayPal Integration (`jeriko paypal`)

OAuth2 client credentials flow. Env: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MODE` (sandbox|live).

```bash
jeriko paypal init                     # interactive setup
jeriko paypal init --client-id xxx --secret xxx --sandbox  # non-interactive

# Orders
jeriko paypal orders create --amount 50.00 --currency USD [--description "text"]
jeriko paypal orders get --id ORDER_ID
jeriko paypal orders capture --id ORDER_ID
jeriko paypal orders authorize --id ORDER_ID

# Payments
jeriko paypal payments get --id CAPTURE_ID
jeriko paypal payments refund --id CAPTURE_ID [--amount 10.00]

# Subscriptions
jeriko paypal subscriptions list --plan PLAN_ID [--status ACTIVE|SUSPENDED|CANCELLED]
jeriko paypal subscriptions get --id SUB_ID
jeriko paypal subscriptions create --plan PLAN_ID
jeriko paypal subscriptions cancel --id SUB_ID [--reason "text"]
jeriko paypal subscriptions suspend --id SUB_ID
jeriko paypal subscriptions activate --id SUB_ID

# Plans
jeriko paypal plans list [--limit 10]
jeriko paypal plans get --id PLAN_ID
jeriko paypal plans create --product PROD_ID --name "Monthly" --amount 9.99 --interval MONTH

# Products
jeriko paypal products list [--limit 10]
jeriko paypal products get --id PROD_ID
jeriko paypal products create --name "My Product" [--type SERVICE|PHYSICAL|DIGITAL]

# Invoices
jeriko paypal invoices list [--limit 10] [--status DRAFT|SENT|PAID|CANCELLED]
jeriko paypal invoices get --id INV_ID
jeriko paypal invoices create --recipient "email@example.com" --amount 100.00
jeriko paypal invoices send --id INV_ID
jeriko paypal invoices cancel --id INV_ID
jeriko paypal invoices remind --id INV_ID

# Payouts
jeriko paypal payouts create --email "user@example.com" --amount 25.00 [--currency USD]
jeriko paypal payouts get --id BATCH_ID

# Disputes
jeriko paypal disputes list [--status OPEN|WAITING|RESOLVED]
jeriko paypal disputes get --id DISPUTE_ID

# Webhooks
jeriko paypal webhooks list
jeriko paypal webhooks create --url "https://..." --events "PAYMENT.CAPTURE.COMPLETED,..."
jeriko paypal webhooks delete --id WEBHOOK_ID
```

## Relay Infrastructure (Multi-User Webhook/OAuth Routing)

External services (Stripe, GitHub, PayPal) send webhooks to `bot.jeriko.ai`. The relay server routes them to the correct user's daemon via WebSocket.

**Architecture:**
```
External Service → POST https://bot.jeriko.ai/hooks/:userId/:triggerId
  → Relay server (apps/relay/) validates trigger ownership
  → Forwards over WebSocket to user's daemon
  → Daemon TriggerEngine.handleWebhook() processes locally
  → Signature verification on daemon (secrets never leave user's machine)
```

**Relay Server — Two implementations** (same wire protocol, same routes):
- `apps/relay/` — Bun + Hono (local dev, testing)
- `apps/relay-worker/` — Cloudflare Worker + Durable Object (production at `bot.jeriko.ai`)

**Bun Relay** (`apps/relay/`): Local dev and test suite
- `relay.ts` — createRelayApp() + createRelayServer(opts) factory (testable, no side effects)
- `connections.ts` — module-level Maps, HMAC timing-safe auth (node:crypto)

**CF Worker Relay** (`apps/relay-worker/`): Production deployment
- `index.ts` — Worker entry, routes all requests to single global DO (`idFromName("global")`)
- `relay-do.ts` — RelayDO Durable Object (Hibernatable WebSockets + Hono HTTP)
- `connections.ts` — ConnectionManager class (async Web Crypto auth, hibernation-safe attachments)
- `crypto.ts` — Web Crypto API helpers (hmacSHA256, safeCompare, verifyStripeSignature)
- `routes/` — webhook.ts, oauth.ts, billing.ts, health.ts (same logic, dependency-injected)

**Shared routes** (both relays):
- POST /hooks/:userId/:triggerId (validates trigger ownership)
- POST /hooks/:triggerId (legacy — looks up trigger owner)
- GET /oauth/:userId/:provider/callback (forwards to daemon, waits for HTML)
- POST /billing/webhook (Stripe centralized), GET /billing/license/:userId
- GET /health (public), GET /health/status (authenticated)

**Relay Client** (`src/daemon/services/relay/client.ts`): Outbound WebSocket
- Connects at kernel step 10.6 (non-fatal — works offline)
- Exponential backoff reconnection (1s → 2s → 4s → ... 60s max)
- Auth timeout (15s), heartbeat (30s ping, 10s pong timeout)
- Skipped when: no user ID, no auth secret, or JERIKO_PUBLIC_URL set (self-hosted)

**Wire Protocol** (`src/shared/relay-protocol.ts`): Single source of truth
- Outbound: auth, register_triggers, unregister_triggers, webhook_ack, oauth_result, ping
- Inbound: auth_ok, auth_fail, webhook, oauth_callback, pong, error

**URL Builders** (`src/shared/urls.ts`): Mode-aware URL generation
- Relay mode (default): `https://bot.jeriko.ai/hooks/:userId/:triggerId`
- Self-hosted (JERIKO_PUBLIC_URL): `https://my-tunnel.com/hooks/:triggerId`
- Local dev: `http://127.0.0.1:3000/hooks/:triggerId`

**User ID**: `getUserId()` in `src/shared/config.ts`, generated at `jeriko install`, persisted as `JERIKO_USER_ID` in `~/.config/jeriko/.env`

**Key env vars**: `JERIKO_USER_ID`, `RELAY_AUTH_SECRET`, `NODE_AUTH_SECRET`, `JERIKO_RELAY_URL`, `JERIKO_PUBLIC_URL`, `JERIKO_BILLING_URL`

See `docs/ARCHITECTURE.md` → Relay Infrastructure for full technical details.

## Web Development (Pre-Built Templates)

When building web apps, ALWAYS use the pre-built templates. They are instant (cp, no download).

### Available Templates
- **`web-static`** — Vite + React 19 + Tailwind 4 + shadcn/ui (50+ components) + Wouter + Framer Motion + Recharts
- **`web-db-user`** — Everything in web-static + Express + Drizzle ORM + tRPC + JWT auth + database

### Workflow
```bash
jeriko create web-static my-app      # instant copy from templates/webdev/web-static
cd ~/.jeriko/projects/my-app
pnpm install                          # install deps
pnpm run dev                          # starts Vite on localhost:3000
```
Or with auto-dev: `jeriko create web-static my-app --dev`

### Rules for Building Apps
1. ALWAYS use `jeriko create web-static` or `jeriko create web-db-user` — never scaffold from scratch
2. After scaffold: write REAL code into `client/src/pages/`, `client/src/components/`
3. Use the pre-installed shadcn components in `client/src/components/ui/` (Button, Card, Dialog, Tabs, etc.)
4. Start dev server: `jeriko dev --start my-app` (auto-detects available port)
5. Check actual port: `jeriko dev --status` → get the URL
6. Preview: `jeriko dev --preview my-app` or `jeriko browse --navigate <URL from status>`
7. Screenshot to check: `jeriko browse --screenshot <URL from status>`
7. Iterate: edit code → check screenshot → repeat
8. Deploy: `jeriko vercel deploy` or `jeriko github pages`

### Template Structure
```
client/
  src/
    App.tsx           ← main app (Wouter router)
    pages/            ← add pages here
    components/       ← app components
    components/ui/    ← 50+ shadcn components (ready to import)
    hooks/            ← custom hooks
    contexts/         ← React contexts
    lib/              ← utilities
  index.html
  public/
server/               ← Express server (web-db-user only)
shared/               ← shared types
vite.config.ts
package.json
```

### DO NOT
- Run `npm create vite` or `npx create-react-app` — use the templates
- Install shadcn manually — it's pre-installed in the templates
- Create bare HTML files — use the React templates

## Key Docs

- `docs/COMMANDS.md` — full CLI reference (all 37 commands, every flag)
- `docs/ARCHITECTURE.md` — system design, three layers, data flow
- `docs/CONTRIBUTING.md` — how to add commands, code style, templates
- `docs/SECURITY.md` — security model, what exists, what doesn't
- `docs/PLUGINS.md` — plugin system, trust, env isolation
- `docs/TRIGGERS.md` — cron, webhook, email, http, file triggers
- `BLUEPRINT.md` — full original CLI reference (archived from this file)
