# Shared Modules Audit Analysis

Audit date: 2026-03-06
Scope: `src/shared/*.ts` (20 files)

---

## 1. Config Schema (`config.ts`)

### JerikoConfig Interface vs Defaults

The `DEFAULTS` object correctly satisfies all required fields of `JerikoConfig`:

| Section     | Interface fields                            | Default values            | Status |
|-------------|---------------------------------------------|---------------------------|--------|
| agent       | model, maxTokens, temperature, extendedThinking | "claude", 4096, 0.3, false | OK |
| channels    | telegram.token, telegram.adminIds, whatsapp.enabled | "", [], false | OK |
| connectors  | stripe, paypal, github, twilio              | All empty strings         | OK |
| security    | allowedPaths, blockedCommands, sensitiveKeys | homedir, 3 commands, 16 keys | OK |
| storage     | dbPath, memoryPath                          | "" (filled at load time)  | OK |
| logging     | level, maxFileSize, maxFiles                | "info", 10MB, 5          | OK |
| providers   | ProviderConfig[] (optional)                 | Not in defaults           | OK |
| billing     | BillingPlanConfig (optional)                | Not in defaults           | OK |

### loadConfig Behavior
- `structuredClone(DEFAULTS)` prevents mutation of the module-level object.
- Storage paths are filled dynamically from `getDataDir()`.
- Merge order: defaults < user config < project config < env vars. Correct.
- `deepMerge` is recursive for objects but replaces arrays wholesale. This is intentional (e.g., adminIds replaces rather than appends).

### getUserId
- Returns `process.env.JERIKO_USER_ID || undefined`.
- Empty string coerces to `undefined` via `||`. Correct.

### Observations
- **No `saveConfig` function** exists. Config is read-only at runtime; the `init` command writes config.json directly. This is intentional (CLAUDE.md confirms).
- **No `flagNum` function** exists in `args.ts`. The task prompt mentioned it but it's absent from the codebase. Tests should only cover `flagStr` and `flagBool`.
- `getDataDir()` ignores XDG_DATA_HOME when it's set to empty string (falsy check `if (xdg)`). This is correct XDG behavior.

---

## 2. Args Parsing (`args.ts`)

### parseArgs

Supported forms:
- `--flag value` / `--flag=value` / `--bool-flag` / `--no-bool-flag`
- `-f value` / `-f` (boolean)
- `--` terminates flags

**Edge case findings:**
- Short flags only work for single-character (`-f`). Multi-char like `-abc` falls through to positional. This is intentional (no bundled short flags).
- `--flag -other` treats `-other` as a new flag, not a value. Correct for CLI convention.
- `--no-` prefix requires at least one char after it (length > 5). Good.

### flagStr / flagBool / requireFlag
- `flagStr` returns defaultValue for booleans (`true`/`false`), treating `--flag` (no value) as not-a-string. Correct.
- `flagBool` returns `true` for any defined, non-false value (including strings). So `--flag value` makes `flagBool("flag")` return `true`. This is technically correct but could surprise callers who expect `flagBool` to only be `true` for boolean-typed flags.
- `requireFlag` rejects `true` and `false` values -- only accepts strings. Correct.

---

## 3. Output Formatting (`output.ts`)

### ok / fail
- Both write to `stdout` (not stderr), followed by `process.exit()`. Correct per contract.
- `ok` always exits 0; `fail` defaults to `ExitCode.GENERAL` (1).

### Serialization
- **JSON**: `JSON.stringify(result)` -- no pretty printing. Correct for machine consumption.
- **Text**: Flattens nested data to `key: value` lines. Arrays use numeric indices (`files.0: a.txt`). Empty data returns "OK". Errors show `Error: message`.
- **Logfmt**: `ok=true/false` prefix, then flattened key=value pairs. Strings with spaces/quotes/equals are quoted and escaped.

### flatten()
- Empty arrays produce `[prefix, "[]"]`. Correct.
- Null/undefined are skipped entirely. Could cause silent data loss if a field is intentionally `null`, but this matches the "only primitives matter" design.

### EXIT constants
- Mirror `ExitCode` enum values exactly. Both exist for different use patterns (enum for types, object for runtime). Consistent.

---

## 4. Logger (`logger.ts`)

- JSONL format, one JSON object per line.
- Lazy file opening, rotation with numbered suffixes.
- `audit()` bypasses level filtering -- always writes. Good security practice.
- Default singleton via `getLogger()` -- first call wins for options. Subsequent calls with different opts are ignored. Documented behavior.
- Imports `getDataDir` from config.ts -- only cross-module dependency.

### Observation
- `getLogger()` ignores `opts` on subsequent calls. If two consumers call `getLogger()` with different options, only the first wins. Not a bug per se, but worth noting.

---

## 5. Escape Functions (`escape.ts`)

### escapeAppleScript
- Escapes `\` then `"`. Order matters and is correct (backslash first prevents double-escaping).

### escapeShellArg
- Single-quote wrapping with `'\''` idiom for embedded single quotes. Industry-standard POSIX approach.

### escapeDoubleQuoted
- Escapes `\`, `"`, `$`, `` ` ``, `!`. Correct for bash double-quoted strings.

### stripAnsi
- Regex covers standard ANSI escape sequences. Comprehensive.

---

## 6. Skill System (`skill.ts`, `skill-loader.ts`)

### Types
- `SkillMeta`, `SkillManifest`, `SkillSummary` -- clean hierarchy.
- `SKILL_NAME_PATTERN`: `/^[a-z0-9][a-z0-9-]{1,49}$/` -- requires 2-50 chars, starts with alphanumeric. Correct.

### Frontmatter Parser
- Regex-based YAML parser, handles strings, booleans (true/false/yes/no), inline arrays, block scalars (`|`), nested metadata.
- Kebab-to-camel conversion: `user-invocable` -> `userInvocable`. Correct.
- Unknown top-level keys go to `metadata` map. Good extensibility.

### Observation
- `parseFrontmatter` regex requires `\n---\n` after the YAML block. A file ending with `---` followed by EOF (no trailing newline) would fail to match. The `?` after the second `\r?\n` makes the final newline optional, so `---\nname: x\n---` works but `---\nname: x\n---EOF` (no newline before content) also works. This is fine.

---

## 7. Env Ref Resolution (`env-ref.ts`)

### resolveEnvRef
- Pattern: `/^\{env:([A-Za-z_][A-Za-z0-9_]*)\}$/` -- must be the entire string. No partial env refs.
- Throws on missing or empty env vars. Correct for API key resolution.

### isEnvRef
- Simple regex test. Consistent with resolveEnvRef.

---

## 8. URL Builders (`urls.ts`)

### getPublicUrl
- Falls back to `https://bot.jeriko.ai`. Strips trailing slashes.

### buildWebhookUrl
- Self-hosted: `/hooks/:triggerId`
- Relay: `/hooks/:userId/:triggerId`
- Local dev: `http://127.0.0.1:PORT/hooks/:triggerId`

### buildOAuthCallbackUrl
- Always: `publicUrl/oauth/:provider/callback`. No userId in path (carried in state).

### getRelayApiUrl
- Converts WebSocket URL to HTTP. Strips `/relay` path suffix.

### Observation
- `wsUrlToHttp` strips `/relay` suffix. If someone sets `JERIKO_RELAY_URL=wss://custom.host/my-relay`, only `/relay` is stripped, not `/my-relay`. The regex `/\/relay\/?$/` is specific. This is correct since the protocol defines `/relay` as the WebSocket path.

---

## 9. Relay Protocol (`relay-protocol.ts`)

- 9 outbound message types (daemon -> relay), 9 inbound types (relay -> daemon).
- Constants: heartbeat 30s, timeout 10s, backoff 1-60s, auth timeout 15s, max triggers 10,000, max pending OAuth 10.
- `buildCompositeState` / `parseCompositeState` -- uses `.` delimiter (unambiguous since UUIDs use `-`).

### Observation
- `parseCompositeState` returns null for states without `.`. Self-hosted mode sends plain tokens. Consistent.

---

## 10. Connector System (`connector.ts`)

- 27 connector definitions covering payments, code, cloud, productivity, CRM, e-commerce.
- `isConnectorConfigured` checks env vars, supporting alternatives (e.g., GITHUB_TOKEN or GH_TOKEN).
- `resolveMethod` intelligently joins positionals based on action verbs.
- `collectFlags` converts kebab-case to snake_case for API conventions.

### Observation
- `getConfiguredConnectorCount()` iterates all 27 connectors. Could be optimized with caching for billing gates, but at 27 items it's negligible.

---

## 11. OAuth Exchange (`oauth-exchange.ts`)

- 23 provider configurations for token exchange.
- Two auth methods: "body" (most) and "basic" (Stripe, Notion).
- `exchangeCodeForTokens` and `refreshAccessToken` follow the same pattern.
- Uses `btoa()` for Basic auth encoding -- cross-runtime compatible.

### Observation
- Shopify's `tokenUrl` contains `{shop}` placeholder: `https://{shop}.myshopify.com/admin/oauth/access_token`. This is NOT resolved in `exchangeCodeForTokens`. The relay or daemon would need to replace `{shop}` before calling. This could be a latent bug if Shopify OAuth is attempted via relay exchange. However, Shopify OAuth typically has the shop in the params, and the daemon likely handles this. Worth verifying.

---

## 12. Baked OAuth IDs (`baked-oauth-ids.ts`)

- 21 provider client IDs, injected at build time via Bun's `define`.
- At dev time, all resolve to `undefined`. Correct fallback behavior.
- Uses `typeof` guard for each -- necessary since `declare const` vars may not exist at runtime.

---

## Summary of Issues Found

### Potential Bugs
1. **Shopify tokenUrl placeholder**: `{shop}` in the URL is not resolved in `exchangeCodeForTokens`. If relay-side Shopify OAuth exchange is attempted, this would produce an invalid URL.

### Missing Functionality
2. **No `flagNum`**: Referenced in the task but absent from `args.ts`. Not a bug -- numeric parsing is handled inline by callers (e.g., `parseInt(env.JERIKO_MAX_TOKENS, 10)` in config.ts).
3. **No `saveConfig`**: Config is write-once at init, read-only at runtime. By design.

### Minor Observations
4. **Logger singleton opts ignored on subsequent calls**: `getLogger()` silently ignores options after first initialization.
5. **`flagBool` returns true for string values**: `--format json` makes `flagBool("format")` return `true`. This is by design (flag is "present") but could confuse callers.
6. **`deepMerge` replaces arrays**: Intentional for adminIds but could surprise if someone expects array append behavior.

### Consistency
- All modules follow Layer 0 pattern (minimal imports, no global state mutation).
- Export naming is consistent (camelCase functions, PascalCase interfaces, UPPER_SNAKE constants).
- Exit codes in `ExitCode` enum match `EXIT` object values exactly.
- `ConnectorDef` required field supports both `string` and `string[]` for alternatives -- all callers handle this correctly.
