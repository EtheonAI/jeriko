# Jeriko Plugin Specification

Version 1.0.0 | February 2026

This is the formal specification for the Jeriko plugin system. It defines the manifest schema, command contract, security model, discovery integration, webhook protocol, and lifecycle commands. Plugin authors and tooling implementors should treat this document as the canonical reference.

---

## Table of Contents

1. [Overview](#overview)
2. [Package Requirements](#package-requirements)
3. [Manifest Schema](#manifest-schema-jeriko-pluginjson)
4. [Command Contract](#command-contract)
5. [Discovery Integration](#discovery-integration)
6. [Namespace Rules](#namespace-rules)
7. [Environment Isolation](#environment-isolation)
8. [Webhook Integration](#webhook-integration)
9. [Security and Trust](#security-and-trust)
10. [Prompt Safety](#prompt-safety)
11. [Versioning](#versioning)
12. [Plugin Lifecycle Commands](#plugin-lifecycle-commands)
13. [Validation and Testing](#validation-and-testing)
14. [Example Manifest](#example-manifest)

---

## Overview

A Jeriko plugin is a self-contained npm package that adds one or more CLI commands to the `jeriko` dispatcher. Plugins extend Jeriko's capabilities without modifying core code. They follow the same output contract as core commands (JSON to stdout, semantic exit codes) and integrate with Jeriko's AI discovery system, environment isolation, and webhook infrastructure.

Plugins install to `~/.jeriko/plugins/`. Each plugin provides:

- **Commands** (`bin/`) -- Executable scripts invoked via `jeriko <name>`.
- **Manifest** (`jeriko-plugin.json`) -- Machine-readable contract declaring commands, env vars, platform support, and webhooks.
- **Command docs** (`COMMANDS.md`) -- Human/AI-readable documentation injected into `jeriko discover` output.
- **AI prompt** (`PROMPT.md`, optional) -- Decision logic that teaches AI models when and how to use the plugin. Only loaded for trusted plugins.

The plugin registry lives at `~/.jeriko/plugins/registry.json`. The security audit log lives at `~/.jeriko/audit.log`.

---

## Package Requirements

### Naming Convention

npm package names SHOULD follow the `jeriko-plugin-*` or `jeriko-*` convention. This is recommended but not enforced. The `name` field in `jeriko-plugin.json` MUST match the `name` field in `package.json`.

### Package Structure

```
jeriko-plugin-weather/
  jeriko-plugin.json       # manifest (REQUIRED)
  COMMANDS.md              # command documentation (REQUIRED for discovery)
  PROMPT.md                # AI decision logic (optional, trusted only)
  bin/
    weather                # executable command (REQUIRED, one per command entry)
    forecast               # additional commands
  package.json             # npm package metadata
```

### package.json Requirements

The `package.json` MUST include:

```json
{
  "name": "jeriko-plugin-weather",
  "version": "1.0.0",
  "peerDependencies": {
    "Jeriko": ">=1.0.0"
  }
}
```

The `peerDependencies` field is RECOMMENDED so that npm warns users if their Jeriko version is incompatible.

### Executable Files

All files referenced in `commands[].bin` MUST:

1. Exist at the declared path relative to the plugin root.
2. Be executable (`chmod +x` or equivalent). The installer runs `chmod 0o755` on all declared bin files automatically.
3. Have a valid shebang line. The dispatcher detects `#!/usr/bin/env node` and `#!/usr/bin/node` shebangs and spawns them with the host Node.js runtime. All other shebangs (Python, Bash, compiled binaries) are executed directly.

### Exports

Plugins that use `Jeriko/lib/cli` for shared infrastructure MUST declare `Jeriko` as a peer dependency. The host Jeriko exposes:

```json
{
  "./lib/cli": "./lib/cli.js",
  "./lib/plugins": "./lib/plugins.js"
}
```

---

## Manifest Schema (`jeriko-plugin.json`)

The manifest is the machine-readable contract between a plugin and Jeriko. It MUST be valid JSON and MUST be located at the plugin root as `jeriko-plugin.json`.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | npm package name. MUST match `package.json` name. |
| `namespace` | `string` | Yes | Unique identifier for this plugin. MUST NOT be a [reserved namespace](#reserved-namespaces). Used in webhook URL paths and env var injection. |
| `version` | `string` | Yes | Semantic version (semver). MUST match `package.json` version. |
| `description` | `string` | No | Human-readable description of what the plugin does. |
| `author` | `string` | No | Author name, email, or both. |
| `license` | `string` | No | SPDX license identifier (e.g., `"MIT"`, `"Apache-2.0"`). |
| `jerikoVersion` | `string` | Yes | Semver range specifying compatible Jeriko versions (e.g., `">=1.0.0"`, `"^1.2.0"`). |
| `platform` | `string[]` | Yes | Array of supported Node.js platform identifiers. Valid values: `"darwin"`, `"linux"`, `"win32"`. Install fails if the host platform is not in this array. |
| `commands` | `object[]` | Yes | Array of command definitions. MUST contain at least one entry. See [Command Entry Schema](#command-entry-schema). |
| `permissions` | `string[]` | No | Declared permissions (advisory, not enforced). Shown during `jeriko trust` review. See [Permissions](#permissions-declarativeadvisory). |
| `env` | `object[]` | No | Environment variables the plugin requires from the host `.env`. See [Env Entry Schema](#env-entry-schema). |
| `webhooks` | `object[]` | No | Webhook endpoints to register on the Jeriko server. Only active for trusted plugins. See [Webhook Entry Schema](#webhook-entry-schema). |

### Command Entry Schema

Each entry in the `commands` array:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Command name. This is what users type after `jeriko` (e.g., `"weather"` becomes `jeriko weather`). MUST be unique across all installed plugins and core commands. |
| `bin` | `string` | Yes | Path to the executable file, relative to the plugin root (e.g., `"bin/weather"`). |
| `description` | `string` | Yes | Short description for `jeriko discover` and `jeriko --help` output. |
| `usage` | `string` | No | Usage example string. Used in auto-generated docs when `COMMANDS.md` is absent. |

### Env Entry Schema

Each entry in the `env` array:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | `string` | Yes | Environment variable name (e.g., `"WEATHER_API_KEY"`). |
| `required` | `boolean` | Yes | Whether the variable MUST be present in the host `.env` for the plugin to function. |
| `description` | `string` | No | Human-readable explanation of what this variable is for. Shown during `jeriko trust` review. |

### Webhook Entry Schema

Each entry in the `webhooks` array:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Webhook endpoint name. Becomes part of the URL path: `POST /hooks/plugin/<namespace>/<name>`. |
| `handler` | `string` | Yes | Path to the handler script, relative to the plugin root (e.g., `"bin/handle-push"`). Any language with a valid shebang. |
| `verify` | `string` | No | Signature verification method. One of: `"hmac-sha256"`, `"github"`, `"stripe"`, `"none"`. Default behavior if omitted: no verification. |
| `secretEnv` | `string` | No | Name of the env var holding the webhook secret for signature verification. MUST be declared in the `env` array. |

#### Verification Methods

| Method | Header Checked | Signature Format |
|--------|---------------|-----------------|
| `hmac-sha256` | `x-webhook-signature` | Raw HMAC-SHA256 hex digest |
| `github` | `x-hub-signature-256` | `sha256=<hex>` |
| `stripe` | `stripe-signature` | `t=<timestamp>,v1=<hex>` |
| `none` | None | No verification performed |

### Reserved Namespaces

The following namespaces are reserved by Jeriko core commands. Plugins MUST NOT use any of these as their `namespace` value. Validation fails at manifest check time and installation is rejected.

```
sys       fs        exec      browse    search    screenshot
notify    discover  memory    server    install   uninstall
trust     audio     camera    clipboard contacts  calendar
email     location  msg       music     net       notes
open      proc      remind    window    stripe    x
plugin    init
```

---

## Command Contract

Every plugin command MUST follow the same contract as core Jeriko commands. This ensures uniform behavior for piping, AI parsing, and error handling.

### Output Format

**Success (stdout):**

```json
{"ok": true, "data": {"key": "value"}}
```

**Error (stderr):**

```json
{"ok": false, "error": "descriptive message"}
```

Commands that use `Jeriko/lib/cli` get format support automatically. The `ok()` function writes to stdout and exits 0. The `fail()` function writes to stderr and exits with a semantic code.

### Multi-Format Support

Commands receive the `JERIKO_FORMAT` environment variable set by the dispatcher. Supported values:

| Value | Output Style | Purpose |
|-------|-------------|---------|
| `json` | `{"ok":true,"data":{...}}` | Default. Machine-parseable. Used for piping. |
| `text` | `key=value key2=value2` | AI-optimized. Minimal tokens. |
| `logfmt` | `ok=true key=value key2=value2` | Structured log format. Greppable. |

Commands using `Jeriko/lib/cli` support all three formats with no additional code. Custom implementations SHOULD read `JERIKO_FORMAT` and format output accordingly.

### Exit Codes

Commands MUST use semantic exit codes:

| Code | Constant | Meaning |
|------|----------|---------|
| 0 | `EXIT.OK` | Success |
| 1 | `EXIT.GENERAL` | General error |
| 2 | `EXIT.NETWORK` | Network error (DNS, connection, HTTP failure) |
| 3 | `EXIT.AUTH` | Authentication/authorization error |
| 5 | `EXIT.NOT_FOUND` | Resource not found |
| 7 | `EXIT.TIMEOUT` | Operation timed out |

The `run()` wrapper from `Jeriko/lib/cli` auto-categorizes uncaught exceptions:

- `ENOENT`, `no such file` -- exit 5
- `ETIMEDOUT`, `timeout` -- exit 7
- `ECONNREFUSED`, `fetch failed` -- exit 2
- `401`, `403`, `unauthorized` -- exit 3

### stdin

Commands SHOULD support piped input. When stdin is not a TTY, the dispatcher passes stdin through to the command. Use `readStdin()` from `Jeriko/lib/cli` to read it.

### stderr Conventions

stderr is reserved for diagnostics. Two structured prefixes are recognized by the ecosystem:

- `SCREENSHOT:<path>` -- indicates a screenshot file was created.
- `FILE:<path>` -- indicates a file was created or modified.

All other stderr output is treated as human-readable diagnostics.

---

## Discovery Integration

`jeriko discover` generates system prompts for AI models. Plugin integration works as follows:

### COMMANDS.md (Always Included)

A plugin's `COMMANDS.md` is included in `jeriko discover` output for **trusted plugins**. The file SHOULD follow the same format as core command documentation in `CLAUDE.md`:

```markdown
### jeriko weather
Get current weather for a location.

```bash
jeriko weather "New York"              # current weather
jeriko weather --forecast "London"     # 5-day forecast
jeriko weather "Tokyo" --format text   # text output
```
```

If `COMMANDS.md` does not exist, Jeriko auto-generates documentation from the manifest's `commands` array using each command's `name`, `description`, and `usage` fields. This fallback produces minimal documentation without usage examples.

### PROMPT.md (Trusted Only, On-Demand)

A plugin's `PROMPT.md` is loaded on-demand only when:

1. The plugin is trusted.
2. `jeriko discover` is invoked with `--plugins <namespace>` or `--all-prompts`.

The prompt content is wrapped with non-authoritative context before injection into the AI system prompt. See [Prompt Safety](#prompt-safety).

### Auto-Generated Docs Fallback

When `COMMANDS.md` is absent, the discovery system generates docs in this format for each command:

```markdown
### jeriko <name>
<description>

```bash
<usage>
```
```

---

## Namespace Rules

1. Every plugin MUST have a unique `namespace` that does not match any [reserved namespace](#reserved-namespaces).
2. Every command `name` MUST be unique across all installed plugins AND all core commands.
3. Namespace uniqueness and command name conflicts are checked at install time via `checkConflicts()`.
4. If a conflict is detected, the install fails with a descriptive error.
5. Core commands always take priority. The dispatcher checks `bin/jeriko-<cmd>` first (Phase 1), then plugin registry (Phase 2). A plugin cannot shadow a core command.
6. Self-upgrades are exempt from conflict checks against the plugin's own prior registration.

---

## Environment Isolation

Plugins run in a restricted environment. The dispatcher constructs a clean `env` object for every plugin command invocation using `buildPluginEnv()`.

### Safe System Variables (Always Passed)

These are passed to every plugin regardless of manifest declarations:

```
PATH    HOME    USER    SHELL    TERM    NODE_ENV    LANG    LC_ALL    TZ
```

### Jeriko Infrastructure Variables (Always Passed)

These are set by the dispatcher for every plugin invocation:

| Variable | Description |
|----------|-------------|
| `JERIKO_ROOT` | Absolute path to the Jeriko installation root. |
| `JERIKO_DATA_DIR` | Absolute path to the Jeriko `data/` directory. |
| `JERIKO_FORMAT` | Active output format: `json`, `text`, or `logfmt`. |
| `JERIKO_QUIET` | `"1"` if `--quiet` was passed to the dispatcher. |
| `JERIKO_PLUGIN` | The plugin's `name` from its manifest. |
| `JERIKO_NAMESPACE` | The plugin's `namespace` from its manifest. |

### Declared Variables (Manifest-Gated)

Only environment variables explicitly listed in the manifest's `env` array are passed from the host environment (`.env` and process environment). A plugin declaring:

```json
"env": [
  { "key": "WEATHER_API_KEY", "required": true }
]
```

will receive `WEATHER_API_KEY` from the host `.env` if it exists. It will **never** receive:

- `TELEGRAM_BOT_TOKEN`
- `ANTHROPIC_API_KEY`
- `STRIPE_SECRET_KEY`
- `NODE_AUTH_SECRET`
- `OPENAI_API_KEY`

or any other variable not in its `env` declaration.

### How It Works

The dispatcher (`bin/jeriko`) calls `buildPluginEnv(meta, manifest, baseEnv)` which:

1. Creates an empty object.
2. Copies safe system vars from `process.env`.
3. Sets Jeriko infrastructure vars.
4. Iterates `manifest.env[]` and copies each declared `key` from the base env if present.
5. Returns the restricted object as the child process's `env`.

Core commands receive the full `process.env`. Only plugin commands are isolated.

---

## Webhook Integration

Trusted plugins can register webhook endpoints on the Jeriko server to receive HTTP callbacks from external services (GitHub, Stripe, custom).

### URL Pattern

```
POST /hooks/plugin/<namespace>/<webhook-name>
```

Example: A plugin with namespace `"deploy"` and a webhook named `"github-push"` receives callbacks at:

```
POST /hooks/plugin/deploy/github-push
```

### Handler Execution

When a webhook is received:

1. The server responds `202 Accepted` immediately.
2. The handler script is spawned asynchronously.
3. The handler receives the raw POST body via **stdin**.
4. The handler receives `TRIGGER_EVENT` as an env var containing JSON:
   ```json
   {
     "type": "webhook",
     "source": "<configured source>",
     "body": <request body>,
     "receivedAt": "2026-02-23T12:00:00.000Z"
   }
   ```
5. The handler's environment is restricted to the plugin's declared env vars plus safe system vars.
6. The handler MUST exit within 60 seconds.
7. Exit 0 indicates success; non-zero indicates failure.

### Signature Verification

If a webhook entry specifies `verify` (and it is not `"none"`), the server enforces signature verification before dispatching to the handler.

**Fail-closed behavior:**

- If `verify` is set and the signature header is missing: respond `401 Unauthorized`.
- If `verify` is set and the signature is invalid: respond `401 Unauthorized`.
- If `secretEnv` is set but the env var is not configured: the webhook cannot function.

**Verification flow by type:**

| Type | Header | Algorithm |
|------|--------|-----------|
| `hmac-sha256` | `x-webhook-signature` | `HMAC-SHA256(secret, raw_body)` compared as hex |
| `github` | `x-hub-signature-256` | `sha256=HMAC-SHA256(secret, raw_body)` compared as hex, timing-safe |
| `stripe` | `stripe-signature` | Parse `t=<timestamp>,v1=<signature>`, compute `HMAC-SHA256(secret, timestamp + "." + raw_body)`, compare hex, timing-safe |

All comparisons use `crypto.timingSafeEqual` to prevent timing attacks.

### Trust Requirement

Webhooks are ONLY registered for **trusted** plugins. Untrusted plugins' webhook declarations are ignored by the server. Revoking trust immediately deregisters webhooks.

---

## Security and Trust

### Trust Lifecycle

```
Install                  Trust                    Revoke
  |                        |                        |
  v                        v                        v
UNTRUSTED  ------>  jeriko trust <name> --yes  ------>  UNTRUSTED
  |                        |                        |
  | Can run commands       | + Webhooks registered  | Webhooks removed
  | COMMANDS.md in         | + PROMPT.md available  | PROMPT.md blocked
  |   discover (trusted)   |                        |
  | Env isolated           |                        |
```

1. **Install**: Plugin is untrusted by default. Recorded in registry with `trusted: false`.
2. **Trust**: Admin runs `jeriko trust <name> --yes`. The command displays requested permissions and env vars for review, then sets `trusted: true` and records `trustedAt` timestamp.
3. **Revoke**: Admin runs `jeriko trust --revoke <name>`. Sets `trusted: false`, clears `trustedAt`.

### What Trust Enables

| Capability | Untrusted | Trusted |
|-----------|-----------|---------|
| Run commands via dispatcher | Yes | Yes |
| Environment isolation | Yes | Yes |
| COMMANDS.md in `jeriko discover` | Trusted only | Yes |
| PROMPT.md in AI system prompt | No | Yes (on-demand) |
| Webhook endpoint registration | No | Yes |
| Listed in `jeriko --help` | Yes (marked "untrusted") | Yes |

### Integrity Verification

On install and upgrade, Jeriko computes a SHA-512 hash of `jeriko-plugin.json`:

```
sha512-<base64-encoded-hash>
```

This hash is stored in `registry.json` under the plugin's `integrity` field. It allows detection of post-install manifest tampering.

The integrity hash is:

- Computed in `src/daemon/plugin/registry.ts` and persisted via `writeSecretFile()` (0o600) to `~/.local/share/jeriko/plugin-trust.json`.
- Stored in the registry at install and upgrade time.
- Visible via `jeriko install --info <name>`.
- Recomputed on upgrade. The new hash replaces the old one.

### Audit Log

All security-relevant operations are logged to `~/.jeriko/audit.log` in JSON-lines format:

```jsonl
{"ts":"2026-02-23T10:00:00.000Z","action":"install","plugin":"jeriko-plugin-weather","version":"1.0.0","namespace":"weather","local":false,"commands":["weather","forecast"]}
{"ts":"2026-02-23T10:05:00.000Z","action":"trust.grant","plugin":"jeriko-plugin-weather","permissions":["network"],"env":["WEATHER_API_KEY"]}
{"ts":"2026-02-23T10:10:00.000Z","action":"trust.revoke","plugin":"jeriko-plugin-weather"}
{"ts":"2026-02-23T10:15:00.000Z","action":"upgrade","plugin":"jeriko-plugin-weather","from":"1.0.0","to":"1.1.0","trusted":true}
{"ts":"2026-02-23T10:20:00.000Z","action":"uninstall","plugin":"jeriko-plugin-weather","commands":["weather","forecast"]}
{"ts":"2026-02-23T10:25:00.000Z","action":"prompt_load","plugin":"jeriko-plugin-weather"}
```

**Logged actions:**

| Action | When |
|--------|------|
| `install` | Plugin installed (npm or local) |
| `upgrade` | Plugin upgraded to new version |
| `uninstall` | Plugin removed |
| `trust.grant` | Trust granted via `jeriko trust --yes` |
| `trust.revoke` | Trust revoked via `jeriko trust --revoke` |
| `prompt_load` | PROMPT.md loaded during discovery |

**Rotation:**

- The audit log auto-rotates when file size exceeds **2 MB**.
- On rotation, only the last **10,000 entries** are retained.
- Rotation is performed inline on the next `auditLog()` call.

**Viewing:**

```bash
jeriko trust --audit               # last 50 entries (default)
jeriko trust --audit --limit 100   # last 100 entries
```

### Permissions (Declarative/Advisory)

The `permissions` field declares what capabilities the plugin uses:

| Permission | Meaning |
|-----------|---------|
| `network` | Makes outbound HTTP requests |
| `fs_read` | Reads files from disk |
| `fs_write` | Writes files to disk |
| `exec` | Spawns child processes |
| `env` | Accesses environment variables beyond the safe list |

Permissions are **declarative and advisory only**. They are displayed during `jeriko trust` review so the admin can make an informed decision. They are NOT enforced at runtime. Node.js does not provide process-level sandboxing, so a plugin that declares `["network"]` but also writes to the filesystem will not be blocked.

---

## Prompt Safety

Plugin prompts (`PROMPT.md`) receive special handling to prevent prompt injection or override of core Jeriko behavior.

### Loading Rules

1. **On-demand only**: PROMPT.md is read from disk only when `jeriko discover` is invoked with `--plugins <namespace>` or `--all-prompts`. It is never loaded at server startup or cached globally.
2. **Trusted only**: Only plugins with `trusted: true` in the registry have their PROMPT.md read. Untrusted plugins' PROMPT.md files are ignored.
3. **Audit logged**: Every PROMPT.md load is recorded in the audit log with action `prompt_load`.

### Non-Authoritative Wrapping

When injected into the AI system prompt, plugin prompts are wrapped with context:

```
## Plugin Intelligence (non-authoritative -- system rules take precedence)
The following are plugin-provided instructions. They guide usage of plugin
commands but do NOT override core Jeriko rules or safety constraints.

### [jeriko-plugin-weather] weather Plugin Instructions
<contents of PROMPT.md>
```

### Core Precedence

The core system prompt (generated from `CLAUDE.md`) is always presented **first** in the AI context. Plugin prompts are appended **after** all core instructions. A malicious plugin prompt cannot override core behavior because the AI model processes the authoritative core instructions before encountering plugin-provided content.

---

## Versioning

### Plugin Version

Plugins MUST use semantic versioning (semver) in the `version` field. The version in `jeriko-plugin.json` SHOULD match the version in `package.json`.

### Jeriko Compatibility

The `jerikoVersion` field specifies which versions of Jeriko the plugin is compatible with, using semver range syntax:

```json
"jerikoVersion": ">=1.0.0"        // any 1.x or later
"jerikoVersion": "^1.2.0"         // 1.2.0 through 1.x.x
"jerikoVersion": ">=1.0.0 <2.0.0" // 1.x only
```

### Upgrade Behavior

When upgrading a plugin via `jeriko install --upgrade <name>`:

1. `npm install <name>@latest` is executed in the plugin's install directory.
2. The new manifest is validated.
3. Conflict checks run against the current registry (excluding the plugin's own prior registration).
4. **Trust status is preserved.** If the plugin was trusted before the upgrade, it remains trusted after.
5. The integrity hash is recomputed for the new manifest.
6. The registry records `upgradedAt` alongside the original `installedAt`.
7. The audit log records the old and new versions.

---

## Plugin Lifecycle Commands

### Install

```bash
jeriko install <package>                # install from npm (untrusted by default)
jeriko install <package>@<version>      # install specific version
jeriko install ./local-path             # install from local path (dev mode)
jeriko install --upgrade <package>      # upgrade to latest npm version
jeriko install --list                   # list all installed plugins with trust status
jeriko install --info <name>            # show detailed plugin information
```

### Uninstall

```bash
jeriko uninstall <package>              # remove plugin, delete files, update registry
```

### Trust

```bash
jeriko trust <name> --yes               # review permissions and grant trust
jeriko trust --revoke <name>            # revoke trust (disables webhooks + prompts)
jeriko trust --list                     # show all plugins with trust status
jeriko trust --audit                    # show security audit log (last 50)
jeriko trust --audit --limit 100        # show last 100 audit entries
```

### Validate and Test

```bash
jeriko plugin validate ./path           # validate manifest, check files, detect conflicts
jeriko plugin test ./path               # run commands and verify output format + exit codes
```

---

## Validation and Testing

### Validation (`jeriko plugin validate`)

Validation performs the following checks in order:

1. `jeriko-plugin.json` exists at the given path.
2. Manifest parses as valid JSON.
3. All required fields are present (`name`, `namespace`, `version`, `commands`, `jerikoVersion`, `platform`).
4. Each command entry has `name`, `bin`, and `description`.
5. Each env entry has `key` and `required`.
6. Each webhook entry has `name` and `handler`.
7. `namespace` is not in the reserved list.
8. All `bin` files exist at their declared paths.
9. All `bin` files are executable (have the execute permission bit set).
10. `COMMANDS.md` exists (warning if missing, not an error).
11. `PROMPT.md` exists (warning if missing, not an error).
12. Current platform is in `manifest.platform` (warning if not, not an error).
13. No namespace or command name conflicts with installed plugins in the registry.
14. Integrity hash (SHA-512) is computed and included in the output.

Validation exits with `{"ok": true, ...}` if no errors are found, or `{"ok": false, "error": {...}}` listing all errors and warnings.

### Testing (`jeriko plugin test`)

Testing runs each declared command and checks compliance:

For each command in `manifest.commands`:

1. **JSON output test**: Run the command with no args and `JERIKO_FORMAT=json`. Parse stdout. Verify the parsed object has an `ok` field set to `true` or `false`. If the command exits non-zero, parse stderr instead and verify `ok: false`.
2. **Text output test**: Run the command with `--format text` and `JERIKO_FORMAT=text`. Verify the output is NOT valid JSON (confirming text format is distinct from JSON).
3. **Exit code test**: Verify the exit code is one of the valid semantic codes: `[0, 1, 2, 3, 5, 7]`.

Each command is reported as `pass`, `fail`, or `skip` (if the bin file is missing). The summary includes counts of passed, failed, and skipped commands.

Commands are run with a **15-second timeout**. Commands that do not complete within this window are killed and marked as failed.

---

## Example Manifest

A complete `jeriko-plugin.json` for a weather plugin with API access and a webhook:

```json
{
  "name": "jeriko-plugin-weather",
  "namespace": "weather",
  "version": "2.1.0",
  "description": "Weather data and forecasts from OpenWeatherMap",
  "author": "Jane Developer <jane@example.com>",
  "license": "MIT",
  "jerikoVersion": ">=1.0.0",
  "platform": ["darwin", "linux", "win32"],
  "commands": [
    {
      "name": "weather",
      "bin": "bin/weather",
      "description": "Get current weather for a location",
      "usage": "jeriko weather \"New York\" [--units metric|imperial]"
    },
    {
      "name": "forecast",
      "bin": "bin/forecast",
      "description": "Get multi-day weather forecast",
      "usage": "jeriko forecast \"London\" [--days 5]"
    }
  ],
  "permissions": [
    "network"
  ],
  "env": [
    {
      "key": "OPENWEATHER_API_KEY",
      "required": true,
      "description": "OpenWeatherMap API key (https://openweathermap.org/api)"
    },
    {
      "key": "WEATHER_UNITS",
      "required": false,
      "description": "Default units: metric (default) or imperial"
    }
  ],
  "webhooks": [
    {
      "name": "alerts",
      "handler": "bin/handle-alert",
      "verify": "hmac-sha256",
      "secretEnv": "WEATHER_WEBHOOK_SECRET"
    }
  ]
}
```

This plugin:

- Registers two commands: `jeriko weather` and `jeriko forecast`.
- Requires `OPENWEATHER_API_KEY` from the host `.env`.
- Optionally reads `WEATHER_UNITS`.
- Registers a webhook at `POST /hooks/plugin/weather/alerts` (trusted only).
- Verifies webhook signatures using HMAC-SHA256 with the secret from `WEATHER_WEBHOOK_SECRET`.
- Declares `network` permission (advisory) to indicate it makes outbound HTTP calls.
- Supports all three platforms.

---

## Directory Structure Reference

After installation, the on-disk layout is:

```
~/.jeriko/
  plugins/
    registry.json                          # plugin registry (trust, versions, integrity)
    jeriko-plugin-weather/
      node_modules/
        jeriko-plugin-weather/
          jeriko-plugin.json               # manifest
          COMMANDS.md                      # command docs (for discovery)
          PROMPT.md                        # AI prompt (trusted only)
          bin/
            weather                        # executable command
            forecast                       # executable command
            handle-alert                   # webhook handler
          package.json                     # npm metadata
  audit.log                                # security audit trail (JSON-lines)
```

### Registry Format (`registry.json`)

```json
{
  "plugins": {
    "jeriko-plugin-weather": {
      "version": "2.1.0",
      "namespace": "weather",
      "path": "/Users/you/.jeriko/plugins/jeriko-plugin-weather/node_modules/jeriko-plugin-weather",
      "commands": ["weather", "forecast"],
      "permissions": ["network"],
      "integrity": "sha512-abc123...",
      "trusted": true,
      "trustedAt": "2026-02-23T10:05:00.000Z",
      "trustedBy": "admin",
      "installedAt": "2026-02-23T10:00:00.000Z",
      "upgradedAt": "2026-02-23T10:15:00.000Z"
    }
  }
}
```

---

## Dispatcher Resolution

When a user runs `jeriko <command>`, the dispatcher resolves the command in two phases:

1. **Phase 1 (Core):** Check if `bin/jeriko-<command>` exists in the Jeriko `bin/` directory. If found, execute it with the full host environment.

2. **Phase 2 (Plugin):** Call `resolvePluginBin(command)` which iterates the registry, finds the plugin that registered the command, locates the bin file, and returns it. Execute with the restricted environment from `buildPluginEnv()`.

Core commands always win. A plugin cannot override a core command.

### Shebang Detection

The dispatcher reads the first 256 bytes of the resolved binary:

- If the shebang is `#!/usr/bin/env node` or `#!/usr/bin/node`: spawn with the host's `process.execPath` (Node.js).
- Otherwise: execute the binary directly (supports Python, Bash, compiled binaries, etc.).
