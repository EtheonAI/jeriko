# Competitor Analysis

> Updated March 2026. Focus: CLI coding agents and AI agent platforms.

---

## Market Overview

The CLI coding agent space exploded in 2025–2026. As of March 2026:

- **Claude Code** — 4% of public GitHub commits (~135K/day). Anthropic-only models. $20–200/mo.
- **Codex CLI** — OpenAI's agent. GPT-5.2-Codex optimized model. 1M+ developers. Open source (Rust).
- **OpenCode** — 100K+ GitHub stars. 75+ providers. GitHub Copilot partnership. Open source (Go).
- **Aider** — 39K stars, 4.1M installs, 15B tokens/week. 100+ models. Open source (Python).
- **Cursor** — 360K paying users. IDE-based. Composer model. $20–200/mo.
- **Gemini CLI** — Google. 1M token context. Free preview.
- **Windsurf** — 5 parallel agents. $15/mo.

Jeriko is the only platform that combines a coding agent with messaging channels, external service connectors, reactive triggers, and web project scaffolding.

---

## Head-to-Head

### Claude Code

**What it is:** Anthropic's official CLI agent. Deep reasoning. Mature ecosystem.

| Dimension | Claude Code | Jeriko | Verdict |
|-----------|------------|--------|---------|
| **Models** | Anthropic only (Opus, Sonnet, Haiku) | 5 drivers + any OpenAI-compat provider | **Jeriko** |
| **Permissions** | Per-tool allow/deny, persisted per project | None — agent runs freely | Claude Code |
| **Hooks** | Pre/post lifecycle callbacks (lint, format, security) | Not implemented | Claude Code |
| **MCP** | Full server + client, lazy loading, 300+ integrations | Not implemented | Claude Code |
| **Git awareness** | Branch, diff, blame in agent context | Via github connector only | Claude Code |
| **Context window** | 200K, sophisticated compaction | 200K, basic 75% threshold compaction | Claude Code |
| **Sub-agents** | Basic subagent, Agent Teams via MCP | 5 typed agents + fanOut + structured context | **Jeriko** |
| **Channels** | None | Telegram, WhatsApp, Slack, Discord | **Jeriko** |
| **Connectors** | None (MCP servers fill this gap) | 10 built-in (Stripe, PayPal, Gmail, etc.) | **Jeriko** |
| **Triggers** | None | Cron, webhook, file, HTTP, email | **Jeriko** |
| **Templates** | None | 34+ (web, deploy, scaffold) | **Jeriko** |
| **Browser** | Basic fetch | Playwright + stealth (anti-detection) | **Jeriko** |
| **Skills** | CLAUDE.md + slash commands | Progressive loading skill packages | **Jeriko** |
| **IDE** | VS Code, JetBrains extensions | CLI only | Claude Code |
| **Pricing** | $20–200/mo (Anthropic subscription) | Free (bring your own API keys) | **Jeriko** |
| **SWE-bench** | 80.9% (Opus 4.5) | Model-dependent | Claude Code |

**Key takeaway:** Claude Code has the best developer-workflow polish (permissions, hooks, MCP, git). Jeriko has the broadest platform surface (channels, connectors, triggers). They solve different problems — Claude Code is a coding assistant, Jeriko is an agent platform.

**Gaps to close:** MCP support, hook system, per-tool permissions.

---

### Codex CLI (OpenAI)

**What it is:** OpenAI's coding agent. Rust binary. Fastest throughput. GPT-5.2-Codex optimized.

| Dimension | Codex CLI | Jeriko | Verdict |
|-----------|----------|--------|---------|
| **Models** | OpenAI only (GPT-5.x series) | 5 drivers + any OpenAI-compat | **Jeriko** |
| **Speed** | 240+ tokens/sec, most turns < 30s | Model-dependent | Codex |
| **MCP** | Supported | Not implemented | Codex |
| **Skills** | $skill-name invocation, community skills | Progressive loading packages | Comparable |
| **Git** | Auto-commit, branch management | Via github connector | Codex |
| **Voice** | Hold spacebar to dictate | Not implemented | Codex |
| **IDE** | VS Code, Cursor, Windsurf extensions | CLI only | Codex |
| **Multi-agent** | Experimental parallel collaboration | 5 types + fanOut (production) | **Jeriko** |
| **Channels** | None | 4 channels | **Jeriko** |
| **Connectors** | None | 10 connectors | **Jeriko** |
| **Triggers** | None | 5 trigger types | **Jeriko** |
| **Terminal-Bench** | 77.3% (GPT-5.3) | Model-dependent | Codex |
| **Pricing** | ChatGPT subscription ($20/mo) | Free (BYOK) | **Jeriko** |
| **Open source** | Yes (Rust) | Yes (TypeScript/Bun) | Tie |

**Key takeaway:** Codex is the fastest raw coding agent. Jeriko has multi-model flexibility and the full platform layer. Codex is locked to OpenAI models; Jeriko can use Codex's models via OpenAI driver.

**Gaps to close:** MCP support, voice input, IDE extensions.

---

### OpenCode

**What it is:** Community-driven open source agent. 100K+ stars. GitHub Copilot partnership. 75+ providers.

| Dimension | OpenCode | Jeriko | Verdict |
|-----------|---------|--------|---------|
| **Models** | 75+ providers via Models.dev | 5 drivers + custom providers | OpenCode |
| **LSP** | Auto-configures language servers for LLM | Not implemented | OpenCode |
| **Multi-session** | Parallel agents on same project | Single session (sub-agents via orchestrator) | OpenCode |
| **Session sharing** | Share links | Share links | Tie |
| **Privacy** | No code/context stored | SQLite local storage | OpenCode |
| **GitHub CI** | `/opencode` in PR comments → Actions runner | Not implemented | OpenCode |
| **Copilot auth** | GitHub Copilot subscribers authenticate directly | BYOK only | OpenCode |
| **Channels** | None | 4 channels | **Jeriko** |
| **Connectors** | None | 10 connectors | **Jeriko** |
| **Triggers** | None | 5 trigger types | **Jeriko** |
| **Templates** | None | 34+ templates | **Jeriko** |
| **Browser** | None | Playwright + stealth | **Jeriko** |
| **Skills** | None | Progressive loading packages | **Jeriko** |
| **Sub-agents** | None | 5 typed agents + structured context | **Jeriko** |
| **Community** | 100K+ stars, 700 contributors, 2.5M monthly users | Early stage | OpenCode |
| **Pricing** | Free + provider costs | Free + provider costs | Tie |

**Key takeaway:** OpenCode wins on model breadth (75+ providers) and community size. Jeriko wins on everything beyond code editing — channels, connectors, triggers, browser, skills, sub-agents. OpenCode is a coding tool; Jeriko is a platform.

**Gaps to close:** LSP integration, GitHub Actions integration, broader provider registry.

---

### Aider

**What it is:** Pioneer of terminal AI pair programming. Git-native. 100+ languages. 15B tokens/week.

| Dimension | Aider | Jeriko | Verdict |
|-----------|-------|--------|---------|
| **Models** | 100+ LLMs (Claude, GPT, DeepSeek, Ollama) | 5 drivers + custom providers | Aider |
| **Git integration** | Auto-commit, diff, repo map, sensible messages | Via github connector | Aider |
| **Repo map** | Codebase graph for large projects | Not implemented | Aider |
| **Linting** | Auto-lint + auto-test after every change | Not implemented | Aider |
| **Voice** | Voice coding via speech-to-text | Not implemented | Aider |
| **Browser UI** | Optional web interface | CLI only | Aider |
| **Multi-file edit** | Coordinated changes with diff preview | Single-file tools (edit_file) | Aider |
| **Channels** | None | 4 channels | **Jeriko** |
| **Connectors** | None | 10 connectors | **Jeriko** |
| **Triggers** | None | 5 trigger types | **Jeriko** |
| **Sub-agents** | None | 5 typed agents + fanOut | **Jeriko** |
| **Browser** | None | Playwright + stealth | **Jeriko** |
| **Templates** | None | 34+ templates | **Jeriko** |
| **Community** | 39K stars, 4.1M installs | Early stage | Aider |
| **Pricing** | Free + provider costs | Free + provider costs | Tie |

**Key takeaway:** Aider is the best pure pair-programming tool — git-native, auto-lint, repo map, voice. Jeriko is the better agent platform. They optimize for different workflows.

**Gaps to close:** Git-native workflow, repo map, auto-lint after edits, multi-file diff preview.

---

### Cursor

**What it is:** IDE with built-in AI. Composer model. Multi-agent parallelism. 360K paying users.

| Dimension | Cursor | Jeriko | Verdict |
|-----------|--------|--------|---------|
| **Interface** | Full IDE (VS Code fork) | CLI / terminal REPL | Different category |
| **Composer model** | Purpose-built coding model, 4x faster | Uses general models | Cursor |
| **Multi-agent** | Mission Control — grid view, parallel agents | 5 types + fanOut via orchestrator | Cursor (UX) |
| **Cloud agents** | Long-running agents with computer use | Local execution only | Cursor |
| **Bug detection** | Bugbot Autofix | Not implemented | Cursor |
| **MCP** | Supported | Not implemented | Cursor |
| **Channels** | None | 4 channels | **Jeriko** |
| **Connectors** | None | 10 connectors | **Jeriko** |
| **Triggers** | None | 5 trigger types | **Jeriko** |
| **Open source** | No | Yes | **Jeriko** |
| **Pricing** | $20–200/mo | Free (BYOK) | **Jeriko** |

**Key takeaway:** Cursor is an IDE; Jeriko is a CLI platform. Not direct competitors. Cursor has the best GUI-based agent experience. Jeriko has Unix composability and the platform layer. Many developers use both.

---

## Feature Matrix (All Competitors)

| Feature | Jeriko | Claude Code | Codex | OpenCode | Aider | Cursor |
|---------|--------|------------|-------|---------|-------|--------|
| Multi-model | **15+ providers** | Anthropic only | OpenAI only | **75+ providers** | **100+ models** | Multi |
| Open source | **Yes** | No | **Yes** | **Yes** | **Yes** | No |
| MCP support | No | **Yes** | **Yes** | Partial | No | **Yes** |
| Hook system | No | **Yes** | No | No | No | No |
| Permissions | No | **Yes** | Partial | No | No | **Yes** |
| Git-native | No | **Yes** | **Yes** | No | **Yes** | **Yes** |
| LSP | No | No | No | **Yes** | No | **Yes** |
| Messaging channels | **4** | 0 | 0 | 0 | 0 | 0 |
| External connectors | **10** | 0 | 0 | 0 | 0 | 0 |
| Reactive triggers | **5 types** | 0 | 0 | 0 | 0 | 0 |
| Sub-agents | **5 types** | Basic | Experimental | Multi-session | No | Multi |
| Browser automation | **Stealth** | No | No | No | No | Cloud |
| Skills/knowledge | **Progressive** | CLAUDE.md | Skills | No | No | Rules |
| Project templates | **34+** | 0 | 0 | 0 | 0 | 0 |
| Session sharing | **Yes** | No | No | **Yes** | No | No |
| Voice input | No | No | **Yes** | No | **Yes** | No |
| IDE integration | No | **Yes** | **Yes** | No | **Yes** | **Native** |
| Repo map | No | No | No | No | **Yes** | **Yes** |
| Auto-lint | No | Via hooks | No | No | **Yes** | **Yes** |
| Compiled binary | **Yes** (66MB) | npm | **Yes** (Rust) | **Yes** (Go) | pip | Electron |

---

## Where Jeriko Is Unique

No other tool in this space combines all of these:

1. **Messaging channels** — Talk to your agent from Telegram, WhatsApp, Slack, Discord. Not just a CLI.
2. **External connectors** — Agent can call Stripe, PayPal, Gmail, GitHub, Twilio, etc. natively.
3. **Reactive triggers** — Cron jobs, webhooks, file watchers, HTTP polling, email monitoring — all fire agent actions.
4. **Web project scaffolding** — 34+ templates, instant scaffold, dev server management, checkpoint/rollback.
5. **Stealth browser** — Playwright with anti-detection (fingerprint spoofing, WebGL overrides).
6. **macOS native** — Notes, Calendar, Reminders, Contacts, Music, Camera, Clipboard, Window management.
7. **Typed sub-agents** — 5 agent types (general, research, task, explore, plan) with structured context return.

These make Jeriko an **agent platform**, not just a coding assistant. The competitors help you write code. Jeriko gives the AI access to your entire digital life.

---

## Where Jeriko Lags

Honest gaps, ranked by impact:

| Gap | Who Has It | Impact | Effort to Close |
|-----|-----------|--------|-----------------|
| **MCP support** | Claude Code, Codex, Cursor | Critical — ecosystem lock-out | High (server + client) |
| **Per-tool permissions** | Claude Code, Cursor | High — safety for untrusted use | Medium |
| **Hook system** | Claude Code | High — enables auto-lint, format, security | Medium |
| **Git-native workflow** | Claude Code, Codex, Aider, Cursor | High — daily developer workflow | Medium |
| **IDE integration** | Claude Code, Codex, Cursor, Aider | Medium — CLI-only limits adoption | High |
| **LSP integration** | OpenCode, Cursor | Medium — better code understanding | High |
| **Repo map** | Aider, Cursor | Medium — large project navigation | Medium |
| **Auto-lint after edit** | Aider, Cursor, Claude Code (hooks) | Medium — code quality guardrail | Low |
| **Voice input** | Codex, Aider | Low — nice to have | Medium |
| **Community size** | OpenCode (100K stars), Aider (39K) | High — ecosystem growth | Time |

---

## Strategic Position

```
                    Platform Breadth →
                    (channels, connectors, triggers, templates)

                    High │ Jeriko ★
                         │
                         │
                         │
                    Low  │ Aider    OpenCode    Claude Code    Cursor
                         └──────────────────────────────────────────
                         Low               Coding Depth →            High
                         (git, lint, LSP, repo map, permissions, MCP)
```

Jeriko occupies a unique quadrant: **high platform breadth, moderate coding depth**. Every competitor clusters in the opposite quadrant: deep coding workflow, no platform capabilities.

**The play:** Close the critical coding gaps (MCP, permissions, hooks, git) while maintaining the platform moat that no competitor is building toward.

---

## Benchmark Context

Jeriko's benchmark performance is model-dependent since it supports multiple providers:

| Benchmark | Best Score | Jeriko (via same model) |
|-----------|-----------|------------------------|
| SWE-bench Verified | 80.9% (Claude Opus 4.5) | Same model available via Anthropic driver |
| Terminal-Bench 2.0 | 77.3% (GPT-5.3 Codex) | GPT models available via OpenAI driver |

Jeriko doesn't have its own benchmark scores because it's model-agnostic. The quality of code generation depends on which model the user chooses. This is a feature, not a limitation — users pick the best model for their task.

---

## Sources

- [Tembo: 15 CLI Coding Tools Compared (2026)](https://www.tembo.io/blog/coding-cli-tools-comparison)
- [Morph: AI Coding Agent Comparison (2026)](https://www.morphllm.com/ai-coding-agent)
- [DataCamp: OpenCode vs Claude Code (2026)](https://www.datacamp.com/blog/opencode-vs-claude-code)
- [Claude Code Documentation](https://code.claude.com/docs/en/features-overview)
- [OpenCode GitHub](https://github.com/opencode-ai/opencode)
- [Aider — AI Pair Programming](https://aider.chat/)
- [Cursor Features](https://cursor.com/features)
- [Codex CLI Documentation](https://developers.openai.com/codex/cli/)
- [Northflank: Claude Code vs Codex (2026)](https://northflank.com/blog/claude-code-vs-openai-codex)
