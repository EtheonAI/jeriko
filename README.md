# Jeriko

Unix-first CLI toolkit that gives any AI model full machine control. 51 commands. 29 connectors. 17 agent tools. Model-agnostic. Composable via pipes. Zero vendor lock-in.

One compiled binary. Every command returns structured output. Any AI with `exec()` becomes an autonomous agent.

A product of [Etheon, Inc.](https://etheon.ai)

```
jeriko sys | jeriko notify          pipe system info to Telegram
jeriko browse --screenshot "url"    browser automation
jeriko stripe customers list        Stripe API operations
jeriko github prs --create "title"  GitHub pull requests
jeriko create app my-app            scaffold from templates
jeriko ai --image "a red fox"       DALL-E image generation
jeriko twilio call +1... --say "hi" make a phone call
jeriko vercel deploy --prod         deploy to Vercel
jeriko                              interactive AI chat (REPL)
```

## Table of Contents

- [Install](#install)
- [Quick Start](#quick-start)
- [Connect Any AI](#connect-any-ai)
- [Output Formats](#output-formats)
- [All Commands (51)](#all-commands-51)
- [Connectors (29)](#connectors-29)
- [Agent Tools (17)](#agent-tools-17)
- [Interactive Chat Mode](#interactive-chat-mode)
- [Skills System](#skills-system)
- [Channels](#channels)
- [Triggers](#triggers)
- [Media Capabilities](#media-capabilities)
- [Billing](#billing)
- [Piping & Composition](#piping--composition)
- [Project Scaffolding & Templates](#project-scaffolding--templates)
- [Plugin System](#plugin-system)
- [Relay Infrastructure](#relay-infrastructure)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Platform Support](#platform-support)
- [Security](#security)
- [Docs](#docs)
- [Project Structure](#project-structure)
- [License](#license)

---

## Install

```bash
# One-line install (recommended)
curl -fsSL https://jeriko.ai/install.sh | bash

# Specific version
curl -fsSL https://jeriko.ai/install.sh | bash -s -- 2.0.0

# From source (requires Bun)
git clone https://github.com/etheon-ai/jeriko.git
cd jeriko && bun install
bun run build    # compiles to standalone ~66MB binary

# First-run setup
jeriko init
```

`jeriko init` walks you through:

1. **AI Backend** — Claude, OpenAI, local model (Ollama/LM Studio), or custom provider
2. **Telegram Bot** — connect via BotFather token + admin ID allowlist
3. **WhatsApp** — QR code pairing via Baileys
4. **Security** — auto-generates auth secret, sets credential permissions to `0600`
5. **Verify** — runs health checks to confirm everything works

Non-interactive mode:

```bash
jeriko init --ai claude --yes
jeriko init --skip-ai --skip-telegram --yes   # minimal setup
```

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
jeriko github issues --create "Bug"           # create GitHub issue
jeriko vercel deploy --project my-app --prod  # deploy to Vercel
jeriko create app my-app                      # scaffold an app
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

Jeriko is model-agnostic. Any AI that can execute shell commands can use it. The multi-provider system supports 22 built-in presets with automatic environment variable discovery.

### Anthropic (Claude)

```bash
# Set in config or environment
ANTHROPIC_API_KEY=sk-ant-...
```

### OpenAI

```bash
OPENAI_API_KEY=sk-...
```

### Local Models (Ollama, LM Studio, llama.cpp)

Run entirely offline with any OpenAI-compatible endpoint.

```bash
# Ollama (auto-detected)
LOCAL_MODEL_URL=http://localhost:11434/v1
LOCAL_MODEL=llama3.2
```

| Runtime | Default URL | Notes |
|---------|------------|-------|
| Ollama | `http://localhost:11434/v1` | Most popular, auto-detected |
| LM Studio | `http://localhost:1234/v1` | GUI-based |
| llama.cpp | `http://localhost:8080/v1` | Lightweight C++ |
| Any OpenAI-compatible | Custom URL | Set `LOCAL_MODEL_URL` |

### Custom Providers

Add any OpenAI-compatible or Anthropic-compatible provider:

```json
{
  "providers": [
    {
      "name": "deepseek",
      "type": "openai-compatible",
      "baseUrl": "https://api.deepseek.com/v1",
      "apiKey": "sk-...",
      "defaultModel": "deepseek-chat"
    }
  ]
}
```

Use with `provider:model` syntax: `deepseek:deepseek-chat`

### 22 Built-in Presets

Provider presets with automatic env var discovery: anthropic, openai, google, deepseek, mistral, groq, together, fireworks, perplexity, cohere, x-ai, cerebras, sambanova, hyperbolic, openrouter, ollama, lm-studio, llama-cpp, jan, text-gen-webui, koboldcpp, vllm.

### Claude Code Backend

```bash
# Pipe system prompt to Claude Code
jeriko prompt --raw | claude -p --system-prompt -
```

---

## Output Formats

Every command supports 3 output formats via the `--format` flag:

```bash
jeriko sys --format json      # JSON: {"ok":true,"data":{...}}
jeriko sys --format text      # AI-optimized: key=value (default)
jeriko sys --format logfmt    # Structured log: ok=true key=value
```

| Format | Use Case | Example |
|--------|----------|---------|
| **text** (default) | AI-optimized, ~30% fewer tokens | `hostname=mac cpu=Apple_M1 memory.used=8GB` |
| **json** | Machine-parseable, piping | `{"ok":true,"data":{"hostname":"mac"}}` |
| **logfmt** | Structured logs, greppable | `ok=true hostname=mac cpu=Apple_M1` |

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

## All Commands (51)

51 commands organized in 11 categories.

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
| `jeriko net --ping google.com` | Ping host |
| `jeriko net --dns example.com` | DNS lookup |
| `jeriko net --ports` | List listening ports |
| `jeriko net --curl "https://api.example.com"` | HTTP requests |
| `jeriko exec ls -la` | Execute any shell command |
| `jeriko exec --timeout 5000 "sleep 10"` | With timeout (ms) |

### Files & Documents

| Command | Description |
|---------|-------------|
| `jeriko fs --ls .` | List directory |
| `jeriko fs --cat file.txt` | Read file |
| `echo "data" \| jeriko fs --write /tmp/file.txt` | Write stdin to file |
| `jeriko fs --find . "*.js"` | Find files by pattern |
| `jeriko fs --grep . "TODO" --glob "*.js"` | Search file contents |
| `jeriko doc --read report.pdf` | Extract text from PDF |
| `jeriko doc --read report.pdf --pages 1-5` | Specific page range |
| `jeriko doc --read data.xlsx --sheet Sales` | Read Excel sheet |
| `jeriko doc --read proposal.docx` | Read Word document |
| `jeriko doc --resize photo.png --width 800` | Resize image |

Supported formats: PDF, XLSX/XLS, DOCX, CSV, TSV, PNG, JPG, GIF, BMP, WEBP, TIFF, SVG + all text/code files.

### Browser & Search

| Command | Description |
|---------|-------------|
| `jeriko browse --navigate "https://example.com"` | Navigate to URL |
| `jeriko browse --screenshot "https://example.com"` | Navigate + screenshot |
| `jeriko browse --text` | Get page text |
| `jeriko browse --click "#submit"` | Click element |
| `jeriko browse --type "#email" --value "user@example.com"` | Type into input |
| `jeriko browse --js "document.title"` | Execute JavaScript |
| `jeriko search "Node.js streams"` | Web search via DuckDuckGo |
| `jeriko screenshot` | Desktop screenshot |
| `jeriko screenshot --display 1` | Capture specific display |

### Desktop (macOS)

| Command | Description |
|---------|-------------|
| `jeriko window --list` | List all visible windows |
| `jeriko window --focus "Safari"` | Bring app to front |
| `jeriko window --resize "Safari" --width 1280 --height 720` | Resize window |
| `jeriko open https://example.com` | Open URL in default browser |
| `jeriko open /path/to/file --with "Visual Studio Code"` | Open with specific app |
| `jeriko clipboard` | Read clipboard |
| `jeriko clipboard --set "text"` | Write to clipboard |

### Communication

| Command | Description |
|---------|-------------|
| `jeriko notify --message "Hello"` | Send message to Telegram |
| `jeriko notify --photo /path/to/image.png` | Send photo to Telegram |
| `jeriko notify --document /path/to/file.pdf` | Send document |
| `echo "text" \| jeriko notify` | Pipe any output to Telegram |
| `jeriko email --unread` | Unread emails |
| `jeriko email --send "to@email.com" --subject "Hi" --body "text"` | Send email |
| `jeriko mail --unread` | Read via macOS Mail.app |
| `jeriko msg --send "+1234567890" --message "hello"` | Send iMessage |

### macOS Native Apps

| Command | Description |
|---------|-------------|
| `jeriko notes --list` | List Apple Notes |
| `jeriko notes --create "Title" --body "content"` | Create note |
| `jeriko remind --create "Buy milk" --due "tomorrow 9am"` | Create reminder |
| `jeriko calendar --week` | Next 7 days |
| `jeriko calendar --create "Meeting" --start "..." --end "..."` | Create event |
| `jeriko contacts --search "John"` | Search contacts |
| `jeriko music --play "Bohemian Rhapsody"` | Search and play |
| `jeriko audio --record 5` | Record 5s from microphone |
| `jeriko audio --say "Hello world"` | Text-to-speech |
| `jeriko camera` | Take a photo (webcam) |
| `jeriko location` | IP-based geolocation |

### AI & Code Execution

| Command | Description |
|---------|-------------|
| `jeriko ai --image "A red fox in watercolor"` | Generate image via DALL-E 3 |
| `jeriko ai --image "Logo" --size 1024x1024 --quality hd` | HD image |
| `jeriko code --python "print('hello')"` | Execute Python |
| `jeriko code --node "console.log(42)"` | Execute Node.js |
| `jeriko code --bash "echo $SHELL"` | Execute Bash |
| `jeriko parallel --tasks '[...]'` | Parallel sub-agent tasks |

### Project Scaffolding

| Command | Description |
|---------|-------------|
| `jeriko create --list` | List available templates |
| `jeriko create --projects` | List created projects |
| `jeriko create app my-app` | Full-stack app |
| `jeriko create web-db-user my-app` | Web app with database + auth |
| `jeriko create web-static my-site` | Static website |

Projects are scaffolded to `~/.jeriko/projects/<name>/`.

### Payments & APIs

| Command | Description |
|---------|-------------|
| `jeriko stripe customers list` | List Stripe customers |
| `jeriko stripe payments create --amount 2000` | Create payment |
| `jeriko stripe subscriptions create --customer cus_xxx --price price_xxx` | Subscriptions |
| `jeriko stripe checkout create --price price_xxx` | Checkout sessions |
| `jeriko paypal orders create --amount 50.00 --currency USD` | PayPal orders |
| `jeriko paypal subscriptions list` | PayPal subscriptions |
| `jeriko x post "Hello world"` | Create tweet |
| `jeriko x search "query"` | Search tweets |
| `jeriko twilio call +1234567890 --say "Hello"` | Make phone call |
| `jeriko twilio sms +1234567890 "Hello"` | Send SMS |

### Cloud & DevOps

| Command | Description |
|---------|-------------|
| `jeriko github repos` | List repositories |
| `jeriko github issues --create "Bug" --body "details"` | Create issue |
| `jeriko github prs --create "title"` | Create pull request |
| `jeriko github actions --run workflow.yml` | Run CI/CD workflow |
| `jeriko vercel deploy --project myapp --prod` | Deploy to Vercel |
| `jeriko vercel domains add example.com` | Domain management |

### Cloud Storage

| Command | Description |
|---------|-------------|
| `jeriko gdrive list` | List Google Drive files |
| `jeriko gdrive upload ./report.pdf` | Upload to Drive |
| `jeriko gdrive download <file_id>` | Download file |
| `jeriko gdrive share <file_id> --email user@gmail.com` | Share file |
| `jeriko onedrive list` | List OneDrive files |
| `jeriko onedrive upload ./report.pdf` | Upload to OneDrive |

### Server & Management

| Command | Description |
|---------|-------------|
| `jeriko serve` | Start daemon (foreground) |
| `jeriko serve --start` | Start daemon (background) |
| `jeriko serve --stop` | Stop daemon |
| `jeriko serve --status` | Check if running |
| `jeriko install jeriko-weather` | Install plugin |
| `jeriko uninstall jeriko-weather` | Remove plugin |
| `jeriko trust jeriko-weather --yes` | Trust plugin |
| `jeriko init` | First-run setup wizard |
| `jeriko memory` | Session history |
| `jeriko prompt --raw` | Generate system prompt for any LLM |
| `jeriko skill list` | List installed skills |

See [docs/COMMANDS.md](docs/COMMANDS.md) for the full reference with flag tables and output samples.

---

## Connectors (29)

Jeriko integrates with 29 third-party services via a unified connector system. Connectors handle OAuth flows, API authentication, and webhook dispatch.

### OAuth Connectors (25)

| Connector | Service | Auth |
|-----------|---------|------|
| github | GitHub | OAuth 2.0 |
| x | X.com (Twitter) | OAuth 2.0 PKCE |
| gdrive | Google Drive | OAuth 2.0 |
| gmail | Gmail | OAuth 2.0 |
| outlook | Outlook/Microsoft | OAuth 2.0 |
| onedrive | OneDrive | OAuth 2.0 |
| vercel | Vercel | OAuth 2.0 |
| hubspot | HubSpot CRM | OAuth 2.0 |
| shopify | Shopify | OAuth 2.0 (per-store URLs) |
| instagram | Instagram | OAuth 2.0 |
| threads | Threads | OAuth 2.0 |
| slack | Slack | OAuth 2.0 |
| discord | Discord | OAuth 2.0 |
| square | Square | OAuth 2.0 |
| gitlab | GitLab | OAuth 2.0 |
| cloudflare | Cloudflare | OAuth 2.0 |
| notion | Notion | OAuth 2.0 |
| linear | Linear | OAuth 2.0 |
| jira | Jira/Atlassian | OAuth 2.0 |
| airtable | Airtable | OAuth 2.0 |
| asana | Asana | OAuth 2.0 |
| mailchimp | Mailchimp | OAuth 2.0 |
| dropbox | Dropbox | OAuth 2.0 |
| sendgrid | SendGrid | OAuth 2.0 |
| salesforce | Salesforce | OAuth 2.0 |

### API Key Connectors (3)

| Connector | Service | Auth |
|-----------|---------|------|
| stripe | Stripe | API Key |
| paypal | PayPal | API Key (Client ID + Secret) |
| twilio | Twilio | Account SID + Auth Token |

### Managing Connectors

```bash
jeriko connectors             # list all connectors with status
jeriko connect github         # initiate OAuth flow
jeriko disconnect github      # remove credentials
```

---

## Agent Tools (17)

When Jeriko runs as an AI agent (via the daemon or in-process mode), it provides 17 tools to the LLM:

| Tool | Aliases | Description |
|------|---------|-------------|
| bash | exec, shell, run | Execute shell commands |
| read_file | read, cat | Read file contents |
| write_file | write, create_file | Write/create files |
| edit_file | edit, modify | Edit existing files |
| list_files | list, ls, find | List directory contents |
| search_files | search, grep | Search file contents |
| browse | visit, web | Browser automation (Playwright) |
| web | query, web_search | Web search |
| screenshot | capture, screen | Desktop screenshot |
| camera | webcam, photo | Webcam capture |
| connector | api, call, invoke | Call any connected service API |
| delegate | sub_agent, spawn | Spawn sub-agent for parallel work |
| skill | use_skill, run_skill | Execute installed skills |
| memory | remember, save_memory, recall | Persistent memory (read/write/search) |
| parallel_tasks | parallel, concurrent | Run multiple tasks concurrently |
| generate_image | image, draw, paint, create_image | DALL-E image generation |
| webdev | web_dev, dev_tools, project | Web development tool (8 actions) |

---

## Interactive Chat Mode

Running `jeriko` with no arguments launches a full interactive AI chat REPL built with React + Ink:

```bash
jeriko           # launch chat
jeriko chat      # same
```

### Features

- Multi-line input with history navigation
- Streaming output from all backends
- Real-time tool call visualization with step numbers
- Arrow-key autocomplete for slash commands
- Markdown rendering with syntax highlighting (6 languages)
- Sub-agent live monitoring
- Model-aware cost tracking
- Context bar with session info
- Phase-specific spinners (thinking, responding, tool calls)

### 38 REPL Slash Commands

Organized in 6 categories:

**Session:** `/new`, `/sessions`, `/resume`, `/switch`, `/history`, `/clear`, `/compact`, `/share`, `/cost`, `/kill`, `/archive`

**Model & Providers:** `/model`, `/models`, `/provider`, `/providers`

**Channels:** `/connectors`, `/connect`, `/disconnect`, `/channels`, `/channel`, `/triggers`, `/auth`

**Management:** `/help`, `/skills`, `/skill`, `/status`, `/health`, `/sys`, `/config`, `/plan`

**Billing:** `/upgrade`, `/billing`, `/cancel`

**System:** `/tasks`, `/notifications`

### Themes

12 built-in themes with mutable palette system:

```bash
/config theme dracula    # switch theme
```

---

## Skills System

Skills are reusable, shareable AI capabilities packaged as YAML frontmatter + Markdown:

```bash
jeriko skill list                    # list installed skills
jeriko skill create my-skill         # scaffold a new skill
jeriko skill install ./my-skill      # install from path
jeriko skill validate my-skill       # validate structure
jeriko skill remove my-skill         # uninstall
```

### Skill Structure

```
~/.jeriko/skills/my-skill/
  SKILL.md          # YAML frontmatter + instructions
  scripts/          # executable scripts
  references/       # reference documentation
  templates/        # template files
```

### Progressive Loading

Skills are loaded efficiently: metadata in the system prompt at boot, full body loaded on demand via the `use_skill` agent tool, and bundled resources loaded as needed.

---

## Channels

Jeriko supports 2 messaging channels for remote AI interaction:

### Telegram

Connect via BotFather token. Supports text, photos, documents, voice messages (auto-transcribed), and QR codes.

### WhatsApp

Connect via Baileys (WhatsApp Web protocol). QR code pairing with 3 QR limit. Supports text, photos, voice messages.

Both channels:
- Route messages to the AI agent for processing
- Auto-transcribe voice messages (OpenAI Whisper or local whisper.cpp)
- Handle vision-gated photo analysis
- Support optional TTS responses

---

## Triggers

Triggers are reactive automations — events that fire actions.

### 6 Trigger Types

| Type | Event Source | Example |
|------|-------------|---------|
| **cron** | Time schedule (cron syntax + timezone) | `0 9 * * MON` — weekly report |
| **webhook** | Incoming HTTP POST (HMAC-SHA256) | Stripe payment events |
| **email** | New email (IMAP polling) | Summarize emails from boss |
| **http** | URL status polling (JSONPath) | Alert if site goes down |
| **file** | File system changes | Alert on log errors |
| **once** | One-time datetime | Run migration at 2am |

### How They Work

1. **Event fires** — cron ticks, webhook received, email arrives, URL changes, file changes, datetime reached
2. **Prompt built** — event data + trigger action composed into a prompt
3. **Action executed** — AI processes the prompt with full tool access
4. **User notified** — result sent via connected channels
5. **State tracked** — run count, last run, consecutive errors

**Auto-disable:** After 5 consecutive errors or `max_runs` reached.

**Billing gate:** Free tier limited to 10 triggers; Pro and above unlimited.

---

## Media Capabilities

### Vision

Multi-modal content support across all 4 LLM drivers. Photos sent via channels are analyzed when the model supports vision.

### Speech-to-Text (STT)

- OpenAI Whisper API
- Local whisper.cpp (offline)
- Auto-transcription of voice messages in channels

### Text-to-Speech (TTS)

- OpenAI tts-1
- macOS native `say` command
- Optional TTS responses in channels

### Image Generation

- DALL-E 3 via `generate_image` agent tool
- `jeriko ai --image "prompt"` CLI command
- Configurable size, quality, and output path

---

## Billing

Jeriko uses a tiered subscription model processed through Stripe:

| Tier | Connectors | Triggers | Price |
|------|-----------|----------|-------|
| **Free** | 5 | 10 | $0 |
| **Pro** | Unlimited | Unlimited | $19.99/mo |
| **Team** | Unlimited | Unlimited | Contact us |
| **Enterprise** | Unlimited | Unlimited | Contact us |

- Stripe Checkout with consent and billing address collection
- 7-day offline grace period
- `past_due` keeps tier for 7 days
- Two-level connector gating: connect-time + activation-time

```bash
jeriko upgrade          # upgrade via Stripe Checkout
jeriko billing          # billing status
jeriko plan             # current plan details
```

---

## Piping & Composition

Jeriko commands are Unix-native. They read stdin, write to stdout, and compose via pipes.

```bash
# Pipe system info to Telegram
jeriko sys --info | jeriko notify

# Search and send results
jeriko search "weather today" | jeriko notify

# Screenshot a website and send
jeriko browse --screenshot "https://example.com" | jeriko notify --photo -

# Write stdin to file
echo "hello world" | jeriko fs --write /tmp/test.txt

# Pipe to clipboard
jeriko sys --format text | jeriko clipboard --set

# Pipe code output
echo "print(42)" | jeriko code --python | jeriko notify
```

---

## Project Scaffolding & Templates

### 3 Built-in Templates

| Template | What It Creates | Command |
|----------|----------------|---------|
| `app` | Full-stack application (30 subdirectories) | `jeriko create app my-app` |
| `web-db-user` | Web app with database + user auth (19 subdirs) | `jeriko create web-db-user my-app` |
| `web-static` | Static website (16 subdirs) | `jeriko create web-static my-site` |

Additional inline scaffolding: `node`, `api`, `cli`, `plugin`.

### Projects Workspace

All projects are scaffolded to `~/.jeriko/projects/<name>/`:

```bash
jeriko create app my-app          # creates ~/.jeriko/projects/my-app/
jeriko create --projects          # list all created projects
jeriko create --open my-app       # open in detected editor
```

Editor auto-detection: VS Code, Cursor, Sublime Text, WebStorm, Zed, Vim.

---

## Plugin System

Third-party commands installed to `~/.jeriko/plugins/`. Each plugin provides:

- **Commands** — executables in `bin/` following the Jeriko output contract
- **Manifest** — `jeriko-plugin.json` declaring name, namespace, commands, env vars, webhooks
- **AI Prompt** — optional `PROMPT.md` loaded on-demand (trusted plugins only)

### Install & Manage

```bash
jeriko install jeriko-weather          # install from npm
jeriko install ./my-plugin             # install from local path
jeriko install --upgrade jeriko-weather # upgrade
jeriko install --list                  # list installed
jeriko uninstall jeriko-weather        # remove
```

### Trust Model

Plugins are **untrusted by default**. Trust enables webhooks + AI prompt injection:

```bash
jeriko trust jeriko-weather --yes      # trust
jeriko trust --revoke jeriko-weather   # revoke
jeriko trust --list                    # show trust status
jeriko trust --audit                   # security audit log
```

### Plugin Security

- **Env isolation** — plugins only receive safe system vars + explicitly declared env vars
- **Namespace reservation** — 32+ core command names reserved
- **Integrity hashing** — SHA-512 of manifest verified on trust operations
- **Audit logging** — all trust changes logged to `~/.jeriko/audit.log`

---

## Relay Infrastructure

The relay enables AI agents to connect from restricted networks via WebSocket.

### Two Implementations

| Implementation | Location | Runtime | Use Case |
|---------------|----------|---------|----------|
| Bun relay | `apps/relay/` | Bun | Local development |
| CF Worker relay | `apps/relay-worker/` | Cloudflare Worker | Production (`relay.jeriko.ai`) |

### Protocol

- HMAC-SHA256 token auth with timing-safe comparison
- Heartbeat ping/pong
- Exponential backoff reconnection
- Non-fatal at kernel boot (step 10.6)

---

## Architecture

### 4 Layers + Platform

```
Layer 4: Relay     → apps/relay/ (Bun) + apps/relay-worker/ (CF Worker)
Layer 3: Daemon    → src/daemon/kernel.ts (16-step boot) → agent, API, services, storage
Layer 2: CLI       → src/cli/dispatcher.ts → 51 commands, Ink-based interactive REPL
Layer 1: Shared    → src/shared/ (config, types, output, escape, relay-protocol, urls, skills)
Platform:          → src/platform/ (darwin/linux/win32) for native features
```

### Entry Points

| Entry | Description |
|-------|-------------|
| `src/index.ts` | Routes to CLI dispatcher |
| `jeriko` (no args) | Interactive chat REPL (`src/cli/chat.tsx`) |
| `jeriko <cmd>` | CLI command (`src/cli/dispatcher.ts` → `src/cli/commands/`) |
| `jeriko serve` | Daemon boot (`src/daemon/kernel.ts`) |

### Daemon Boot Sequence

16-step kernel boot in `src/daemon/kernel.ts`:
1. Config loading
2. Database initialization
3. Storage setup
4. Migration execution
5. Service initialization
5.5. License refresh from Stripe
6. Tool registration (17 tools)
7-8. API server + middleware
9. System prompt (AGENT.md + skills + memory)
10. Channel setup (Telegram, WhatsApp)
10.5. ConnectorManager initialization
10.6. Relay connection (non-fatal)
11-16. Triggers, cleanup, health checks

### Agent Execution Flow

```
User message (Telegram / WhatsApp / chat REPL / API)
         │
         ▼
    Orchestrator (observe → think → act loop)
         │
         ├─ anthropic driver → Anthropic Messages API
         ├─ openai driver → OpenAI Chat Completions API
         ├─ local driver → Any OpenAI-compatible endpoint
         ├─ claude-code driver → Claude Code CLI
         └─ custom provider → OpenAI-compat or Anthropic-compat
```

### Key Files

| File | Purpose |
|------|---------|
| `src/daemon/kernel.ts` | 16-step daemon boot sequence |
| `src/cli/dispatcher.ts` | Command registry, global flags, fuzzy matching |
| `src/cli/app.tsx` | Root Ink component (useReducer state) |
| `src/cli/backend.ts` | Backend interface — daemon IPC vs in-process agent |
| `src/shared/config.ts` | JerikoConfig schema, loader |
| `src/shared/output.ts` | ok()/fail() output contract |
| `src/daemon/agent/orchestrator.ts` | Main agent loop (observe → think → act) |
| `src/daemon/agent/tools/registry.ts` | Tool registry (17 tools, alias support) |
| `src/daemon/exec/gateway.ts` | Single entry for all shell execution |
| `src/daemon/api/app.ts` | Hono HTTP server, middleware |

### Workspace Structure

```
Root workspace:     src/                      (main Jeriko CLI + daemon)
Apps:               apps/relay/               (Bun relay, local dev)
                    apps/relay-worker/         (CF Worker relay, production)
                    apps/website/              (Next.js marketing site)
Packages:           packages/protocol/         (wire protocol types)
                    packages/plugin-sdk/       (plugin developer types)
                    packages/sdk/              (daemon API client)
```

---

## Configuration

Configuration lives in `~/.config/jeriko/config.json` following the `JerikoConfig` schema.

### Config Schema

```json
{
  "agent": {
    "model": "claude-sonnet-4-20250514",
    "maxTokens": 8192,
    "temperature": 0.7,
    "extendedThinking": false
  },
  "channels": {
    "telegram": { "token": "...", "adminIds": ["..."] },
    "whatsapp": { "adminPhone": "..." }
  },
  "connectors": {
    "stripe": { "webhookSecret": "..." }
  },
  "providers": [],
  "media": {
    "stt": { "provider": "openai" },
    "tts": { "provider": "native" },
    "imageGen": { "provider": "openai" }
  },
  "security": {
    "allowedPaths": [],
    "blockedCommands": [],
    "sensitiveKeys": []
  },
  "storage": {
    "dbPath": "~/.jeriko/data/jeriko.db",
    "memoryPath": "~/.jeriko/memory/MEMORY.md"
  },
  "logging": {
    "level": "info",
    "maxFileSize": 10485760,
    "maxFiles": 5
  }
}
```

### Config Loading Order

Defaults → User config (`~/.config/jeriko/config.json`) → Project config → Environment variables

### Secrets

Sensitive credentials stored in `~/.config/jeriko/.env` with `0600` permissions. Three synchronized sensitive key lists across the codebase ensure secrets are never leaked in logs, exec output, or plugin sandboxes.

---

## Platform Support

| Feature | macOS | Linux | Windows |
|---------|-------|-------|---------|
| Core commands (sys, fs, exec, browse, search, net, proc) | Full | Full | Full |
| Daemon + API server | Full | Full | Full |
| All 29 connectors | Full | Full | Full |
| Telegram / WhatsApp channels | Full | Full | Full |
| Document handling (PDF, Excel, Word, CSV, images) | Full | Full | Full |
| AI features (all drivers, image gen, STT, TTS) | Full | Full | Partial |
| Skills system | Full | Full | Full |
| Interactive chat REPL | Full | Full | Full |
| AppleScript (notes, reminders, calendar, contacts, music, messages, mail) | Full | — | — |
| Desktop screenshot | Full | Partial | — |
| Camera (webcam) | Full | Full (ffmpeg) | — |
| Clipboard | Full | Full (xclip) | — |

### Build Targets

| Platform | Architecture |
|----------|-------------|
| macOS | arm64, x64 |
| Linux | arm64, x64 |
| Windows | x64 |

**Required:** Bun >= 1.1.0

**Optional dependencies:**

| Dependency | Required For | Install |
|------------|-------------|---------|
| Playwright | `jeriko browse` | `bunx playwright install` |
| ffmpeg | Camera, audio recording | `brew install ffmpeg` / `apt install ffmpeg` |

---

## Security

Jeriko's security model is defense-in-depth at the application level, audited March 2026.

### Security Architecture

| Layer | Mechanism |
|-------|-----------|
| **Compiled binary** | Standalone binary cannot be opened, inspected, or decompiled |
| **Local-only data** | All data, credentials, sessions stored on your device — never transmitted to Etheon |
| **Exec gateway** | Single entry for all shell execution (lease → sandbox → audit pipeline) |
| **Env stripping** | `SENSITIVE_KEYS` filtered from all subprocesses (3 synchronized lists) |
| **Plugin isolation** | Plugins receive only declared env vars + safe system vars |
| **Shell escaping** | `escapeShellArg()` on all user input in shell commands (25+ sites) |
| **AppleScript escaping** | `escapeAppleScript()` on all user input in AppleScript (30+ sites) |
| **Timing-safe auth** | HMAC-SHA256 with timing-safe comparison (15+ sites) |
| **Telegram allowlist** | `ADMIN_TELEGRAM_IDS` — deny-all when empty |
| **Webhook signatures** | GitHub, Stripe, raw HMAC — fail-closed verification |
| **Plugin trust** | Untrusted by default — no webhooks, no prompt injection |
| **Plugin integrity** | SHA-512 manifest hash verified on trust operations |
| **Audit logging** | All security operations logged, auto-rotated |
| **Security headers** | X-Frame-Options DENY, X-Content-Type-Options nosniff, CSP on share pages |
| **File permissions** | Credentials stored with `0600` (owner-only read/write) |
| **Body limits** | Request size limits, buffer bounds, worker pool queue bounds |

### Audit Status

Full security audit completed March 6, 2026 — 19 fixes applied across 2 phases. See `docs/SECURITY-AUDIT-2026-03-06.md`.

---

## Testing

```bash
bun test                             # all tests
bun run test:smoke                   # fast gates (<100ms)
bun run test:unit                    # all unit tests (12 parallel suites)
bun run test:integration             # integration tests
bun run test:e2e                     # end-to-end tests
```

### Test Suites

| Suite | Tests | Command |
|-------|-------|---------|
| Smoke | 10 | `bun run test:smoke` |
| CLI | 509 | `bun run test:unit:cli` |
| Agent | — | `bun run test:unit:agent` |
| Billing | 165 | `bun run test:unit:billing` |
| Channels | — | `bun run test:unit:channels` |
| Connectors | — | `bun run test:unit:connectors` |
| Triggers | — | `bun run test:unit:triggers` |
| Relay | — | `bun run test:unit:relay` |
| Security | — | `bun run test:unit:security` |
| Shared | — | `bun run test:unit:shared` |
| Skills | — | `bun run test:unit:skills` |
| Webdev | 38 | `bun run test:unit:webdev` |
| Streaming | — | `bun run test:unit:streaming` |
| Media | 46 | — |

### CI Pipeline

5-stage progressive gate:
1. **Typecheck + Smoke** — fast fail (<30s)
2. **Unit tests** — 12 parallel jobs by subsystem
3. **Integration tests** — relay, commands, connectors
4. **E2E tests** — full system
5. **Build verification** — Linux x64 binary

---

## Docs

| Document | Description |
|----------|-------------|
| [AGENT.md](AGENT.md) | System prompt for AI agents (all commands, workflows) |
| [Command Reference](docs/COMMANDS.md) | All 51 commands with flag tables and examples |
| [Architecture](docs/ARCHITECTURE.md) | System design, data flow, 4-layer model |
| [Security Model](docs/SECURITY.md) | Security architecture and audit |
| [Triggers](docs/TRIGGERS.md) | 6 trigger types, management, lifecycle |
| [Plugins](docs/PLUGINS.md) | Plugin system, trust, env isolation |
| [Contributing](docs/CONTRIBUTING.md) | Development setup, coding standards |
| [ADR-001: CI/CD Pipeline](docs/adr/001-ci-cd-devops-pipeline.md) | CI/CD strategy |
| [ADR-002: Model Compatibility](docs/ADR-002-MODEL-COMPATIBILITY.md) | Multi-model support |

---

## Project Structure

```
src/
  index.ts                    # entry point → CLI dispatcher
  cli/
    dispatcher.ts             # 51 commands, global flags, fuzzy matching
    app.tsx                   # root Ink component (useReducer state)
    chat.tsx                  # interactive chat REPL
    backend.ts                # daemon IPC vs in-process agent
    commands/                 # 11 command categories
      system/                 # sys, exec, proc, net
      files/                  # fs, doc
      browser/                # browse, search, screenshot
      comms/                  # email, msg, notify, audio
      os/                     # notes, remind, calendar, contacts, music, clipboard, window, camera, open, location
      integrations/           # stripe, github, paypal, vercel, twilio, x, gdrive, gmail, hubspot, shopify, + 14 more
      dev/                    # code, create, dev, parallel
      agent/                  # ask, memory, discover, prompt, skill, share, provider
      automation/             # init, onboard, server, task, setup, update
      plugin/                 # install, trust, uninstall
      billing/                # plan, upgrade, billing
    handlers/                 # REPL slash command handlers
      session.ts              # /new, /sessions, /resume, /switch, /history, /clear, /compact, /share, /cost, /kill, /archive
      model.ts                # /model, /provider
      connector.ts            # /connectors, /connect, /disconnect, /channels, /triggers
      system.ts               # /help, /skills, /status, /health, /sys, /config, /plan, /upgrade, /billing
      registry.ts             # command registration
    hooks/                    # React hooks
      useAppReducer.ts        # centralized state (~23 action types)
      useSlashCommands.ts     # REPL dispatch table
    themes.ts                 # 12 themes, mutable PALETTE
    components/               # Ink components (App, Input, Messages, StatusBar, etc.)
  daemon/
    kernel.ts                 # 16-step boot sequence
    agent/
      orchestrator.ts         # observe → think → act loop
      tools/                  # 17 agent tools
        bash.ts               # shell execution
        browse.ts             # browser automation
        camera.ts             # webcam capture
        connector.ts          # service API calls
        delegate.ts           # sub-agent spawning
        edit.ts               # file editing
        list.ts               # directory listing
        memory-tool.ts        # persistent memory
        parallel.ts           # concurrent tasks
        read.ts               # file reading
        screenshot.ts         # desktop capture
        search.ts             # file search
        skill.ts              # skill execution
        web.ts                # web search
        webdev.ts             # web development (8 actions)
        write.ts              # file writing
        registry.ts           # tool registry + aliases
      drivers/                # LLM drivers
        anthropic.ts          # Anthropic Messages API
        openai.ts             # OpenAI Chat Completions
        openai-compat.ts      # OpenAI-compatible providers
        anthropic-compat.ts   # Anthropic-compatible providers
        local.ts              # Ollama, LM Studio
        claude-code.ts        # Claude Code CLI
        presets.ts            # 22 provider presets
        models.ts             # model capabilities
    services/
      channels/               # Telegram (grammy), WhatsApp (Baileys)
      connectors/             # 29 connector implementations
        registry.ts           # CONNECTOR_FACTORIES
        manager.ts            # ConnectorManager (lazy init, health cache)
      triggers/               # TriggerEngine (6 types)
      relay/                  # relay client (exponential backoff, heartbeat)
      media/                  # STT, TTS, image generation
      oauth/                  # OAuth provider definitions
    billing/                  # Stripe billing, license, webhooks
    storage/                  # SQLite via bun:sqlite, migrations
    api/                      # Hono HTTP server
    exec/                     # execution gateway (lease → sandbox → audit)
    plugin/                   # plugin sandbox
  shared/
    config.ts                 # JerikoConfig schema + loader
    types.ts                  # exit codes, shared types
    output.ts                 # ok()/fail() output contract
    secrets.ts                # sensitive key management
    skill.ts                  # skill types
    skill-loader.ts           # skill YAML parser + loader
    connector.ts              # CONNECTOR_DEFS metadata
    relay-protocol.ts         # wire protocol types + constants
  platform/
    darwin/                   # macOS: 18 platform modules (AppleScript-based)
    linux/                    # Linux: 6 platform modules
    win32/                    # Windows: 5 platform modules
apps/
  relay/                      # Bun relay server (local dev)
  relay-worker/               # CF Worker relay (production)
  website/                    # Next.js marketing site
packages/
  protocol/                   # wire protocol types
  plugin-sdk/                 # plugin developer types
  sdk/                        # daemon API client
templates/
  webdev/
    app/                      # full-stack app template
    web-db-user/              # web + database + auth template
    web-static/               # static website template
test/
  smoke/                      # fast gate tests (<100ms)
  unit/                       # 12 subsystem test suites
  integration/                # relay, commands, connectors
  e2e/                        # end-to-end tests
```

---

## License

Proprietary — [Etheon, Inc.](https://etheon.ai)

Etheon, Inc., a Delaware corporation, 524 Market Street, San Francisco, CA 94105.
Etheon AI LTD, a United Kingdom limited company, 3rd Floor Suite, 207 Regent Street, London, England, W1B 3HH.

See [Terms & Conditions](https://jeriko.ai/terms-and-conditions) | [Privacy Policy](https://jeriko.ai/privacy-policy) | [Acceptable Use](https://jeriko.ai/acceptable-use)

Contact: [info@etheon.ai](mailto:info@etheon.ai)
