# Dispatcher System Audit

## Flow Diagram

```
process.argv
  |
  v
dispatcher(argv)          [src/cli/dispatcher.ts:297]
  |
  +-- parseArgs(argv)     [src/shared/args.ts:20]  -> { flags, positional }
  |
  +-- Extract global flags:
  |     --format json|text|logfmt  -> setOutputFormat()
  |     --quiet                    -> module-level `quiet` flag
  |
  +-- --version?  -> printVersion() -> process.exit(0)
  |
  +-- loadBuiltinCommands()   [lazy imports, registers 70+ commands]
  |
  +-- --help (no command)?  -> printHelp() -> process.exit(0)
  |
  +-- No positional?  -> startChat() (interactive REPL)
  |
  +-- cmdName = positional[0]
  |   cmdArgs = stripGlobalFlags(argv.slice(after cmdName))
  |
  +-- registry.get(cmdName)
  |     |
  |     +-- NOT FOUND -> suggestSimilar(cmdName) -> fail("Unknown command")
  |     |
  |     +-- FOUND -> handler.run(cmdArgs)
  |                    |
  |                    +-- success -> ok(data) -> JSON/text/logfmt to stdout -> exit(0)
  |                    +-- throw  -> fail("Command failed: ...") -> exit(1)
```

## Registered Commands (70 total + 3 billing = 73)

### system (4)
- sys, exec, proc, net

### files (2)
- fs, doc

### browser (3)
- browse, search, screenshot

### comms (4)
- email, msg, notify, audio

### os (10)
- notes, remind, calendar, contacts, music, clipboard, window, camera, open, location

### integrations (27)
- stripe, github, paypal, vercel, twilio, x, gdrive, onedrive, gmail, outlook
- hubspot, shopify, slack, discord, sendgrid, square, gitlab, cloudflare, digitalocean
- notion, linear, jira, airtable, asana, mailchimp, dropbox, salesforce
- connectors

### dev (4)
- code, create, dev, parallel

### agent (7)
- ask, memory, discover, prompt, skill, share, provider

### automation (6)
- init, onboard, server, task, setup, update

### plugin (3)
- install, trust, uninstall

### billing (3)
- plan, upgrade, billing

## Global Flag Handling

| Flag | Set | Stripped | Notes |
|------|-----|---------|-------|
| `--format` | GLOBAL_FLAGS | Yes (+ value) | Valid: json, text, logfmt |
| `--quiet` | GLOBAL_FLAGS | Yes (+ next non-flag) | **BUG** - see below |
| `--version` | Not in GLOBAL_FLAGS | Not stripped | Handled before command dispatch |
| `--help` | Not in GLOBAL_FLAGS | Not stripped | Passed through to commands |

### stripGlobalFlags Behavior

Called on `cmdArgs` (args after the command name). Removes `--format` and `--quiet`
so they don't confuse command-specific parsers.

### BUG: --quiet strips following positional argument

`stripGlobalFlags` does not distinguish boolean flags from value flags. When
`--quiet` appears in cmdArgs followed by a non-flag token, it eats the next
token as if it were `--quiet`'s value:

```
Input:  ["--quiet", "foo", "--cpu"]
Output: ["--cpu"]
Expected: ["foo", "--cpu"]
```

This happens because the stripping logic (line 233-243) checks if the next arg
starts with `-`. If it doesn't, it assumes it's the flag's value and skips it.
`--quiet` is a boolean flag and should never consume a value argument.

**Fix:** Split GLOBAL_FLAGS into two sets: `GLOBAL_VALUE_FLAGS` (format) and
`GLOBAL_BOOL_FLAGS` (quiet), and only consume the next argument for value flags.

### Edge case: --format with invalid value

If `--format=invalid`, the dispatcher silently falls back to "json" (the default)
since the condition on line 301 only sets the format for the three valid values.
This is arguably correct behavior but could be more explicit (warning/error).

## Error Paths and Exit Codes

| Scenario | Exit Code | Message Format |
|----------|-----------|---------------|
| Unknown command | 1 (GENERAL) | `{"ok":false,"error":"Unknown command: \"xyz\"","code":1}` |
| Command throws | 1 (GENERAL) | `{"ok":false,"error":"Command \"x\" failed: ...","code":1}` |
| --version | 0 | Plain text: `jeriko 2.0.0-alpha.1` |
| --help | 0 | Plain text help (not JSON) |
| Command --help | 0 | Plain text (command-specific, not JSON) |

### Observation: --help and --version bypass output format

`printVersion()` and `printHelp()` use `console.log()` directly, not `ok()`.
This means `--format json --version` still outputs plain text. This is
intentional -- version/help are human-facing, not machine-facing.

### Observation: fail() after unknown command uses current output format

If `--format text` is set and an unknown command is given, the error uses text
format: `Error: Unknown command: "xyz"`. This is correct behavior.

## Command Pattern

Every command follows this structure:
1. `parseArgs(args)` on its own sub-args
2. Check `flagBool(parsed, "help")` -> print help, `process.exit(0)`
3. Extract flags, do work
4. `ok(data)` on success, `fail(msg)` on error

## Potential Issues Summary

1. **BUG (Medium):** `stripGlobalFlags` eats positional args after `--quiet`
2. **Minor:** Invalid `--format` value silently defaults to json (no warning)
3. **Minor:** `fail()` in dispatcher (line 342) does not return/throw after call,
   but since `fail()` calls `process.exit()`, this is safe in practice. However,
   TypeScript doesn't know the control flow ends there without the `never` return
   type being trusted.
4. **Minor:** `printHelp()` only shows commands if `loadBuiltinCommands()` has
   populated the registry. This is guaranteed by the call order in `dispatcher()`,
   but `printHelp()` as a standalone function could produce empty output.
5. **Minor:** `getCommands()` auto-loads if registry is empty, but `dispatcher()`
   always calls `loadBuiltinCommands()` explicitly. Double-loading is harmless
   (Map.set overwrites) but wasteful.
