# Contributing to Jeriko

## Development Setup

```bash
git clone https://github.com/etheon/Jeriko.git
cd Jeriko
npm install

# Add bin/ to PATH for development
export PATH="$(pwd)/bin:$PATH"

# Initialize
jeriko init --yes

# Verify
jeriko sys --format text
jeriko discover --list
```

## Adding a Core Command

### 1. Create the Tool Library (if needed)

Add functions to `tools/` that do the actual work:

```javascript
// tools/myfeature.js
async function doThing(input) {
  // ...
  return { result: 'data' };
}

module.exports = { doThing };
```

### 2. Create the CLI Command

```javascript
// bin/jeriko-mycommand
#!/usr/bin/env node
const { parseArgs, ok, fail, run, EXIT } = require('../lib/cli');

run(async () => {
  const { flags, positional } = parseArgs(process.argv);

  // Flag-based subcommands
  if (flags.list) {
    const items = await getList();
    return ok(items);
  }

  if (flags.create) {
    const name = typeof flags.create === 'string' ? flags.create : positional[0];
    if (!name) fail('Usage: jeriko mycommand --create <name>');
    const result = await create(name);
    return ok(result);
  }

  // Default behavior (no flags)
  const data = await getDefault();
  ok(data);
});
```

Make it executable:

```bash
chmod +x bin/jeriko-mycommand
```

### 3. Register in `tools/index.js`

Add a Telegram slash command handler:

```javascript
'mycommand': {
  description: 'Short description for /tools listing',
  usage: '/mycommand [--list|--create <name>]',
  handler: async (args) => {
    const data = jerikoExec(`mycommand ${args.trim()}`);
    if (Array.isArray(data)) {
      return data.map(item => `${item.name}: ${item.value}`).join('\n') || 'No results';
    }
    return typeof data === 'object' ? JSON.stringify(data, null, 2) : data;
  },
},
```

### 4. Document in `CLAUDE.md`

Add a section following the existing format:

```markdown
### jeriko mycommand
Short description.

\`\`\`bash
jeriko mycommand                      # default behavior
jeriko mycommand --list               # list items
jeriko mycommand --create "name"      # create item
echo "input" | jeriko mycommand       # pipe input
\`\`\`
```

### 5. Update the Reserved List

Add your command name to `RESERVED` in `lib/plugins.js`:

```javascript
const RESERVED = [
  // ... existing ...
  'mycommand',
];
```

## Command Template

Full template with stdin support, error handling, and all patterns:

```javascript
#!/usr/bin/env node
const { parseArgs, ok, fail, readStdin, run, EXIT } = require('../lib/cli');

run(async () => {
  const { flags, positional } = parseArgs(process.argv);
  const stdin = await readStdin();

  // Subcommand: --list
  if (flags.list) {
    const limit = parseInt(flags.limit) || 10;
    const results = await fetchItems(limit);
    return ok(results);
  }

  // Subcommand: --create (with stdin support)
  if (flags.create) {
    const name = typeof flags.create === 'string' ? flags.create : positional[0];
    if (!name) fail('Usage: jeriko mycommand --create <name>');
    const body = flags.body || stdin;
    const result = await createItem(name, body);
    return ok(result);
  }

  // Subcommand: --delete
  if (flags.delete) {
    const id = typeof flags.delete === 'string' ? flags.delete : positional[0];
    if (!id) fail('Usage: jeriko mycommand --delete <id>');
    await deleteItem(id);
    return ok({ deleted: id });
  }

  // Default: show info
  const info = await getInfo();
  ok(info);
});
```

## Code Style

- **Plain JavaScript**: no TypeScript, no transpilation, no build step
- **No classes**: use plain functions and module exports
- **Minimal dependencies**: prefer Node.js built-ins over npm packages
- **`ok()` / `fail()`**: always use these for output. Never `console.log` in commands (except `jeriko init` which has special interactive output).
- **Semantic exit codes**: use `EXIT.NETWORK`, `EXIT.AUTH`, `EXIT.NOT_FOUND`, `EXIT.TIMEOUT`
- **Error messages**: human-readable, include what went wrong and what to do
- **`escapeAppleScript()`**: always use when interpolating user input into AppleScript strings
- **`readStdin()`**: support piped input where it makes sense
- **No global state**: each command invocation is a fresh process

### Naming Conventions

| What | Convention | Example |
|------|-----------|---------|
| CLI commands | `bin/jeriko-lowercase` | `bin/jeriko-mycommand` |
| Tool libraries | `tools/lowercase.js` | `tools/myfeature.js` |
| Flags | `--kebab-case` | `--kill-name`, `--days-until-due` |
| JSON keys | `camelCase` | `{ runCount: 5 }` |
| Env vars | `UPPER_SNAKE_CASE` | `IMAP_HOST` |

## Platform Guidelines

When adding macOS-specific functionality:

```javascript
// Check platform at the top of the command
if (process.platform !== 'darwin') {
  fail('This command requires macOS');
}
```

When using AppleScript:

```javascript
const { escapeAppleScript } = require('../lib/cli');

// Always escape user input
const safeName = escapeAppleScript(userInput);
const script = `tell application "Notes" to make new note with properties {name:"${safeName}"}`;
```

When a command partially works cross-platform, check per-feature:

```javascript
if (flags.say) {
  if (process.platform !== 'darwin') {
    fail('Text-to-speech requires macOS');
  }
  // ... macOS-only code
}
```

## Testing

### Manual Testing

Test all three output formats:

```bash
# JSON (default) - should be valid JSON with ok field
jeriko mycommand --format json
jeriko mycommand --format json 2>&1 | python3 -c "import sys,json; json.load(sys.stdin)"

# Text - should NOT be JSON
jeriko mycommand --format text

# Logfmt - should be key=value pairs
jeriko mycommand --format logfmt
```

### Test Piping

```bash
# Pipe to another command
jeriko mycommand | jeriko notify

# Pipe from stdin
echo "input" | jeriko mycommand
```

### Test Error Cases

```bash
# Missing required input
jeriko mycommand --create
# Should: exit 1, output {"ok":false,"error":"Usage: ..."}

# Not found
jeriko mycommand --get nonexistent
# Should: exit 5, output {"ok":false,"error":"...not found"}

# Verify exit code
jeriko mycommand --bad-input; echo "Exit: $?"
```

### Test via Plugin Tooling

If you are developing a plugin, use the built-in test runner:

```bash
# Validates manifest, checks bins, verifies docs
jeriko plugin validate /path/to/plugin

# Runs each command with json and text format, checks output contract
jeriko plugin test /path/to/plugin
```

## Project Structure Reference

```
bin/
  jeriko              # dispatcher (resolves core + plugin commands)
  jeriko-*            # core commands (28+)
lib/
  cli.js              # parseArgs, ok, fail, readStdin, run, escapeAppleScript
  plugins.js          # plugin SDK (registry, trust, env isolation, audit)
tools/
  *.js                # tool library functions
  index.js            # Telegram slash command registry (35+ handlers)
server/
  index.js            # Express + HTTP server + WebSocket + boot
  router.js           # AI routing (Claude/OpenAI, auto-discover, memory injection)
  auth.js             # HMAC tokens, timing-safe comparison, Telegram allowlist
  telegram.js         # Telegram bot (slash commands, triggers, free-text -> AI)
  whatsapp.js         # WhatsApp integration
  websocket.js        # WebSocket hub for multi-machine
  triggers/
    engine.js          # trigger lifecycle (activate, deactivate, fire)
    store.js           # JSON file persistence
    executor.js        # Claude or shell action execution
    notify.js          # macOS + node-notifier notifications
    webhooks.js        # HTTP webhook receiver + signature verification
    pollers/
      email.js         # IMAP email polling
agent/
  agent.js            # remote node (55 lines, WebSocket + Claude)
data/
  session.jsonl       # session history (auto-logged)
  memory.json         # key-value store
  triggers.json       # trigger definitions
  trigger-log.json    # trigger execution log
```
