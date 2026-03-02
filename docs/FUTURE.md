# Jeriko — Future Development Roadmap

> Strategic priorities informed by competitive analysis against Claude Code, OpenCode, Aider, and Cursor.

---

## Competitive Landscape

### What Jeriko Already Has That Others Don't

| Capability | Claude Code | OpenCode | Aider | Jeriko |
|------------|------------|----------|-------|--------|
| Multi-LLM drivers (Anthropic, OpenAI, Ollama, custom) | Anthropic only | OpenAI + Anthropic | Multi-model | **5 drivers + any OpenAI-compat** |
| Messaging channels (Telegram, WhatsApp, Slack, Discord) | None | None | None | **4 channels** |
| External service connectors (Stripe, PayPal, GitHub, etc.) | None | None | None | **10 connectors** |
| Reactive triggers (cron, webhook, file, HTTP, email) | None | None | None | **5 trigger types** |
| Sub-agent orchestration with structured context | Basic subagent | None | None | **5 agent types + fanOut** |
| Single compiled binary (~66MB) | npm package | Go binary | pip package | **Bun compile** |
| Web project scaffolding (34+ templates) | None | None | None | **Full template system** |
| Headless browser with stealth mode | Basic fetch | None | None | **Playwright + anti-detection** |
| Skills system (extensible knowledge packages) | None | None | None | **Progressive loading** |
| macOS native commands (Notes, Calendar, Music, etc.) | None | None | None | **10 OS commands** |
| Session sharing (public links) | None | None | None | **Share system** |

### What Competitors Have That Jeriko Needs

| Capability | Who Has It | Jeriko Status |
|------------|-----------|---------------|
| MCP (Model Context Protocol) | Claude Code, Cursor | Not implemented |
| LSP integration (IDE awareness) | Cursor, Continue | Not implemented |
| Hook system (pre/post tool callbacks) | Claude Code | Not implemented |
| Git-aware context (branch, diff, blame) | Claude Code, Aider | Partial (via `github` connector) |
| Cost tracking + token dashboard | Claude Code, Aider | Basic (per-turn only) |
| Context window management (auto-compact) | Claude Code | Basic (75% threshold) |
| Multi-file edit preview with diff | Aider, Cursor | Not implemented |
| Conversation export/replay | None fully | Share only (no replay) |
| Remote execution (SSH) | None | Not implemented |
| Container sandboxing | Cursor (via Docker) | Not implemented |
| Memory system (cross-session) | Claude Code (CLAUDE.md) | KV store only |

---

## Priority 1 — Protocol & Ecosystem

**Impact: High · Effort: High · Unlocks ecosystem adoption**

### MCP (Model Context Protocol) Support

MCP is becoming the standard protocol for AI tool integration. Jeriko should support both server and client modes.

**MCP Server mode** — Expose Jeriko's 15 tools as MCP tools so any MCP client (Claude Desktop, Cursor, etc.) can use them:
- Map ToolDefinition → MCP tool schema
- Transport: stdio (for local) and SSE (for remote)
- Session management via MCP protocol
- Resource exposure: files, skills, connector data

**MCP Client mode** — Allow Jeriko to consume external MCP servers:
- Config: `mcpServers` section in `config.json`
- Dynamic tool loading from MCP servers at boot
- Tool namespacing to avoid collisions (`mcp:server:tool`)
- Stdio and SSE transport support

### Hook System

Pre/post execution callbacks for tool calls, allowing users to customize agent behavior:

```typescript
// ~/.config/jeriko/hooks.json
{
  "pre:bash": "echo 'About to run: $JERIKO_COMMAND'",
  "post:write_file": "eslint --fix $JERIKO_FILE_PATH",
  "pre:*": "jeriko audit log --tool $JERIKO_TOOL"
}
```

- Pre-hooks can block execution (non-zero exit = cancel)
- Post-hooks receive tool result via env vars
- Wildcard patterns for broad hooks
- Registered in config, executed by tool registry

### Plugin Marketplace

Evolve the existing plugin system into a community registry:

- Central registry at `registry.jeriko.ai` (or GitHub-based)
- `jeriko install <plugin>` from registry (already supports npm)
- Plugin discovery: `jeriko discover --remote`
- Version pinning and integrity verification (SHA-512, already implemented)
- Trust levels: untrusted → verified → official

---

## Priority 2 — Developer Experience

**Impact: High · Effort: Medium · Improves daily workflow**

### Git-Aware Context

Automatically inject git context into agent sessions:

- Current branch, recent commits, staged changes
- File blame context when editing (who last changed this, why)
- PR context when working on a branch (linked issues, review comments)
- Diff-aware edits: agent sees what changed since last commit
- Integration point: extend system prompt with git metadata at session start

### Cost Tracking Dashboard

Persistent cost tracking across sessions:

- Per-session token counts and estimated costs (already tracked per-turn)
- Running totals by model, by day, by week
- Budget alerts: warn when approaching spending threshold
- `jeriko cost` command: summary, breakdown, trends
- Storage: new `cost_log` table in SQLite
- Dashboard view in `/status` slash command

### Multi-File Edit Preview

Before applying edits, show a unified diff preview:

- Collect all pending edits from a tool call batch
- Display unified diff with syntax highlighting
- User confirms or rejects in chat (`y/n/e` to edit)
- Applies atomically (all or nothing)
- Useful for `delegate` results that modify multiple files

### Session Export & Replay

Export conversations for sharing, debugging, and compliance:

- `jeriko session export <slug>` → Markdown, JSON, or HTML
- Include tool calls, results, timing, token counts
- Replay mode: re-execute a session against a different model
- Diff mode: compare outputs between models
- Extend existing share system with full-fidelity export

### `/init` Project Onboarding

Auto-detect project stack and configure Jeriko optimally:

- Detect: language, framework, package manager, test runner, linter
- Generate: project-specific `jeriko.json` with appropriate settings
- Suggest: relevant skills to install
- Create: `.jeriko/` directory with project context
- Examples: detect Next.js → suggest web-db-user patterns, detect Python → adjust shell tool defaults

---

## Priority 3 — Agent Intelligence

**Impact: High · Effort: High · Core agent capability improvements**

### Cross-Session Memory

Persistent memory system that builds project understanding over time:

- **Project memory**: auto-extracted facts about codebase (architecture, conventions, key files)
- **User preferences**: learned from interactions (style, tools, workflows)
- **Entity memory**: relationships between files, functions, APIs
- Storage: new `memory` table with embeddings (or keyword-based retrieval)
- Injection: relevant memories prepended to system prompt per-session
- Decay: old/unused memories deprioritized over time
- Commands: `jeriko memory list`, `jeriko memory forget <key>`

### Plan Mode

Think → plan → execute cycle for complex tasks:

- Agent receives complex request
- Phase 1: Research — read files, search codebase, understand context
- Phase 2: Plan — produce a structured plan (file changes, order, risks)
- Phase 3: Review — user approves/modifies the plan
- Phase 4: Execute — agent implements the plan step-by-step
- Plan persistence: checkpoints between phases
- Rollback: revert to pre-plan state if execution fails

### Auto-Recovery

Intelligent error handling with retry strategies:

- Classify errors: transient (retry), permanent (fail), recoverable (fix & retry)
- Transient: API rate limits, network timeouts → exponential backoff
- Recoverable: syntax errors in generated code → self-correct and retry
- Fallback models: if primary model fails, try secondary (e.g., Claude → GPT-4o)
- Configurable: `agent.retryStrategy`, `agent.fallbackModels` in config
- Circuit breaker already exists (5 errors) — extend with smarter strategies

### Advanced Context Management

Smarter handling of the context window:

- Priority scoring: recent messages > old messages, user messages > tool results
- Selective compaction: summarize tool results, keep user messages verbatim
- File-aware: when editing a file, keep its full content in context
- Sliding window: automatically drop oldest messages when approaching limit
- Context usage indicator in CLI (already have `ContextBar` component)
- Pre-emptive compaction: compact before hitting 75%, not after

---

## Priority 4 — Infrastructure

**Impact: Medium · Effort: High · Platform hardening**

### Remote Execution (SSH)

Execute agent commands on remote machines:

- `jeriko remote add <name> <host>` — register SSH target
- `@<name> <command>` syntax in chat (similar to existing multi-machine WebSocket)
- SSH key-based auth (reuse OS trust chain)
- File sync: mirror working directory to remote
- Tool routing: agent specifies target machine per tool call
- Security: allowlisted commands per remote, no root by default

### Container Sandboxing

Isolate untrusted code execution:

- Docker/Firecracker containers for `bash` tool calls
- Pre-built images with common dev tools
- Volume mounts for project files (read-write) and system (read-only)
- Network policy: allow/deny per container
- Resource limits: CPU, memory, time
- Configurable: `security.sandbox` in config (off by default)

### CI/CD Integration

Jeriko as a CI/CD assistant:

- GitHub Actions: `jeriko-action` for PR review, code generation, test fixes
- GitLab CI: equivalent runner
- `jeriko ci review` — review PR diff, suggest improvements
- `jeriko ci fix` — auto-fix failing tests
- `jeriko ci release` — generate changelogs, bump versions
- Webhook triggers already support GitHub events — extend with specialized handlers

### Telemetry & Analytics

Operational visibility for teams:

- Request/response logging with trace IDs
- Performance metrics: latency, token usage, error rates
- Audit dashboard: who did what, when, with which model
- Export: Prometheus metrics, OpenTelemetry traces
- Privacy: opt-in, no data leaves the machine by default

### Rate Limiting & Cost Controls

Multi-user/team controls:

- Per-user token budgets (daily, weekly, monthly)
- Per-model rate limits
- Cost alerts and auto-pause
- Admin override for emergency access
- Storage: extend `key_value` table or new `quotas` table

---

## Priority 5 — Platform

**Impact: Medium · Effort: Very High · Enterprise features**

### Team & Organization Support

Shared Jeriko instances for teams:

- User accounts with role-based access (admin, member, viewer)
- Shared sessions: team members can view/continue conversations
- Shared skills: team skill registry
- Shared connectors: centralized API credentials
- Audit log: compliance-ready activity tracking
- SSO integration (SAML, OIDC)

### Web Dashboard

Browser-based management interface:

- Session list with search and filtering
- Real-time session viewer (watch agent work)
- Connector management UI
- Trigger builder (visual cron expression editor)
- Skill browser and installer
- Cost and usage dashboard
- Built with Jeriko's own web-static template

### Mobile Companion

Lightweight mobile access:

- View active sessions and agent status
- Send messages to agent via mobile
- Receive trigger notifications
- Quick actions: approve/reject pending operations
- Platform: React Native or PWA (using existing Hono API)

### API Key Management

Programmatic access to Jeriko:

- Generate API keys for external integrations
- Scope keys: read-only, agent-only, admin
- Key rotation and expiry
- Usage tracking per key
- Rate limiting per key

---

## Implementation Notes

### Quick Wins (< 1 week each)

1. **Cost tracking** — extend per-turn tracking to persistent storage + `jeriko cost` command
2. **Git context injection** — `git status` + `git log` prepended to system prompt
3. **Session export** — Markdown export of conversation history
4. **`/init` command** — basic stack detection and config generation

### Medium Efforts (1–4 weeks each)

1. **MCP Server** — expose tools via MCP stdio transport
2. **Hook system** — pre/post callbacks with config-based registration
3. **Plan mode** — research → plan → approve → execute cycle
4. **Cross-session memory** — keyword-based memory with auto-extraction

### Large Efforts (1–3 months each)

1. **MCP Client** — consume external MCP servers with dynamic tool loading
2. **Container sandboxing** — Docker integration for bash tool
3. **Web dashboard** — full management UI
4. **Team support** — multi-user access control

### Dependencies Between Items

```
MCP Server ← MCP Client ← Plugin Marketplace
Git Context ← Plan Mode ← Auto-Recovery
Cost Tracking ← Rate Limiting ← Team Support
Session Export ← Web Dashboard ← Mobile App
Hook System ← CI/CD Integration
Remote Execution ← Container Sandboxing
Cross-Session Memory ← Advanced Context Management
```
