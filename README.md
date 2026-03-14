<p align="center">
  <img src="https://www.jeriko.ai/jeriko-logo-white.png" alt="Jeriko" width="200">
</p>

<h3 align="center">Unix-first CLI toolkit for AI agents</h3>

<p align="center">
  One binary. 51 commands. 17 agent tools. 29 connectors. Model-agnostic. Composable via pipes. Zero vendor lock-in.
</p>

<p align="center">
  <a href="https://github.com/etheonai/jeriko/releases"><img src="https://img.shields.io/github/v/release/etheonai/jeriko?label=version&style=flat-square" alt="Version"></a>
  <a href="https://github.com/etheonai/jeriko/actions"><img src="https://img.shields.io/github/actions/workflow/status/etheonai/jeriko/ci.yml?style=flat-square&label=CI" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License"></a>
  <a href="https://github.com/etheonai/jeriko/issues"><img src="https://img.shields.io/github/issues/etheonai/jeriko?style=flat-square" alt="Issues"></a>
</p>

<p align="center">
  <a href="https://jeriko.ai">Website</a> &middot;
  <a href="https://jeriko.ai/docs">Docs</a> &middot;
  <a href="docs/COMMANDS.md">Commands</a> &middot;
  <a href="docs/ARCHITECTURE.md">Architecture</a> &middot;
  <a href="docs/CONTRIBUTING.md">Contributing</a>
</p>

---

Any AI with `exec()` becomes an autonomous agent. Every command returns structured JSON. Pipe anything into anything.

```
jeriko sys | jeriko notify            pipe system info to Telegram
jeriko browse --screenshot "url"      browser automation
jeriko stripe customers list          Stripe API operations
jeriko github prs --create "title"    GitHub pull requests
jeriko ai --image "a red fox"         DALL-E image generation
jeriko twilio call +1... --say "hi"   make a phone call
jeriko vercel deploy --prod           deploy to Vercel
jeriko                                interactive AI chat (REPL)
```

---

## Install

```bash
# One-line install (recommended)
curl -fsSL https://jeriko.ai/install | sh

# From source (requires Bun >= 1.1.0)
git clone https://github.com/etheonai/jeriko.git
cd jeriko && bun install && bun run build

# First-run setup
jeriko init
```

`jeriko init` configures your AI backend (Claude, OpenAI, Ollama, or any OpenAI-compatible provider), messaging channels, and security settings.

See [docs/INSTALL.md](docs/INSTALL.md) for detailed instructions.

---

## Quick Start

```bash
jeriko sys                                    # system info (CPU, RAM, disk)
jeriko search "Node.js streams"               # web search
jeriko browse --screenshot "https://x.com"    # browser automation
jeriko stripe customers list                  # Stripe API
jeriko github issues --create "Bug"           # GitHub issues
jeriko ai --image "a sunset over mountains"   # DALL-E image generation
jeriko code --python "print(2**100)"          # execute Python
jeriko sys | jeriko notify                    # pipe output to Telegram
jeriko                                        # interactive AI chat (REPL)
```

---

## Connect Any AI

Jeriko is model-agnostic with 22 built-in provider presets and automatic env var discovery.

```bash
# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# OpenAI
OPENAI_API_KEY=sk-...

# Local models (Ollama, LM Studio, llama.cpp — runs fully offline)
LOCAL_MODEL_URL=http://localhost:11434/v1
LOCAL_MODEL=llama3.2

# Any OpenAI-compatible or Anthropic-compatible provider
jeriko provider add deepseek --type openai-compatible --base-url https://api.deepseek.com/v1
```

**Built-in presets:** anthropic, openai, google, deepseek, mistral, groq, together, fireworks, perplexity, cohere, x-ai, cerebras, sambanova, hyperbolic, openrouter, ollama, lm-studio, llama-cpp, jan, text-gen-webui, koboldcpp, vllm.

---

## Features

### 51 Commands

Organized in 11 categories: system, files, browser, desktop, communication, AI, project scaffolding, payments, cloud, storage, and server management.

Every command outputs structured data: `{"ok":true,"data":{...}}` or `{"ok":false,"error":"...","code":N}`. Three formats: `json`, `text`, `logfmt`.

See the full reference: [docs/COMMANDS.md](docs/COMMANDS.md)

### 29 Connectors

OAuth and API key integrations with: Stripe, GitHub, PayPal, Twilio, Vercel, Google Drive, Gmail, Outlook, OneDrive, HubSpot, Shopify, Slack, Discord, X, Instagram, Threads, Square, GitLab, Notion, Linear, Jira, Airtable, Asana, Mailchimp, Dropbox, SendGrid, Salesforce, Cloudflare.

```bash
jeriko connect github         # OAuth flow
jeriko connectors             # list all with status
jeriko disconnect github      # revoke credentials
```

### 17 Agent Tools

When running as an AI agent, Jeriko provides tools for: shell execution, file I/O, browser automation, web search, screenshots, webcam, connector API calls, sub-agent delegation, skills, persistent memory, parallel tasks, image generation, and web development.

### Interactive Chat REPL

`jeriko` with no arguments launches a full terminal chat built with React + Ink: streaming output, tool call visualization, markdown rendering, syntax highlighting, 38 slash commands, 12 themes, and model-aware cost tracking.

### Channels

Telegram and WhatsApp integration for remote AI interaction. Voice messages are auto-transcribed. Photos are vision-analyzed.

### Triggers

6 event-driven automation types: cron, webhook, file watch, HTTP polling, email (IMAP), and one-time datetime. Events fire AI agent actions with full tool access.

### Skills

Reusable AI capabilities packaged as YAML frontmatter + Markdown. Progressive loading: metadata at boot, full body on demand.

### Plugins

Third-party commands with sandboxed execution, trust model, and integrity verification.

---

## Architecture

```
Layer 4: Relay     apps/relay/ (Bun) + apps/relay-worker/ (Cloudflare Worker)
Layer 3: Daemon    src/daemon/kernel.ts — 16-step boot, agent, API, services, storage
Layer 2: CLI       src/cli/dispatcher.ts — 51 commands, Ink-based interactive REPL
Layer 1: Shared    src/shared/ — config, types, output, escape, protocol
Platform           src/platform/ — OS abstraction (darwin/linux/win32)
```

| Entry Point | Description |
|-------------|-------------|
| `jeriko` | Interactive chat REPL |
| `jeriko <cmd>` | CLI command |
| `jeriko serve` | Daemon with HTTP API |

TypeScript (strict mode), Bun runtime, compiled to standalone ~66MB binary. React + Ink for terminal UI. SQLite via bun:sqlite. Hono HTTP server.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full system design.

---

## Platform Support

| Feature | macOS | Linux | Windows |
|---------|:-----:|:-----:|:-------:|
| Core commands, daemon, connectors, chat REPL | Full | Full | Full |
| Document handling (PDF, Excel, Word, images) | Full | Full | Full |
| AI features (all drivers, image gen, STT/TTS) | Full | Full | Partial |
| Native apps (Notes, Reminders, Calendar, etc.) | Full | - | - |
| Desktop screenshot, camera, clipboard | Full | Partial | - |

**Build targets:** macOS (arm64, x64), Linux (arm64, x64, musl), Windows (x64, arm64)

---

## Building from Source

```bash
git clone https://github.com/etheonai/jeriko.git
cd jeriko
bun install
bun run build           # standalone binary → ./jeriko
bun run build:all       # all platforms → dist/
bun run typecheck       # tsc --noEmit
bun test                # all tests
```

### Test Suites

```bash
bun run test:smoke          # fast gates (<100ms)
bun run test:unit           # 12 parallel subsystem suites
bun run test:integration    # relay, commands, connectors
bun run test:e2e            # end-to-end
```

CI runs a 5-stage progressive gate: typecheck + smoke, unit (12 parallel jobs), integration, e2e, build verification.

---

## Configuration

Config lives in `~/.config/jeriko/config.json`. Credentials in `~/.config/jeriko/.env` (permissions `0600`).

```bash
jeriko init                    # interactive setup wizard
jeriko init --ai claude --yes  # non-interactive
```

Loading order: defaults -> user config -> project config -> environment variables.

See [docs/INSTALL.md](docs/INSTALL.md) for detailed configuration options.

---

## Security

Defense-in-depth architecture, audited March 2026. Key mechanisms:

- All data stored locally — never transmitted to Etheon
- Single execution gateway with lease/sandbox/audit pipeline
- Sensitive env vars filtered from all subprocesses (3 synchronized lists)
- Shell and AppleScript escaping at 55+ call sites
- Timing-safe HMAC-SHA256 auth at 15+ call sites
- Plugin sandbox with env isolation and integrity verification
- Webhook signature verification (fail-closed)

See [docs/SECURITY.md](docs/SECURITY.md) and [docs/SECURITY-AUDIT-2026-03-06.md](docs/SECURITY-AUDIT-2026-03-06.md).

---

## Documentation

| Document | Description |
|----------|-------------|
| [AGENT.md](AGENT.md) | System prompt for AI agents |
| [Commands](docs/COMMANDS.md) | All 51 commands with flags and examples |
| [Architecture](docs/ARCHITECTURE.md) | System design, 4-layer model, data flow |
| [API Reference](docs/API.md) | Daemon HTTP API |
| [Security](docs/SECURITY.md) | Security model and audit |
| [Triggers](docs/TRIGGERS.md) | 6 trigger types and management |
| [Plugins](docs/PLUGINS.md) | Plugin system, trust, env isolation |
| [Plugin Spec](docs/PLUGIN-SPEC.md) | Plugin manifest and authoring |
| [Database](docs/DATABASE.md) | SQLite schema reference |
| [Multi-Machine](docs/MULTI-MACHINE.md) | Distributed orchestration |
| [Contributing](docs/CONTRIBUTING.md) | Development setup and coding standards |
| [Install](docs/INSTALL.md) | Detailed installation guide |

---

## Contributing

```bash
git clone https://github.com/etheonai/jeriko.git
cd jeriko && bun install
bun run dev              # watch mode
bun run typecheck        # type check
bun test                 # run tests
```

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for coding standards, naming conventions, and how to add commands.

---

## License

MIT — see [LICENSE](LICENSE) for details.

Built by [Etheon](https://etheon.ai)
