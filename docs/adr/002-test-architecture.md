# ADR-002: Test Architecture — Subsystem Isolation & Progressive Gating

## Status: Accepted

## Date: 2026-03-06

## Context

Jeriko has 1,971 tests across 77 files. Running `bun test` executes everything — billing,
camera, browser, channels, relay — regardless of what changed. A billing fix triggers
camera tests. A CLI tweak waits for trigger engine tests. This wastes 5-10 minutes per run
and provides no signal about what actually broke.

### Problem Statement

1. **No subsystem isolation** — `bun test` runs all 1,971 tests monolithically
2. **No progressive gating** — integration tests run even if unit tests fail
3. **No smoke tests** — no fast (<1s) sanity check for deploys
4. **No CI/CD subsystem matrix** — GitHub Actions runs one "Unit Tests" job
5. **Developer time wasted** — fixing billing runs camera/browser tests (~5-10 min)

## Decision

### Test Pyramid (4 tiers)

```
         ╱ E2E ╲           ← Full system (channel registry + router + DB + all commands)
        ╱────────╲          140 tests, ~46s — runs last
       ╱Integration╲       ← Real servers, WebSockets, HTTP endpoints
      ╱──────────────╲      119 tests, ~2s — runs after unit
     ╱   Unit Tests    ╲   ← Pure logic, mocked deps, isolated
    ╱────────────────────╲  1,702 tests, <30s — 12 parallel subsystems
   ╱     Smoke Tests      ╲ ← Import validation, no side effects
  ╱────────────────────────╲ 10 tests, <100ms — runs first
```

### Subsystem Decomposition (12 unit test suites)

| Suite | Files | Tests | What it validates |
|-------|-------|-------|-------------------|
| `billing` | 6 | 147 | Tier limits, license state machine, webhooks, store, relay proxy |
| `cli` | 24 | 619 | Components, hooks, formatters, autocomplete, commands, theme |
| `agent` | 6 | 197 | Orchestrator, context, guard, model system, registry |
| `channels` | 2 | 107 | Router commands, adapter interface, message lifecycle |
| `connectors` | 3 | 143 | All 10 connectors, OAuth2 flow, Gmail/Outlook |
| `triggers` | 3 | 67 | Cron/webhook/file/http/email triggers, routes |
| `relay` | 4 | 61 | Client, protocol, connections, URL builders |
| `security` | 3 | 24 | API auth, AppleScript escaping, shell escaping |
| `shared` | 13 | 119 | Config, output, bus, args, DB, signals, user ID, install |
| `skills` | 2 | 65 | Skill loader, skill tool |
| `webdev` | 2 | 80 | Web dev tool, browser scripts |
| `streaming` | 4 | 68 | Socket stream, OpenAI stream, providers, Claude Code driver |

### Integration Tests (3 suites)

| Suite | Tests | What it validates |
|-------|-------|-------------------|
| `relay` | 20 | Real Bun relay server + WebSocket clients + HTTP |
| `commands` | 67 | Full daemon kernel boot + HTTP API + channel bus |
| `connectors` | 32 | Connector defs, secrets, health, auth flows |

### CI/CD Pipeline (5 stages, progressive gates)

```
Stage 1: Typecheck + Smoke     (~30s)  ← fail fast, parallel
    ↓
Stage 2: Unit tests × 12       (~30s)  ← parallel matrix, isolated failures
    ↓
Stage 3: Integration tests × 3 (~10s)  ← real servers, gates on unit pass
    ↓
Stage 4: E2E tests             (~46s)  ← full system, gates on integration
    ↓
Stage 5: Build verification    (~60s)  ← binary compiles, output contract
```

Key properties:
- **fail-fast: false** on matrix jobs — see ALL failures, not just the first
- **Stage gating** — integration won't run if any unit suite fails
- **Concurrency control** — cancels in-progress CI on new pushes to same branch
- **Cache** — `~/.bun/install/cache` + `node_modules` cached by lockfile hash

### npm Scripts (granular)

```bash
# Full suite
bun run test              # all tests
bun run test:ci           # unit → integration → e2e (sequential)

# By tier
bun run test:smoke        # <100ms sanity check
bun run test:unit         # all unit tests
bun run test:integration  # all integration tests
bun run test:e2e          # full system flow

# By subsystem (unit)
bun run test:unit:billing
bun run test:unit:cli
bun run test:unit:agent
bun run test:unit:channels
bun run test:unit:connectors
bun run test:unit:triggers
bun run test:unit:relay
bun run test:unit:security
bun run test:unit:shared
bun run test:unit:skills
bun run test:unit:webdev
bun run test:unit:streaming

# By subsystem (integration)
bun run test:integration:relay
bun run test:integration:commands
bun run test:integration:connectors
```

## Alternatives Considered

### 1. Keep monolithic `bun test`
- **Rejected**: 5-10 min per run, no failure isolation, camera tests on billing changes.

### 2. File-based filtering only (no npm scripts)
- **Rejected**: Requires remembering file paths. `bun test test/unit/billing/` works but
  `bun run test:unit:billing` is self-documenting and CI-friendly.

### 3. Separate test runner (Jest, Vitest)
- **Rejected**: Bun's built-in test runner is fast, zero-config, and native. Adding
  another runner adds complexity without benefit.

## Consequences

### Positive
- **Targeted testing**: Fix billing → run `test:unit:billing` in 300ms, not 5 min
- **CI isolation**: See exactly which subsystem failed in GitHub Actions
- **Fast feedback**: Smoke tests catch import/config issues in <100ms
- **Progressive confidence**: Unit → Integration → E2E builds confidence layer by layer

### Negative
- **Script maintenance**: Adding a new test file requires updating the correct npm script
- **12 CI jobs**: More parallel jobs = more GitHub Actions minutes (mitigated by cache + speed)

## Files Changed

- `package.json` — 19 new test scripts
- `.github/workflows/ci.yml` — 5-stage pipeline with subsystem matrix
- `test/smoke/system.test.ts` — 10 smoke tests (<100ms)
- `docs/adr/002-test-architecture.md` — this document
