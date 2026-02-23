# JerikoBot

Unix-first CLI toolkit that gives any AI model full machine control. 28+ commands. Model-agnostic. Composable via pipes. Zero runtime overhead.

```
Human (or AI) --> jeriko <command> --> stdout JSON --> next command or AI
```

Any AI with shell access can control the entire machine through `jeriko` commands. No proprietary tool abstractions, no SDKs, no function-calling schemas. Just Unix.

## Quick Start

```bash
# Install globally
npm install -g jerikobot

# Initialize (generates .env, verifies commands)
jeriko init

# Verify
jeriko sys --format text
```

`jeriko init` walks through 4 steps:
1. AI backend selection (Claude or OpenAI)
2. Telegram bot token (optional)
3. NODE_AUTH_SECRET generation
4. Verification checks

Non-interactive mode:

```bash
jeriko init --yes --ai claude --skip-telegram
```

## Core Commands

```bash
# System
jeriko sys                          # full system info
jeriko sys --processes --limit 5    # top processes
jeriko sys --battery                # battery status

# Search
jeriko search "Node.js streams"

# Files
jeriko fs --ls .
jeriko fs --cat package.json
jeriko fs --grep . "TODO" --glob "*.js"

# Shell
jeriko exec ls -la
jeriko exec --timeout 5000 "long-running-task"

# Browser (Playwright)
jeriko browse --screenshot "https://example.com"
jeriko browse --navigate "https://example.com" --text --links

# Desktop + Camera
jeriko screenshot
jeriko camera --photo

# Apple Apps (macOS)
jeriko notes --list
jeriko remind --create "Buy milk" --due "tomorrow 9am"
jeriko calendar --week
jeriko contacts --search "John"
jeriko msg --send "+1234567890" --message "hello"
jeriko music --play "Bohemian Rhapsody"
jeriko clipboard --get

# Audio
jeriko audio --say "Hello world"
jeriko audio --record 5
jeriko audio --volume 50

# System Control
jeriko window --list
jeriko proc --find "node"
jeriko net --ping google.com
jeriko open https://example.com

# Notifications
jeriko notify --message "Deploy complete"

# Payments
jeriko stripe customers list
jeriko stripe payments create --amount 5000 --currency usd

# Social
jeriko x post "Hello from JerikoBot"
jeriko x search "topic" --limit 10
```

Full command reference: [CLAUDE.md](../CLAUDE.md)

Architecture details and future design notes:
- [System Architecture](ARCHITECTURE.md)
- See `Future Direction: OS-Centric Memory + Thin Gateway` in [System Architecture](ARCHITECTURE.md)
- See `OS Connectivity as First-Class Primitive` in [System Architecture](ARCHITECTURE.md)

## Connect an AI

### Claude Code (recommended)

Claude Code auto-discovers JerikoBot commands via `CLAUDE.md`. No extra setup needed -- just run `claude` in the project directory.

### OpenAI / Any Model

Generate a system prompt any AI can use:

```bash
# Raw text prompt (pipe to any AI)
jeriko discover --format raw

# Structured JSON metadata
jeriko discover --json

# List available commands
jeriko discover --list

# Custom bot name
jeriko discover --name "MyAssistant" --format raw
```

The generated prompt includes all installed commands (core + plugins) and teaches the AI the JSON output contract.

### Programmatic: Router

The server's `router.js` auto-discovers commands on startup and injects session memory into every AI call:

```bash
npm start
# Telegram: send any text message -> Claude executes it
# WhatsApp: same
```

## Output Formats

Every command supports 3 output formats:

```bash
jeriko --format json sys --info    # {"ok":true,"data":{...}}
jeriko --format text sys --info    # key=value (AI-optimized, minimal tokens)
jeriko --format logfmt sys --info  # ok=true key=value (greppable)
jeriko sys --info --format text    # --format works before or after command
```

| Format | Use Case |
|--------|----------|
| `json` | Default. Machine-parseable. Pipe between commands. |
| `text` | AI consumption. Minimal tokens, instant comprehension. |
| `logfmt` | Structured logs. Grep-friendly key=value pairs. |

Errors follow the same format:
- JSON: `{"ok":false,"error":"message"}`
- Text: `error message`
- Logfmt: `ok=false error="message"`

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Network error |
| 3 | Auth error |
| 5 | Not found |
| 7 | Timeout |

## Piping Patterns

```bash
# Pipe system info to Telegram
jeriko sys --info | jeriko notify

# Search and notify
jeriko search "weather" | jeriko notify

# Screenshot a page and send it
jeriko browse --screenshot "https://example.com" | jeriko notify --photo -

# Chain commands
jeriko browse --navigate "https://example.com" --screenshot && jeriko notify --message "Done"

# Read clipboard, search, notify
jeriko clipboard | jeriko search | jeriko notify
```

## Plugins

Third-party plugins extend JerikoBot with new commands:

```bash
# Install a plugin from npm
jeriko install jeriko-plugin-github

# Review and trust it
jeriko trust jeriko-plugin-github --yes

# Use its commands like any core command
jeriko gh-issues --list

# List installed plugins
jeriko install --list
```

See [PLUGINS.md](PLUGINS.md) for the full plugin author guide.

## Server Setup

The server runs Telegram bot, WhatsApp integration, WebSocket hub, and trigger engine:

```bash
# Configure .env (see Environment Variables below)
cp .env.example .env

# Start
npm start

# Or background via CLI
jeriko server --start

# Check status
jeriko server --status

# Stop
jeriko server --stop
```

## Requirements

| Dependency | Required | Notes |
|-----------|----------|-------|
| Node.js >= 18 | Yes | ES2022 features, native fetch |
| npm | Yes | Package management |
| macOS | Full support | All 28+ commands |
| Linux | Core support | sys, fs, exec, search, browse, net, proc, stripe, notify |
| Windows | Via WSL | Run inside WSL for full compatibility |

### Optional Dependencies

| Package | Commands | Install |
|---------|----------|---------|
| Playwright | `browse` | `npx playwright install` |
| ffmpeg | `camera`, `audio --record` | `brew install ffmpeg` |
| Claude Code | AI routing (Claude backend) | `npm install -g @anthropic-ai/claude-code` |

## Environment Variables

Create a `.env` file in the project root (or run `jeriko init`):

| Variable | Required | Description |
|----------|----------|-------------|
| `AI_BACKEND` | No | `claude` (default) or `openai` |
| `ANTHROPIC_API_KEY` | For Claude | API key for Claude backend |
| `OPENAI_API_KEY` | For OpenAI | API key when `AI_BACKEND=openai` |
| `OPENAI_MODEL` | No | OpenAI model (default: `gpt-4o`) |
| `TELEGRAM_BOT_TOKEN` | For Telegram | Token from @BotFather |
| `ADMIN_TELEGRAM_IDS` | For Telegram | Comma-separated allowed user IDs |
| `NODE_AUTH_SECRET` | For multi-machine | HMAC secret for WebSocket auth |
| `PROXY_PORT` | No | Server port (default: `3000`) |
| `DEFAULT_NODE` | No | Default target machine (default: `local`) |
| `WHATSAPP_ADMIN_PHONE` | For WhatsApp | Admin phone number (no +, with country code) |
| `IMAP_HOST` | For email | IMAP server (default: `imap.gmail.com`) |
| `IMAP_PORT` | For email | IMAP port (default: `993`) |
| `IMAP_USER` | For email | Email address |
| `IMAP_PASSWORD` | For email | Email password or app password |
| `STRIPE_SECRET_KEY` | For Stripe | Stripe API secret key |
| `X_BEARER_TOKEN` | For X.com | X API bearer token |
| `X_CLIENT_ID` | For X.com | X OAuth client ID |
| `X_CLIENT_SECRET` | For X.com | X OAuth client secret |

## Platform Support

### macOS (Full)

All commands work natively. Apple app commands (Notes, Reminders, Calendar, Contacts, Messages, Music) use AppleScript. Window management uses AppleScript. Screenshots use native APIs.

### Linux (Core)

Commands that work: `sys`, `fs`, `exec`, `search`, `browse`, `net`, `proc`, `notify`, `stripe`, `x`, `email`, `location`, `memory`, `discover`, `clipboard`, `open`, `server`.

Commands that require macOS: `notes`, `remind`, `calendar`, `contacts`, `msg`, `music`, `window`, `audio --say`, `screenshot` (uses macOS screencapture).

### Windows

Run JerikoBot inside WSL (Windows Subsystem for Linux). Core commands work as they do on Linux.

## Uninstall

```bash
# Remove global install
npm uninstall -g jerikobot

# Remove plugin data
rm -rf ~/.jeriko

# Remove project data
rm -rf data/session.jsonl data/memory.json data/triggers.json data/trigger-log.json
```
