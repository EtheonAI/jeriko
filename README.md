# JerikoBot

Unix-first CLI toolkit that gives any AI model full machine control.
30+ commands. Model-agnostic. Composable via pipes. Zero vendor lock-in.

## Install

```bash
npm install -g jerikobot
jeriko init
```

## Quick Start

```bash
jeriko sys                                    # system info
jeriko search "weather today"                 # web search
jeriko fs --ls .                              # list files
jeriko exec uptime                            # run any command
jeriko browse --screenshot "https://x.com"    # browser automation
jeriko sys | jeriko notify                    # pipe to Telegram
```

## Connect Any AI

```bash
# Claude Code
jeriko discover --raw | claude -p --system-prompt -

# OpenAI, Gemini, Llama, Ollama — anything with exec()
# Feed `jeriko discover --raw` as the system prompt
```

## Output Formats

```bash
jeriko sys                       # JSON (for piping)
jeriko sys --format text         # AI-optimized (~30% fewer tokens)
jeriko sys --format logfmt       # structured logs
```

## Plugins

```bash
jeriko install jeriko-stripe     # add Stripe payments
jeriko trust jeriko-stripe --yes # enable webhooks + AI prompts
jeriko plugin validate ./my-plugin  # validate before publishing
```

## Docs

- [Getting Started](docs/README.md)
- [Build a Plugin](docs/PLUGINS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Triggers](docs/TRIGGERS.md)
- [Contributing](docs/CONTRIBUTING.md)

## License

MIT — Etheon
