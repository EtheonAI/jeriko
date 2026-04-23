# ADR-002 — Production-hygiene audit (April 2026)

Status: **Accepted**
Date: 2026-04-23
Author: khaleel737

## Context

Toby's PR #67 landed a batch of "release hygiene" fixes (retry/backoff on the
Anthropic driver, release-base probe refactor, `.env` 0o600, Vercel promote,
malformed-JSON config guard, template version pinning). The PR was narrowly
scoped to a handful of sites; the patterns it applies are much broader than
the sites it touched.

This ADR catalogs the **full surface of the same bug classes** across the
codebase so we can close the category rather than the individual bugs Toby
happened to spot.

## Audit scope

Five heavy audits were run in parallel, each with file:line citations:

1. HTTP retry/backoff coverage across drivers, connectors, and misc fetch sites
2. `spawn()` process hygiene — timeout, AbortSignal, kill semantics, stderr capture
3. Malformed-input robustness (JSON.parse / YAML / env vars) + log redaction
4. Secret-file permissions + diagnostic surfacing (`VERSION`, `BUILD_REF`)
5. Connector method-surface completeness vs vendor API

## Findings

### Retry coverage — 2% today

| Area | Sites | Working retry |
|---|---|---|
| LLM drivers | 6 | 0 (none) |
| Connectors | 31 | 0 (base has `withRetry` but it only catches thrown exceptions; `toResult` never throws on 5xx, so retry is non-functional) |
| Other HTTP (OAuth, media, models.dev, billing license, web search) | 12+ | 0 |

The connector finding is the sharpest: the base class's retry code has
been running for months and never retried a single HTTP error, because the
retry wrapper only triggers on exceptions and the connector base turns every
5xx response into a `{ok: false}` return value. Silent dead code.

### Process hygiene — 14 UNSAFE, 18 PARTIAL, 28 SAFE (60 total)

Highest-risk sites:
- `daemon/services/triggers/engine.ts:798` — user-supplied shell command via
  `Bun.spawn` with no timeout
- `daemon/services/mcp/stdio-transport.ts:51` — MCP server startup can hang
  indefinitely
- `daemon/agent/tools/webdev.ts:596` + `cli/commands/dev/dev.ts:46` —
  `{ detached: true, unref() }` orphans dev servers
- `daemon/agent/tools/camera.ts:27` + `screenshot.ts:{24,29}` — hardware-hang
  vectors with no timeout
- Platform service lifecycle (18 `execSync` sites) — `schtasks` / `launchctl`
  / `systemctl` with no timeout

### Input + redaction — JSON parsing is solid, error-body redaction is not

- JSON.parse: 13 sites, 100% wrapped in try/catch (excellent)
- One exception: `daemon/plugin/loader.ts:120` lacks a local try/catch (covered
  by an outer loop but less graceful)
- `response.text()` → error yield: **4 of 4 LLM drivers leak** raw provider
  response bodies to the user via StreamChunk errors without `redact()`
- `parseInt(process.env.*)` in 5+ places silently yields NaN on malformed
  input (IMAP port, rate-limit reset, token budgets)

### Secrets + diagnostics — 3 unprotected writes, telemetry version broken

Unprotected `writeFileSync` sites (no `0o600`):
- `daemon/plugin/registry.ts:176` — plugin trust store
- `daemon/services/channels/lifecycle.ts:236` — channel config (may hold creds)
- `daemon/agent/tools/memory-tool.ts:39` — agent memory (may hold PII)

Diagnostic gaps:
- `src/shared/telemetry.ts:21` — hardcodes version `"2.0.0-alpha.1"` instead
  of importing `VERSION`. Every PostHog event mis-reports.
- `BUILD_REF` (added by Toby's PR) has zero consumers — exported but never
  surfaced in `--version`, `/health`, telemetry, or logs.
- Windows installers (`install.ps1`, `install.cmd`) hardcode
  `khaleel737/jeriko` as the GitHub org. Should be `etheonai/jeriko`.
  Toby fixed only the bash installer.

### Connector completeness — 15 ranked gaps

Top 5 by user impact:
1. `files.upload` — missing in Dropbox, Slack, Gmail
2. `attachments.*` — missing in Outlook, Gmail
3. `threads.*` — missing in Slack, Discord
4. `messages.batch_*` — missing in Gmail, Twilio
5. `deployments.promote` — Toby fixed in Vercel

## Decisions

### Accept from PR #67 (wholesale — 47 of 50 files)

- Templates (×35): exact-version pinning for reproducible builds
- Scripts: `build.ts` (BUILD_REF bake), install scripts (base-URL probe)
- `automation/update.ts`: base-URL refactor + versioned fallback
- `vercel/connector.ts` + `integrations/vercel.ts`: `deployments.promote`
- `wizard/onboarding.ts`: 0o600 + chmod on `.env` write
- `kernel.ts`: malformed-JSON typed error
- `shared/config.ts`: comment clarification
- `shared/version.ts`: `BUILD_REF` export
- `tsconfig.json`: cosmetic reorder
- Tests: anthropic retry suite, config malformed test, connectors promote test

### Accept with modification

- **`anthropic.ts` retry logic** — keep the 429/502/503/504 loop, Retry-After
  parsing, exponential backoff, and redacted error body. But route the body
  through our `buildCachedAnthropicRequest` (not the non-cache-aware
  `buildAnthropicRequestBody` directly) so prompt caching survives.
- **`models.ts`** — accept the `isKnownProvider()` gate, conservative 24k
  fallback, `pinnedOnly`, malformed-`modelId` guard. **Reject** the
  `gpt-5.4` alias default and the 64k maxOutput bump — `gpt-5.4` isn't a
  real OpenAI model id and bumping the default would 404 first-time users.

### Extend to the full surface (Phase 2)

Toby's class-of-fix, applied everywhere it should be:

1. **Retry layer**: wrap every driver and every connector HTTP helper in a
   single `withHttpRetry` that inspects `res.status` (not just exceptions).
   5 drivers + 20 connectors + 12 other sites = 37 call sites to cover.
2. **Redaction**: apply `redact()` to every `response.text()` → error
   yield. 4 driver sites + media/OAuth secondary sites.
3. **Spawn timeouts**: add explicit timeouts to the 14 unsafe + 18 partial
   sites. Introduce a `spawnWithTimeout` helper.
4. **File modes**: `0o600` on plugin trust store, channels config, memory
   file.
5. **Input validation**: `parseEnvInt(name, default, { min, max })` helper
   for the 5+ `parseInt(process.env.*)` sites.
6. **Windows installers**: fix `khaleel737/jeriko` → `etheonai/jeriko`.
7. **Diagnostics**: consume `BUILD_REF` in telemetry, `/health`,
   `--version`, and uncaught-exception handler. Fix telemetry hardcoded
   VERSION to import from `version.ts`.

## Consequences

Positive:
- Category-level fixes instead of whack-a-mole: one retry utility covers
  every HTTP client; one spawn helper covers every child process.
- Toby's good patterns land, plus the 90% he didn't touch.
- No regression of our prompt-caching work.

Negative:
- Medium-sized diff (~25 files) lands in one pass.
- Some tests need updating to cover the new retry/redaction/spawn wrappers.

## References

- Toby's PR: https://github.com/EtheonAI/jeriko/pull/67
- Retry audit: 2% coverage across 49 HTTP sites
- Spawn audit: 14 UNSAFE / 18 PARTIAL / 28 SAFE of 60 sites
- Input audit: 100% JSON parsing protected; 4/4 drivers leak error bodies
- Secrets audit: 6/9 writes chmod-protected; 3 drift
- Connector audit: top 15 gaps by user impact documented
