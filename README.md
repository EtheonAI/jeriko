# JerikoBot

Unix-first CLI toolkit that gives any AI model full machine control. 35+ commands. Model-agnostic. Composable via pipes. Zero vendor lock-in.

One binary. Every command returns JSON. Any AI with `exec()` becomes an autonomous agent.

## Table of Contents

- [Install](#install)
- [Quick Start](#quick-start)
- [Connect Any AI](#connect-any-ai)
- [Output Formats](#output-formats)
- [All Commands](#all-commands)
- [Piping & Composition](#piping--composition)
- [Plugin System](#plugin-system)
- [Triggers](#triggers)
- [Multi-Machine](#multi-machine)
- [Server & API](#server--api)
- [Interactive Chat Mode](#interactive-chat-mode)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Platform Support](#platform-support)
- [Security](#security)
- [Docs](#docs)
- [License](#license)

---

## Install

```bash
# npm (recommended)
npm install -g jerikobot

# From source
git clone https://github.com/khaleel737/jerikobot.git
cd jerikobot && npm install
npm link   # makes `jeriko` available globally

# First-run setup (6-step interactive wizard)
jeriko init
```

`jeriko init` walks you through:

1. **AI Backend** — Claude Code, Anthropic API, OpenAI, or local model (Ollama/LM Studio)
2. **Telegram Bot** — connect via BotFather token + admin ID allowlist
3. **Security** — auto-generates `NODE_AUTH_SECRET`, sets `.env` to 600
4. **Tunnel** — optional localtunnel or Cloudflare tunnel for webhooks
5. **Server** — start the JerikoBot server (HTTP + WebSocket + Telegram + WhatsApp)
6. **Verify** — runs `jeriko sys`, `jeriko discover`, `jeriko exec` to confirm everything works

Non-interactive mode:

```bash
jeriko init --ai claude --yes
jeriko init --skip-ai --skip-telegram --yes   # minimal setup
```

See [docs/INSTALL.md](docs/INSTALL.md) for the full installation guide.

---

## Quick Start

```bash
jeriko sys                                    # system info (CPU, RAM, disk, network)
jeriko search "Node.js streams"               # web search via DuckDuckGo
jeriko fs --ls .                              # list files
jeriko exec uptime                            # run any shell command
jeriko browse --screenshot "https://x.com"    # browser automation + screenshot
jeriko stripe customers list                  # Stripe API operations
jeriko x search "AI agents"                   # search X.com (Twitter)
jeriko sys | jeriko notify                    # pipe system info to Telegram
jeriko                                        # interactive AI chat (REPL)
```

---

## Connect Any AI

JerikoBot is model-agnostic. Any AI that can execute shell commands can use it.

### Claude Code

```bash
# Auto-generate a system prompt from installed commands
jeriko discover --raw | claude -p --system-prompt -
```

### Anthropic API (Production)

Set `AI_BACKEND=claude` in `.env` with your `ANTHROPIC_API_KEY`. The router auto-discovers all commands via `jeriko discover` and provides the AI with a bash tool for executing them. Supports up to 15 tool-call turns per request.

### OpenAI

Set `AI_BACKEND=openai` with your `OPENAI_API_KEY`. Same agent loop — system prompt auto-generated, bash tool provided, up to 15 turns.

### Local Models (Ollama, LM Studio, vLLM, llama.cpp)

Run entirely offline. Set `AI_BACKEND=local` in `.env`.

```bash
AI_BACKEND=local
LOCAL_MODEL_URL=http://localhost:11434/v1   # Ollama default
LOCAL_MODEL=llama3.2
```

| Runtime | Default URL | Notes |
|---------|------------|-------|
| Ollama | `http://localhost:11434/v1` | Most popular, auto-detected by `jeriko init` |
| LM Studio | `http://localhost:1234/v1` | GUI-based |
| vLLM | `http://localhost:8000/v1` | Production-grade serving |
| llama.cpp server | `http://localhost:8080/v1` | Lightweight C++ |
| Any OpenAI-compatible | Custom URL | Set `LOCAL_MODEL_URL` |

Uses the `/v1/chat/completions` endpoint with `stream: false` (avoids the Ollama tool_calls streaming bug).

### How Discovery Works

`jeriko discover` reads `CLAUDE.md` and all installed commands, then generates a complete system prompt. The router calls this on startup, so every AI backend automatically knows every command.

```bash
jeriko discover --raw       # raw text system prompt (for piping to any AI)
jeriko discover --list      # list available commands
jeriko discover --json      # structured command metadata
jeriko discover --name "MyBot"  # custom bot name in prompt
```

---

## Output Formats

Every command supports 3 output formats via the `--format` flag:

```bash
jeriko sys --format json      # JSON (default): {"ok":true,"data":{...}}
jeriko sys --format text      # AI-optimized:   key=value key2=value2
jeriko sys --format logfmt    # Structured log: ok=true key=value
```

| Format | Use Case | Example |
|--------|----------|---------|
| **json** (default) | Machine-parseable, piping between commands | `{"ok":true,"data":{"hostname":"mac"}}` |
| **text** | AI-optimized, ~30% fewer tokens | `hostname=mac cpu=Apple_M1 memory.used=8GB` |
| **logfmt** | Structured logs, greppable | `ok=true hostname=mac cpu=Apple_M1` |

The `--format` flag works anywhere in the argument list:

```bash
jeriko --format text sys --info    # before the command
jeriko sys --info --format text    # after the command
```

**Error output:**

| Format | Error |
|--------|-------|
| json | `{"ok":false,"error":"message"}` |
| text | `error message` |
| logfmt | `ok=false error="message"` |

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Network error |
| 3 | Auth error |
| 5 | Not found |
| 7 | Timeout |

---

## All Commands

37 commands (dispatcher + 36 bin files), grouped by category.

### System

| Command | Description |
|---------|-------------|
| `jeriko sys` | System info — CPU, memory, disk, hostname, uptime |
| `jeriko sys --processes --limit 5` | Top processes by CPU |
| `jeriko sys --network` | Network interfaces + traffic stats |
| `jeriko sys --battery` | Battery status |
| `jeriko proc` | Process management — list, kill, find, start background |
| `jeriko proc --kill 12345` | Kill process by PID |
| `jeriko proc --kill-name "node"` | Kill by name pattern |
| `jeriko proc --find "python"` | Find processes by name |
| `jeriko proc --start "sleep 999"` | Run in background, returns PID |
| `jeriko net --ping google.com` | Ping host |
| `jeriko net --dns example.com` | DNS lookup |
| `jeriko net --ports` | List listening ports |
| `jeriko net --curl "https://api.example.com"` | HTTP requests (GET, POST, custom headers) |
| `jeriko net --download "https://..." --to ./file.zip` | Download files |
| `jeriko net --ip` | Public IP address |
| `jeriko exec ls -la` | Execute any shell command |
| `jeriko exec --timeout 5000 "sleep 10"` | With timeout (ms) |
| `jeriko exec --cwd /tmp "pwd"` | With working directory |

### Files

| Command | Description |
|---------|-------------|
| `jeriko fs --ls .` | List directory |
| `jeriko fs --cat file.txt` | Read file |
| `echo "data" \| jeriko fs --write /tmp/file.txt` | Write stdin to file |
| `jeriko fs --write /tmp/file.txt --append` | Append mode |
| `jeriko fs --find . "*.js"` | Find files by name pattern |
| `jeriko fs --grep . "TODO" --glob "*.js"` | Search file contents |
| `jeriko fs --info package.json` | File metadata (size, permissions, dates) |

### Browser & Search

| Command | Description |
|---------|-------------|
| `jeriko browse --navigate "https://example.com"` | Navigate to URL |
| `jeriko browse --screenshot "https://example.com"` | Navigate + screenshot |
| `jeriko browse --text` | Get page text |
| `jeriko browse --links` | Get all links |
| `jeriko browse --click "#submit"` | Click element by CSS selector |
| `jeriko browse --type "#email" --value "user@example.com"` | Type into input field |
| `jeriko browse --scroll down` | Scroll viewport |
| `jeriko browse --js "document.title"` | Execute JavaScript |
| `jeriko search "Node.js streams"` | Web search via DuckDuckGo |
| `jeriko screenshot` | Desktop screenshot |
| `jeriko screenshot --list` | List available displays |
| `jeriko screenshot --display 1` | Capture specific display |

> **Note:** Each `jeriko browse` call is a fresh browser. Combine flags in one call to share browser state:
> `jeriko browse --navigate "https://example.com" --screenshot --text --links`

### Desktop (macOS)

| Command | Description |
|---------|-------------|
| `jeriko window --list` | List all visible windows (app, title, position, size) |
| `jeriko window --apps` | List running foreground apps |
| `jeriko window --focus "Safari"` | Bring app to front |
| `jeriko window --minimize "Safari"` | Minimize all windows of app |
| `jeriko window --close "Safari"` | Close all windows of app |
| `jeriko window --app "Terminal"` | Launch or activate app |
| `jeriko window --quit "Safari"` | Quit an app |
| `jeriko window --resize "Safari" --width 1280 --height 720` | Resize window |
| `jeriko window --fullscreen "Safari"` | Toggle fullscreen |
| `jeriko open https://example.com` | Open URL in default browser |
| `jeriko open /path/to/file.pdf` | Open file in default app |
| `jeriko open /path/to/file --with "Visual Studio Code"` | Open with specific app |
| `jeriko open /path/to/dir --reveal` | Reveal in Finder |
| `jeriko open server` | Open http://localhost:3000 |
| `jeriko clipboard` | Read clipboard |
| `jeriko clipboard --set "text"` | Write to clipboard |

### Communication

| Command | Description |
|---------|-------------|
| `jeriko notify --message "Hello"` | Send message to Telegram |
| `jeriko notify --photo /path/to/image.png` | Send photo to Telegram |
| `jeriko notify --document /path/to/file.pdf` | Send document to Telegram |
| `jeriko email` | Latest 10 emails (IMAP) |
| `jeriko email --unread` | Unread emails only |
| `jeriko email --search "invoice"` | Search emails |
| `jeriko email --from "boss@co.com"` | Filter by sender |
| `jeriko email init` | Interactive IMAP setup |
| `jeriko mail` | Send emails (SMTP) |
| `jeriko msg --send "+1234567890" --message "hello"` | Send iMessage |
| `jeriko msg --read` | Recent iMessage chats |

### macOS Native

| Command | Description |
|---------|-------------|
| `jeriko notes --list` | List all Apple Notes |
| `jeriko notes --search "meeting"` | Search notes by title |
| `jeriko notes --read "My Note"` | Read note content |
| `jeriko notes --create "Title" --body "content"` | Create note |
| `jeriko remind --list` | List incomplete reminders |
| `jeriko remind --lists` | List all reminder lists |
| `jeriko remind --create "Buy milk" --due "tomorrow 9am"` | Create reminder |
| `jeriko remind --complete "Buy milk"` | Complete reminder |
| `jeriko calendar` | Today's events |
| `jeriko calendar --week` | Next 7 days |
| `jeriko calendar --calendars` | List all calendars |
| `jeriko calendar --create "Meeting" --start "..." --end "..."` | Create event |
| `jeriko contacts --search "John"` | Search contacts |
| `jeriko contacts --list --limit 20` | List contacts |
| `jeriko music` | Current track |
| `jeriko music --play "Bohemian Rhapsody"` | Search and play |
| `jeriko music --pause` / `--next` / `--prev` | Playback controls |
| `jeriko music --spotify --play` | Use Spotify instead |
| `jeriko audio --record 5` | Record 5s from microphone |
| `jeriko audio --say "Hello world"` | Text-to-speech |
| `jeriko audio --volume 50` | Set volume |
| `jeriko audio --mute` / `--unmute` | Mute controls |

### Media

| Command | Description |
|---------|-------------|
| `jeriko camera` | Take a photo (webcam) |
| `jeriko camera --video --duration 10` | Record 10s video |

### Location

| Command | Description |
|---------|-------------|
| `jeriko location` | IP-based geolocation (city, coords, ISP, timezone) |

### Payments & APIs

| Command | Description |
|---------|-------------|
| `jeriko stripe init` | Interactive Stripe setup |
| `jeriko stripe customers list` | List customers |
| `jeriko stripe customers create --name "..." --email "..."` | Create customer |
| `jeriko stripe products list` | List products |
| `jeriko stripe prices create --product prod_xxx --amount 2000 --currency usd` | Create price |
| `jeriko stripe payments list` | List payment intents |
| `jeriko stripe payments create --amount 5000 --currency usd` | Create payment |
| `jeriko stripe invoices list` | List invoices |
| `jeriko stripe subscriptions create --customer cus_xxx --price price_xxx` | Create subscription |
| `jeriko stripe checkout create --price price_xxx --success-url ... --cancel-url ...` | Checkout session |
| `jeriko stripe links create --price price_xxx` | Payment links |
| `jeriko stripe balance` | Account balance |
| `jeriko stripe webhooks create --url ... --events "..."` | Create webhook |
| `jeriko stripe-hook` | Stripe webhook receiver (server integration) |
| `jeriko x init` | Interactive X.com setup |
| `jeriko x auth` | OAuth 2.0 PKCE login |
| `jeriko x post "Hello world"` | Create tweet |
| `jeriko x search "query"` | Search recent tweets |
| `jeriko x timeline` | Home timeline |
| `jeriko x timeline --user <handle>` | User's tweets |
| `jeriko x like <tweet_id>` / `unlike` / `retweet` / `bookmark` | Tweet actions |
| `jeriko x follow <handle>` / `unfollow` | Follow management |
| `jeriko x dm <handle> "message"` | Send DM |
| `jeriko x lists` / `--create` / `--add` / `--remove` | List management |
| `jeriko x me` | Authenticated user info |
| `jeriko twilio init` | Interactive Twilio setup |
| `jeriko twilio call +1234567890 --say "Hello"` | Text-to-speech call |
| `jeriko twilio call +1234567890 --play https://...` | Play audio in call |
| `jeriko twilio call +1234567890 --say "Hi" --record` | Call + record |
| `jeriko twilio sms +1234567890 "Hello"` | Send SMS |
| `jeriko twilio sms +1234567890 --media https://...` | Send MMS |
| `jeriko twilio calls` | List call history |
| `jeriko twilio messages` | List message history |
| `jeriko twilio recordings` | List recordings |
| `jeriko twilio account` | Account info + balance |
| `jeriko twilio numbers` | List owned phone numbers |

### Server & Plugins

| Command | Description |
|---------|-------------|
| `jeriko server` | Start server (foreground) |
| `jeriko server --start` | Start server (background, daemonized) |
| `jeriko server --stop` | Stop server |
| `jeriko server --restart` | Restart server |
| `jeriko server --status` | Check if running (PID, port) |
| `jeriko chat` | Interactive AI chat REPL |
| `jeriko install jeriko-weather` | Install plugin from npm |
| `jeriko install ./my-plugin` | Install from local path (dev) |
| `jeriko install --upgrade jeriko-weather` | Upgrade plugin |
| `jeriko install --list` | List installed plugins |
| `jeriko uninstall jeriko-weather` | Remove plugin |
| `jeriko trust jeriko-weather --yes` | Trust plugin (enable webhooks + AI prompts) |
| `jeriko trust --revoke jeriko-weather` | Revoke trust |
| `jeriko trust --list` | Show all plugins with trust status |
| `jeriko trust --audit` | Show security audit log |
| `jeriko plugin validate ./my-plugin` | Validate plugin manifest + files |
| `jeriko plugin test ./my-plugin` | Run plugin commands and verify output |
| `jeriko discover --raw` | Generate system prompt |
| `jeriko discover --list` | List available commands |
| `jeriko init` | First-run 6-step setup wizard |

### Memory

| Command | Description |
|---------|-------------|
| `jeriko memory` | Recent session history (default: 20) |
| `jeriko memory --recent 50` | Last 50 entries |
| `jeriko memory --search "deploy"` | Search memory |
| `jeriko memory --set "key" --value "val"` | Store key-value pair |
| `jeriko memory --get "key"` | Retrieve key-value pair |
| `jeriko memory --context` | Get context block for system prompt |
| `jeriko memory --log --command "..." --result '...'` | Log entry |
| `jeriko memory --clear` | Clear session log |

### Menu

| Command | Description |
|---------|-------------|
| `jeriko menu` | Interactive terminal menu |

See [docs/COMMANDS.md](docs/COMMANDS.md) for the full reference with flag tables and output samples.

---

## Piping & Composition

JerikoBot commands are Unix-native. They read stdin, write to stdout, and compose via pipes.

```bash
# Pipe system info to Telegram
jeriko sys --info | jeriko notify

# Search the web and send results to Telegram
jeriko search "weather today" | jeriko notify

# Screenshot a website and send the image
jeriko browse --screenshot "https://example.com" | jeriko notify --photo -

# Chain with &&
jeriko browse --navigate "https://example.com" --screenshot && jeriko notify --message "Done"

# Search stdin
echo "weather today" | jeriko search

# Write stdin to file
echo "hello world" | jeriko fs --write /tmp/test.txt

# Pipe to clipboard
jeriko sys --format text | jeriko clipboard --set

# Read from stdin into exec
echo "uptime" | jeriko exec
```

When stdin is JSON from another jeriko command (e.g. `jeriko sys | jeriko notify`), the `data` field is extracted and formatted automatically.

---

## Plugin System

Third-party commands installed to `~/.jeriko/plugins/`. Each plugin provides:

- **Commands** — executables in `bin/` that follow the JerikoBot output contract
- **Manifest** — `jeriko-plugin.json` declaring name, namespace, commands, env vars, webhooks, platform support
- **AI Prompt** — optional `PROMPT.md` loaded on-demand into the AI system prompt (trusted plugins only)
- **Command Docs** — `COMMANDS.md` always included in `jeriko discover` output

### Install & Manage

```bash
jeriko install jeriko-weather          # install from npm
jeriko install jeriko-weather@2.1.0    # specific version
jeriko install ./my-plugin             # install from local path (dev mode)
jeriko install --upgrade jeriko-weather # upgrade to latest
jeriko install --list                  # list installed plugins with trust status
jeriko install --info jeriko-weather   # show plugin details
jeriko uninstall jeriko-weather        # remove
```

### Trust Model

Plugins are **untrusted by default**. Untrusted plugins can run commands but cannot:

- Register webhook endpoints on the server
- Inject `PROMPT.md` into the AI system prompt

Trust a plugin after reviewing its permissions:

```bash
jeriko trust jeriko-weather --yes      # trust (enables webhooks + prompts)
jeriko trust --revoke jeriko-weather   # revoke trust
jeriko trust --list                    # show trust status
jeriko trust --audit                   # security audit log
```

### Security

- **Env isolation** — plugins only receive safe system vars (`PATH`, `HOME`, `USER`, `SHELL`, `TERM`, `NODE_ENV`, `LANG`, `LC_ALL`, `TZ`) plus their explicitly declared env vars. They cannot access `STRIPE_SECRET_KEY`, `ANTHROPIC_API_KEY`, etc. unless declared in their manifest.
- **Namespace reservation** — core command names are reserved and cannot be claimed by plugins
- **Integrity hashing** — SHA-512 hash of `jeriko-plugin.json` stored on install, verified on trust operations
- **Audit logging** — all trust changes, installs, webhook executions logged to `~/.jeriko/audit.log` (auto-rotated at 2MB)
- **Conflict detection** — duplicate namespaces and command names detected on install

### Create Your Own

```bash
# Validate before publishing
jeriko plugin validate ./my-plugin     # validate manifest, check files
jeriko plugin test ./my-plugin         # run commands and verify output
```

See [docs/PLUGIN-SPEC.md](docs/PLUGIN-SPEC.md) for the full plugin specification.

---

## Triggers

Triggers are reactive automations — events that fire actions. Created via Telegram (`/watch`) or the triggers API.

### 5 Trigger Types

| Type | Event Source | Example |
|------|-------------|---------|
| **cron** | Time schedule (cron syntax) | `/watch cron "0 9 * * MON" run weekly report` |
| **webhook** | Incoming HTTP POST | `/watch webhook stripe log payment details` |
| **email** | New email (IMAP polling) | `/watch email from:boss@co.com summarize and notify me` |
| **http_monitor** | URL status change | `/watch http https://mysite.com alert me if it goes down` |
| **file_watch** | File system changes | `/watch file /var/log/app.log alert on errors` |

### How They Work

1. **Event fires** — cron ticks, webhook received, email arrives, URL goes down, file changes
2. **Prompt built** — event data + trigger action composed into a prompt
3. **Action executed** — Claude processes the prompt (or a shell command runs directly)
4. **User notified** — result sent via Telegram + macOS notification
5. **State tracked** — run count, last run, consecutive errors logged

**Auto-disable:** After 5 consecutive errors, a trigger is automatically disabled.

**Max runs:** Set a `maxRuns` limit and the trigger disables itself after that many executions.

### Manage via Telegram

```
/watch <description>       — create trigger
/triggers                  — list all triggers
/trigger_pause <id>        — pause
/trigger_resume <id>       — resume
/trigger_delete <id>       — delete
/trigger_log               — recent executions
```

Trigger data is persisted in `data/triggers.json`. Execution history in `data/trigger-log.json` (last 500 entries).

See [docs/TRIGGERS.md](docs/TRIGGERS.md) for details.

---

## Multi-Machine

JerikoBot runs as a hub that controls remote nodes via WebSocket.

```
┌──────────────┐       WebSocket       ┌──────────────┐
│   Hub/Proxy  │◄─────────────────────►│   Node Agent  │
│  (server/)   │                       │  (agent.js)   │
│              │◄──────────────────────►│  @macbook     │
│  port 3000   │                       │               │
│              │◄──────────────────────►│  @server      │
└──────────────┘                       └──────────────┘
```

### Setup

1. **Hub:** Start the server (`jeriko server --start` or `npm start`)
2. **Generate token:** `/token macbook` in Telegram or `GET /api/token/macbook`
3. **Node:** Install and connect the agent

```bash
# Quick install on remote node
curl -sL https://yourserver.com/install | bash -s -- wss://yourserver.com/ws macbook <token>

# Or manual
NODE_NAME=macbook NODE_TOKEN=<token> PROXY_URL=wss://yourserver.com/ws node agent/agent.js
```

### Targeting

Prefix messages with `@nodename` to route to a specific machine:

```
@macbook take a screenshot and show me
@server check disk usage
```

Without `@prefix`, commands run locally (configurable via `DEFAULT_NODE`).

### Protocol

- **HMAC-SHA256** token auth with timing-safe comparison
- **30s heartbeat** ping/pong
- **Exponential backoff** reconnection (1s → 30s max)
- **5-minute timeout** per task
- Systemd service file included for auto-start on Linux

See [docs/MULTI-MACHINE.md](docs/MULTI-MACHINE.md) for the full setup guide.

---

## Server & API

The server (`npm start` or `jeriko server --start`) provides:

### HTTP Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | None | Health check (name, status, uptime, nodes, triggers) |
| GET | `/api/nodes` | Bearer | List connected WebSocket nodes |
| GET | `/api/token/:name` | Bearer | Generate auth token for a node |
| GET | `/api/triggers` | Bearer | List all triggers |
| GET | `/hooks` | None | List webhook URLs |
| POST | `/hooks/:triggerId` | Signature | Receive webhook (trigger fires) |
| POST | `/hooks/plugin/:ns/:name` | Signature | Plugin webhook endpoint (trusted only) |

**Auth:** Bearer token = `NODE_AUTH_SECRET` from `.env`. Webhook signature verification supports GitHub (`sha256=<hex>`), Stripe (`t=...,v1=...`), and raw HMAC-SHA256.

### WebSocket

Connect to `ws://host:port/ws?name=<nodeName>&token=<token>`.

Messages: `{ taskId, command }` (hub→node), `{ taskId, type: "chunk"|"result"|"error", data }` (node→hub).

### Telegram Bot

33 slash commands registered automatically from the tool registry, plus:

| Command | Description |
|---------|-------------|
| `/start` | Welcome + help |
| `/nodes` | Connected machines |
| `/status` | Health check (uptime, nodes, triggers, memory) |
| `/token <name>` | Generate node auth token |
| `/watch <desc>` | Create trigger |
| `/triggers` | List triggers |
| `/trigger_delete <id>` | Delete trigger |
| `/trigger_pause <id>` | Pause trigger |
| `/trigger_resume <id>` | Resume trigger |
| `/trigger_log` | Recent trigger executions |

Free-text messages are routed to the AI backend (Claude/OpenAI/local).

### WhatsApp

Connected via Baileys (WhatsApp Web protocol). QR code served at `/qr`.

### Rate Limiting

120 requests per minute per IP (configurable via `express-rate-limit`).

See [docs/API.md](docs/API.md) for the full server API reference.

---

## Interactive Chat Mode

Running `jeriko` with no arguments launches an interactive AI chat REPL:

```bash
jeriko           # launch chat
jeriko chat      # same
```

Features:

- Spinner states: thinking, responding, tool calls
- Streaming output from all backends (Claude Code, Anthropic API, OpenAI, local)
- Tool call visibility — shows which bash commands the AI is executing
- Auto-discovers all commands via `jeriko discover`
- Session context injected from `jeriko memory`

---

## Architecture

### Three Layers

```
CLI Layer           Library Layer         Server Layer
bin/jeriko-*  ───►  tools/*.js     ───►  server/
(35 commands)       (6 core libs)        (Express + WS + Telegram + WhatsApp)
```

1. **CLI** (`bin/jeriko-*`) — individual command scripts. Parse args via `lib/cli.js`, call library functions, output JSON/text/logfmt.
2. **Tools** (`tools/*.js`) — reusable library functions. Also used by Telegram slash commands in `tools/index.js`.
3. **Server** (`server/`) — Express HTTP, WebSocket for multi-machine, Telegram bot, WhatsApp, trigger engine, AI router.

### Command Execution Flow

```
User → jeriko <cmd> [args]
         │
         ▼
    bin/jeriko (dispatcher)
         │
         ├─ Core? → bin/jeriko-<cmd> → tools/*.js → stdout (JSON)
         │
         └─ Plugin? → ~/.jeriko/plugins/<ns>/bin/<cmd> (restricted env) → stdout (JSON)
```

### AI Execution Flow

```
User message (Telegram / WhatsApp / chat REPL)
         │
         ▼
    server/router.js
         │
         ├─ @node prefix? → WebSocket → remote agent
         │
         └─ Local execution:
              │
              ├─ claude-code → spawn claude CLI
              ├─ claude → Anthropic API + bash tool (up to 15 turns)
              ├─ openai → OpenAI API + bash tool (up to 15 turns)
              └─ local → Ollama/LM Studio API + bash tool (up to 15 turns)
```

### Key Files

| File | Purpose |
|------|---------|
| `bin/jeriko` | Dispatcher — global flags, two-phase resolution (core → plugins) |
| `lib/cli.js` | Shared infra — `parseArgs`, `ok`, `fail`, `readStdin`, `run`, `escapeAppleScript`, formatters |
| `lib/plugins.js` | Plugin SDK — registry, trust, env isolation, audit, integrity, validation |
| `server/index.js` | Main entry — Express, WebSocket, Telegram, WhatsApp, plugin webhooks |
| `server/router.js` | AI backend — 4 backends, auto-discovers commands, injects session memory |
| `server/auth.js` | HMAC token auth, timing-safe comparison, Telegram ID allowlist |
| `server/telegram.js` | Telegram bot — 33 slash commands + trigger management + free-text AI routing |
| `server/websocket.js` | WebSocket hub — node registry, task routing, heartbeat |
| `server/triggers/engine.js` | Trigger lifecycle — cron, webhook, email, http_monitor, file_watch |
| `tools/index.js` | Tool registry — 33 Telegram slash commands |
| `agent/agent.js` | Remote node agent — WebSocket client, reconnection, Claude/API execution |

---

## Configuration

All configuration is in `.env` at the project root. See `.env.example` for the template.

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AI_BACKEND` | No | `claude-code` | AI backend: `claude-code`, `claude`, `openai`, `local` |
| `ANTHROPIC_API_KEY` | If `claude` | — | Anthropic API key |
| `CLAUDE_MODEL` | No | `claude-sonnet-4-20250514` | Claude model ID |
| `OPENAI_API_KEY` | If `openai` | — | OpenAI API key |
| `OPENAI_MODEL` | No | `gpt-4o` | OpenAI model ID |
| `LOCAL_MODEL_URL` | If `local` | `http://localhost:11434/v1` | Local model server URL |
| `LOCAL_MODEL` | If `local` | `llama3.2` | Local model name |
| `LOCAL_API_KEY` | No | — | Optional API key for local server |
| `TELEGRAM_BOT_TOKEN` | For Telegram | — | Bot token from @BotFather |
| `ADMIN_TELEGRAM_IDS` | For Telegram | — | Comma-separated authorized user IDs |
| `PROXY_PORT` | No | `3000` | Server port |
| `NODE_AUTH_SECRET` | For server | — | Secret for HMAC token generation (auto-generated by `jeriko init`) |
| `WHATSAPP_ADMIN_PHONE` | For WhatsApp | — | Admin phone number (with country code, no +) |
| `DEFAULT_NODE` | No | `local` | Default target for commands without @prefix |
| `IMAP_HOST` | For email | `imap.gmail.com` | IMAP server host |
| `IMAP_PORT` | For email | `993` | IMAP server port |
| `IMAP_USER` | For email | — | IMAP username |
| `IMAP_PASSWORD` | For email | — | IMAP password (use App Password for Gmail) |
| `STRIPE_SECRET_KEY` | For Stripe | — | Stripe secret key (set via `jeriko stripe init`) |
| `X_BEARER_TOKEN` | For X.com | — | X.com Bearer token (set via `jeriko x init`) |
| `X_CLIENT_ID` | For X.com | — | X.com OAuth client ID |
| `X_CLIENT_SECRET` | For X.com | — | X.com OAuth client secret |
| `TWILIO_ACCOUNT_SID` | For Twilio | — | Twilio Account SID (set via `jeriko twilio init`) |
| `TWILIO_AUTH_TOKEN` | For Twilio | — | Twilio Auth Token |
| `TWILIO_PHONE_NUMBER` | For Twilio | — | Twilio phone number |
| `TUNNEL_PROVIDER` | No | — | `localtunnel` or `cloudflare` (set by `jeriko init`) |
| `TUNNEL_URL` | No | — | Public tunnel URL (auto-detected) |

See [docs/INSTALL.md](docs/INSTALL.md) for the full configuration reference.

---

## Platform Support

| Feature | macOS | Linux | Windows (WSL) |
|---------|-------|-------|---------------|
| Core commands (sys, fs, exec, search, browse, net, proc) | Full | Full | Full |
| Telegram / WhatsApp / Server | Full | Full | Full |
| Stripe / X.com / Twilio APIs | Full | Full | Full |
| AppleScript commands (notes, remind, calendar, contacts, music, msg, window, audio TTS) | Full | — | — |
| Desktop screenshot | Full | Partial | — |
| Camera (webcam) | Full | Full (ffmpeg) | — |
| Clipboard | Full | Full (xclip) | — |
| Open (URLs/files/apps) | Full | Full (xdg-open) | Partial |
| Multi-machine (agent) | Full | Full | Full |
| Plugins | Full | Full | Full |

**Required:** Node.js 18+, npm 8+

**Optional dependencies:**

| Dependency | Required For | Install |
|------------|-------------|---------|
| Playwright | `jeriko browse` | `npx playwright install` (auto-installed with npm) |
| ffmpeg | `jeriko camera`, `jeriko audio --record` | `brew install ffmpeg` / `apt install ffmpeg` |
| Claude Code CLI | `claude-code` backend | `npm install -g @anthropic-ai/claude-code` |

---

## Security

### Auth & Access Control

- **Telegram allowlist** — only user IDs in `ADMIN_TELEGRAM_IDS` can interact with the bot. Returns false when no IDs configured (deny-all default).
- **HMAC-SHA256 tokens** — WebSocket nodes authenticate with tokens derived from `NODE_AUTH_SECRET`. Timing-safe comparison prevents timing attacks.
- **Bearer auth** — admin API endpoints require `Authorization: Bearer <NODE_AUTH_SECRET>`.
- **NODE_AUTH_SECRET required** — server refuses to start/generate tokens if not set (no insecure defaults).

### Plugin Security

- **Untrusted by default** — new plugins cannot register webhooks or inject AI prompts.
- **Env isolation** — plugins only see declared env vars + safe system vars. Cannot access API keys or secrets they didn't declare.
- **Namespace reservation** — 30+ core command names are reserved; plugins cannot shadow them.
- **Integrity verification** — SHA-512 hash of manifest computed on install, verified on trust operations.
- **Audit logging** — all security-relevant operations logged to `~/.jeriko/audit.log` with timestamps. Auto-rotated at 2MB, keeps last 10,000 entries.
- **Webhook signature verification** — plugin webhooks support GitHub, Stripe, and raw HMAC signatures. Fail-closed: rejects if secret configured but signature missing/invalid.

### Shell Safety

- **Env stripping** — sensitive keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `STRIPE_SECRET_KEY`, etc.) stripped from `jeriko exec` subprocess environment.
- **AppleScript injection prevention** — `escapeAppleScript()` sanitizes all user input interpolated into AppleScript (notes, reminders, calendar, contacts, messages, music, audio).

### Webhook Verification

The server verifies incoming webhook signatures in three formats:

1. **GitHub** — `sha256=<hex>` (HMAC-SHA256 of raw body)
2. **Stripe** — `t=<timestamp>,v1=<signature>` (HMAC-SHA256 of `timestamp.body`)
3. **Raw HMAC** — plain hex digest comparison

All comparisons use `crypto.timingSafeEqual`.

---

## Docs

- [Installation Guide](docs/INSTALL.md)
- [Command Reference](docs/COMMANDS.md)
- [Plugin Specification](docs/PLUGIN-SPEC.md)
- [Multi-Machine Setup](docs/MULTI-MACHINE.md)
- [Server API Reference](docs/API.md)
- [Security Model](docs/SECURITY.md)
- [Triggers](docs/TRIGGERS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Build a Plugin](docs/PLUGINS.md)
- [Contributing](docs/CONTRIBUTING.md)

---

## Project Structure

```
bin/
  jeriko               # dispatcher (global flags, two-phase resolution)
  jeriko-sys           # system info
  jeriko-screenshot    # desktop capture
  jeriko-search        # web search
  jeriko-exec          # shell execution
  jeriko-fs            # file operations
  jeriko-browse        # browser automation (Playwright)
  jeriko-notify        # Telegram notifications
  jeriko-camera        # webcam photo/video
  jeriko-email         # IMAP email reader
  jeriko-mail          # SMTP email sender
  jeriko-notes         # Apple Notes
  jeriko-remind        # Apple Reminders
  jeriko-calendar      # Apple Calendar
  jeriko-contacts      # Apple Contacts
  jeriko-clipboard     # system clipboard
  jeriko-audio         # mic, volume, TTS
  jeriko-music         # Music/Spotify control
  jeriko-msg           # iMessage
  jeriko-location      # IP geolocation
  jeriko-discover      # auto-generate system prompts for AI
  jeriko-memory        # session memory & key-value store
  jeriko-window        # window/app management (macOS)
  jeriko-proc          # process management
  jeriko-net           # network utilities
  jeriko-server        # server lifecycle
  jeriko-open          # open URLs, files, apps
  jeriko-stripe        # Stripe payments API
  jeriko-stripe-hook   # Stripe webhook receiver
  jeriko-x             # X.com (Twitter) API
  jeriko-twilio        # Twilio Voice + SMS/MMS
  jeriko-install       # plugin installer
  jeriko-uninstall     # plugin remover
  jeriko-trust         # plugin trust management
  jeriko-plugin        # plugin validate/test
  jeriko-init          # first-run onboarding
  jeriko-chat          # interactive AI REPL
  jeriko-menu          # terminal menu
lib/
  cli.js               # shared CLI infra (parseArgs, ok, fail, formatters, escapeAppleScript)
  plugins.js           # plugin SDK (registry, trust, env isolation, audit, integrity)
tools/
  system.js            # system info functions
  screenshot.js        # desktop screenshot
  search.js            # DuckDuckGo search
  shell.js             # shell exec (env-stripped)
  files.js             # file operations
  browser.js           # Playwright browser
  index.js             # tool registry (33 Telegram slash commands)
data/
  session.jsonl        # auto-logged session history
  memory.json          # persistent key-value store
  triggers.json        # trigger definitions
  trigger-log.json     # trigger execution log
server/
  index.js             # main entry (Express + WebSocket + Telegram + WhatsApp)
  router.js            # AI backend (4 backends, auto-discover, memory injection)
  auth.js              # HMAC token auth + admin ID validation
  telegram.js          # Telegram bot (33 tools + triggers + free-text AI)
  whatsapp.js          # WhatsApp via Baileys
  websocket.js         # WebSocket hub (node registry, task routing, heartbeat)
  triggers/
    engine.js          # trigger lifecycle (5 types)
    store.js           # trigger persistence (JSON file)
    executor.js        # action execution (Claude or shell)
    notify.js          # macOS + node-notifier notifications
    webhooks.js        # webhook receiver + signature verification
    pollers/
      email.js         # IMAP email polling
agent/
  agent.js             # remote node agent (WebSocket client)
  install.sh           # one-line installer for remote nodes
  jerikobot-agent.service  # systemd service file
~/.jeriko/
  plugins/             # installed third-party plugins
  plugins/registry.json # plugin registry (trust, versions, integrity)
  audit.log            # security audit log
```

---

## License

MIT — [Etheon](https://github.com/khaleel737)
