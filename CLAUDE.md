# JerikoBot — Developer Guide

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

## Architecture (3 layers)

```
Layer 3: Server    → server/index.js (Express + WS + Telegram + WhatsApp + Triggers)
Layer 2: CLI       → bin/jeriko (dispatcher) → bin/jeriko-* (36 commands)
Layer 1: Libraries → tools/*.js (reusable functions, also used by Telegram slash cmds)
```

Shared infra: `lib/cli.js` (parseArgs, ok, fail, readStdin, run, escapeAppleScript)
Plugin SDK: `lib/plugins.js` (registry, trust, env isolation, audit)

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

## Key Docs

- `docs/COMMANDS.md` — full CLI reference (all 37 commands, every flag)
- `docs/ARCHITECTURE.md` — system design, three layers, data flow
- `docs/CONTRIBUTING.md` — how to add commands, code style, templates
- `docs/SECURITY.md` — security model, what exists, what doesn't
- `docs/PLUGINS.md` — plugin system, trust, env isolation
- `docs/TRIGGERS.md` — cron, webhook, email, http, file triggers
- `BLUEPRINT.md` — full original CLI reference (archived from this file)
