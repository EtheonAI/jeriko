# Phase 1: The Shell

**Duration:** Week 1-2
**Goal:** User can download, open, choose AI provider, type natural language, and get streamed AI responses with basic tabs.

---

## Objectives

1. Electron app scaffolding with Vite + React + TypeScript
2. Custom frameless window with custom title bar
3. PromptInput component (history, cursor, keyboard shortcuts)
4. OutputArea component (scrollable, renders text blocks)
5. IPC bridge between renderer and main process
6. Jeriko engine (router.js) imported and callable from main process
7. Basic streaming: onChunk and onStatus events forwarded to renderer
8. Onboarding screen: choose Cloud AI or Local AI, enter API key
9. Credential storage via safeStorage
10. Settings store (electron-store) for preferences
11. Basic tabs: new tab, close tab, switch tabs, tab persistence
12. Mac .dmg packaging via electron-builder

---

## Prerequisites

- Node.js >= 18
- npm or pnpm
- Jeriko codebase at `../` (parent directory)
- macOS for initial development and testing

---

## Step 1: Project Scaffolding

### 1.1 Initialize the terminal directory

```bash
cd jeriko
mkdir terminal && cd terminal
npm init -y
```

### 1.2 Install dependencies

```bash
# Electron + build tools
npm install --save-dev electron electron-builder vite @vitejs/plugin-react typescript

# React
npm install react react-dom

# TypeScript types
npm install --save-dev @types/react @types/react-dom @types/node

# Utilities
npm install electron-store uuid
npm install --save-dev @electron/rebuild
```

### 1.3 package.json

```json
{
  "name": "jeriko-terminal",
  "version": "1.0.0",
  "description": "Jeriko Terminal — The world's smartest terminal",
  "main": "dist/main/index.js",
  "scripts": {
    "dev": "vite build --mode development && electron .",
    "dev:renderer": "vite dev",
    "build": "tsc -p tsconfig.main.json && vite build",
    "package": "npm run build && electron-builder",
    "package:mac": "npm run build && electron-builder --mac",
    "package:win": "npm run build && electron-builder --win",
    "package:linux": "npm run build && electron-builder --linux"
  },
  "build": {
    "appId": "dev.jeriko.terminal",
    "productName": "Jeriko",
    "directories": {
      "output": "release"
    },
    "files": [
      "dist/**/*",
      "node_modules/**/*"
    ],
    "extraResources": [
      {
        "from": "../bin",
        "to": "engine/bin",
        "filter": ["**/*"]
      },
      {
        "from": "../server",
        "to": "engine/server",
        "filter": ["**/*"]
      },
      {
        "from": "../lib",
        "to": "engine/lib",
        "filter": ["**/*"]
      },
      {
        "from": "../tools",
        "to": "engine/tools",
        "filter": ["**/*"]
      },
      {
        "from": "../runtime",
        "to": "engine/runtime",
        "filter": ["parallel-engine", "main.go", "go.mod"]
      },
      {
        "from": "../templates",
        "to": "engine/templates",
        "filter": ["**/*"]
      },
      {
        "from": "../AGENT.md",
        "to": "engine/AGENT.md"
      },
      {
        "from": "../.env.example",
        "to": "engine/.env.example"
      },
      {
        "from": "../package.json",
        "to": "engine/package.json"
      },
      {
        "from": "resources/fonts",
        "to": "fonts"
      }
    ],
    "mac": {
      "category": "public.app-category.productivity",
      "icon": "resources/icon.icns",
      "target": [
        { "target": "dmg", "arch": ["arm64", "x64"] }
      ],
      "hardenedRuntime": true,
      "gatekeeperAssess": false
    },
    "win": {
      "icon": "resources/icon.ico",
      "target": ["nsis"]
    },
    "linux": {
      "icon": "resources/icon.png",
      "target": ["AppImage"],
      "category": "Utility"
    },
    "protocols": [
      {
        "name": "Jeriko Protocol",
        "schemes": ["jeriko"]
      }
    ]
  }
}
```

### 1.4 TypeScript configs

**tsconfig.main.json** (main process):
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "outDir": "dist/main",
    "rootDir": "src/main",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": true,
    "types": ["node"]
  },
  "include": ["src/main/**/*", "src/shared/**/*"]
}
```

**tsconfig.json** (renderer — used by Vite):
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "types": ["node"],
    "paths": {
      "@/*": ["./src/renderer/*"],
      "@shared/*": ["./src/shared/*"]
    }
  },
  "include": ["src/renderer/**/*", "src/shared/**/*"]
}
```

### 1.5 Vite config

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: 'src/renderer',
  base: './',
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
});
```

---

## Step 2: Main Process

### 2.1 src/main/index.ts — App Entry Point

Core responsibilities:
- Create BrowserWindow (frameless on macOS, custom title bar)
- Register IPC handlers
- Register global shortcut
- Register jeriko:// protocol
- Handle app lifecycle (ready, activate, window-all-closed)
- Single instance lock

Key configuration:
```typescript
const mainWindow = new BrowserWindow({
  width: 900,
  height: 650,
  minWidth: 600,
  minHeight: 400,
  titleBarStyle: 'hiddenInset',  // macOS: native traffic lights
  trafficLightPosition: { x: 16, y: 16 },
  frame: process.platform === 'darwin' ? true : false,  // Custom frame on Win/Linux
  backgroundColor: '#0d1117',  // Midnight theme background
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  },
});
```

Window states to handle:
- `app.requestSingleInstanceLock()` — only one instance
- `app.on('second-instance')` — handle protocol URLs on Windows/Linux
- `app.on('open-url')` — handle protocol URLs on macOS
- `app.on('before-quit')` — save tab state
- `mainWindow.on('close')` — hide instead of quit (for tray behavior)

### 2.2 src/main/preload.ts — Context Bridge

Exposes `window.api` to renderer. See ARCHITECTURE.md Section 3.1 for full specification.

Must be compiled separately (not bundled by Vite) since it runs in the preload context.

### 2.3 src/main/engine.ts — Jeriko Engine Wrapper

This is the bridge between Electron and the Jeriko engine.

```typescript
// Resolve engine path (dev vs packaged)
function getEnginePath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'engine');
  }
  return path.join(__dirname, '..', '..');  // jeriko/ root
}

// Set up environment before importing engine
function initializeEngine(settings: AppSettings, credentials: CredentialStore): void {
  const enginePath = getEnginePath();

  process.env.JERIKO_ROOT = enginePath;
  process.env.JERIKO_DATA_DIR = path.join(app.getPath('userData'), 'data');

  // AI backend from settings
  process.env.AI_BACKEND = mapProviderToBackend(settings.ai.provider);
  process.env.CLAUDE_MODEL = settings.ai.model;
  process.env.OPENAI_MODEL = settings.ai.model;
  process.env.LOCAL_MODEL_URL = settings.ai.localModelUrl || 'http://localhost:11434/v1';

  // API keys from safeStorage
  const anthropicKey = credentials.get('anthropic_api_key');
  if (anthropicKey) process.env.ANTHROPIC_API_KEY = anthropicKey;

  const openaiKey = credentials.get('openai_api_key');
  if (openaiKey) process.env.OPENAI_API_KEY = openaiKey;

  // Ensure data directory exists
  const dataDir = process.env.JERIKO_DATA_DIR;
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

// Map UI provider names to AI_BACKEND values
function mapProviderToBackend(provider: string): string {
  switch (provider) {
    case 'anthropic': return 'claude';
    case 'openai': return 'openai';
    case 'ollama':
    case 'custom': return 'local';
    default: return 'claude';
  }
}

// Import and wrap the route function
function createEngine() {
  const routerPath = path.join(getEnginePath(), 'server', 'router');
  const { route } = require(routerPath);
  return { route };
}
```

### 2.4 src/main/ipc.ts — IPC Handler Registration

```typescript
function registerIpcHandlers(
  mainWindow: BrowserWindow,
  engine: Engine,
  credentials: CredentialStore,
  settings: SettingsStore,
) {
  // Per-tab conversation histories
  const tabHistories = new Map<string, any[]>();

  // Terminal: execute command
  ipcMain.handle('terminal:execute', async (_, tabId: string, text: string) => {
    if (!tabHistories.has(tabId)) tabHistories.set(tabId, []);
    const history = tabHistories.get(tabId)!;

    try {
      const response = await engine.route(
        text,
        // onChunk: stream text to renderer
        (chunk: string) => {
          mainWindow.webContents.send('terminal:chunk', tabId, chunk);
        },
        // onStatus: forward status events
        (status: any) => {
          mainWindow.webContents.send('terminal:status', tabId, status);
        },
        history,
      );

      mainWindow.webContents.send('terminal:done', tabId, response);
      return { ok: true };
    } catch (err: any) {
      mainWindow.webContents.send('terminal:done', tabId, `Error: ${err.message}`);
      return { ok: false, error: err.message };
    }
  });

  // Terminal: cancel
  ipcMain.handle('terminal:cancel', async (_, tabId: string) => {
    // TODO: implement cancellation via AbortController when router.js supports it
    return { ok: true };
  });

  // Settings
  ipcMain.handle('settings:get', () => settings.getAll());
  ipcMain.handle('settings:set', (_, key: string, value: any) => {
    settings.set(key, value);
    // If AI settings changed, reinitialize engine
    if (key.startsWith('ai.')) {
      initializeEngine(settings.getAll(), credentials);
    }
    return { ok: true };
  });

  // Credentials
  ipcMain.handle('credentials:store', (_, key: string, value: string) => {
    credentials.store(key, value);
    return { ok: true };
  });
  ipcMain.handle('credentials:get', (_, key: string) => {
    return credentials.get(key);
  });
  ipcMain.handle('credentials:delete', (_, key: string) => {
    credentials.delete(key);
    return { ok: true };
  });

  // Tabs
  ipcMain.handle('tabs:save', (_, tabs: any[]) => {
    settings.set('tabs', tabs);
    return { ok: true };
  });
  ipcMain.handle('tabs:load', () => {
    return settings.get('tabs') || [];
  });

  // App info
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    licenseTier: settings.get('license.tier') || 'free',
    aiBackend: process.env.AI_BACKEND,
    aiModel: process.env.CLAUDE_MODEL || process.env.OPENAI_MODEL || 'unknown',
  }));
}
```

### 2.5 src/main/credentials.ts

Full implementation as specified in ARCHITECTURE.md Section 4.

### 2.6 src/main/settings.ts

Uses `electron-store` for simple JSON persistence:

```typescript
import Store from 'electron-store';

const defaults: AppSettings = {
  ai: {
    backend: 'claude',
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
  },
  appearance: {
    theme: 'midnight',
    fontSize: 14,
  },
  hotkey: process.platform === 'darwin' ? 'CommandOrControl+Shift+Space' : 'Ctrl+Shift+Space',
  onboardingComplete: false,
  license: {
    tier: 'free',
  },
};

export function createSettingsStore() {
  return new Store<AppSettings>({ defaults });
}
```

---

## Step 3: Renderer — React App

### 3.1 src/renderer/index.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self';" />
  <title>Jeriko</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./index.tsx"></script>
</body>
</html>
```

### 3.2 src/renderer/index.tsx

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(<App />);
```

### 3.3 src/renderer/App.tsx — Root Component

```tsx
function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function init() {
      const s = await window.api.getSettings();
      setSettings(s);
      setIsReady(true);
    }
    init();
  }, []);

  if (!isReady || !settings) return null;

  if (!settings.onboardingComplete) {
    return <OnboardingScreen onComplete={handleOnboardingComplete} />;
  }

  return (
    <div className="app">
      <TitleBar settings={settings} />
      <TabBar />
      <OutputArea />
      <PromptInput />
      {showSettings && <SettingsOverlay onClose={() => setShowSettings(false)} />}
    </div>
  );
}
```

### 3.4 Components — PromptInput.tsx

The most important component. Must feel like a terminal prompt.

```tsx
function PromptInput({ onSubmit, isProcessing, disabled }) {
  const [value, setValue] = useState('');
  const [cursorPos, setCursorPos] = useState(0);
  const { history, navigateHistory } = useCommandHistory();
  const inputRef = useRef<HTMLDivElement>(null);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !isProcessing) {
        onSubmit(value.trim());
        history.push(value.trim());
        setValue('');
      }
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = navigateHistory('up');
      if (prev !== null) setValue(prev);
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = navigateHistory('down');
      if (next !== null) setValue(next);
    }
    if (e.key === 'c' && e.ctrlKey) {
      // Cancel current operation
      window.api.cancel(currentTabId);
    }
    if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      // Clear output
      onClear();
    }
    if (e.key === 'a' && e.ctrlKey) {
      e.preventDefault();
      setCursorPos(0);
    }
    if (e.key === 'e' && e.ctrlKey) {
      e.preventDefault();
      setCursorPos(value.length);
    }
    if (e.key === 'u' && e.ctrlKey) {
      e.preventDefault();
      setValue('');
      setCursorPos(0);
    }
  }

  return (
    <div className="prompt-container">
      <span className={`prompt-chevron ${isProcessing ? 'pulsing' : ''}`}>
        {'> '}
      </span>
      <div
        ref={inputRef}
        className="prompt-input"
        contentEditable={!disabled}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        suppressContentEditableWarning
      />
      {isProcessing && (
        <span className="prompt-status">Thinking...</span>
      )}
    </div>
  );
}
```

Key CSS for terminal feel:
```css
.prompt-container {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  background: var(--bg-primary);
  font-family: 'JetBrains Mono', monospace;
  font-size: var(--font-size);
}

.prompt-chevron {
  color: var(--accent);
  font-weight: bold;
  flex-shrink: 0;
  user-select: none;
}

.prompt-chevron.pulsing {
  animation: pulse 1.5s ease-in-out infinite;
}

.prompt-input {
  flex: 1;
  color: var(--text-primary);
  background: transparent;
  border: none;
  outline: none;
  font-family: inherit;
  font-size: inherit;
  line-height: 1.6;
  caret-color: var(--accent);
  caret-shape: block;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
```

### 3.5 Components — OutputArea.tsx

```tsx
function OutputArea({ blocks, isProcessing }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll to bottom on new content
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [blocks, autoScroll]);

  // Detect manual scroll (user scrolled up)
  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    setAutoScroll(isAtBottom);
  }

  return (
    <div className="output-area" ref={scrollRef} onScroll={handleScroll}>
      {blocks.length === 0 && <WelcomeMessage />}
      {blocks.map((block) => renderBlock(block))}
    </div>
  );
}

function renderBlock(block: OutputBlock) {
  switch (block.type) {
    case 'command': return <CommandBlock key={block.id} text={block.text} />;
    case 'thinking': return <ThinkingIndicator key={block.id} />;
    case 'reasoning': return <ReasoningBlock key={block.id} text={block.text} />;
    case 'tool_call': return <ToolCallCard key={block.id} name={block.name} />;
    case 'tool_result': return <ToolResultBlock key={block.id} {...block} />;
    case 'response': return <StreamedResponse key={block.id} text={block.text} />;
    case 'error': return <ErrorRecovery key={block.id} error={block.error} />;
    default: return <GenericResult key={block.id} text={block.text} />;
  }
}
```

### 3.6 Components — TabBar.tsx

```tsx
function TabBar() {
  const { tabs, activeTabId, createTab, closeTab, switchTab, renameTab } = useTabs();

  return (
    <div className="tab-bar">
      <button className="tab-new" onClick={createTab} title="New tab (Cmd+T)">+</button>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`tab ${tab.id === activeTabId ? 'active' : ''}`}
          onClick={() => switchTab(tab.id)}
          onDoubleClick={() => renameTab(tab.id)}
          onAuxClick={(e) => { if (e.button === 1) closeTab(tab.id); }}
        >
          <span className="tab-label">{tab.label}</span>
          <button
            className="tab-close"
            onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
```

### 3.7 Components — TitleBar.tsx

```tsx
function TitleBar({ settings, onSettingsClick }) {
  const appInfo = useAppInfo();

  return (
    <div className="title-bar">
      {/* macOS traffic lights sit in the hiddenInset area — leave space */}
      <div className="title-bar-drag-region">
        <span className="title-bar-text">Jeriko</span>
      </div>
      <div className="title-bar-right">
        <span className="title-bar-info dim">
          {appInfo?.aiModel || 'Connecting...'}
        </span>
        <span className={`title-bar-badge ${settings.license.tier}`}>
          {settings.license.tier === 'pro' ? 'Pro' : 'Free'}
        </span>
        <button className="title-bar-settings" onClick={onSettingsClick}>
          ⚙
        </button>
      </div>
    </div>
  );
}
```

### 3.8 Components — OnboardingScreen.tsx

```tsx
function OnboardingScreen({ onComplete }) {
  const [step, setStep] = useState<'choose' | 'cloud' | 'local'>('choose');
  const [provider, setProvider] = useState('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState('');

  async function handleCloudContinue() {
    setValidating(true);
    setError('');

    // Store the credential
    await window.api.storeCredential(`${provider}_api_key`, apiKey);

    // Update settings
    await window.api.setSetting('ai.provider', provider);
    await window.api.setSetting('ai.backend', provider === 'anthropic' ? 'claude' : provider);
    await window.api.setSetting('onboardingComplete', true);

    // Validate by attempting a simple call
    // (The engine will initialize with the new key)
    setValidating(false);
    onComplete();
  }

  if (step === 'choose') {
    return (
      <div className="onboarding">
        <div className="onboarding-content">
          <h1>Welcome to Jeriko.</h1>
          <p>To get started, choose how Jeriko thinks.</p>
          <div className="onboarding-cards">
            <button className="onboarding-card" onClick={() => setStep('cloud')}>
              <h3>Cloud AI</h3>
              <p>Claude, GPT-4</p>
              <p className="dim">Most powerful · Needs API key</p>
            </button>
            <button className="onboarding-card" onClick={() => setStep('local')}>
              <h3>Local AI</h3>
              <p>Ollama</p>
              <p className="dim">Private, free · Runs on device</p>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'cloud') {
    return (
      <div className="onboarding">
        <div className="onboarding-content">
          <button className="onboarding-back" onClick={() => setStep('choose')}>← Back</button>
          <h2>Choose your provider</h2>
          <div className="radio-group">
            <label><input type="radio" checked={provider === 'anthropic'} onChange={() => setProvider('anthropic')} /> Anthropic Claude (recommended)</label>
            <label><input type="radio" checked={provider === 'openai'} onChange={() => setProvider('openai')} /> OpenAI GPT-4</label>
          </div>
          <div className="input-group">
            <label>Your API key:</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={provider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
              autoFocus
            />
            <p className="dim">
              Don't have one? Get a key at {provider === 'anthropic' ? 'console.anthropic.com' : 'platform.openai.com'}
            </p>
            <p className="dim">Your key is encrypted and stored locally.</p>
          </div>
          {error && <p className="error">{error}</p>}
          <button
            className="button-primary"
            onClick={handleCloudContinue}
            disabled={!apiKey.trim() || validating}
          >
            {validating ? 'Validating...' : 'Continue'}
          </button>
        </div>
      </div>
    );
  }

  // Local AI step similar but checks for Ollama
  return <LocalAISetup onComplete={onComplete} onBack={() => setStep('choose')} />;
}
```

### 3.9 Components — SettingsOverlay.tsx (Phase 1: Basic)

```tsx
function SettingsOverlay({ onClose }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    window.api.getSettings().then(setSettings);
  }, []);

  async function updateSetting(key: string, value: any) {
    await window.api.setSetting(key, value);
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="settings-overlay">
      <div className="settings-panel">
        <div className="settings-header">
          <h2>Settings</h2>
          <button onClick={onClose}>×</button>
        </div>
        <div className="settings-content">
          {/* AI Provider section */}
          {/* Appearance section (theme, font size) */}
          {/* About section (version, check updates) */}
        </div>
      </div>
    </div>
  );
}
```

### 3.10 Hooks — useJeriko.ts

The main hook for engine communication:

```tsx
function useJeriko(tabId: string) {
  const [blocks, setBlocks] = useState<OutputBlock[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    // Listen for events from main process
    window.api.onStatus((eventTabId, status) => {
      if (eventTabId !== tabId) return;
      handleStatus(status);
    });

    window.api.onChunk((eventTabId, text) => {
      if (eventTabId !== tabId) return;
      handleChunk(text);
    });

    window.api.onDone((eventTabId, response) => {
      if (eventTabId !== tabId) return;
      setIsProcessing(false);
    });

    return () => {
      window.api.removeAllListeners('terminal:status');
      window.api.removeAllListeners('terminal:chunk');
      window.api.removeAllListeners('terminal:done');
    };
  }, [tabId]);

  async function execute(text: string) {
    setIsProcessing(true);
    // Add command echo block
    addBlock({ type: 'command', text, id: uuid() });
    // Execute via IPC
    await window.api.execute(tabId, text);
  }

  function handleStatus(status: StatusEvent) {
    switch (status.type) {
      case 'thinking':
        addBlock({ type: 'thinking', id: uuid() });
        break;
      case 'reasoning':
        addBlock({ type: 'reasoning', text: status.text, id: uuid() });
        break;
      case 'tool_call':
        addBlock({ type: 'tool_call', name: status.name, id: uuid() });
        break;
      case 'tool_result':
        replaceLastBlock((prev) =>
          prev.type === 'tool_call'
            ? { ...prev, type: 'tool_result', result: status.result, duration: status.duration }
            : prev
        );
        break;
      case 'responding':
        addBlock({ type: 'response', text: '', id: uuid() });
        break;
      case 'security_blocked':
        addBlock({ type: 'security_blocked', tool: status.tool, reason: status.reason, id: uuid() });
        break;
    }
  }

  function handleChunk(text: string) {
    // Append to last response block
    updateLastBlock((prev) =>
      prev.type === 'response'
        ? { ...prev, text: prev.text + text }
        : prev
    );
  }

  return { blocks, isProcessing, execute };
}
```

### 3.11 Hooks — useTabs.ts

```tsx
function useTabs() {
  const [tabs, setTabs] = useState<Tab[]>([{ id: uuid(), label: 'New Tab' }]);
  const [activeTabId, setActiveTabId] = useState(tabs[0].id);

  // Restore tabs on mount
  useEffect(() => {
    window.api.loadTabs().then((saved) => {
      if (saved && saved.length > 0) {
        setTabs(saved);
        setActiveTabId(saved[saved.length - 1].id);
      }
    });
  }, []);

  // Save tabs on change
  useEffect(() => {
    window.api.saveTabs(tabs);
  }, [tabs]);

  function createTab() {
    if (tabs.length >= 10) return;  // Max tabs
    const newTab = { id: uuid(), label: 'New Tab' };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  }

  function closeTab(tabId: string) {
    if (tabs.length <= 1) {
      // Can't close last tab — create new one
      const newTab = { id: uuid(), label: 'New Tab' };
      setTabs([newTab]);
      setActiveTabId(newTab.id);
      return;
    }
    const index = tabs.findIndex((t) => t.id === tabId);
    const newTabs = tabs.filter((t) => t.id !== tabId);
    setTabs(newTabs);
    if (activeTabId === tabId) {
      // Switch to adjacent tab
      const newIndex = Math.min(index, newTabs.length - 1);
      setActiveTabId(newTabs[newIndex].id);
    }
  }

  function switchTab(tabId: string) {
    setActiveTabId(tabId);
  }

  function renameTab(tabId: string, newLabel?: string) {
    setTabs((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, label: newLabel || t.label } : t))
    );
  }

  return { tabs, activeTabId, createTab, closeTab, switchTab, renameTab };
}
```

### 3.12 Hooks — useCommandHistory.ts

```tsx
function useCommandHistory() {
  const [history, setHistory] = useState<string[]>([]);
  const [position, setPosition] = useState(-1);

  function push(command: string) {
    setHistory((prev) => [...prev, command]);
    setPosition(-1);
  }

  function navigateHistory(direction: 'up' | 'down'): string | null {
    if (history.length === 0) return null;

    let newPos: number;
    if (direction === 'up') {
      newPos = position === -1 ? history.length - 1 : Math.max(0, position - 1);
    } else {
      if (position === -1) return null;
      newPos = position + 1;
      if (newPos >= history.length) {
        setPosition(-1);
        return '';
      }
    }

    setPosition(newPos);
    return history[newPos];
  }

  return { history: { push }, navigateHistory };
}
```

---

## Step 4: Styles

### 4.1 src/renderer/styles/global.css

```css
@font-face {
  font-family: 'JetBrains Mono';
  src: url('../../../resources/fonts/JetBrainsMono-Regular.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
}

:root {
  /* Midnight Theme */
  --bg-primary: #0d1117;
  --bg-secondary: #161b22;
  --bg-card: #161b22;
  --border: #30363d;
  --text-primary: #e6edf3;
  --text-secondary: #8b949e;
  --text-dim: #484f58;
  --accent: #58a6ff;
  --success: #3fb950;
  --warning: #d29922;
  --error: #f85149;
  --info: #58a6ff;
  --font-size: 14px;
  --font-family: 'JetBrains Mono', 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  --line-height: 1.6;
  --radius: 8px;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #root {
  height: 100%;
  overflow: hidden;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font-family);
  font-size: var(--font-size);
  line-height: var(--line-height);
  -webkit-font-smoothing: antialiased;
}

/* App layout */
.app {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* Title bar */
.title-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 40px;
  padding: 0 16px;
  padding-left: 80px; /* Space for macOS traffic lights */
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  -webkit-app-region: drag;
  user-select: none;
}

.title-bar button, .title-bar span {
  -webkit-app-region: no-drag;
}

.title-bar-text {
  font-weight: 600;
  font-size: 13px;
  color: var(--text-secondary);
}

.title-bar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.title-bar-info {
  font-size: 12px;
  color: var(--text-dim);
}

.title-bar-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--border);
  color: var(--text-secondary);
}

.title-bar-badge.pro {
  background: var(--accent);
  color: var(--bg-primary);
}

.title-bar-settings {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 16px;
  padding: 4px;
}

/* Tab bar */
.tab-bar {
  display: flex;
  align-items: center;
  height: 36px;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border);
  padding: 0 8px;
  overflow-x: auto;
  -webkit-app-region: drag;
}

.tab-bar::-webkit-scrollbar { display: none; }

.tab-new {
  -webkit-app-region: no-drag;
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 18px;
  cursor: pointer;
  padding: 4px 10px;
  border-radius: 4px;
  flex-shrink: 0;
}

.tab-new:hover { background: var(--bg-secondary); color: var(--text-primary); }

.tab {
  -webkit-app-region: no-drag;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  font-size: 12px;
  color: var(--text-dim);
  cursor: pointer;
  border-radius: 4px;
  flex-shrink: 0;
  max-width: 160px;
}

.tab:hover { background: var(--bg-secondary); color: var(--text-secondary); }

.tab.active {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.tab-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-close {
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 14px;
  cursor: pointer;
  padding: 0 2px;
  opacity: 0;
}

.tab:hover .tab-close { opacity: 1; }

/* Output area */
.output-area {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  scroll-behavior: smooth;
}

.output-area::-webkit-scrollbar { width: 6px; }
.output-area::-webkit-scrollbar-track { background: transparent; }
.output-area::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

/* Output blocks */
.output-block {
  margin-bottom: 16px;
  animation: fadeIn 150ms ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.command-block {
  color: var(--text-primary);
  padding: 4px 0;
}

.command-block .chevron {
  color: var(--accent);
  margin-right: 8px;
}

/* Cards */
.card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 16px;
  margin: 8px 0;
}

/* Prompt input */
.prompt-container {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  background: var(--bg-primary);
}

.prompt-chevron {
  color: var(--accent);
  font-weight: bold;
  margin-right: 8px;
  flex-shrink: 0;
}

.prompt-input {
  flex: 1;
  color: var(--text-primary);
  background: transparent;
  border: none;
  outline: none;
  font-family: var(--font-family);
  font-size: var(--font-size);
  line-height: var(--line-height);
  caret-color: var(--accent);
}

.prompt-status {
  color: var(--text-dim);
  font-size: 12px;
  margin-left: 12px;
}

/* Onboarding */
.onboarding {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  background: var(--bg-primary);
}

.onboarding-content {
  max-width: 480px;
  text-align: center;
}

.onboarding h1 {
  font-size: 28px;
  margin-bottom: 8px;
}

.onboarding p {
  color: var(--text-secondary);
  margin-bottom: 24px;
}

.onboarding-cards {
  display: flex;
  gap: 16px;
  justify-content: center;
}

.onboarding-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 24px;
  cursor: pointer;
  text-align: left;
  width: 200px;
  color: var(--text-primary);
  transition: border-color 0.15s;
}

.onboarding-card:hover {
  border-color: var(--accent);
}

.onboarding-card h3 {
  margin-bottom: 4px;
}

/* Settings overlay */
.settings-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.settings-panel {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 12px;
  width: 520px;
  max-height: 80vh;
  overflow-y: auto;
  padding: 24px;
}

/* Utilities */
.dim { color: var(--text-dim); }
.error { color: var(--error); }
.success { color: var(--success); }

.button-primary {
  background: var(--accent);
  color: var(--bg-primary);
  border: none;
  padding: 8px 24px;
  border-radius: 6px;
  font-family: var(--font-family);
  font-size: 14px;
  cursor: pointer;
  font-weight: 600;
}

.button-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

---

## Step 5: Build and Package

### 5.1 Development

```bash
cd terminal

# Build main process TypeScript
npx tsc -p tsconfig.main.json

# Build renderer with Vite
npx vite build

# Run Electron
npx electron .
```

Or for dev mode with hot reload:
```bash
# Terminal 1: Vite dev server for renderer
npx vite dev --port 5173

# Terminal 2: Electron pointing to dev server
VITE_DEV_SERVER_URL=http://localhost:5173 npx electron .
```

### 5.2 Package for macOS

```bash
npm run package:mac
# Output: release/Jeriko-1.0.0-arm64.dmg and Jeriko-1.0.0-x64.dmg
```

---

## Acceptance Criteria

Phase 1 is complete when ALL of the following are true:

- [ ] Electron app launches on macOS
- [ ] Frameless window with macOS traffic lights visible and functional
- [ ] Custom title bar shows "Jeriko" and gear icon
- [ ] First launch shows onboarding screen with Cloud AI / Local AI choice
- [ ] Cloud AI path: user can enter API key, key is validated, stored via safeStorage
- [ ] Local AI path: Ollama detected/not detected, model selection works
- [ ] After onboarding: terminal view with prompt `> _` and welcome message
- [ ] User can type text and press Enter to submit
- [ ] Text is sent to Jeriko engine via IPC
- [ ] AI response streams back character by character
- [ ] Status events (thinking, tool_call, tool_result) render as basic text blocks
- [ ] Up/Down arrow cycles command history
- [ ] Ctrl+C cancels current operation (or signals cancel intent)
- [ ] Ctrl+L clears output area
- [ ] Basic tabs: create new tab, close tab, switch tabs
- [ ] Tab labels auto-generated from first command
- [ ] Tabs persist between sessions
- [ ] Settings overlay opens/closes
- [ ] Settings: can change AI provider and API key
- [ ] Settings: can change font size
- [ ] .dmg builds successfully for macOS
- [ ] App installs and runs from Applications folder
- [ ] No console errors in production build
- [ ] Window resize works cleanly
- [ ] App icon displays correctly in dock

---

## Testing Plan

### Manual Tests (Phase 1)

1. **Fresh install**: Delete app data, launch, verify onboarding appears
2. **Cloud AI setup**: Enter valid Anthropic key, verify it's accepted
3. **Invalid key**: Enter garbage key, verify error message
4. **First command**: Type "hello", verify AI responds
5. **Streaming**: Type a complex query, verify response streams
6. **Tool usage**: Type "what's my system info", verify tool_call events appear
7. **History**: Submit 3 commands, use Up arrow to cycle through them
8. **Tabs**: Create new tab, verify independent context
9. **Tab persistence**: Create tabs, quit app, reopen, verify tabs restored
10. **Settings**: Open settings, change font size, verify it applies immediately
11. **Settings: AI switch**: Change provider in settings, verify next command uses new provider
12. **Window resize**: Resize to minimum, verify layout doesn't break
13. **Long output**: Generate very long response, verify scrolling works
14. **Auto-scroll**: Scroll up during output, verify auto-scroll stops. Scroll to bottom, verify it resumes
