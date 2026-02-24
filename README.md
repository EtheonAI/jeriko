# JerikoBot

Unix-first CLI toolkit that gives any AI model full machine control. 46 commands. Model-agnostic. Composable via pipes. Zero vendor lock-in.

One binary. Every command returns structured output. Any AI with `exec()` becomes an autonomous agent.

```
┌─────────────────────────────────────────────────────────────────────┐
│  jeriko sys | jeriko notify          pipe system info to Telegram   │
│  jeriko browse --screenshot "url"    browser automation             │
│  jeriko stripe customers list        Stripe API operations          │
│  jeriko github prs --create "title"  GitHub pull requests           │
│  jeriko create nextjs my-app         scaffold from templates        │
│  jeriko ai --image "a red fox"       DALL-E image generation        │
│  jeriko twilio call +1... --say "hi" make a phone call              │
│  jeriko vercel deploy --prod         deploy to Vercel               │
│  jeriko                              interactive AI chat (REPL)     │
└─────────────────────────────────────────────────────────────────────┘
```

## Table of Contents

- [Install](#install)
- [Quick Start](#quick-start)
- [Connect Any AI](#connect-any-ai)
- [Output Formats](#output-formats)
- [All Commands (46)](#all-commands-46)
  - [System & Shell](#system--shell)
  - [Files & Documents](#files--documents)
  - [Browser & Search](#browser--search)
  - [Desktop (macOS)](#desktop-macos)
  - [Communication](#communication)
  - [macOS Native Apps](#macos-native-apps)
  - [Media & Location](#media--location)
  - [AI & Code Execution](#ai--code-execution)
  - [Project Scaffolding](#project-scaffolding)
  - [Payments & APIs](#payments--apis)
  - [Cloud & DevOps](#cloud--devops)
  - [Cloud Storage](#cloud-storage)
  - [Server & Plugins](#server--plugins)
  - [Memory & Discovery](#memory--discovery)
- [Piping & Composition](#piping--composition)
- [Project Scaffolding & Templates](#project-scaffolding--templates)
- [Plugin System](#plugin-system)
- [Triggers](#triggers)
- [Multi-Machine Orchestration](#multi-machine-orchestration)
- [Server & API](#server--api)
- [Interactive Chat Mode](#interactive-chat-mode)
- [Parallel Task Execution](#parallel-task-execution)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Platform Support](#platform-support)
- [Security](#security)
  - [Current Security Model](#current-security-model)
  - [Attack Surface & Prompt Injection](#attack-surface--prompt-injection)
  - [Target Architecture: Kernel-Level Isolation](#target-architecture-kernel-level-isolation)
  - [eBPF Observability](#ebpf-observability)
  - [Execution Manifests](#execution-manifests)
  - [Implementation Roadmap](#implementation-roadmap)
- [Docs](#docs)
- [Project Structure](#project-structure)
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

1. **AI Backend** — Claude Code, Anthropic API, OpenAI, or local model (Ollama/LM Studio/vLLM/llama.cpp)
2. **Telegram Bot** — connect via BotFather token + admin ID allowlist
3. **Security** — auto-generates `NODE_AUTH_SECRET`, sets `.env` to 600 permissions
4. **Tunnel** — optional localtunnel or Cloudflare tunnel for webhooks
5. **Server** — start the JerikoBot server (HTTP + WebSocket + Telegram + WhatsApp)
6. **Verify** — runs `jeriko sys`, `jeriko discover`, `jeriko exec` to confirm everything works

Non-interactive mode:

```bash
jeriko init --ai claude --yes
jeriko init --skip-ai --skip-telegram --yes   # minimal setup
```

Third-party service setup (each has its own init wizard):

```bash
jeriko stripe init     # Stripe payments
jeriko x init          # X.com (Twitter)
jeriko email init      # Email (IMAP/SMTP)
jeriko twilio init     # Twilio Voice + SMS
jeriko github init     # GitHub API
jeriko vercel init     # Vercel deployments
jeriko gdrive init     # Google Drive
jeriko onedrive init   # OneDrive
jeriko paypal init     # PayPal payments
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
jeriko github issues --create "Bug" --body "details"  # create GitHub issue
jeriko vercel deploy --project my-app --prod  # deploy to Vercel
jeriko create nextjs my-app                   # scaffold a Next.js app
jeriko ai --image "a sunset over mountains"   # generate image via DALL-E
jeriko doc --read report.pdf --pages 1-5      # read PDF pages
jeriko code --python "print(2**100)"          # execute Python code
jeriko twilio call +1234567890 --say "Hello"  # make a phone call
jeriko gdrive upload ./report.pdf             # upload to Google Drive
jeriko sys | jeriko notify                    # pipe system info to Telegram
jeriko                                        # interactive AI chat (REPL)
```

---

## Connect Any AI

JerikoBot is model-agnostic. Any AI that can execute shell commands can use it.

### Claude Code

```bash
# Auto-generate a system prompt from installed commands
jeriko prompt --raw | claude -p --system-prompt -
```

### Anthropic API (Production)

Set `AI_BACKEND=claude` in `.env` with your `ANTHROPIC_API_KEY`. The router auto-discovers all 46 commands via `jeriko prompt` and provides the AI with a bash tool for executing them. Supports up to 15 tool-call turns per request.

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

`jeriko prompt` reads the full `CLAUDE.md` reference (1100+ lines), detects all installed commands, templates, editor, projects workspace, and plugin docs — then generates a complete system prompt. The router calls this on startup, so every AI backend automatically knows every command.

```bash
jeriko prompt --raw           # full raw text prompt (1100+ lines, for piping to any AI)
jeriko prompt --list          # list available commands
jeriko prompt --json          # structured command metadata
jeriko prompt --name "MyBot"  # custom bot name in prompt
jeriko prompt --all-prompts   # include all trusted plugin PROMPT.md
jeriko discover --raw         # legacy alias (same functionality)
```

---

## Output Formats

Every command supports 3 output formats via the `--format` flag:

```bash
jeriko sys --format json      # JSON: {"ok":true,"data":{...}}
jeriko sys --format text      # AI-optimized: key=value key2=value2 (default)
jeriko sys --format logfmt    # Structured log: ok=true key=value
```

| Format | Use Case | Example |
|--------|----------|---------|
| **text** (default) | AI-optimized, ~30% fewer tokens | `hostname=mac cpu=Apple_M1 memory.used=8GB` |
| **json** | Machine-parseable, piping between commands | `{"ok":true,"data":{"hostname":"mac"}}` |
| **logfmt** | Structured logs, greppable | `ok=true hostname=mac cpu=Apple_M1` |

The `--format` flag works anywhere in the argument list:

```bash
jeriko --format json sys --info    # before the command
jeriko sys --info --format json    # after the command
JERIKO_FORMAT=json jeriko sys      # via environment variable
```

**Error output:**

| Format | Error |
|--------|-------|
| text | `error message` |
| json | `{"ok":false,"error":"message"}` |
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

## All Commands (46)

46 core commands (dispatcher + 45 bin files), grouped by category.

### System & Shell

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

### Files & Documents

| Command | Description |
|---------|-------------|
| `jeriko fs --ls .` | List directory |
| `jeriko fs --cat file.txt` | Read file |
| `echo "data" \| jeriko fs --write /tmp/file.txt` | Write stdin to file |
| `jeriko fs --write /tmp/file.txt --append` | Append mode |
| `jeriko fs --find . "*.js"` | Find files by name pattern |
| `jeriko fs --grep . "TODO" --glob "*.js"` | Search file contents |
| `jeriko fs --info package.json` | File metadata (size, permissions, dates) |
| `jeriko doc --read report.pdf` | Extract text from PDF |
| `jeriko doc --read report.pdf --pages 1-5` | Specific page range |
| `jeriko doc --read data.xlsx` | Read Excel (default sheet) |
| `jeriko doc --read data.xlsx --sheet Sales` | Specific Excel sheet |
| `jeriko doc --read proposal.docx` | Read Word document |
| `jeriko doc --read contacts.csv` | Read CSV with auto-detect |
| `jeriko doc --info report.pdf` | PDF metadata (pages, title, author, encrypted) |
| `jeriko doc --info photo.jpg` | Image metadata (dimensions, format, EXIF) |
| `jeriko doc --search report.pdf --query "revenue"` | Search inside documents |
| `echo '{"headers":["Name"],"rows":[["Alice"]]}' \| jeriko doc --write out.xlsx` | Write Excel |
| `jeriko doc --resize photo.png --width 800 --output thumb.png` | Resize image |
| `jeriko doc --convert photo.png --output photo.jpg` | Convert image format |

Supported formats: PDF, XLSX/XLS, DOCX, CSV, TSV, PNG, JPG, GIF, BMP, WEBP, TIFF, SVG + all text/code files.

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
| `jeriko notify --photo /path/to/image.png --caption "Look"` | Photo with caption |
| `jeriko notify --document /path/to/file.pdf` | Send document to Telegram |
| `echo "text" \| jeriko notify` | Pipe any output to Telegram |
| `jeriko email` | Latest 10 emails (IMAP) |
| `jeriko email --unread` | Unread emails only |
| `jeriko email --search "invoice"` | Search emails |
| `jeriko email --from "boss@co.com"` | Filter by sender |
| `jeriko email --send "to@email.com" --subject "Hi" --body "text"` | Send email (SMTP) |
| `jeriko email --send "to@email.com" --attach report.pdf` | Send with attachment |
| `jeriko email init` | Interactive IMAP/SMTP setup |
| `jeriko mail --unread` | Read emails via macOS Mail.app (no credentials needed) |
| `jeriko mail --search "invoice"` | Search Mail.app by subject |
| `jeriko mail --read <message-id>` | Read full email by ID |
| `jeriko mail --reply <id> --message "text"` | Reply to email |
| `jeriko mail --send "to@email.com" --subject "Hi" --message "body"` | Compose and send |
| `jeriko mail --check-for "query"` | Check for matching emails (used by triggers) |
| `jeriko msg --send "+1234567890" --message "hello"` | Send iMessage |
| `jeriko msg --read` | Recent iMessage chats |

### macOS Native Apps

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
| `jeriko audio --say "Hi" --voice Samantha` | TTS with custom voice |
| `jeriko audio --volume 50` | Set volume |
| `jeriko audio --mute` / `--unmute` | Mute controls |

### Media & Location

| Command | Description |
|---------|-------------|
| `jeriko camera` | Take a photo (webcam) |
| `jeriko camera --video --duration 10` | Record 10s video |
| `jeriko location` | IP-based geolocation (city, coords, ISP, timezone) |

### AI & Code Execution

| Command | Description |
|---------|-------------|
| `jeriko ai --image "A red fox in watercolor"` | Generate image via DALL-E 3 |
| `jeriko ai --image "Logo" --size 1024x1024 --quality hd` | HD image generation |
| `jeriko ai --image "Art" --output ~/images/art.png` | Save to custom path |
| `jeriko code --python "print('hello')"` | Execute Python code |
| `jeriko code --node "console.log(42)"` | Execute Node.js code |
| `jeriko code --bash "echo $SHELL"` | Execute Bash code |
| `echo "print(2+2)" \| jeriko code --python` | Code via stdin |
| `jeriko code --python "import math; print(math.pi)" --timeout 5000` | With timeout |
| `jeriko parallel --tasks '[{"task_id":"t1","prompt":"Summarize: ..."}]'` | Parallel LLM tasks |
| `jeriko parallel --tasks '[...]' --backend claude` | Use Anthropic API |
| `jeriko parallel --tasks '[...]' --backend openai` | Use OpenAI API |
| `jeriko parallel --tasks '[...]' --backend local` | Use local model (Ollama, etc.) |
| `jeriko parallel --tasks '[...]' --workers 8` | Max concurrent workers |

The parallel engine is a compiled Go binary (`runtime/parallel-engine`) that handles concurrent LLM task execution. Supports both Anthropic (`/v1/messages`) and OpenAI-compatible (`/v1/chat/completions`) API formats.

### Project Scaffolding

| Command | Description |
|---------|-------------|
| `jeriko create --list` | List available templates |
| `jeriko create --projects` | List created projects |
| `jeriko create nextjs my-app` | Next.js with App Router |
| `jeriko create react my-app` | React with Vite |
| `jeriko create expo my-mobile-app` | React Native with Expo |
| `jeriko create express my-api` | Express.js API server |
| `jeriko create flask my-api` | Flask Python web app |
| `jeriko create static my-site` | Static HTML/CSS/JS site |
| `jeriko create --open my-app` | Open project in detected editor |

Projects are scaffolded to `~/.jeriko/projects/<name>/`. Editor auto-detection: VS Code, Cursor, Sublime Text, WebStorm, Zed, Vim.

### Payments & APIs

| Command | Description |
|---------|-------------|
| `jeriko stripe init` | Interactive Stripe setup |
| `jeriko stripe customers list` | List customers |
| `jeriko stripe customers create --name "..." --email "..."` | Create customer |
| `jeriko stripe products list` / `create` | Products management |
| `jeriko stripe prices create --product prod_xxx --amount 2000` | Create price |
| `jeriko stripe payments list` / `create` / `confirm` / `cancel` | Payment intents |
| `jeriko stripe invoices list` / `create` / `send` / `pay` | Invoice management |
| `jeriko stripe subscriptions create --customer cus_xxx --price price_xxx` | Subscriptions |
| `jeriko stripe checkout create --price price_xxx` | Checkout sessions |
| `jeriko stripe links create --price price_xxx` | Payment links |
| `jeriko stripe balance` / `balance transactions` | Account balance |
| `jeriko stripe payouts list` / `create` | Payouts |
| `jeriko stripe charges list` / `refunds create` | Charges & refunds |
| `jeriko stripe events list` | Event history |
| `jeriko stripe webhooks list` / `create` / `delete` | Webhook endpoints |
| `jeriko stripe hook` | Format webhook event and notify (used by triggers) |
| `jeriko paypal init` | Interactive PayPal setup (OAuth2 client credentials) |
| `jeriko paypal orders create --amount 50.00 --currency USD` | Create order |
| `jeriko paypal orders get --id ORDER_ID` / `capture` / `authorize` | Order operations |
| `jeriko paypal payments get` / `refund` | Capture & refund management |
| `jeriko paypal subscriptions list` / `create` / `cancel` / `suspend` / `activate` | Subscription management |
| `jeriko paypal plans list` / `create` / `get` | Billing plans |
| `jeriko paypal products list` / `create` / `get` | Product catalog |
| `jeriko paypal invoices list` / `create` / `send` / `cancel` / `remind` | Invoice management |
| `jeriko paypal payouts create --email "..." --amount 25.00` | Send payouts |
| `jeriko paypal disputes list` / `get` | Dispute management |
| `jeriko paypal webhooks list` / `create` / `delete` | Webhook endpoints |
| `jeriko x init` | Interactive X.com setup |
| `jeriko x auth` | OAuth 2.0 PKCE login |
| `jeriko x post "Hello world"` | Create tweet |
| `jeriko x search "query"` | Search recent tweets (7 days) |
| `jeriko x timeline` / `--user <handle>` / `--mentions` | Timeline views |
| `jeriko x like` / `unlike` / `retweet` / `bookmark` `<tweet_id>` | Tweet actions |
| `jeriko x follow` / `unfollow` `<handle>` | Follow management |
| `jeriko x dm <handle> "message"` | Send DM |
| `jeriko x lists` / `--create` / `--add` / `--remove` | List management |
| `jeriko x me` / `user <handle>` | User lookup |
| `jeriko x mute` / `unmute` `<handle>` | Mute management |
| `jeriko twilio init` | Interactive Twilio setup |
| `jeriko twilio call +1234567890 --say "Hello"` | Text-to-speech call |
| `jeriko twilio call +1234567890 --play https://...` | Play audio in call |
| `jeriko twilio call +1234567890 --say "Hi" --record` | Call + record |
| `jeriko twilio sms +1234567890 "Hello"` | Send SMS |
| `jeriko twilio sms +1234567890 --media https://...` | Send MMS (image) |
| `jeriko twilio calls` / `messages` | Call & message history |
| `jeriko twilio recordings` | List recordings |
| `jeriko twilio account` / `numbers` | Account info & phone numbers |

### Cloud & DevOps

| Command | Description |
|---------|-------------|
| `jeriko github init` | Interactive GitHub setup (Personal Access Token) |
| `jeriko github repos` | List repositories |
| `jeriko github issues` / `--create` / `--view` / `--close` / `--comment` | Issue management |
| `jeriko github prs` / `--create` / `--view` / `--merge` / `--close` | Pull request management |
| `jeriko github actions` / `--run` / `--jobs` / `--rerun` / `--cancel` | CI/CD workflow management |
| `jeriko github releases` / `--create` / `--latest` / `--delete` | Release management |
| `jeriko github gists` / `--create` / `--view` / `--delete` | Gist management |
| `jeriko github search "query"` / `--code` / `--issues` / `--users` | GitHub search |
| `jeriko github clone owner/repo` | Clone repository |
| `jeriko vercel init` | Interactive Vercel setup |
| `jeriko vercel projects` | List projects |
| `jeriko vercel deploy --project myapp` | Preview deployment |
| `jeriko vercel deploy --project myapp --prod` | Production deployment |
| `jeriko vercel deployments` | List deployments |
| `jeriko vercel domains` / `add` / `delete` | Domain management |
| `jeriko vercel env --project myapp` / `--set` / `--delete` | Environment variables |
| `jeriko vercel logs --deployment dpl_xxx` | Deployment logs |
| `jeriko vercel dns --domain example.com` / `--create` | DNS record management |
| `jeriko vercel promote --deployment dpl_xxx` | Promote to production |
| `jeriko vercel certs` / `teams` / `aliases` | SSL certs, teams, aliases |

### Cloud Storage

| Command | Description |
|---------|-------------|
| `jeriko gdrive init` | Interactive Google Drive setup (OAuth2) |
| `jeriko gdrive list` | List root files |
| `jeriko gdrive list --folder <id>` / `--type document` | Browse and filter |
| `jeriko gdrive search "quarterly report"` | Search across drive |
| `jeriko gdrive download <file_id>` | Download file |
| `jeriko gdrive download <file_id> --export pdf` | Export Google Docs as PDF/docx/csv |
| `jeriko gdrive upload ./report.pdf` | Upload file |
| `jeriko gdrive upload ./report.pdf --folder <id>` | Upload to specific folder |
| `jeriko gdrive mkdir "New Folder"` | Create folder |
| `jeriko gdrive share <file_id> --email user@gmail.com` | Share file |
| `jeriko gdrive share <file_id> --anyone` | Enable link sharing |
| `jeriko gdrive delete <file_id>` / `--permanent` | Delete file |
| `jeriko gdrive about` | Storage usage and quota |
| `jeriko onedrive init` | Interactive OneDrive setup (Azure OAuth2) |
| `jeriko onedrive list` | List root files |
| `jeriko onedrive list --path "/Documents/Work"` | List by path |
| `jeriko onedrive search "quarterly report"` | Search across drive |
| `jeriko onedrive download <item_id>` | Download file |
| `jeriko onedrive upload ./report.pdf` | Upload file |
| `jeriko onedrive upload ./report.pdf --path "/Documents"` | Upload to path |
| `jeriko onedrive mkdir "New Folder"` | Create folder |
| `jeriko onedrive share <item_id>` / `--role edit` / `--email user@...` | Share file |
| `jeriko onedrive delete <item_id>` | Delete file |
| `jeriko onedrive about` | Storage usage and quota |

### Server & Plugins

| Command | Description |
|---------|-------------|
| `jeriko server` | Start server (foreground) |
| `jeriko server --start` | Start server (background, daemonized) |
| `jeriko server --stop` | Stop server |
| `jeriko server --restart` | Restart server |
| `jeriko server --status` | Check if running (PID, port) |
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
| `jeriko init` | First-run 6-step setup wizard |

### Memory & Discovery

| Command | Description |
|---------|-------------|
| `jeriko memory` | Recent session history (default: 20) |
| `jeriko memory --recent 50` | Last 50 entries |
| `jeriko memory --search "deploy"` | Search memory |
| `jeriko memory --set "key" --value "val"` | Store key-value pair |
| `jeriko memory --get "key"` | Retrieve key-value pair |
| `jeriko memory --context` | Get context block for system prompt |
| `jeriko memory --clear` | Clear session log |
| `jeriko prompt --raw` | Generate full system prompt (1100+ lines) for any LLM |
| `jeriko prompt --list` | List all available commands |
| `jeriko prompt --all-prompts` | Include all trusted plugin prompts |
| `jeriko discover --raw` | Legacy alias for prompt generation |
| `jeriko discover --list` / `--json` | Command discovery |
| `jeriko chat` | Interactive AI chat REPL (also launched by `jeriko` with no args) |

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

# Pipe code output
echo "print(42)" | jeriko code --python | jeriko notify

# Download and send
jeriko net --download "https://example.com/file.pdf" --to /tmp/file.pdf && jeriko notify --document /tmp/file.pdf
```

When stdin is JSON from another jeriko command (e.g. `jeriko sys | jeriko notify`), the `data` field is extracted and formatted automatically.

---

## Project Scaffolding & Templates

When you ask JerikoBot to build an app (via Telegram, chat, or any AI backend), it uses `jeriko create` with built-in templates.

### 6 Built-in Templates

| Template | What It Creates | Command |
|----------|----------------|---------|
| `nextjs` | Next.js app with App Router, ESLint, src dir | `npx create-next-app@latest` |
| `react` | React SPA with Vite | `npm create vite@latest` |
| `expo` | React Native mobile app with Expo | `npx create-expo-app@latest` |
| `express` | Express.js API server | `npm init + npm install express` |
| `flask` | Flask Python web app with venv | `python3 -m venv + pip install flask` |
| `static` | Static HTML/CSS/JS with directories | `mkdir -p css/ js/ img/` |

### Projects Workspace

All projects are scaffolded to `~/.jeriko/projects/<name>/`:

```bash
jeriko create nextjs ramadan-app       # creates ~/.jeriko/projects/ramadan-app/
jeriko create --projects               # list all created projects
jeriko create --open ramadan-app       # open in detected editor (VS Code, Cursor, etc.)
```

Editor auto-detection checks for: VS Code, Cursor, Sublime Text, WebStorm, Zed, Vim. After scaffolding, the AI automatically reports the project path and offers to open it.

---

## Plugin System

Third-party commands installed to `~/.jeriko/plugins/`. Each plugin provides:

- **Commands** — executables in `bin/` that follow the JerikoBot output contract
- **Manifest** — `jeriko-plugin.json` declaring name, namespace, commands, env vars, webhooks, platform support
- **AI Prompt** — optional `PROMPT.md` loaded on-demand into the AI system prompt (trusted plugins only)
- **Command Docs** — `COMMANDS.md` always included in `jeriko prompt` output for trusted plugins

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

### Plugin Security

- **Env isolation** — plugins only receive safe system vars (`PATH`, `HOME`, `USER`, `SHELL`, `TERM`, `NODE_ENV`, `LANG`, `LC_ALL`, `TZ`) plus their explicitly declared env vars. They cannot access `STRIPE_SECRET_KEY`, `ANTHROPIC_API_KEY`, etc. unless declared in their manifest.
- **Namespace reservation** — 32+ core command names are reserved and cannot be claimed by plugins.
- **Integrity hashing** — SHA-512 hash of `jeriko-plugin.json` stored on install, verified on trust operations.
- **Audit logging** — all trust changes, installs, webhook executions logged to `~/.jeriko/audit.log` (auto-rotated at 2MB, keeps last 10,000 entries).
- **Conflict detection** — duplicate namespaces and command names detected on install.

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

---

## Multi-Machine Orchestration

JerikoBot runs as a hub that controls remote nodes via WebSocket.

```
┌──────────────┐       WebSocket       ┌──────────────┐
│   Hub/Proxy  │◄─────────────────────►│  @macbook     │
│  (server/)   │                       │  (agent.js)   │
│              │◄──────────────────────►│  @server      │
│  port 3000   │                       │  (agent.js)   │
│              │◄──────────────────────►│  @raspberry   │
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
@raspberry check temperature sensor
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

51 slash commands registered automatically from the tool registry, plus:

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

Free-text messages are routed to the AI backend (Claude/OpenAI/local) with live progress updates showing which commands the AI is executing.

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

- Color-coded ASCII art banner with system info and version
- Spinner with elapsed time counter (thinking, responding, tool calls)
- Real-time tool call visualization — shows which bash commands the AI is executing with step numbers and checkmarks
- Streaming output from all backends (Claude Code, Anthropic API, OpenAI, local)
- Auto-discovers all 46 commands via `jeriko prompt`
- Session context injected from `jeriko memory`
- Slash commands: `/exit`, `/quit`, `/clear`, `/help`, `/commands`, `/memory`

---

## Parallel Task Execution

Execute multiple independent tasks concurrently via sub-agent LLMs.

```bash
jeriko parallel --tasks '[
  {"task_id":"t1","prompt":"Summarize this article: ..."},
  {"task_id":"t2","prompt":"Translate to Spanish: ..."},
  {"task_id":"t3","prompt":"Extract key points: ..."}
]'
```

- **Go binary** (`runtime/parallel-engine`) handles actual parallel execution
- Supports Claude, OpenAI, Kimi, Qwen, DeepSeek, and any local model
- Configurable workers (default: 4, max: 16), per-task token limits
- Two API formats: `anthropic` (Anthropic `/v1/messages`) and `openai` (any OpenAI-compatible endpoint)
- Sub-tasks are text-only (no tool access) — pass content in the prompt

---

## Architecture

### Three Layers

```
CLI Layer              Library Layer         Server Layer
bin/jeriko-*    ───►   tools/*.js     ───►   server/
(46 commands)          (7 core libs)         (Express + WS + Telegram + WhatsApp)
```

1. **CLI** (`bin/jeriko-*`) — individual command scripts. Parse args via `lib/cli.js`, call library functions, output text/JSON/logfmt.
2. **Tools** (`tools/*.js`) — reusable library functions. Also used by Telegram slash commands in `tools/index.js`.
3. **Server** (`server/`) — Express HTTP, WebSocket for multi-machine, Telegram bot, WhatsApp, trigger engine, AI router.

### Command Execution Flow

```
User → jeriko <cmd> [args]
         │
         ▼
    bin/jeriko (dispatcher)
         │
         ├─ Core? → bin/jeriko-<cmd> → tools/*.js → stdout
         │
         └─ Plugin? → ~/.jeriko/plugins/<ns>/bin/<cmd> (restricted env) → stdout
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
              ├─ claude-code → spawn claude CLI (dev, 10min timeout)
              ├─ claude → Anthropic API + bash tool (up to 15 turns)
              ├─ openai → OpenAI API + bash tool (up to 15 turns)
              └─ local → Ollama/LM Studio API + bash tool (up to 15 turns)
```

### System Prompt Generation

```
CLAUDE.md (1100+ lines)
    │
    ▼
jeriko prompt --raw
    │  includes: all 46 commands, flags, examples,
    │  piping patterns, templates, local model config,
    │  plugin system docs, architecture, project structure,
    │  projects workspace, editor detection, runtime rules
    │
    ▼
router.js (on startup)
    │  + session memory context
    │
    ▼
AI backend (Claude / OpenAI / Local)
```

### Key Files

| File | Purpose |
|------|---------|
| `bin/jeriko` | Dispatcher — global flags, two-phase resolution (core → plugins), binary type detection |
| `lib/cli.js` | Shared infra — `parseArgs`, `ok`, `fail`, `readStdin`, `run`, `escapeAppleScript`, formatters |
| `lib/plugins.js` | Plugin SDK — registry, trust, env isolation, audit, integrity, validation |
| `server/index.js` | Main entry — Express, WebSocket, Telegram, WhatsApp, plugin webhooks |
| `server/router.js` | AI backend — 4 backends, auto-discovers commands via `jeriko prompt`, injects session memory |
| `server/auth.js` | HMAC token auth, timing-safe comparison, Telegram ID allowlist |
| `server/telegram.js` | Telegram bot — 51 slash commands + trigger management + free-text AI routing with live progress |
| `server/websocket.js` | WebSocket hub — node registry, task routing, heartbeat |
| `server/triggers/engine.js` | Trigger lifecycle — cron, webhook, email, http_monitor, file_watch |
| `tools/index.js` | Tool registry — all Telegram slash commands |
| `agent/agent.js` | Remote node agent — WebSocket client, reconnection, multi-backend execution |
| `runtime/parallel-engine` | Compiled Go binary for parallel LLM task execution |

---

## Configuration

All configuration is in `.env` at the project root. See `.env.example` for the template.

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| **Core** | | | |
| `AI_BACKEND` | No | `claude-code` | AI backend: `claude-code`, `claude`, `openai`, `local` |
| `ANTHROPIC_API_KEY` | If `claude` | — | Anthropic API key |
| `CLAUDE_MODEL` | No | `claude-sonnet-4-20250514` | Claude model ID |
| `OPENAI_API_KEY` | If `openai` | — | OpenAI API key |
| `OPENAI_MODEL` | No | `gpt-4o` | OpenAI model ID |
| `LOCAL_MODEL_URL` | If `local` | `http://localhost:11434/v1` | Local model server URL |
| `LOCAL_MODEL` | If `local` | `llama3.2` | Local model name |
| `LOCAL_API_KEY` | No | — | Optional API key for local server |
| **Server** | | | |
| `PROXY_PORT` | No | `3000` | Server port |
| `NODE_AUTH_SECRET` | For server | — | Secret for HMAC token generation (auto-generated by `jeriko init`) |
| `DEFAULT_NODE` | No | `local` | Default target for commands without @prefix |
| **Telegram** | | | |
| `TELEGRAM_BOT_TOKEN` | For Telegram | — | Bot token from @BotFather |
| `ADMIN_TELEGRAM_IDS` | For Telegram | — | Comma-separated authorized user IDs |
| **WhatsApp** | | | |
| `WHATSAPP_ADMIN_PHONE` | For WhatsApp | — | Admin phone number (with country code, no +) |
| **Email** | | | |
| `IMAP_HOST` | For email | `imap.gmail.com` | IMAP server host |
| `IMAP_PORT` | For email | `993` | IMAP server port |
| `IMAP_USER` | For email | — | IMAP username |
| `IMAP_PASSWORD` | For email | — | IMAP password (use App Password for Gmail) |
| `SMTP_HOST` | For sending | — | SMTP server host |
| `SMTP_PORT` | For sending | — | SMTP port |
| `SMTP_USER` | For sending | — | SMTP username |
| `SMTP_PASSWORD` | For sending | — | SMTP password |
| `SMTP_FROM` | For sending | — | From address |
| **Third-Party Services** | | | |
| `STRIPE_SECRET_KEY` | For Stripe | — | Stripe secret key (`jeriko stripe init`) |
| `X_BEARER_TOKEN` | For X.com | — | X.com Bearer token (`jeriko x init`) |
| `X_CLIENT_ID` | For X.com | — | X.com OAuth client ID |
| `X_CLIENT_SECRET` | For X.com | — | X.com OAuth client secret |
| `TWILIO_ACCOUNT_SID` | For Twilio | — | Twilio Account SID (`jeriko twilio init`) |
| `TWILIO_AUTH_TOKEN` | For Twilio | — | Twilio Auth Token |
| `TWILIO_PHONE_NUMBER` | For Twilio | — | Twilio phone number |
| `GITHUB_TOKEN` | For GitHub | — | GitHub Personal Access Token (`jeriko github init`) |
| `PAYPAL_CLIENT_ID` | For PayPal | — | PayPal OAuth2 client ID (`jeriko paypal init`) |
| `PAYPAL_CLIENT_SECRET` | For PayPal | — | PayPal OAuth2 client secret |
| `PAYPAL_MODE` | For PayPal | `sandbox` | PayPal environment: `sandbox` or `live` |
| `VERCEL_TOKEN` | For Vercel | — | Vercel API token (`jeriko vercel init`) |
| `GOOGLE_DRIVE_CLIENT_ID` | For GDrive | — | Google OAuth2 client ID (`jeriko gdrive init`) |
| `GOOGLE_DRIVE_CLIENT_SECRET` | For GDrive | — | Google OAuth2 client secret |
| `GOOGLE_DRIVE_REFRESH_TOKEN` | For GDrive | — | Google OAuth2 refresh token |
| `ONEDRIVE_CLIENT_ID` | For OneDrive | — | Azure app client ID (`jeriko onedrive init`) |
| `ONEDRIVE_REFRESH_TOKEN` | For OneDrive | — | Microsoft OAuth2 refresh token |
| **Parallel Engine** | | | |
| `PARALLEL_API_URL` | For parallel | — | API endpoint for parallel tasks |
| `PARALLEL_API_FORMAT` | For parallel | — | API format: `anthropic` or `openai` |
| `PARALLEL_API_KEY` | For parallel | — | API key for parallel backend |
| **Tunnel** | | | |
| `TUNNEL_PROVIDER` | No | — | `localtunnel` or `cloudflare` |
| `TUNNEL_URL` | No | — | Public tunnel URL (auto-detected) |

See [docs/INSTALL.md](docs/INSTALL.md) for the full configuration reference.

---

## Platform Support

| Feature | macOS | Linux | Windows (WSL) |
|---------|-------|-------|---------------|
| Core commands (sys, fs, exec, search, browse, net, proc) | Full | Full | Full |
| Telegram / WhatsApp / Server | Full | Full | Full |
| Stripe / X.com / Twilio / GitHub / Vercel APIs | Full | Full | Full |
| Google Drive / OneDrive | Full | Full | Full |
| Document handling (PDF, Excel, Word, CSV, images) | Full | Full | Full |
| AI image generation (DALL-E) | Full | Full | Full |
| Code execution (Python/Node.js/Bash) | Full | Full | Full |
| Parallel task execution (Go binary) | Full | Full | Full |
| Project scaffolding (jeriko create) | Full | Full | Full |
| AppleScript commands (notes, remind, calendar, contacts, music, msg, window, mail, audio TTS) | Full | — | — |
| Desktop screenshot | Full | Partial | — |
| Camera (webcam) | Full | Full (ffmpeg) | — |
| Clipboard | Full | Full (xclip) | — |
| Open (URLs/files/apps) | Full | Full (xdg-open) | Partial |
| Multi-machine (agent) | Full | Full | Full |
| Plugins | Full | Full | Full |
| Kernel-level sandboxing (Phase 2+) | Via Linux VM | Full | Via WSL2 |

**Required:** Node.js 18+, npm 8+

**Optional dependencies:**

| Dependency | Required For | Install |
|------------|-------------|---------|
| Playwright | `jeriko browse` | `npx playwright install` (auto-installed with npm) |
| ffmpeg | `jeriko camera`, `jeriko audio --record` | `brew install ffmpeg` / `apt install ffmpeg` |
| Claude Code CLI | `claude-code` backend | `npm install -g @anthropic-ai/claude-code` |
| Python 3 + PyPDF2/openpyxl/python-docx/Pillow | `jeriko doc` | `pip3 install PyPDF2 openpyxl python-docx Pillow` |
| Go 1.21+ | Building parallel engine from source | `brew install go` / [golang.org](https://golang.org) |

---

## Security

### Current Security Model

JerikoBot's security is **application-level** — defense in depth at the Node.js layer with a clear roadmap to kernel-level isolation.

#### What Exists Today

| Layer | Mechanism | File |
|-------|-----------|------|
| Env stripping | `SENSITIVE_KEYS` array filtered from `jeriko exec` subprocesses | `tools/shell.js` |
| Plugin env isolation | Plugins only receive declared env vars + safe system vars | `lib/plugins.js:buildPluginEnv` |
| AppleScript injection prevention | `escapeAppleScript()` sanitizes all interpolated strings | `lib/cli.js` |
| WebSocket auth | HMAC-SHA256 token with timing-safe comparison | `server/auth.js` |
| Telegram allowlist | `ADMIN_TELEGRAM_IDS` — deny-all when empty (no IDs = no access) | `server/auth.js` |
| Bearer auth | Admin API endpoints require `NODE_AUTH_SECRET` header | `server/auth.js` |
| Webhook signatures | GitHub (`sha256=<hex>`), Stripe (`t=...,v1=...`), raw HMAC — fail-closed | `server/triggers/webhooks.js` |
| Plugin trust | Untrusted by default — no webhooks, no prompt injection for untrusted plugins | `lib/plugins.js` |
| Plugin integrity | SHA-512 hash of manifest computed on install, verified on trust operations | `lib/plugins.js` |
| Audit logging | All security ops logged to `~/.jeriko/audit.log`, auto-rotated at 2MB, keeps last 10,000 entries | `lib/plugins.js` |
| Namespace reservation | 32+ core command names blocked from plugins — cannot shadow core commands | `lib/plugins.js` |
| Conflict detection | Duplicate namespaces and command names rejected on install | `lib/plugins.js` |
| NODE_AUTH_SECRET required | Server refuses to start/generate tokens if not set (no insecure defaults) | `server/auth.js` |
| Code execution env stripping | `jeriko code` strips sensitive keys before running Python/Node.js/Bash | `bin/jeriko-code` |
| Output size limits | 10KB cap on `runBash()` output, prevents memory exhaustion | `server/router.js` |
| Timeout enforcement | 60s per bash call, 10min per Claude Code session, 5min per agent task | `server/router.js` |

### Attack Surface & Prompt Injection

The AI bash tool in `router.js` is the primary attack surface. Any command the AI generates runs with the same permissions as the JerikoBot server process.

**If the AI is tricked via prompt injection, it can do anything the user can do.**

#### Prompt Injection Vectors

| Vector | How It Works |
|--------|-------------|
| **Browse** | `jeriko browse --text` pulls arbitrary web content into AI context. Malicious page text becomes part of the prompt. |
| **Email triggers** | Email arrives with crafted content. Trigger fires, AI processes it autonomously. |
| **Webhooks** | External service pushes payload. Data enters AI context via trigger action. |
| **Plugins** | Even with env isolation, plugin command output enters AI context. |
| **Multi-machine** | Compromised hub sends malicious tasks to all connected nodes. |
| **Search** | `jeriko search` returns web results. Crafted snippets enter AI context. |

#### Current Mitigation

The user is the perimeter. This works when you are the only user, control all inputs, review trigger actions before creating them, and trust the websites you browse. It stops working when triggers, webhooks, or multi-machine routing introduce inputs you didn't personally review.

### Target Architecture: Kernel-Level Isolation

The AI is an OS process. Instead of trusting the AI to not be tricked, we make it **impossible** for a tricked AI to cause damage outside its scope.

```
User message
     │
     ▼
  AI Backend (Claude/OpenAI/local)
     │
     ▼ generates bash command
  Governor (validates + scopes)
     │
     ▼
  Micro-Jail (namespaced, cgroup-limited, seccomp-filtered)
     │
     ▼
  Command executes in isolation
     │
     ▼
  stdout captured, returned to AI
```

The Governor creates a fresh sandbox per execution. Even if the AI is tricked, the sandboxed process:

- **Cannot see files** outside its scoped working directory
- **Cannot open network sockets** unless explicitly allowed per-command
- **Cannot spawn privileged operations** — all capabilities dropped
- **Cannot exhaust CPU/RAM** — cgroup v2 limits enforced
- **Cannot escape to the host** — PID namespace, mount namespace, user namespace isolation

#### Why This Kills Prompt Injection

In the application-level model, injection happens in the AI's logic layer — the AI is tricked and calls `send_email(file='/etc/shadow')`.

In the kernel-level model, defense is at the OS layer:
- **Network namespace**: process has no internet. The `curl` fails at the socket level.
- **Mount namespace**: process cannot see `/etc/shadow`. Only the scoped working directory exists.
- **seccomp-bpf**: forbidden syscalls return `EPERM` regardless of what the AI asks for.
- **User namespace**: AI is "root" inside the jail, "nobody" on the host.

**The AI doesn't need to be trained to be safe. The OS forces it to be safe.**

#### Level 1 — Application Layer (Node.js, current target)

No OS changes required. Implement in `router.js`.

| Control | Implementation |
|---------|---------------|
| Command allowlist | AI bash tool can only run `jeriko *` commands, not arbitrary bash |
| Path scoping | `jeriko fs` operations restricted to declared directories |
| Network disable flag | Trigger-executed commands cannot use `curl`, `wget`, `fetch` |
| Read-only mode | Certain contexts (browse, search) only allow read operations |
| Output size limits | Already implemented (10KB cap in `runBash`) |
| Timeout | Already implemented (60s in `runBash`, 10min for Claude Code) |
| Bash tool audit logging | Log all bash tool executions to audit log |

#### Level 2 — OS Layer (Linux Namespaces + cgroups)

Wrap `runBash()` with `unshare` to create kernel-enforced isolation per execution.

| Isolation | Primitive | Effect |
|-----------|-----------|--------|
| Filesystem | `pivot_root` + `mount --bind` | AI sees only a minimal root with the scoped project directory |
| PID | PID namespace | Isolated process tree, cannot signal host processes |
| Network | Network namespace | No network access unless explicitly bridged |
| Resources | cgroups v2 | CPU limit (1 core), memory limit (256MB), prevents fork bombs |
| Identity | User namespace | AI is "root" inside the jail, "nobody" on the host |

Implementation: a small Go wrapper binary (`micro-jail`) that:
1. Calls `unshare(CLONE_NEWPID | CLONE_NEWNS | CLONE_NEWNET | CLONE_NEWUSER)`
2. Bind-mounts the working directory read-only
3. Creates a tmpfs scratch space for writes
4. Drops all capabilities
5. Applies cgroup v2 limits (256MB memory, 1 CPU core, 60s wall time)
6. Execs the command
7. Returns stdout

`runBash()` changes from `execSync(command)` to `execSync('micro-jail --scope /project --no-net --timeout 60 -- ' + command)`.

#### Level 3 — seccomp-bpf + Landlock

Fine-grained syscall filtering on top of Level 2.

| Mechanism | Purpose |
|-----------|---------|
| **seccomp-bpf** | Whitelist specific syscalls. Deny `mount`, `ptrace`, `clone` with dangerous flags, raw networking sockets |
| **Landlock** (kernel 5.13+) | Filesystem access control without root. Scope reads/writes to declared paths only |

Profiles per command type:

| Profile | Allowed | Denied |
|---------|---------|--------|
| `read-only` | `open(O_RDONLY)`, `read`, `stat`, `readdir` | `write`, `unlink`, `rename`, `connect` |
| `local-write` | `open`, `read`, `write`, `stat` within scope | `connect`, `bind`, `sendto` |
| `network` | `open`, `read`, `write`, `connect` | `mount`, `ptrace`, `clone` |
| `full` | Most syscalls | `mount`, `ptrace`, `reboot`, `kexec` |

#### Level 4 — VM Isolation (Multi-Tenant)

Strongest isolation. Each execution runs in its own kernel boundary.

| Runtime | Use Case |
|---------|----------|
| **Firecracker** | Lightweight microVM, <125ms boot, used by AWS Lambda |
| **gVisor** | User-space kernel, intercepts syscalls, used by Google Cloud Run |
| **KVM** | Full VM, heaviest but most isolated |

Required if JerikoBot becomes multi-tenant or runs untrusted user-submitted code.

### eBPF Observability

eBPF (extended Berkeley Packet Filter) provides real-time kernel-level observability without modifying the kernel or application code.

#### What eBPF Enables for JerikoBot

| Capability | How It Works |
|-----------|-------------|
| **Syscall monitoring** | Attach eBPF probes to syscall entry/exit points. Monitor every `open()`, `connect()`, `execve()`, `write()` from AI-spawned processes in real-time. |
| **Anomaly detection** | Profile normal command behavior (e.g., `jeriko fs` reads 2-3 files per call). Alert when a process exceeds its baseline — e.g., opening 100 files or connecting to unexpected IPs. |
| **Dynamic rate limiting** | Count syscalls per second per cgroup. If an AI-spawned process exceeds thresholds (e.g., >1000 syscalls/sec), throttle or terminate it before damage. |
| **Network observability** | Monitor all socket operations at the kernel level. Log every outbound connection (IP, port, protocol) from AI processes. Block connections to non-allowlisted destinations. |
| **File access auditing** | Track every file open/read/write by PID. Build a complete audit trail of which files the AI accessed, when, and whether it modified them. |
| **Process tree tracking** | Monitor `fork()`/`execve()` calls. Detect if an AI process spawns unexpected children (e.g., `bash -c "..."` trying to escape a command allowlist). |

#### eBPF vs seccomp

| Aspect | seccomp-bpf | eBPF |
|--------|-------------|------|
| Purpose | Block syscalls (enforcement) | Observe + react to syscalls (observability + enforcement) |
| Overhead | Near-zero (kernel inline) | Very low (JIT-compiled in kernel) |
| Flexibility | Static filter per process | Dynamic programs, maps, per-cgroup policies |
| Response | Kill process or return EPERM | Log, alert, rate-limit, or kill — programmable |
| Use in JerikoBot | Level 3 (hard syscall deny) | Level 3+ (monitoring, anomaly detection, dynamic policy) |

eBPF programs run in kernel space with safety guarantees (verified by the eBPF verifier before loading). They can observe every syscall, network packet, and file operation from AI-spawned processes without any modifications to the JerikoBot codebase.

### Execution Manifests

Every AI bash execution should request a "lease" specifying its scope:

```json
{
  "scope": "/home/user/projects/invoices",
  "capabilities": ["READ", "WRITE"],
  "networking": "DISABLED",
  "maxRuntime": "30s",
  "maxMemory": "256MB",
  "maxCPU": "1 core"
}
```

If the command tries to access a path outside `scope`, the kernel returns `EPERM`. If it tries to open a socket and networking is `DISABLED`, the kernel returns `EACCES`. The AI doesn't need training to respect boundaries — the OS enforces them.

#### Manifest Per Context

| Context | Scope | Network | Capabilities |
|---------|-------|---------|-------------|
| `jeriko fs` | Declared path only | Disabled | READ, WRITE |
| `jeriko browse` | tmpdir only | Enabled (target URL only) | READ |
| `jeriko exec` (user CLI) | cwd | Enabled | READ, WRITE, EXEC |
| `jeriko exec` (trigger) | trigger scope | Disabled | READ |
| `jeriko exec` (AI bash tool) | project root | Disabled by default | READ, WRITE |
| Plugin command | plugin dir + declared paths | Per manifest | Per manifest |

### Implementation Roadmap

#### Phase 1 — Now (Application Layer)

- [x] Env stripping in shell execution (`SENSITIVE_KEYS` array)
- [x] Plugin env isolation (only declared vars + safe system vars)
- [x] AppleScript injection prevention (`escapeAppleScript()`)
- [x] HMAC-SHA256 WebSocket auth with timing-safe comparison
- [x] Telegram allowlist (deny-all when empty)
- [x] Plugin trust model (untrusted by default)
- [x] Plugin integrity verification (SHA-512)
- [x] Audit logging (auto-rotated)
- [x] Webhook signature verification (GitHub, Stripe, raw HMAC)
- [x] Output size limits (10KB) and timeout enforcement
- [ ] Command allowlisting in `runBash()` — restrict AI to `jeriko *` commands only
- [ ] Path validation in `jeriko fs` — reject `..` traversal and absolute paths outside project
- [ ] Trigger isolation flag — `selfNotify: true` commands skip AI processing
- [ ] Log all bash tool executions to audit log

#### Phase 2 — Next (OS Layer, Linux)

- [ ] Write `micro-jail` Go wrapper using `unshare` + `pivot_root`
- [ ] Integrate into `runBash()` with fallback to direct exec on macOS
- [ ] cgroup v2 limits: 256MB memory, 1 CPU core, 60s wall time
- [ ] Network namespace: disabled by default, enabled per-command flag
- [ ] Read-only bind mount of project root, tmpfs scratch for writes

#### Phase 3 — Future (Deep Isolation)

- [ ] seccomp-bpf profiles per command type (read-only, local-write, network, full)
- [ ] Landlock filesystem scoping (kernel 5.13+)
- [ ] Per-plugin sandbox profiles derived from manifest
- [ ] eBPF observability: monitor syscalls, detect anomalies, rate limit dynamically
- [ ] Firecracker/gVisor option for multi-tenant deployment

#### Platform Reality

| Primitive | Linux | macOS | Windows |
|-----------|-------|-------|---------|
| Namespaces (PID, mount, net, user) | Full | None | None |
| cgroups v2 | Full | None | Job objects (partial) |
| seccomp-bpf | Full | None | None |
| Landlock | Kernel 5.13+ | None | None |
| eBPF | Kernel 4.4+ (full at 5.x) | Limited (network only) | None |
| `sandbox-exec` | None | Deprecated but works | None |
| Firecracker | Full | None | None |
| gVisor | Full | None | None |

**macOS strategy:** Application-level controls (Phase 1) work everywhere. For kernel-level isolation on macOS, the practical option is running JerikoBot inside a Linux VM (e.g., OrbStack, Lima, or Docker Desktop's Linux VM). Native macOS sandboxing via `sandbox-exec` is deprecated and limited but functional for basic filesystem scoping.

**Production deployment:** Linux is the target for hardened execution. macOS is for development.

#### Key Principle

> The AI is not trusted. The AI is not malicious. The AI is **exploitable**.
>
> Any input the AI processes — web pages, emails, webhooks, search results, plugin output — could contain adversarial content designed to make the AI execute unintended commands.
>
> Application-level defenses (allowlists, input validation) reduce risk. Kernel-level isolation (namespaces, seccomp, cgroups, eBPF) eliminates categories of risk.
>
> Defense in depth: both layers, always.

See [docs/SECURITY.md](docs/SECURITY.md) for the full security model documentation.

---

## Docs

| Document | Description |
|----------|-------------|
| [Installation Guide](docs/INSTALL.md) | Full install, `jeriko init` walkthrough, all env vars, platform support |
| [Command Reference](docs/COMMANDS.md) | All 46 commands with flag tables, examples, output samples |
| [Plugin Specification](docs/PLUGIN-SPEC.md) | Formal plugin spec: manifest schema, command contract, security model |
| [Multi-Machine Setup](docs/MULTI-MACHINE.md) | Hub/node architecture, WebSocket protocol, systemd service |
| [Server API Reference](docs/API.md) | HTTP endpoints, WebSocket protocol, Telegram commands |
| [Security Model](docs/SECURITY.md) | Current state, attack surface, kernel-level isolation roadmap |
| [Triggers](docs/TRIGGERS.md) | 5 trigger types, management, execution lifecycle |
| [Architecture](docs/ARCHITECTURE.md) | Three-layer design, execution flows, key files |
| [Build a Plugin](docs/PLUGINS.md) | Step-by-step plugin creation guide |
| [Contributing](docs/CONTRIBUTING.md) | Development setup, coding standards, PR process |

---

## Project Structure

```
bin/
  jeriko               # dispatcher (global flags, two-phase resolution: core → plugins)
  jeriko-sys           # system info
  jeriko-screenshot    # desktop capture
  jeriko-search        # web search (DuckDuckGo)
  jeriko-exec          # shell execution
  jeriko-fs            # file operations
  jeriko-browse        # browser automation (Playwright)
  jeriko-notify        # Telegram notifications
  jeriko-camera        # webcam photo/video
  jeriko-email         # IMAP email reader + SMTP sender
  jeriko-mail          # macOS Mail.app integration (AppleScript)
  jeriko-notes         # Apple Notes
  jeriko-remind        # Apple Reminders
  jeriko-calendar      # Apple Calendar
  jeriko-contacts      # Apple Contacts
  jeriko-clipboard     # system clipboard
  jeriko-audio         # mic, volume, TTS
  jeriko-music         # Music/Spotify control
  jeriko-msg           # iMessage
  jeriko-location      # IP geolocation
  jeriko-discover      # system prompt generation (legacy)
  jeriko-prompt        # full system prompt for any LLM backend
  jeriko-memory        # session memory & key-value store
  jeriko-chat          # interactive AI REPL
  jeriko-window        # window/app management (macOS)
  jeriko-proc          # process management
  jeriko-net           # network utilities (ping, dns, curl, download)
  jeriko-server        # server lifecycle (start/stop/restart)
  jeriko-open          # open URLs, files, apps
  jeriko-stripe        # Stripe payments, customers, subscriptions, invoices, webhook hook
  jeriko-stripe-hook   # backward-compat shim → jeriko stripe hook
  jeriko-paypal        # PayPal REST API — orders, subscriptions, invoices, payouts, disputes
  jeriko-x             # X.com (Twitter) — post, search, timeline, DMs, follows
  jeriko-twilio        # Twilio Voice + SMS/MMS — calls, messages, recordings
  jeriko-github        # GitHub REST API — repos, issues, PRs, actions, releases, gists
  jeriko-vercel        # Vercel REST API — projects, deployments, domains, env vars
  jeriko-gdrive        # Google Drive API v3 — list, upload, download, share
  jeriko-onedrive      # OneDrive/Microsoft Graph — list, upload, download, share
  jeriko-doc           # document reader/writer (PDF, Excel, Word, CSV, images)
  jeriko-code          # code execution (Python/Node.js/Bash, env-stripped)
  jeriko-ai            # AI image generation (DALL-E 3)
  jeriko-parallel      # parallel LLM task execution (Go binary wrapper)
  jeriko-create        # app scaffolding from templates
  jeriko-install       # plugin installer (npm + local, upgrade)
  jeriko-uninstall     # plugin remover
  jeriko-trust         # plugin trust management
  jeriko-plugin        # plugin validate/test
  jeriko-init          # first-run onboarding (6-step wizard)
lib/
  cli.js               # shared CLI infra (parseArgs, ok, fail, formatters, readStdin, escapeAppleScript)
  plugins.js           # plugin SDK (registry, trust, env isolation, audit, integrity, validation)
tools/
  system.js            # system info functions
  screenshot.js        # desktop screenshot
  search.js            # DuckDuckGo search
  shell.js             # shell exec (env-stripped, SENSITIVE_KEYS filtering)
  files.js             # file operations
  browser.js           # Playwright browser
  index.js             # tool registry (51 Telegram slash commands)
runtime/
  main.go              # Go parallel engine (model-agnostic, anthropic + openai formats)
  go.mod               # Go module (stdlib only, no external deps)
  build.sh             # cross-compile: darwin/arm64, darwin/amd64, linux/amd64, linux/arm64, windows/amd64
  parallel-engine      # compiled Go binary
templates/
  nextjs.json          # Next.js app with App Router
  react.json           # React + Vite
  express.json         # Express.js API server
  flask.json           # Flask Python web app
  static.json          # Static HTML/CSS/JS site
  expo.json            # React Native Expo
data/
  session.jsonl        # auto-logged session history
  memory.json          # persistent key-value store
  triggers.json        # trigger definitions
  trigger-log.json     # trigger execution log
server/
  index.js             # main entry (Express + WebSocket + Telegram + WhatsApp + plugin webhooks)
  router.js            # AI backend (4 backends, auto-discover via jeriko prompt, memory injection)
  auth.js              # HMAC token auth + timing-safe comparison + Telegram ID allowlist
  telegram.js          # Telegram bot (51 tools + triggers + free-text AI routing + live progress)
  whatsapp.js          # WhatsApp via Baileys
  websocket.js         # WebSocket hub (node registry, task routing, heartbeat, reconnection)
  triggers/
    engine.js          # trigger lifecycle (cron, webhook, email, http_monitor, file_watch)
    store.js           # trigger persistence (JSON file)
    executor.js        # action execution (Claude or shell)
    notify.js          # macOS + node-notifier notifications
    webhooks.js        # webhook receiver + signature verification (GitHub, Stripe, raw HMAC)
    pollers/
      email.js         # IMAP email polling
agent/
  agent.js             # remote node agent (WebSocket client, multi-backend, reconnection)
  install.sh           # one-line installer for remote nodes
  jerikobot-agent.service  # systemd service file (auto-start on Linux)
~/.jeriko/
  projects/            # AI-built projects (jeriko create)
  plugins/             # installed third-party plugins
  plugins/registry.json # plugin registry (trust, versions, integrity hashes)
  audit.log            # security audit log (auto-rotated at 2MB)
```

---

## License

MIT — [Etheon](https://github.com/khaleel737)
