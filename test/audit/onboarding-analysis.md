# Onboarding & Init System Audit

## Full Onboarding Flow

```
User runs `jeriko` (no args)
  -> chat.tsx: startChat()
  -> needsSetup() checks:
       1. No config file at ~/.config/jeriko/config.json
       2. No ANTHROPIC_API_KEY or OPENAI_API_KEY in env
  -> If needs setup:
       runOnboarding(ClackPrompter, version) -> OnboardingResult | null
       persistSetup(result) -> writes config.json + .env + spawnDaemon()
  -> createBackend() -> daemon IPC or in-process
  -> printBanner() + render(<App />)
```

### Alternative Entry: `jeriko onboard`
- Same wizard via `runOnboarding()` + `persistSetup()` from `onboarding.ts`
- Calls `process.exit(0)` on success, `process.exit(1)` on cancel

### Alternative Entry: `jeriko init`
- Extended wizard: channels + provider + API key + security token + connectors
- Non-interactive mode (`--non-interactive`): builds config from env vars
- `--force` flag to overwrite existing config
- Also deploys AGENT.md to `~/.config/jeriko/agent.md`

## Provider Paths

### Anthropic (Claude)
1. User selects "Claude (Anthropic)" from provider list
2. Prompted for API key (password input, min 10 chars, no whitespace)
3. verifyApiKey("anthropic", key) -> POST to Anthropic messages API with haiku model
4. 401 = invalid, anything else = valid (tolerates rate limits, network errors)
5. Config: `{ agent: { model: "claude" } }`, env: `ANTHROPIC_API_KEY=<key>`

### OpenAI (GPT)
1. User selects "GPT (OpenAI)"
2. Same key input flow
3. verifyApiKey("openai", key) -> GET /v1/models with Bearer token
4. Config: `{ agent: { model: "gpt4" } }`, env: `OPENAI_API_KEY=<key>`

### Local (Ollama)
1. User selects "Local (Ollama)"
2. No API key prompt (needsApiKey = false)
3. verifyOllamaRunning() -> GET http://127.0.0.1:11434/api/tags
4. If not running: shows note with install instructions
5. Config: `{ agent: { model: "local" } }`, no env written

### Preset Providers (OpenRouter, DeepInfra, Together, etc.)
- Loaded dynamically from `PROVIDER_PRESETS` in daemon layer
- Each has envKey, defaultModel, needsApiKey = true
- Model written as `{presetId}:{defaultModel}`
- Gracefully skipped if presets module unavailable

## Config File Written

Path: `~/.config/jeriko/config.json`

### Onboarding wizard (`persistSetup` in onboarding.ts):
```json
{
  "agent": { "model": "<provider.model>" },
  "channels": {
    "telegram": { "token": "<token or empty>", "adminIds": [] },
    "whatsapp": { "enabled": false }
  },
  "connectors": {},
  "logging": { "level": "info" }
}
```

### Init wizard (`runInteractiveInit` in init.ts):
```json
{
  "agent": { "model": "<provider.model>" },
  "channels": {
    "telegram": { "token": "<token>", "adminIds": ["<from env>"] },
    "whatsapp": { "enabled": true/false }
  },
  "connectors": {
    "stripe": { "webhookSecret": "<from env>" },
    "github": { "webhookSecret": "<from env>" },
    "twilio": { "accountSid": "<from env>", "authToken": "<from env>" }
  },
  "logging": { "level": "info" }
}
```

### Backend persistSetup (in-REPL setup):
Same shape as onboarding wizard. No channel/connector data.

## .env File Written

Path: `~/.config/jeriko/.env`

- Appends (does not overwrite) existing content
- Checks for duplicate keys before writing
- Format: `PROVIDER_ENV_KEY=apikey\n`
- Init also writes `NODE_AUTH_SECRET=<hex>` if generated

## Daemon Auto-Start

- Both init and onboarding call `spawnDaemon()` after writing config
- `spawnDaemon()` in `daemon.ts`:
  1. Checks `isDaemonRunning()` first (returns existing PID if running)
  2. Cleans stale PID file
  3. Detects mode: compiled binary (VFS) vs dev mode (.ts/.js)
  4. Uses `process.execPath` (not `process.argv[0]`) for compiled binaries
  5. Spawns detached child: `<execPath> server start --foreground`
  6. Polls for PID file (50ms intervals, 5s timeout)
  7. Returns PID or null

## Non-Interactive Init (`--non-interactive`)

- Builds config from env vars only (no prompts)
- Provider detection: ANTHROPIC_API_KEY -> "claude", OPENAI_API_KEY -> "gpt4", else "local"
- Telegram token from TELEGRAM_BOT_TOKEN
- Admin IDs from ADMIN_TELEGRAM_IDS (comma-separated)
- WhatsApp from WHATSAPP_ENABLED
- Connector secrets from env
- Does NOT write .env (secrets are already in env)
- Does NOT start daemon

## Error Paths

- **Invalid API key**: verifyApiKey returns false, spinner shows "could not verify", continues anyway
- **No Ollama**: verifyOllamaRunning returns false, shows install instructions note, continues
- **User cancel**: Any prompt returning symbol -> outro("cancelled") + return null
- **Network error during verify**: caught, returns true (assumes key is OK)
- **Existing config**: `jeriko init` shows message + returns (unless --force)
- **needsSetup() false**: Skips wizard entirely (config exists OR API key in env)

## daemon.ts Shared Module

- `JERIKO_DIR`: `~/.jeriko`
- `PID_FILE`: `~/.jeriko/daemon.pid`
- `SOCKET_PATH`: `~/.jeriko/daemon.sock`
- `LOG_FILE`: `~/.jeriko/data/daemon.log`
- `readPid()`: Reads PID file, returns number or null
- `isDaemonRunning()`: readPid + process.kill(pid, 0), cleans up stale PID on failure
- `cleanupPidFile()`: Removes PID file and socket file
- `spawnDaemon()`: Full lifecycle with compiled binary detection

## Potential Issues / Bugs Found

1. **Inconsistent persistSetup signatures**: `onboarding.ts` exports `persistSetup(result: OnboardingResult)` and `backend.ts` exports `persistSetup(provider, apiKey)` — same function name, different interfaces. The `chat.tsx` imports from `onboarding.ts`, while the in-REPL setup component presumably imports from `backend.ts`. Not a bug, but confusing naming.

2. **Init wizard does not check for existing env keys before appending**: The init wizard checks `!existing.includes(l.split("=")[0]!)` which works but could false-positive if a key name is a substring of another key name (e.g., `KEY` vs `MY_KEY`). The onboarding wizard checks `!existing.includes(\`${result.envKey}=\`)` which is slightly more precise.

3. **Non-interactive init does not deploy daemon**: `buildNonInteractiveConfig` writes config and deploys AGENT.md but does not call `spawnDaemon()`. This is likely intentional for CI/scripting but undocumented.

4. **JERIKO_DIR in daemon.ts uses hardcoded homedir()**: The path is `join(homedir(), ".jeriko")` at module level, which means it's set once at import time. This is fine in production but makes testing harder (HOME override must happen before import).

5. **Onboarding flow in init.ts is duplicated from onboarding.ts**: The channel + provider + API key flow in `runInteractiveInit` is a superset of `runOnboarding`. The code is duplicated rather than composing `runOnboarding` + extra steps. Any bug fix in one must be mirrored.

6. **verifyApiKey model hardcoded**: Uses `claude-haiku-4-5-20251001` which could become unavailable. Gracefully handled (non-401 = valid).
