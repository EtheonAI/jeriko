# Plugin Author Guide

Plugins add AI intelligence to Jeriko, not just functions. A plugin is a set of CLI commands plus an AI prompt that teaches models *when and how* to use them. The prompt is the product; the commands are the API.

## The Big Picture

```
Plugin = Commands + Prompt + Docs + Manifest
         (what)    (why)    (how)   (contract)
```

When a plugin is installed and trusted:
1. Its commands become available as `jeriko <name>`
2. Its `PROMPT.md` is loaded on-demand to teach AI models decision logic
3. Its `COMMANDS.md` is injected into `jeriko discover` output
4. Its webhooks get registered as HTTP endpoints
5. Its env vars are isolated -- it only sees what it declares

## Quick Start: 5-Minute Plugin

```bash
mkdir jeriko-plugin-hello
cd jeriko-plugin-hello
npm init -y
```

### 1. Manifest (`jeriko-plugin.json`)

```json
{
  "name": "jeriko-plugin-hello",
  "namespace": "hello",
  "version": "1.0.0",
  "description": "Example Jeriko plugin",
  "jerikoVersion": ">=1.0.0",
  "platform": ["darwin", "linux", "win32"],
  "commands": [
    {
      "name": "greet",
      "bin": "bin/greet",
      "description": "Say hello to someone"
    }
  ],
  "permissions": [],
  "env": []
}
```

### 2. Command (`bin/greet`)

```javascript
#!/usr/bin/env node
const { parseArgs, ok, fail, run } = require('Jeriko/lib/cli');

run(async () => {
  const { positional } = parseArgs(process.argv);
  const name = positional[0] || 'world';
  ok({ greeting: `Hello, ${name}!` });
});
```

```bash
chmod +x bin/greet
```

### 3. Prompt (`PROMPT.md`)

```markdown
# hello Plugin

## When to Use
Use `jeriko greet` when the user wants to say hello or greet someone.

## Decision Logic
- User says "hello" or "greet" -> use `jeriko greet <name>`
- User asks for a greeting in another language -> DO NOT use this plugin

## Error Handling
- No name provided: defaults to "world"

## Composition
- Pipe output to `jeriko notify` to send greeting via Telegram
```

### 4. Docs (`COMMANDS.md`)

```markdown
### jeriko greet
Say hello to someone.

\`\`\`bash
jeriko greet                # Hello, world!
jeriko greet "Alice"        # Hello, Alice!
jeriko greet Alice | jeriko notify  # greet + send via Telegram
\`\`\`
```

### 5. Test and Publish

```bash
# Validate
jeriko plugin validate .

# Test (runs each command, checks JSON/text output, exit codes)
jeriko plugin test .

# Install locally for dev
jeriko install ./

# Trust it
jeriko trust jeriko-plugin-hello --yes

# Test the command
jeriko greet Alice

# Publish
npm publish
```

Users install with:

```bash
jeriko install jeriko-plugin-hello
jeriko trust jeriko-plugin-hello --yes
```

---

## The Command Pattern

Every plugin command follows the same contract as core commands:

```javascript
#!/usr/bin/env node
const { parseArgs, ok, fail, run, EXIT } = require('Jeriko/lib/cli');

run(async () => {
  const { flags, positional } = parseArgs(process.argv);

  // Validate input
  if (!flags.query && positional.length === 0) {
    fail('Usage: jeriko mycommand <query> or --query <text>');
  }

  // Do work
  const query = flags.query || positional.join(' ');
  const result = await doSomething(query);

  // Output (format is handled automatically by ok/fail)
  ok(result);
});
```

Key rules:
- `#!/usr/bin/env node` shebang (or compiled binary)
- `require('Jeriko/lib/cli')` for shared infrastructure
- `parseArgs()` for flag/positional parsing
- `ok(data)` writes to stdout in the active format (json/text/logfmt) and exits 0
- `fail(message, code)` writes to stderr in the active format and exits with semantic code
- `run(fn)` wraps async main with error handling and auto-categorizes errors

### Output Contract

**stdout** (success):
```json
{"ok": true, "data": {"key": "value"}}
```

**stderr** (error):
```json
{"ok": false, "error": "descriptive message"}
```

The `ok()` and `fail()` functions handle all three formats automatically. You never format output manually.

### Exit Codes

| Code | Meaning | When to Use |
|------|---------|-------------|
| 0 | Success | `ok()` |
| 1 | General error | `fail(msg)` or `fail(msg, EXIT.GENERAL)` |
| 2 | Network error | `fail(msg, EXIT.NETWORK)` |
| 3 | Auth error | `fail(msg, EXIT.AUTH)` |
| 5 | Not found | `fail(msg, EXIT.NOT_FOUND)` |
| 7 | Timeout | `fail(msg, EXIT.TIMEOUT)` |

The `run()` wrapper auto-categorizes uncaught errors:
- `ENOENT`, `no such file` -> exit 5
- `ETIMEDOUT`, `timeout` -> exit 7
- `ECONNREFUSED`, `fetch failed` -> exit 2
- `401`, `403`, `unauthorized` -> exit 3

### Format Support

Plugins automatically support all three formats because `ok()` and `fail()` read the `JERIKO_FORMAT` env var (set by the dispatcher). No extra code needed.

```bash
jeriko greet Alice --format json    # {"ok":true,"data":{"greeting":"Hello, Alice!"}}
jeriko greet Alice --format text    # greeting="Hello, Alice!"
jeriko greet Alice --format logfmt  # ok=true greeting="Hello, Alice!"
```

### Reading stdin

For pipe support:

```javascript
const { readStdin } = require('Jeriko/lib/cli');

run(async () => {
  const { flags, positional } = parseArgs(process.argv);
  const stdin = await readStdin();
  const input = positional[0] || stdin;
  if (!input) fail('No input provided');
  // ...
});
```

---

## The Manifest (`jeriko-plugin.json`)

Full field reference:

```json
{
  "name": "jeriko-plugin-example",
  "namespace": "example",
  "version": "1.0.0",
  "description": "What this plugin does",
  "author": "Your Name",
  "license": "MIT",
  "jerikoVersion": ">=1.0.0",
  "platform": ["darwin", "linux"],
  "commands": [
    {
      "name": "mycmd",
      "bin": "bin/mycmd",
      "description": "Short description for discovery",
      "usage": "jeriko mycmd <input> [--flag value]"
    }
  ],
  "permissions": ["network", "fs_read"],
  "env": [
    {
      "key": "MY_API_KEY",
      "required": true,
      "description": "API key for the service"
    },
    {
      "key": "MY_TIMEOUT",
      "required": false,
      "description": "Request timeout in ms"
    }
  ],
  "webhooks": [
    {
      "name": "events",
      "handler": "bin/webhook-handler",
      "verify": "hmac-sha256",
      "secretEnv": "MY_WEBHOOK_SECRET"
    }
  ]
}
```

### Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | npm package name. Must start with `jeriko-plugin-`. |
| `namespace` | string | Yes | Short unique prefix. Cannot be a reserved name. |
| `version` | semver | Yes | Plugin version. |
| `description` | string | No | Human-readable description. |
| `author` | string | No | Author name or email. |
| `license` | string | No | SPDX license identifier. |
| `jerikoVersion` | semver range | Yes | Required Jeriko version (e.g., `>=1.0.0`). |
| `platform` | string[] | Yes | Supported platforms: `darwin`, `linux`, `win32`. |
| `commands` | object[] | Yes | At least one command. |
| `commands[].name` | string | Yes | Command name (what users type after `jeriko`). |
| `commands[].bin` | string | Yes | Path to executable relative to plugin root. |
| `commands[].description` | string | Yes | Short description for `jeriko discover`. |
| `commands[].usage` | string | No | Usage example string. |
| `permissions` | string[] | No | Declared permissions (advisory). |
| `env` | object[] | No | Environment variables the plugin needs. |
| `env[].key` | string | Yes | Variable name. |
| `env[].required` | boolean | Yes | Whether the variable must be set. |
| `env[].description` | string | No | What this variable is for. |
| `webhooks` | object[] | No | Webhook endpoints to register. |
| `webhooks[].name` | string | Yes | Endpoint name (becomes URL path segment). |
| `webhooks[].handler` | string | Yes | Path to handler script relative to plugin root. |
| `webhooks[].verify` | string | No | Signature verification method (`hmac-sha256`, `none`). |
| `webhooks[].secretEnv` | string | No | Env var holding the webhook secret. |

### Reserved Namespaces

These cannot be used as plugin namespaces -- they are core commands:

```
sys, fs, exec, browse, search, screenshot, notify, discover, memory,
server, install, uninstall, trust, audio, camera, clipboard, contacts,
calendar, email, location, msg, music, net, notes, open, proc, remind,
window, stripe, x, plugin, init
```

### Command Name Conflicts

If a plugin command name conflicts with an existing core command or another plugin's command, `jeriko install` **fails** with an error. Core commands always win.

---

## The Prompt (`PROMPT.md`)

This is the most important file in a plugin. It teaches AI models *when* and *how* to use your commands.

### Structure

```markdown
# <plugin-name> Plugin

## When to Use
Clear conditions for when an AI should reach for this plugin.
- User asks about X -> use this
- User asks about Y -> do NOT use this (suggest Z instead)

## Decision Logic
Flowchart or rules the AI should follow.
- If condition A: run `jeriko cmd-a`
- If condition B with parameter: run `jeriko cmd-b --flag value`
- If unsure: run `jeriko cmd-a` first, then decide

## Error Handling
What to do when commands fail.
- Exit code 3 (auth): tell user to set MY_API_KEY in .env
- Exit code 2 (network): retry once, then report
- Exit code 5 (not found): suggest alternative query

## Composition
How to combine with other jeriko commands.
- `jeriko mycmd "query" | jeriko notify` — search and notify
- `jeriko mycmd --export | jeriko fs --write /tmp/result.json` — save results

## Webhook Events
(If plugin has webhooks) What events arrive and how to process them.
- `payment.completed`: contains {amount, currency, customer}
- `payment.failed`: contains {error, customer}
```

### Prompt Safety

Plugin prompts are:
- **Loaded on-demand**: only when `jeriko discover` runs, not at startup
- **Non-authoritative**: wrapped with context indicating they come from a third-party plugin
- **Separate from core**: the core system prompt (from `CLAUDE.md`) always takes precedence

### Tips for Good Prompts

1. Be specific about when NOT to use the plugin
2. Include the exact command syntax with flags
3. Show piping patterns with core commands
4. Document every error code the user might see
5. Keep it under 500 words -- AI context is expensive

---

## The Docs (`COMMANDS.md`)

Same format as `CLAUDE.md`. This gets injected into `jeriko discover` output.

```markdown
### jeriko mycmd
Short description.

\`\`\`bash
jeriko mycmd "query"                    # basic usage
jeriko mycmd --flag value               # with flag
jeriko mycmd "query" --format text      # text output
echo "input" | jeriko mycmd            # pipe input
\`\`\`
```

If `COMMANDS.md` is missing, Jeriko auto-generates docs from the manifest's command descriptions. But writing `COMMANDS.md` is strongly recommended -- the auto-generated version lacks usage examples.

---

## Namespace Rules

1. Namespaces must be unique across all installed plugins
2. Namespaces cannot match any reserved core command name
3. Command names must be unique across all installed plugins AND core commands
4. Conflicts are detected at install time and **cause install failure**
5. Core commands always take priority -- a plugin cannot shadow `sys`, `fs`, etc.

---

## Platform Support

Declare supported platforms in `manifest.platform`:

```json
"platform": ["darwin", "linux"]
```

Valid values: `darwin` (macOS), `linux`, `win32` (Windows).

At install time, Jeriko checks the current `process.platform` against the manifest. If the current platform is not in the list, the install fails.

For commands that work differently per-platform, check at runtime:

```javascript
if (process.platform !== 'darwin') {
  fail('This command requires macOS', EXIT.GENERAL);
}
```

---

## Webhook Integration

Plugins can receive webhooks from external services (GitHub, Stripe, etc.).

### Manifest Declaration

```json
"webhooks": [
  {
    "name": "github-push",
    "handler": "bin/handle-push",
    "verify": "hmac-sha256",
    "secretEnv": "GITHUB_WEBHOOK_SECRET"
  }
]
```

### URL Pattern

```
POST /hooks/plugin/<namespace>/<webhook-name>
```

Example: `POST /hooks/plugin/example/github-push`

### Handler Contract

The handler script receives:
- **stdin**: the raw request body
- **env var `TRIGGER_EVENT`**: JSON with `{type, source, body, receivedAt}`
- **Plugin's declared env vars** (isolated)

The handler must:
- Be executable (`chmod +x`)
- Exit within 60 seconds (timeout)
- Exit 0 on success, non-zero on failure

```javascript
#!/usr/bin/env node
const event = JSON.parse(process.env.TRIGGER_EVENT || '{}');
const body = JSON.parse(event.body || '{}');

// Process the webhook
console.log(`Received ${event.source} event at ${event.receivedAt}`);
// ...do work...
process.exit(0);
```

### Signature Verification

If `verify` is set and is not `none`, the server checks for a signature header:
- `x-webhook-signature`
- `x-hub-signature-256` (GitHub)
- `stripe-signature` (Stripe)

The secret comes from the env var named in `secretEnv`. If the secret is not configured, the webhook returns 500. If the signature is missing, it returns 401.

**Fail-closed**: webhooks only work for trusted plugins. Untrusted plugins' webhooks are never registered.

### Response Pattern

The server responds `202 Accepted` immediately and processes the handler asynchronously. All webhook executions are logged to the audit log.

---

## Security & Trust

### Untrusted by Default

Every newly installed plugin is **untrusted**. Untrusted plugins:
- Can run commands (with restricted env)
- Cannot receive webhooks
- Show "(untrusted)" in `jeriko --help`

### Granting Trust

```bash
# Review what the plugin requests
jeriko trust jeriko-plugin-example
# Output shows: permissions, env vars, commands

# Confirm
jeriko trust jeriko-plugin-example --yes

# Revoke trust
jeriko trust --revoke jeriko-plugin-example

# List all plugins with trust status
jeriko trust --list
```

### Environment Isolation

Plugins only see:
- **Safe system vars**: `PATH`, `HOME`, `USER`, `SHELL`, `TERM`, `NODE_ENV`, `LANG`, `LC_ALL`, `TZ`
- **Jeriko infra vars**: `JERIKO_ROOT`, `JERIKO_DATA_DIR`, `JERIKO_FORMAT`, `JERIKO_QUIET`, `JERIKO_PLUGIN`, `JERIKO_NAMESPACE`
- **Declared vars**: only env vars listed in `manifest.env`

A plugin that declares `env: [{key: "MY_API_KEY", required: true}]` will see `MY_API_KEY` from the host `.env`. It will **never** see `TELEGRAM_BOT_TOKEN`, `STRIPE_SECRET_KEY`, `NODE_AUTH_SECRET`, or any other env var it did not declare.

### Permissions (Declarative/Advisory)

```json
"permissions": ["network", "fs_read", "fs_write", "exec", "env"]
```

| Permission | Meaning |
|-----------|---------|
| `network` | Makes outbound HTTP requests |
| `fs_read` | Reads files from disk |
| `fs_write` | Writes files to disk |
| `exec` | Spawns child processes |
| `env` | Accesses environment variables beyond safe list |

Permissions are **declarative and advisory** -- they inform the admin during `jeriko trust` review. They are not enforced at runtime (Node.js has no sandboxing).

### Audit Log

Every plugin action is logged to `~/.jeriko/audit.log`:
- Install, upgrade, uninstall
- Trust grant, trust revoke
- Webhook received, webhook handler execution
- Each entry: `{ts, action, plugin, ...details}`

```bash
# View recent audit entries
jeriko trust --audit
jeriko trust --audit --limit 100
```

The audit log auto-rotates at 2MB (keeps last 10,000 entries).

### Integrity Hashes

On install/upgrade, Jeriko computes a SHA-512 hash of `jeriko-plugin.json` and stores it in the registry. This allows detecting if a plugin's manifest was modified after install.

```bash
# View plugin integrity hash
jeriko install --info jeriko-plugin-example
```

---

## Prompt Safety

Plugin prompts (`PROMPT.md`) are handled carefully:

1. **On-demand loading**: prompts are only read when `jeriko discover` runs, not at server startup
2. **Non-authoritative wrapping**: when injected into AI context, plugin prompts are clearly labeled as third-party
3. **Core precedence**: the core system prompt (`CLAUDE.md`) is always presented first; plugin prompts come after

A malicious prompt cannot override core Jeriko behavior because the AI sees the core instructions first.

---

## Testing

### Validate

```bash
jeriko plugin validate /path/to/plugin
```

Checks:
1. `jeriko-plugin.json` exists and is valid JSON
2. All required manifest fields present
3. All `bin` files exist and are executable
4. `COMMANDS.md` exists (warning if missing)
5. `PROMPT.md` exists (warning if missing)
6. Current platform is in `manifest.platform` (warning if not)
7. No namespace conflicts with core commands
8. No command name conflicts with registry
9. Integrity hash computed

### Test

```bash
jeriko plugin test /path/to/plugin
```

For each command in the manifest:
1. Runs with no args and `JERIKO_FORMAT=json` -- expects JSON output with `ok` field
2. Runs with `--format text` -- expects non-JSON output
3. Validates exit code is one of `[0, 1, 2, 3, 5, 7]`

Reports pass/fail/skip per command.

---

## Publishing

### Prepare

1. Set `name` in `package.json` to match `manifest.name`
2. Include `jeriko-plugin.json`, `COMMANDS.md`, `PROMPT.md`, and all `bin/` files in the package
3. Ensure all bin files have `#!/usr/bin/env node` shebang and are `chmod +x`
4. Run `jeriko plugin validate .` and `jeriko plugin test .`

### Publish

```bash
npm publish
```

### Users Install

```bash
jeriko install jeriko-plugin-yourname
jeriko trust jeriko-plugin-yourname --yes
```

### Local Development

```bash
# Install from local path (dev mode)
jeriko install ./path/to/plugin

# Trust
jeriko trust jeriko-plugin-yourname --yes

# Test changes — reinstall after edits
jeriko install ./path/to/plugin
```

---

## Plugin Upgrade

```bash
# Upgrade to latest version from npm
jeriko install --upgrade jeriko-plugin-example
```

Upgrade behavior:
- Runs `npm install <name>@latest`
- Re-validates manifest
- Checks for new conflicts
- **Preserves trust status** -- if the plugin was trusted before upgrade, it stays trusted
- Records `upgradedAt` timestamp and old/new version in audit log
- Recomputes integrity hash

---

## Version Locking and Integrity

```bash
# Install specific version
jeriko install jeriko-plugin-example@1.2.3

# View installed version and integrity hash
jeriko install --info jeriko-plugin-example
```

The registry stores:
- `version`: installed semver
- `integrity`: SHA-512 hash of `jeriko-plugin.json`
- `installedAt`: ISO timestamp
- `upgradedAt`: ISO timestamp (if upgraded)

---

## Best Practices

1. **Namespace everything**: your namespace prevents conflicts with other plugins
2. **Fail fast**: validate input immediately, use semantic exit codes
3. **Support piping**: read stdin with `readStdin()`, output structured data with `ok()`
4. **Keep prompts honest**: describe what your plugin does, not what you wish it did
5. **Declare env vars**: list every env var you need; you will not see undeclared ones
6. **Test both formats**: run `jeriko plugin test .` to verify json and text output
7. **Minimal dependencies**: plugins run in isolated env; keep the dep tree small
8. **Document composition**: show users how to pipe your commands with core commands
9. **Handle errors gracefully**: every error should produce structured output via `fail()`
10. **Respect platform**: check `process.platform` for platform-specific behavior

---

## Directory Structure Reference

```
~/.jeriko/
  plugins/
    registry.json              # installed plugins index
    jeriko-plugin-example/
      node_modules/
        jeriko-plugin-example/
          jeriko-plugin.json   # manifest
          COMMANDS.md          # command docs
          PROMPT.md            # AI prompt
          bin/
            mycmd              # executable command
          package.json
  audit.log                    # plugin audit trail
```
