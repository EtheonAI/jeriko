# Jeriko Terminal — Technical Architecture

**Status:** Approved
**Date:** 2026-02-25

---

## 1. System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                     ELECTRON MAIN PROCESS                        │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Jeriko Engine (imported directly via require())        │  │
│  │                                                            │  │
│  │  server/router.js   → route(text, onChunk, onStatus, h)   │  │
│  │  server/context.js  → conversation save/load/list          │  │
│  │  server/tools.js    → tool definitions + execution         │  │
│  │  server/security.js → path/command validation              │  │
│  │  server/logger.js   → structured JSONL logging             │  │
│  │  server/triggers/   → autonomous trigger engine            │  │
│  │  lib/plugins.js     → plugin system with trust/isolation   │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Electron Services                                         │  │
│  │                                                            │  │
│  │  CredentialStore    → safeStorage encrypt/decrypt          │  │
│  │  globalShortcut     → Cmd+Shift+Space hotkey               │  │
│  │  Tray               → menu bar / system tray icon          │  │
│  │  protocol.handle    → jeriko:// OAuth callbacks            │  │
│  │  autoUpdater        → silent background updates            │  │
│  │  nativeNotification → OS notifications for triggers        │  │
│  │  powerMonitor       → sleep/wake for scheduling            │  │
│  │  BrowserWindow      → main window management               │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  IPC Bridge (contextBridge + ipcMain/ipcRenderer)          │  │
│  │                                                            │  │
│  │  terminal:execute   → text input → streamed response       │  │
│  │  terminal:cancel    → abort current operation              │  │
│  │  terminal:status    → status event forwarding              │  │
│  │  settings:get       → read settings                        │  │
│  │  settings:set       → write settings                       │  │
│  │  credentials:store  → encrypt + save credential            │  │
│  │  credentials:get    → decrypt + return credential          │  │
│  │  credentials:delete → remove credential                    │  │
│  │  credentials:export → export encrypted backup              │  │
│  │  credentials:import → import encrypted backup              │  │
│  │  oauth:start        → begin OAuth flow                     │  │
│  │  oauth:callback     → handle OAuth redirect                │  │
│  │  tabs:save          → persist tab state                    │  │
│  │  tabs:load          → restore tab state                    │  │
│  │  triggers:list      → get active triggers                  │  │
│  │  triggers:event     → notify renderer of trigger fire      │  │
│  │  app:info           → version, license, platform           │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│                    ELECTRON RENDERER PROCESS                      │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  React Application (TypeScript)                            │  │
│  │                                                            │  │
│  │  <App />                                                   │  │
│  │  ├── <TitleBar />                                          │  │
│  │  ├── <TabBar />                                            │  │
│  │  ├── <OutputArea />                                        │  │
│  │  │   ├── <WelcomeMessage />                                │  │
│  │  │   ├── <CommandBlock />                                  │  │
│  │  │   ├── <ThinkingIndicator />                             │  │
│  │  │   ├── <ReasoningBlock />                                │  │
│  │  │   ├── <ToolCallCard />                                  │  │
│  │  │   ├── <ToolResultBlock /> (delegates to sub-components) │  │
│  │  │   ├── <StreamedResponse />                              │  │
│  │  │   ├── <ConfirmationPrompt />                            │  │
│  │  │   ├── <IntegrationSetup />                              │  │
│  │  │   ├── <SecurityWarning />                               │  │
│  │  │   └── <ErrorRecovery />                                 │  │
│  │  ├── <PromptInput />                                       │  │
│  │  ├── <OnboardingScreen />                                  │  │
│  │  └── <SettingsOverlay />                                   │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Communicates with Main via: window.api.* (contextBridge)        │
│  No direct Node.js access. No require(). No fs. No child_process│
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Engine Integration

### 2.1 Direct Import (No Server)

The Jeriko engine is imported directly into Electron's main process:

```javascript
// main/engine.ts
const { route } = require('../../server/router');
const context = require('../../server/context');
const { createLogger } = require('../../server/logger');
```

This works because:
- Jeriko is plain JavaScript with `require()` — no build step needed
- `router.js` already supports being imported without starting Express (see: `jeriko-chat` does the same)
- WebSocket module is lazy-loaded (`getWs()`) to avoid side effects
- No localhost server running. Zero network latency.

### 2.2 Environment Setup

Before importing the engine, the main process sets required env vars:

```javascript
// Set JERIKO_ROOT so lib/cli.js can find .env and bins
process.env.JERIKO_ROOT = path.join(__dirname, '..', '..');

// Set AI backend from stored settings (not .env)
process.env.AI_BACKEND = settings.get('ai.backend') || 'claude';
process.env.CLAUDE_MODEL = settings.get('ai.model') || 'claude-sonnet-4-6';

// API keys from safeStorage (not .env)
const apiKey = credentialStore.get('anthropic_api_key');
if (apiKey) process.env.ANTHROPIC_API_KEY = apiKey;

// Set data directory
process.env.JERIKO_DATA_DIR = path.join(app.getPath('userData'), 'data');
```

### 2.3 Calling route()

The `route()` function signature is:

```typescript
route(
  text: string,           // User's natural language input
  onChunk: (text: string) => void,  // Streamed response text
  onStatus: (status: StatusEvent) => void,  // Status events
  history?: Message[]     // Conversation history (mutated in place)
): Promise<string>        // Final complete response
```

Status event types (from `server/router.js`):

```typescript
type StatusEvent =
  | { type: 'thinking' }
  | { type: 'thinking_text', text: string }
  | { type: 'reasoning', text: string }
  | { type: 'tool_call', name: string, input: Record<string, any> }
  | { type: 'tool_result', name: string, result: string, duration: number }
  | { type: 'responding' }
  | { type: 'context_compacted', from: number, to: number }
  | { type: 'security_blocked', tool: string, reason: string }
```

### 2.4 IPC Flow for a Command

```
Renderer                    Main Process
   │                            │
   │  terminal:execute(text)    │
   ├───────────────────────────►│
   │                            │  route(text, onChunk, onStatus, history)
   │                            │     │
   │  terminal:status(event)    │◄────┘ (thinking)
   │◄───────────────────────────┤
   │  terminal:status(event)    │◄────── (tool_call)
   │◄───────────────────────────┤
   │  terminal:status(event)    │◄────── (tool_result)
   │◄───────────────────────────┤
   │  terminal:chunk(text)      │◄────── (streamed text)
   │◄───────────────────────────┤
   │  terminal:chunk(text)      │◄────── (more text)
   │◄───────────────────────────┤
   │  terminal:done(response)   │◄────── (complete)
   │◄───────────────────────────┤
   │                            │
```

The main process emits events back via `BrowserWindow.webContents.send()`. The renderer listens via the preload bridge.

---

## 3. IPC Specification

### 3.1 Preload Script

```typescript
// src/main/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  // Terminal
  execute: (tabId: string, text: string) =>
    ipcRenderer.invoke('terminal:execute', tabId, text),
  cancel: (tabId: string) =>
    ipcRenderer.invoke('terminal:cancel', tabId),
  onChunk: (callback: (tabId: string, text: string) => void) =>
    ipcRenderer.on('terminal:chunk', (_, tabId, text) => callback(tabId, text)),
  onStatus: (callback: (tabId: string, event: StatusEvent) => void) =>
    ipcRenderer.on('terminal:status', (_, tabId, event) => callback(tabId, event)),
  onDone: (callback: (tabId: string, response: string) => void) =>
    ipcRenderer.on('terminal:done', (_, tabId, response) => callback(tabId, response)),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSetting: (key: string, value: any) =>
    ipcRenderer.invoke('settings:set', key, value),

  // Credentials
  storeCredential: (key: string, value: string) =>
    ipcRenderer.invoke('credentials:store', key, value),
  getCredential: (key: string) =>
    ipcRenderer.invoke('credentials:get', key),
  deleteCredential: (key: string) =>
    ipcRenderer.invoke('credentials:delete', key),
  exportCredentials: (passphrase: string, filePath: string) =>
    ipcRenderer.invoke('credentials:export', passphrase, filePath),
  importCredentials: (passphrase: string, filePath: string) =>
    ipcRenderer.invoke('credentials:import', passphrase, filePath),

  // OAuth
  startOAuth: (provider: string) =>
    ipcRenderer.invoke('oauth:start', provider),
  onOAuthCallback: (callback: (provider: string, result: OAuthResult) => void) =>
    ipcRenderer.on('oauth:callback', (_, provider, result) => callback(provider, result)),

  // Tabs
  saveTabs: (tabs: TabState[]) =>
    ipcRenderer.invoke('tabs:save', tabs),
  loadTabs: () =>
    ipcRenderer.invoke('tabs:load'),

  // Triggers
  listTriggers: () =>
    ipcRenderer.invoke('triggers:list'),
  onTriggerEvent: (callback: (event: TriggerEvent) => void) =>
    ipcRenderer.on('triggers:event', (_, event) => callback(event)),

  // App
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  onUpdateAvailable: (callback: (version: string) => void) =>
    ipcRenderer.on('app:update-available', (_, version) => callback(version)),

  // Cleanup
  removeAllListeners: (channel: string) =>
    ipcRenderer.removeAllListeners(channel),
});
```

### 3.2 Type Definitions

```typescript
// src/shared/types.ts

interface StatusEvent {
  type: 'thinking' | 'thinking_text' | 'reasoning' | 'tool_call'
      | 'tool_result' | 'responding' | 'context_compacted' | 'security_blocked';
  text?: string;
  name?: string;
  input?: Record<string, any>;
  result?: string;
  duration?: number;
  from?: number;
  to?: number;
  tool?: string;
  reason?: string;
}

interface TabState {
  id: string;
  label: string;
  history: Message[];
  scrollPosition: number;
  createdAt: string;
  lastActiveAt: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface OAuthResult {
  success: boolean;
  provider: string;
  error?: string;
}

interface TriggerEvent {
  triggerId: string;
  triggerName: string;
  type: string;
  data: any;
  timestamp: string;
}

interface AppSettings {
  ai: {
    backend: 'claude' | 'openai' | 'local';
    provider: 'anthropic' | 'openai' | 'google' | 'ollama' | 'custom';
    model: string;
    localModelUrl?: string;
  };
  appearance: {
    theme: 'midnight' | 'daylight' | 'focus';
    fontSize: number;
  };
  hotkey: string;
  onboardingComplete: boolean;
  license: {
    key?: string;
    tier: 'free' | 'pro';
    validatedAt?: string;
  };
}

interface AppInfo {
  version: string;
  platform: NodeJS.Platform;
  arch: string;
  licenseTier: 'free' | 'pro';
  aiBackend: string;
  aiModel: string;
}
```

---

## 4. Credential Storage

### 4.1 safeStorage API

```typescript
// src/main/credentials.ts
import { safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const CREDENTIALS_DIR = path.join(app.getPath('userData'), 'credentials');

class CredentialStore {
  store(key: string, value: string): void {
    const encrypted = safeStorage.encryptString(value);
    fs.writeFileSync(path.join(CREDENTIALS_DIR, key), encrypted);
  }

  get(key: string): string | null {
    const filePath = path.join(CREDENTIALS_DIR, key);
    if (!fs.existsSync(filePath)) return null;
    const encrypted = fs.readFileSync(filePath);
    return safeStorage.decryptString(encrypted);
  }

  delete(key: string): void {
    const filePath = path.join(CREDENTIALS_DIR, key);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  list(): string[] {
    if (!fs.existsSync(CREDENTIALS_DIR)) return [];
    return fs.readdirSync(CREDENTIALS_DIR);
  }
}
```

### 4.2 Credential Backup

Export uses AES-256-GCM with PBKDF2 key derivation:

```typescript
export(passphrase: string, outputPath: string): void {
  const salt = crypto.randomBytes(32);
  const iv = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(passphrase, salt, 100000, 32, 'sha512');

  const credentials: Record<string, string> = {};
  for (const name of this.list()) {
    credentials[name] = this.get(name)!;
  }

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(credentials), 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // File format: version(1) + salt(32) + iv(16) + authTag(16) + encrypted(N)
  const output = Buffer.concat([
    Buffer.from([1]),  // version byte
    salt, iv, authTag, encrypted,
  ]);

  fs.writeFileSync(outputPath, output);
}
```

---

## 5. Protocol Handler (OAuth)

### 5.1 Registration

Electron registers `jeriko://` as a custom protocol:

```typescript
// In main process, before app.ready
if (process.defaultApp) {
  app.setAsDefaultProtocolClient('jeriko', process.execPath, [path.resolve(process.argv[1])]);
} else {
  app.setAsDefaultProtocolClient('jeriko');
}
```

### 5.2 OAuth Flow

```
1. User clicks "Connect with Google" in terminal
2. Main process: opens browser to Google OAuth URL
   - redirect_uri = jeriko://oauth/google/callback
   - state = random nonce (CSRF protection)
   - scope = drive.readonly (or appropriate scope)
3. User approves in browser
4. Browser redirects to jeriko://oauth/google/callback?code=XXX&state=YYY
5. OS routes jeriko:// URL to Electron
6. Electron receives via app.on('open-url') (macOS) or second-instance (Windows/Linux)
7. Main process: validates state nonce, exchanges code for tokens
8. Tokens stored via CredentialStore
9. Renderer notified via oauth:callback IPC
10. Terminal shows "Google Drive connected" and resumes original command
```

### 5.3 Platform Differences

| Platform | Protocol Registration | URL Handling |
|----------|----------------------|-------------|
| macOS | Info.plist CFBundleURLTypes | `app.on('open-url', handler)` |
| Windows | Registry HKCU\Software\Classes\jeriko | `app.on('second-instance', handler)` |
| Linux | .desktop file with MimeType | `app.on('second-instance', handler)` |

On Windows and Linux, the URL comes through the second-instance event because the OS launches a new Electron instance which passes the URL to the existing one via `app.requestSingleInstanceLock()`.

---

## 6. Webhook Relay

### 6.1 Architecture

```
┌──────────────┐     HTTPS      ┌──────────────────────┐
│ Stripe       ├───────────────►│                      │
│ GitHub       │                │  relay.jeriko.dev    │
│ Custom hooks │                │                      │
└──────────────┘                │  Express (inbound)   │
                                │  WebSocket (outbound)│
                                │  Redis (queue)       │
                                │  PostgreSQL (state)  │
                                └──────────┬───────────┘
                                           │
                                    WebSocket (persistent)
                                           │
                                ┌──────────▼───────────┐
                                │  Electron App         │
                                │  (user's machine)     │
                                │                       │
                                │  triggers/engine.js   │
                                └───────────────────────┘
```

### 6.2 Relay Registration

When user creates a webhook trigger:

```javascript
// Main process → relay
const response = await fetch('https://relay.jeriko.dev/register', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${licenseKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    triggerId: trigger.id,
    source: 'stripe',  // for signature verification
    secret: trigger.webhookSecret,  // optional, for HMAC verification
  }),
});

const { webhookUrl } = await response.json();
// webhookUrl = "https://relay.jeriko.dev/hooks/{userId}/{triggerId}"
```

### 6.3 Relay → App Communication

```javascript
// Main process — persistent WebSocket to relay
const ws = new WebSocket('wss://relay.jeriko.dev/stream', {
  headers: { 'Authorization': `Bearer ${licenseKey}` },
});

ws.on('message', (data) => {
  const event = JSON.parse(data);
  // { triggerId, payload, headers, timestamp }
  triggers.engine.fireTrigger(event.triggerId, event.payload);
});

// Reconnect with exponential backoff on disconnect
```

### 6.4 Offline Queue

If the user's app is disconnected:
- Relay queues events in Redis with 24h TTL
- Maximum 100 queued events per user
- On reconnect: relay flushes queue in chronological order
- Events older than 24h are dropped with a log entry

### 6.5 Relay Server Spec

Minimal infrastructure:
- Node.js + Express + ws
- Redis for event queue (TTL-based)
- PostgreSQL for user → webhook mappings
- Single VPS ($20/month handles 10K users)
- Scale to load balancer + multiple instances when needed

---

## 7. Go Binary Integration

### 7.1 Bundle Location

```
terminal/
└── resources/
    └── binaries/
        ├── parallel-darwin-arm64
        ├── parallel-darwin-x64
        ├── parallel-linux-x64
        └── parallel-win32-x64.exe
```

electron-builder config packages only the target platform's binary:

```yaml
# electron-builder.yml
extraResources:
  - from: "resources/binaries/parallel-${platform}-${arch}"
    to: "binaries/parallel"
```

### 7.2 Path Resolution

```typescript
// src/main/binary.ts
import { app } from 'electron';
import * as path from 'path';

export function getParallelBinaryPath(): string {
  const ext = process.platform === 'win32' ? '.exe' : '';
  const name = `parallel${ext}`;

  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'binaries', name);
  } else {
    const platformArch = `${process.platform}-${process.arch}`;
    return path.join(__dirname, '..', '..', 'resources', 'binaries',
      `parallel-${platformArch}${ext}`);
  }
}
```

### 7.3 Spawning

```typescript
import { execFile } from 'child_process';

function runParallel(tasks: ParallelTask[]): Promise<ParallelResult[]> {
  const binaryPath = getParallelBinaryPath();

  // Generate session token for binary authentication
  const timestamp = Date.now().toString();
  const token = crypto.createHmac('sha256', process.env.NODE_AUTH_SECRET || 'dev')
    .update(timestamp)
    .digest('hex');

  return new Promise((resolve, reject) => {
    const child = execFile(binaryPath, [], {
      env: {
        ...process.env,
        PARALLEL_SESSION_TOKEN: token,
        PARALLEL_SESSION_TIMESTAMP: timestamp,
      },
      timeout: 300000,  // 5 min max
    });

    child.stdin.write(JSON.stringify(tasks));
    child.stdin.end();

    let output = '';
    child.stdout.on('data', (data) => { output += data; });
    child.on('close', (code) => {
      if (code === 0) resolve(JSON.parse(output));
      else reject(new Error(`Parallel engine exited with code ${code}`));
    });
  });
}
```

### 7.4 Binary Authentication

The Go binary validates the session token before executing:

```go
func validateSession() bool {
    token := os.Getenv("PARALLEL_SESSION_TOKEN")
    timestamp := os.Getenv("PARALLEL_SESSION_TIMESTAMP")
    secret := os.Getenv("NODE_AUTH_SECRET")

    // Check timestamp is within 60 seconds
    ts, _ := strconv.ParseInt(timestamp, 10, 64)
    if time.Now().UnixMilli()-ts > 60000 {
        return false
    }

    // Verify HMAC
    mac := hmac.New(sha256.New, []byte(secret))
    mac.Write([]byte(timestamp))
    expected := hex.EncodeToString(mac.Sum(nil))
    return hmac.Equal([]byte(token), []byte(expected))
}
```

---

## 8. Update Mechanism

### 8.1 Strategy: Monolithic Differential Updates

Every release ships the complete app. Electron's autoUpdater uses differential downloads (ASAR diff), so engine-only changes produce 5-20MB deltas, not 250MB full downloads.

### 8.2 Update Flow

```
1. autoUpdater.checkForUpdatesAndNotify() — runs every 6 hours
2. If update available: downloads delta in background
3. Download complete: renderer notified via app:update-available IPC
4. Terminal shows: "Update available (v1.1.0). [Restart now] [Later]"
5. If user clicks "Restart now": autoUpdater.quitAndInstall()
6. If "Later": update applies on next natural app restart
```

### 8.3 Update Server

Updates hosted on Cloudflare R2 (or GitHub Releases):

```
https://releases.jeriko.dev/
├── latest-mac.yml          ← macOS update manifest
├── latest-linux.yml        ← Linux update manifest
├── latest.yml              ← Windows update manifest
├── Jeriko-1.0.0-arm64.dmg  ← macOS Apple Silicon
├── Jeriko-1.0.0-x64.dmg    ← macOS Intel
├── Jeriko-1.0.0.exe        ← Windows installer
├── Jeriko-1.0.0.AppImage   ← Linux
└── Jeriko-1.0.0-arm64-mac.zip  ← macOS auto-update zip (differential)
```

### 8.4 Critical Updates

For security patches:
- Update server can mark a release as `critical: true`
- On check: if critical update available, show non-dismissible prompt
- App continues to function but shows persistent banner until updated
- No forced auto-restart — user always in control

---

## 9. File Structure

```
jeriko/
├── terminal/                           ← NEW: Electron app
│   ├── package.json                    ← Electron + React dependencies
│   ├── tsconfig.json                   ← TypeScript config
│   ├── electron-builder.yml            ← Build/packaging config
│   ├── vite.config.ts                  ← Vite config for renderer
│   │
│   ├── src/
│   │   ├── main/                       ← Electron main process
│   │   │   ├── index.ts                ← App entry: window, tray, lifecycle
│   │   │   ├── preload.ts              ← contextBridge API exposure
│   │   │   ├── engine.ts               ← Jeriko engine wrapper
│   │   │   ├── ipc.ts                  ← IPC handler registration
│   │   │   ├── credentials.ts          ← safeStorage wrapper + backup
│   │   │   ├── settings.ts             ← Settings store (electron-store)
│   │   │   ├── protocol.ts             ← jeriko:// protocol handler
│   │   │   ├── hotkey.ts               ← Global shortcut registration
│   │   │   ├── tray.ts                 ← System tray icon + menu
│   │   │   ├── updater.ts              ← Auto-update logic
│   │   │   ├── binary.ts               ← Go binary path resolution
│   │   │   ├── relay.ts                ← WebSocket to relay.jeriko.dev
│   │   │   └── tabs.ts                 ← Tab state persistence
│   │   │
│   │   ├── renderer/                   ← React UI
│   │   │   ├── index.html              ← HTML entry point
│   │   │   ├── index.tsx               ← React entry point
│   │   │   ├── App.tsx                 ← Root component
│   │   │   │
│   │   │   ├── components/
│   │   │   │   ├── TitleBar.tsx        ← Custom title bar
│   │   │   │   ├── TabBar.tsx          ← Tab management
│   │   │   │   ├── OutputArea.tsx      ← Scrollable output container
│   │   │   │   ├── PromptInput.tsx     ← Command input with cursor
│   │   │   │   ├── OnboardingScreen.tsx← First-launch AI selection
│   │   │   │   ├── SettingsOverlay.tsx ← Settings panel
│   │   │   │   ├── WelcomeMessage.tsx  ← "Try: ..." suggestions
│   │   │   │   │
│   │   │   │   └── output/             ← Output block components
│   │   │   │       ├── CommandBlock.tsx         ← User input echo
│   │   │   │       ├── ThinkingIndicator.tsx    ← Pulsing "Thinking..."
│   │   │   │       ├── ReasoningBlock.tsx       ← Collapsible AI reasoning
│   │   │   │       ├── ToolCallCard.tsx         ← "Running: X..."
│   │   │   │       ├── ToolResultBlock.tsx      ← Result router → sub-components
│   │   │   │       ├── StreamedResponse.tsx     ← Character-by-character text
│   │   │   │       ├── ConfirmationPrompt.tsx   ← Destructive action confirm
│   │   │   │       ├── IntegrationSetup.tsx     ← Inline integration connect
│   │   │   │       ├── SecurityWarning.tsx      ← Blocked command warning
│   │   │   │       ├── ErrorRecovery.tsx        ← Friendly error + suggestions
│   │   │   │       ├── FileListResult.tsx       ← File cards
│   │   │   │       ├── FileActionCard.tsx       ← File created/edited card
│   │   │   │       ├── CodeBlock.tsx            ← Syntax-highlighted code
│   │   │   │       ├── SearchResults.tsx        ← Grep match results
│   │   │   │       ├── WebSearchResults.tsx     ← Web search cards
│   │   │   │       ├── SystemInfoResult.tsx     ← Gauges and meters
│   │   │   │       ├── ImagePreview.tsx         ← Inline image display
│   │   │   │       ├── ParallelResults.tsx      ← Multi-task results
│   │   │   │       ├── WhileYouWereAway.tsx     ← Trigger event summary
│   │   │   │       └── UpgradePrompt.tsx        ← Pro feature gate
│   │   │   │
│   │   │   ├── hooks/
│   │   │   │   ├── useJeriko.ts        ← Engine communication hook
│   │   │   │   ├── useTabs.ts          ← Tab state management
│   │   │   │   ├── useSettings.ts      ← Settings read/write
│   │   │   │   ├── useCommandHistory.ts← Up/down arrow history
│   │   │   │   └── useTheme.ts         ← Theme CSS variables
│   │   │   │
│   │   │   ├── styles/
│   │   │   │   ├── global.css          ← Reset, base styles, animations
│   │   │   │   └── themes.ts           ← Theme color definitions
│   │   │   │
│   │   │   └── lib/
│   │   │       ├── types.ts            ← Renderer-specific types
│   │   │       └── format.ts           ← Output formatting utilities
│   │   │
│   │   └── shared/
│   │       ├── types.ts                ← Types shared between processes
│   │       └── constants.ts            ← IPC channel names, limits
│   │
│   └── resources/
│       ├── icon.icns                   ← macOS app icon
│       ├── icon.ico                    ← Windows app icon
│       ├── icon.png                    ← Linux app icon (512x512)
│       ├── fonts/
│       │   └── JetBrainsMono-Regular.woff2
│       └── binaries/
│           ├── parallel-darwin-arm64
│           ├── parallel-darwin-x64
│           ├── parallel-linux-x64
│           └── parallel-win32-x64.exe
│
├── server/                             ← EXISTING: Jeriko engine
│   ├── router.js                       ← Imported by terminal/src/main/engine.ts
│   ├── context.js                      ← Conversation persistence
│   ├── tools.js                        ← Tool definitions + execution
│   ├── security.js                     ← Validation
│   ├── logger.js                       ← Logging
│   └── triggers/                       ← Trigger engine
│
├── bin/                                ← EXISTING: 49 CLI commands
├── lib/                                ← EXISTING: Shared infrastructure
├── tools/                              ← EXISTING: Tool implementations
└── runtime/                            ← EXISTING: Go parallel engine
```

---

## 10. Platform-Specific Command Matrix

### 10.1 Cross-Platform Commands (Work Everywhere)

| Command | Implementation | Notes |
|---|---|---|
| `fs` | Node.js `fs` | Full cross-platform |
| `exec` | Node.js `child_process` | Shell differences handled |
| `search` | DuckDuckGo API | Network only |
| `browse` | Playwright | Cross-platform |
| `screenshot` | Platform-specific (see below) | Abstracted |
| `sys` | `systeminformation` | Cross-platform library |
| `email` / `mail` | IMAP/SMTP | Cross-platform |
| `notify` | `node-notifier` | Cross-platform |
| `stripe` | Stripe API | Network only |
| `github` | GitHub API | Network only |
| `vercel` | Vercel API | Network only |
| `gdrive` | Google API | Network only |
| `onedrive` | Microsoft API | Network only |
| `paypal` | PayPal API | Network only |
| `twilio` | Twilio API | Network only |
| `x` | X API | Network only |
| `memory` | Node.js file ops | Cross-platform |
| `discover` | Node.js file ops | Cross-platform |
| `parallel` | Go binary | Platform binaries bundled |
| `code` | AI code generation | Cross-platform |
| `create` | Template scaffolding | Cross-platform |
| `doc` | AI documentation | Cross-platform |
| `ai` | Direct AI query | Cross-platform |
| `prompt` | System prompt gen | Cross-platform |
| `net` | `systeminformation` | Cross-platform |
| `proc` | `systeminformation` | Cross-platform |
| `open` | `shell.openPath` (Electron) | Cross-platform via Electron |

### 10.2 Platform-Specific Commands

| Command | macOS | Windows | Linux |
|---|---|---|---|
| `screenshot` | `screencapture` | PowerShell | `gnome-screenshot`/`scrot` |
| `notes` | AppleScript | Not available | Not available |
| `remind` | AppleScript | Not available | Not available |
| `calendar` | AppleScript | PowerShell (Outlook) | Not available |
| `contacts` | AppleScript | PowerShell (Outlook) | Not available |
| `msg` (iMessage) | AppleScript | Not available | Not available |
| `music` | AppleScript (Music.app) | PowerShell | `playerctl` |
| `audio` | `osascript` volume | `nircmd`/PowerShell | `amixer`/`pactl` |
| `camera` | `imagesnap` | PowerShell | `fswebcam` |
| `clipboard` | `pbcopy`/`pbpaste` | `clip`/PowerShell | `xclip`/`wl-copy` |
| `window` | AppleScript | PowerShell | `wmctrl`/`xdotool` |
| `location` | CoreLocation | Windows.Devices | Not available |

### 10.3 Graceful Degradation

When a command is not available on the current platform:

```typescript
// In engine.ts
function isCommandAvailable(command: string): boolean {
  const platformCommands: Record<string, NodeJS.Platform[]> = {
    notes: ['darwin'],
    remind: ['darwin'],
    calendar: ['darwin', 'win32'],
    contacts: ['darwin', 'win32'],
    msg: ['darwin'],
    location: ['darwin', 'win32'],
  };
  const supported = platformCommands[command];
  if (!supported) return true;  // Not platform-specific = available
  return supported.includes(process.platform);
}
```

When unavailable, the AI is informed via system prompt injection and responds with alternatives.

---

## 11. Data Storage Locations

```
~/.jeriko/terminal/                    ← App data (Electron userData)
├── settings.json                      ← App settings
├── credentials/                       ← safeStorage encrypted files
│   ├── anthropic_api_key
│   ├── openai_api_key
│   ├── stripe_secret_key
│   ├── google_drive_tokens
│   └── ...
├── conversations/                     ← Tab conversation history
│   ├── {tabId}.jsonl
│   └── {tabId}.meta.json
├── history.jsonl                      ← Global command history
├── tabs.json                          ← Tab state for restoration
├── data/                              ← Jeriko data directory
│   ├── memory.json                    ← KV store
│   ├── session.jsonl                  ← Session log
│   ├── triggers.json                  ← Trigger definitions
│   ├── trigger-log.json               ← Trigger execution log
│   └── agent.log                      ← Agent activity log
└── logs/
    └── app.log                        ← Electron app logs
```

---

## 12. Security Model

### 12.1 Electron Security Checklist

| Setting | Value | Why |
|---|---|---|
| `nodeIntegration` | `false` | Renderer cannot access Node.js |
| `contextIsolation` | `true` | Renderer has no access to Electron internals |
| `sandbox` | `true` | Renderer runs in Chromium sandbox |
| `webSecurity` | `true` | Same-origin policy enforced |
| `allowRunningInsecureContent` | `false` | No mixed HTTP/HTTPS |
| `enableRemoteModule` | `false` | Deprecated remote module disabled |
| CSP header | `default-src 'self'` | Only load local resources |

### 12.2 IPC Security

- All IPC goes through contextBridge (preload script)
- Input validation on every IPC handler in main process
- No arbitrary code execution from renderer
- Credential operations are main-process only — renderer never sees raw keys
- File paths validated against allowed directories before operations

### 12.3 Command Security

Inherited from Jeriko:
- `security.js` validates all tool calls
- Dangerous commands blocked (rm -rf /, sudo, etc.)
- File access limited to user's home, /tmp, /var/tmp
- Secret redaction in logs
