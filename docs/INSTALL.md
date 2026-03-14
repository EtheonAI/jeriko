# Jeriko Installation Guide

Complete installation and configuration reference for Jeriko, a Unix-first CLI toolkit for AI agents.

---

## Requirements

| Requirement | Minimum Version | Check Command |
|-------------|----------------|---------------|
| **Node.js** | 18+ | `node --version` |
| **npm** | 8+ | `npm --version` |

Jeriko uses Node.js built-in `fetch` (available since Node 18) and ES module features. Older versions will not work.

---

## Install Methods

### npm (Recommended)

```bash
npm install -g Jeriko
```

This installs the `jeriko` command globally. Verify with:

```bash
jeriko sys
```

### From Source

```bash
git clone https://github.com/etheonai/jeriko.git
cd jeriko
bun install
bun run build
```

`npm link` creates a global symlink so the `jeriko` command is available system-wide. To remove the link later, run `npm unlink -g Jeriko` from the project directory.

### Development Mode

For active development with auto-reload:

```bash
git clone https://github.com/etheonai/jeriko.git
cd jeriko
npm install
npm run dev
```

This starts the server with `node --watch` for automatic restarts on file changes.

---

## First-Run Setup: `jeriko init`

The interactive setup wizard walks through 6 steps to configure Jeriko. Run it after installation:

```bash
jeriko init
```

### Step 1/6: AI Backend

Choose which AI model powers Jeriko's reasoning:

| Option | Name | Description |
|--------|------|-------------|
| 1 | `claude-code` | Claude Code CLI (dev mode, no API key needed) |
| 2 | `claude` | Anthropic API (production, requires `ANTHROPIC_API_KEY`) |
| 3 | `openai` | OpenAI API (requires `OPENAI_API_KEY`) |
| 4 | `local` | Ollama / LM Studio / any local model (fully offline, no cloud) |

- **claude-code**: Uses the Claude Code CLI directly. Best for development. Requires `@anthropic-ai/claude-code` to be installed globally.
- **claude**: Connects to the Anthropic API. The wizard prompts for your API key and verifies it against the API before saving.
- **openai**: Connects to the OpenAI API. Same verification flow as Claude.
- **local**: Auto-detects running Ollama or LM Studio instances, lists available models, and prompts for the model URL and name. See [Local Model Setup](#local-model-setup) below.

### Step 2/6: Telegram Bot

Connects Jeriko to Telegram for remote control via chat.

1. **Bot Token**: Create a bot with [@BotFather](https://t.me/BotFather) on Telegram. Copy the token it gives you.
2. **Admin IDs**: Send `/start` to [@userinfobot](https://t.me/userinfobot) to get your numeric Telegram user ID. Multiple admins can be specified as a comma-separated list.

The wizard verifies the bot token against the Telegram API and confirms the bot's `@username`.

### Step 3/6: Security

This step runs automatically (no prompts):

- **NODE_AUTH_SECRET**: If not already set, generates a cryptographically random 64-character hex string (`crypto.randomBytes(32)`). This secret is used for HMAC token authentication between the server and remote agents.
- **JERIKO_PORT**: Defaults to `7741` if not set.
- **.env permissions**: Sets `chmod 600` on the `.env` file so only the owner can read it.

### Step 4/6: Tunnel

Optional. Required only if you need external webhooks (e.g., Stripe webhooks, Telegram webhook mode).

| Option | Provider | Notes |
|--------|----------|-------|
| 1 | `localtunnel` | Zero install, uses `npx localtunnel` (recommended) |
| 2 | `cloudflare` | Cloudflare Tunnel, requires `cloudflared` binary |

If you choose Cloudflare and `cloudflared` is not installed, the wizard offers to install it automatically (`brew install cloudflared` on macOS, binary download on Linux).

The tunnel URL is saved to `TUNNEL_URL` in `.env` once the tunnel starts.

### Step 5/6: Start Server

Optionally starts the Jeriko server in the background using `jeriko server --start`. If a tunnel was configured in Step 4, the tunnel is also started and the wizard waits up to 30 seconds for the tunnel URL to become available.

The server runs on the port specified by `JERIKO_PORT` (default: 7741).

### Step 6/6: Verify

Runs three health checks to confirm the installation:

| Check | Command | What It Tests |
|-------|---------|--------------|
| System | `jeriko sys` | Core CLI and system info |
| Discover | `jeriko discover --list` | Command auto-discovery |
| Exec | `jeriko exec echo "ready"` | Shell execution |
| Server | `GET http://localhost:{port}/` | Server health (only if started) |

All checks must pass for a complete installation.

### Non-Interactive Mode

For CI/CD, Docker, or scripted deployments:

```bash
# Minimal: set AI backend, accept all defaults
jeriko init --ai claude --yes

# Full configuration via flags
jeriko init --ai claude --anthropic-key sk-ant-xxx --telegram-token 123:ABC --admin-ids 12345678 --yes

# OpenAI backend
jeriko init --ai openai --openai-key sk-xxx --yes

# Local model
jeriko init --ai local --local-url http://localhost:11434/v1 --local-model llama3.2 --yes

# Skip everything optional
jeriko init --skip-ai --skip-telegram --yes
```

Non-interactive mode skips the tunnel and server start steps.

---

## Configuration (.env)

Jeriko reads all configuration from a `.env` file in the project root. The `jeriko init` wizard creates this file automatically, or you can copy from `.env.example` and edit manually:

```bash
cp .env.example .env
chmod 600 .env
```

### Full Environment Variable Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AI_BACKEND` | No | `claude-code` | AI backend: `claude-code`, `claude`, `openai`, or `local` |
| `ANTHROPIC_API_KEY` | For `claude` backend | -- | Anthropic API key (starts with `sk-ant-`) |
| `CLAUDE_MODEL` | No | `claude-sonnet-4-20250514` | Claude model to use |
| `OPENAI_API_KEY` | For `openai` backend | -- | OpenAI API key (starts with `sk-`) |
| `OPENAI_MODEL` | No | `gpt-4o` | OpenAI model to use |
| `LOCAL_MODEL_URL` | For `local` backend | `http://localhost:11434/v1` | OpenAI-compatible API endpoint for local model |
| `LOCAL_MODEL` | For `local` backend | `llama3.2` | Local model name (as reported by the runtime) |
| `LOCAL_API_KEY` | No | -- | API key for secured local model endpoints (optional) |
| `TELEGRAM_BOT_TOKEN` | For Telegram | -- | Bot token from [@BotFather](https://t.me/BotFather) |
| `ADMIN_TELEGRAM_IDS` | For Telegram | -- | Comma-separated Telegram user IDs allowed to use the bot |
| `JERIKO_PORT` | No | `7741` | Daemon HTTP server port |
| `NODE_AUTH_SECRET` | Yes (for server) | -- | 64-char hex secret for HMAC auth. **Must be set; server refuses to start without it.** |
| `DEFAULT_NODE` | No | `local` | Default machine name for commands without `@prefix` |
| `WHATSAPP_ADMIN_PHONE` | For WhatsApp | -- | Admin phone number with country code, no `+` (e.g., `1234567890`) |
| `IMAP_HOST` | For email | `imap.gmail.com` | IMAP server hostname |
| `IMAP_PORT` | For email | `993` | IMAP server port (993 = SSL) |
| `IMAP_USER` | For email | -- | Email address for IMAP login |
| `IMAP_PASSWORD` | For email | -- | Email password or App Password (Gmail requires App Passwords) |
| `STRIPE_SECRET_KEY` | For Stripe | -- | Stripe secret key (starts with `sk_live_` or `sk_test_`). Set via `jeriko stripe init`. |
| `X_BEARER_TOKEN` | For X.com | -- | X.com API bearer token. Set via `jeriko x init`. |
| `X_CLIENT_ID` | For X.com | -- | X.com OAuth 2.0 client ID. Set via `jeriko x init`. |
| `X_CLIENT_SECRET` | For X.com | -- | X.com OAuth 2.0 client secret. Set via `jeriko x init`. |
| `TWILIO_ACCOUNT_SID` | For Twilio | -- | Twilio Account SID (starts with `AC`). Set via `jeriko twilio init`. |
| `TWILIO_AUTH_TOKEN` | For Twilio | -- | Twilio Auth Token. Set via `jeriko twilio init`. |
| `TWILIO_PHONE_NUMBER` | For Twilio | -- | Twilio phone number (e.g., `+1234567890`). Set via `jeriko twilio init`. |
| `TUNNEL_PROVIDER` | No | -- | Tunnel provider: `localtunnel` or `cloudflare`. Auto-set by `jeriko init`. |
| `TUNNEL_URL` | No | -- | Public tunnel URL. Auto-set when tunnel starts. |

### Security Notes

- Never commit `.env` to version control. It is listed in `.gitignore`.
- `NODE_AUTH_SECRET` must be set before starting the server. The server will fail to start if it is missing.
- `chmod 600 .env` ensures only the file owner can read secrets.
- For Gmail IMAP, use an [App Password](https://myaccount.google.com/apppasswords), not your real password.
- Sensitive environment variables are stripped from child processes in `shell.js`.

---

## Local Model Setup

Jeriko runs entirely offline using any OpenAI-compatible local model server. Set `AI_BACKEND=local` in `.env`.

### Supported Runtimes

| Runtime | Default URL | Install | Notes |
|---------|------------|---------|-------|
| [Ollama](https://ollama.com) | `http://localhost:11434/v1` | `brew install ollama` / [ollama.com](https://ollama.com) | Most popular. Auto-detected by `jeriko init`. |
| [LM Studio](https://lmstudio.ai) | `http://localhost:1234/v1` | Download from [lmstudio.ai](https://lmstudio.ai) | GUI-based, easy model management. |
| [vLLM](https://docs.vllm.ai) | `http://localhost:8000/v1` | `pip install vllm` | Production-grade serving with GPU optimization. |
| [llama.cpp server](https://github.com/ggerganov/llama.cpp) | `http://localhost:8080/v1` | Build from source | Lightweight C++ inference. |
| Any OpenAI-compatible | Custom URL | Varies | Any server implementing `/v1/chat/completions`. |

### Ollama Setup (Recommended)

```bash
# Install Ollama
brew install ollama        # macOS
curl -fsSL https://ollama.com/install.sh | sh  # Linux

# Start the Ollama server
ollama serve

# Pull a model
ollama pull llama3.2

# Configure Jeriko
jeriko init --ai local --local-url http://localhost:11434/v1 --local-model llama3.2 --yes
```

### LM Studio Setup

1. Download and install [LM Studio](https://lmstudio.ai).
2. Download a model from the built-in model browser.
3. Start the local server from LM Studio's "Local Server" tab.
4. Configure Jeriko:

```bash
jeriko init --ai local --local-url http://localhost:1234/v1 --local-model <model-name> --yes
```

### Manual .env Configuration

If you prefer to skip the wizard:

```bash
# Add to .env
AI_BACKEND=local
LOCAL_MODEL_URL=http://localhost:11434/v1
LOCAL_MODEL=llama3.2
# LOCAL_API_KEY=         # only if your endpoint requires auth
```

### How It Works

The local backend sends requests to the OpenAI-compatible `/v1/chat/completions` endpoint with `stream: false`. The model receives the same system prompt (auto-generated via `jeriko discover`) and bash tool definition as cloud backends. Non-streaming mode is used to avoid the Ollama tool_calls streaming bug.

---

## Third-Party Service Setup

Each third-party integration has its own `init` subcommand with an interactive setup wizard.

### Stripe

```bash
jeriko stripe init
```

- Prompts for your Stripe secret key (from [dashboard.stripe.com/apikeys](https://dashboard.stripe.com/apikeys)).
- Saves `STRIPE_SECRET_KEY` to `.env`.
- Non-interactive: `jeriko stripe init --key sk_test_xxx`

### X.com (Twitter)

```bash
jeriko x init
```

- Prompts for Bearer Token, Client ID, and Client Secret (from [developer.x.com](https://developer.x.com/en/portal/dashboard)).
- Saves `X_BEARER_TOKEN`, `X_CLIENT_ID`, and `X_CLIENT_SECRET` to `.env`.
- Non-interactive: `jeriko x init --bearer-token xxx --client-id xxx`

### Email (IMAP)

```bash
jeriko email init
```

- Interactive wizard with presets for Gmail, Outlook, Yahoo, and custom IMAP servers.
- Saves `IMAP_HOST`, `IMAP_PORT`, `IMAP_USER`, and `IMAP_PASSWORD` to `.env`.
- For Gmail: requires an [App Password](https://myaccount.google.com/apppasswords) (not your regular password).

### Twilio

```bash
jeriko twilio init
```

- 3-step wizard: Account SID, Auth Token, Phone Number (from [console.twilio.com](https://console.twilio.com)).
- Saves `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_PHONE_NUMBER` to `.env`.
- Non-interactive: `jeriko twilio init --sid ACxxx --token xxx --phone +1xxx`

---

## Platform Support

| Platform | Support Level | Notes |
|----------|--------------|-------|
| **macOS** | Full | All 30+ commands supported. Apple integrations (Notes, Reminders, Calendar, Contacts, iMessage, Music) use AppleScript. |
| **Linux** | Core + Partial | Core commands work fully (sys, exec, fs, search, browse, notify, etc.). Apple-specific commands (notes, remind, calendar, contacts, msg, music) are unavailable. Audio commands require ALSA/PulseAudio. |
| **Windows** | Via WSL | Run inside Windows Subsystem for Linux (WSL 2). Same support level as Linux. Native Windows is not supported. |

### macOS-Specific Requirements

- Apple integrations require macOS accessibility permissions for AppleScript execution.
- `jeriko screenshot` requires screen recording permission (System Settings > Privacy & Security > Screen Recording).
- `jeriko camera` requires camera permission.
- `jeriko audio --record` requires microphone permission.

---

## Optional Dependencies

These are not required for core functionality but enable specific commands:

| Dependency | Required For | Install (macOS) | Install (Linux) |
|------------|-------------|-----------------|-----------------|
| [Playwright](https://playwright.dev) | `jeriko browse` (browser automation) | `npx playwright install` | `npx playwright install --with-deps` |
| [ffmpeg](https://ffmpeg.org) | `jeriko camera`, `jeriko audio --record` | `brew install ffmpeg` | `apt install ffmpeg` |
| [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) | `claude-code` AI backend | `npm install -g @anthropic-ai/claude-code` | Same |
| [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) | Cloudflare tunnel | `brew install cloudflared` | [Download binary](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) |

### Installing Playwright Browsers

Playwright requires browser binaries to be downloaded separately:

```bash
# Install all browsers (Chromium, Firefox, WebKit)
npx playwright install

# Install only Chromium (smaller download)
npx playwright install chromium

# Linux: also install system dependencies
npx playwright install --with-deps
```

---

## Server Setup

The Jeriko server provides the Telegram bot, WhatsApp integration, WebSocket orchestration, AI routing, and trigger engine.

### Foreground (Development)

```bash
# Standard
npm start

# Or directly
node server/index.js

# With auto-reload on file changes
npm run dev
```

### Background (Production)

```bash
# Start daemonized
jeriko server --start

# Check status
jeriko server --status

# Restart
jeriko server --restart

# Stop
jeriko server --stop
```

### Systemd Service (Linux Production)

Create `/etc/systemd/system/Jeriko.service`:

```ini
[Unit]
Description=Jeriko Server
After=network.target

[Service]
Type=simple
User=Jeriko
WorkingDirectory=/opt/Jeriko
ExecStart=/usr/bin/node server/index.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable Jeriko
sudo systemctl start Jeriko
sudo systemctl status Jeriko
```

### Server Architecture

The server listens on `JERIKO_PORT` (default: 7741) and provides:

- **Express HTTP API**: REST endpoints with HMAC token authentication.
- **Telegram Bot**: Long-polling via Telegraf. All `jeriko` commands available as slash commands.
- **WhatsApp Bot**: Via Baileys library. QR code pairing on first connection.
- **WebSocket**: Multi-machine orchestration for remote agent nodes.
- **Trigger Engine**: Cron, webhook, email, HTTP, and file-based autonomous triggers.

---

## Verify Installation

After setup, run these commands to confirm everything is working:

```bash
# Core CLI
jeriko sys                  # should print system info JSON
jeriko discover --list      # should list all available commands
jeriko exec echo "ready"    # should print {"ok":true,"data":{"stdout":"ready\n",...}}

# Text format for human-readable output
jeriko sys --format text
jeriko discover --list --format text

# Test a specific integration
jeriko notify --message "Jeriko is alive"   # requires Telegram setup
```

Expected output for `jeriko sys --format text`:

```
hostname=<your-hostname> platform=darwin arch=arm64 uptime=... node=v22.x.x ...
```

If any command fails, check:

1. Node.js version: `node --version` (must be 18+)
2. `.env` exists and is readable: `ls -la .env`
3. Dependencies installed: `npm install`
4. Global link exists: `which jeriko`

---

## Uninstall

### npm Global Install

```bash
npm uninstall -g Jeriko
```

### From Source

```bash
cd /path/to/Jeriko
npm unlink -g Jeriko
```

### Clean Up All Data

```bash
# Remove plugin data and configuration
rm -rf ~/.jeriko

# Remove project data files (if from source)
rm -rf /path/to/Jeriko/data/
```

### Stop Running Services

```bash
# Stop the server if running
jeriko server --stop

# Or find and kill manually
lsof -i :3000 | grep node
kill <PID>
```
