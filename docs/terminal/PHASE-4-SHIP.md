# Phase 4: Cross-Platform + Polish + Ship

**Duration:** Week 7-8
**Depends on:** Phase 3 complete
**Goal:** Windows and Linux support, auto-updates, themes, RTL, performance optimization. Ship.

---

## Objectives

1. Windows .exe packaging and platform-specific adjustments
2. Linux .AppImage packaging and platform-specific adjustments
3. Platform-specific command handling and graceful degradation
4. Auto-updater with differential downloads
5. System tray behavior per platform
6. Three themes: Midnight, Daylight, Focus
7. RTL text support
8. Go binary bundling per platform
9. Credential backup mechanism (export/import)
10. Performance optimization and profiling
11. License validation system
12. Code signing (macOS notarization, Windows signing)
13. Launch checklist and final QA

---

## Windows Support

### 1. Window Frame

Windows doesn't support `titleBarStyle: 'hiddenInset'`. Use a fully custom frame:

```typescript
// In main/index.ts
const mainWindow = new BrowserWindow({
  frame: process.platform !== 'darwin' ? false : true,
  titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : undefined,
  // ...
});
```

Custom title bar for Windows:

```tsx
function TitleBar({ settings, onSettingsClick }) {
  const isWindows = navigator.userAgent.includes('Windows');

  return (
    <div className="title-bar">
      {/* Left: app name and tabs (same as macOS) */}
      <div className="title-bar-left">
        <span className="title-bar-text">Jeriko</span>
      </div>

      {/* Right: info + window controls (Windows only) */}
      <div className="title-bar-right">
        <span className="title-bar-info dim">{appInfo?.aiModel}</span>
        <span className={`title-bar-badge ${settings.license.tier}`}>
          {settings.license.tier}
        </span>
        <button className="title-bar-settings" onClick={onSettingsClick}>⚙</button>

        {isWindows && (
          <div className="window-controls">
            <button onClick={() => window.api.minimize()}>─</button>
            <button onClick={() => window.api.maximize()}>□</button>
            <button className="close" onClick={() => window.api.close()}>×</button>
          </div>
        )}
      </div>
    </div>
  );
}
```

IPC handlers for window controls:

```typescript
ipcMain.handle('window:minimize', () => mainWindow.minimize());
ipcMain.handle('window:maximize', () => {
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.handle('window:close', () => mainWindow.close());
```

### 2. Shell Commands

Windows uses PowerShell/cmd instead of bash. The engine's `bash` tool needs platform handling:

```typescript
// The existing tools.js bash tool already uses child_process.spawnSync
// On Windows, we need to ensure it uses the right shell
function getShellConfig() {
  if (process.platform === 'win32') {
    return { shell: 'powershell.exe', args: ['-Command'] };
  }
  return { shell: '/bin/bash', args: ['-c'] };
}
```

### 3. File Paths

```typescript
// Normalize paths for display
function displayPath(p: string): string {
  const home = os.homedir();
  if (p.startsWith(home)) {
    return '~' + p.slice(home.length).replace(/\\/g, '/');
  }
  return p.replace(/\\/g, '/');
}
```

### 4. Windows Installer (NSIS)

```yaml
# electron-builder.yml additions
win:
  icon: resources/icon.ico
  target:
    - target: nsis
      arch: [x64]
  publisherName: "Etheon"
  signAndEditExecutable: true

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: "Jeriko"
```

### 5. Windows-Specific Gotchas

- **Antivirus**: Windows Defender may flag unsigned Electron apps. Code signing is essential.
- **Firewall**: If the Express server starts (for Telegram/WhatsApp), Windows Firewall will prompt. Suppress by not starting the server by default.
- **Long paths**: Windows has a 260-character path limit by default. Use `\\?\` prefix for long paths or enable LongPathsEnabled in manifest.
- **Auto-start**: Add to Registry `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`

---

## Linux Support

### 1. AppImage

```yaml
# electron-builder.yml additions
linux:
  icon: resources/icon.png
  target:
    - target: AppImage
      arch: [x64]
  category: Utility
  desktop:
    Name: Jeriko
    Comment: The world's smartest terminal
    Categories: Utility;Development;
    MimeType: x-scheme-handler/jeriko
```

### 2. Linux-Specific Adjustments

- **Tray**: Use `StatusNotifierItem` (GNOME) or `XEmbed` (older DEs). Some Linux DEs don't support tray icons — detect and skip.
- **Notifications**: `node-notifier` uses `notify-send` on Linux. Ensure `libnotify` is available.
- **Hotkey**: `globalShortcut` works via X11. May not work on Wayland without `xdg-desktop-portal`.
- **Protocol handler**: Register via `.desktop` file with `MimeType=x-scheme-handler/jeriko`
- **Auto-start**: Create `.desktop` file in `~/.config/autostart/`

### 3. AppImage Notes

AppImage is self-contained. No installation needed. User downloads, makes executable, runs. This is the simplest distribution for Linux.

For users who want proper installation:
- `.deb` for Debian/Ubuntu (add later)
- `.rpm` for Fedora/RHEL (add later)
- Flatpak (add later)

---

## Platform-Specific Command Degradation

```typescript
// src/main/platform-commands.ts

const PLATFORM_AVAILABILITY: Record<string, string[]> = {
  notes:      ['darwin'],
  remind:     ['darwin'],
  calendar:   ['darwin', 'win32'],
  contacts:   ['darwin', 'win32'],
  msg:        ['darwin'],
  music:      ['darwin', 'win32', 'linux'],
  audio:      ['darwin', 'win32', 'linux'],
  camera:     ['darwin', 'win32', 'linux'],
  clipboard:  ['darwin', 'win32', 'linux'],
  window:     ['darwin', 'win32', 'linux'],
  location:   ['darwin', 'win32'],
};

export function getUnavailableCommands(): string[] {
  const platform = process.platform;
  return Object.entries(PLATFORM_AVAILABILITY)
    .filter(([_, platforms]) => !platforms.includes(platform))
    .map(([cmd]) => cmd);
}

export function getPlatformNote(): string {
  const unavailable = getUnavailableCommands();
  if (unavailable.length === 0) return '';

  const names = unavailable.map((cmd) => {
    const friendly: Record<string, string> = {
      notes: 'Apple Notes',
      remind: 'Reminders',
      calendar: 'Calendar',
      contacts: 'Contacts',
      msg: 'iMessage',
      location: 'Location',
    };
    return friendly[cmd] || cmd;
  });

  return `\n\nNote: ${names.join(', ')} are not available on ${process.platform === 'win32' ? 'Windows' : 'Linux'}.`;
}
```

This note is appended to the system prompt so the AI knows what's available and responds honestly.

---

## Auto-Updater

### Implementation

```typescript
// src/main/updater.ts
import { autoUpdater } from 'electron-updater';
import { BrowserWindow } from 'electron';

export function initAutoUpdater(mainWindow: BrowserWindow) {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  // Check every 6 hours
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 6 * 60 * 60 * 1000);

  // Check on startup (after 30s delay to not slow startup)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 30000);

  autoUpdater.on('update-available', (info) => {
    mainWindow.webContents.send('app:update-available', info.version);
  });

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow.webContents.send('app:update-ready', info.version);
  });

  autoUpdater.on('error', (err) => {
    console.error('[updater] Error:', err.message);
  });
}

// Called from renderer when user clicks "Restart now"
ipcMain.handle('app:install-update', () => {
  autoUpdater.quitAndInstall(false, true);
});
```

### Renderer Update Prompt

```tsx
function UpdateBanner({ version, onInstall, onDismiss }) {
  return (
    <div className="update-banner">
      <span>Update available (v{version}).</span>
      <button onClick={onInstall}>Restart now</button>
      <button className="dim" onClick={onDismiss}>Later</button>
    </div>
  );
}
```

### Update Server Config

```yaml
# electron-builder.yml
publish:
  provider: generic
  url: https://releases.jeriko.dev
  channel: latest
```

---

## Themes

### Theme Definitions

```typescript
// src/renderer/styles/themes.ts

export const themes = {
  midnight: {
    '--bg-primary': '#0d1117',
    '--bg-secondary': '#161b22',
    '--bg-card': '#161b22',
    '--border': '#30363d',
    '--text-primary': '#e6edf3',
    '--text-secondary': '#8b949e',
    '--text-dim': '#484f58',
    '--accent': '#58a6ff',
    '--success': '#3fb950',
    '--warning': '#d29922',
    '--error': '#f85149',
    '--info': '#58a6ff',
  },
  daylight: {
    '--bg-primary': '#ffffff',
    '--bg-secondary': '#f6f8fa',
    '--bg-card': '#f6f8fa',
    '--border': '#d0d7de',
    '--text-primary': '#1f2328',
    '--text-secondary': '#656d76',
    '--text-dim': '#8b949e',
    '--accent': '#0969da',
    '--success': '#1a7f37',
    '--warning': '#9a6700',
    '--error': '#cf222e',
    '--info': '#0969da',
  },
  focus: {
    '--bg-primary': '#000000',
    '--bg-secondary': '#0a0a0a',
    '--bg-card': '#111111',
    '--border': '#333333',
    '--text-primary': '#ffffff',
    '--text-secondary': '#cccccc',
    '--text-dim': '#666666',
    '--accent': '#00aaff',
    '--success': '#00ff88',
    '--warning': '#ffcc00',
    '--error': '#ff4444',
    '--info': '#00aaff',
  },
};
```

### Theme Application

```typescript
// src/renderer/hooks/useTheme.ts
export function useTheme() {
  const [theme, setTheme] = useState<string>('midnight');

  useEffect(() => {
    window.api.getSettings().then((s) => setTheme(s.appearance.theme));
  }, []);

  useEffect(() => {
    const vars = themes[theme as keyof typeof themes];
    const root = document.documentElement;
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value);
    }

    // Focus theme increases font size
    if (theme === 'focus') {
      root.style.setProperty('--font-size', '16px');
      root.style.setProperty('--line-height', '1.8');
    } else {
      const fontSize = `${settings.appearance.fontSize}px`;
      root.style.setProperty('--font-size', fontSize);
      root.style.setProperty('--line-height', '1.6');
    }
  }, [theme]);

  return { theme, setTheme };
}
```

---

## RTL Support

### Direction Detection

```typescript
// src/renderer/lib/rtl.ts

// Unicode ranges for RTL scripts
const RTL_REGEX = /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0780-\u07BF\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export function isRTL(text: string): boolean {
  // Check if the first meaningful character is RTL
  const stripped = text.replace(/[\s\d\W]/g, '');
  if (stripped.length === 0) return false;
  return RTL_REGEX.test(stripped[0]);
}

export function getDirection(text: string): 'ltr' | 'rtl' {
  return isRTL(text) ? 'rtl' : 'ltr';
}
```

### CSS for RTL

```css
/* Direction-aware styles */
[dir="rtl"] .prompt-container {
  flex-direction: row-reverse;
}

[dir="rtl"] .prompt-chevron {
  margin-right: 0;
  margin-left: 8px;
}

[dir="rtl"] .prompt-input {
  text-align: right;
}

[dir="rtl"] .command-block .chevron {
  margin-right: 0;
  margin-left: 8px;
}

[dir="rtl"] .card {
  text-align: right;
}

[dir="rtl"] .file-row {
  flex-direction: row-reverse;
}

[dir="rtl"] .title-bar {
  flex-direction: row-reverse;
  padding-left: 16px;
  padding-right: 80px; /* Traffic lights space on right for RTL */
}
```

### Per-Block Direction

Each output block detects its own direction:

```tsx
function OutputBlock({ block }) {
  const dir = getDirection(block.text || '');
  return (
    <div className="output-block" dir={dir}>
      {renderBlockContent(block)}
    </div>
  );
}
```

---

## Go Binary Bundling

### Build Script

```bash
#!/bin/bash
# scripts/build-binaries.sh

cd runtime

# macOS Apple Silicon
GOOS=darwin GOARCH=arm64 go build -ldflags="-s -w" -o ../terminal/resources/binaries/parallel-darwin-arm64 .

# macOS Intel
GOOS=darwin GOARCH=amd64 go build -ldflags="-s -w" -o ../terminal/resources/binaries/parallel-darwin-x64 .

# Linux x64
GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o ../terminal/resources/binaries/parallel-linux-x64 .

# Windows x64
GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o ../terminal/resources/binaries/parallel-win32-x64.exe .

echo "All binaries built."
```

### electron-builder Config

```yaml
extraResources:
  - from: "resources/binaries/parallel-${platform}-${arch}${ext}"
    to: "binaries/parallel${ext}"
    filter: ["!*.md"]
```

---

## Performance Optimization

### 1. Lazy Imports

The engine should only import modules when first used:

```typescript
// Don't import Playwright, systeminformation, etc. at startup
// They add 2-3 seconds to startup time
// The engine already lazy-loads most tools — verify no eager imports
```

### 2. Startup Time Budget

Target: app visible in < 2 seconds from launch.

- Electron ready: ~500ms
- Window show: ~200ms
- React mount: ~200ms
- Settings load: ~50ms
- Engine init: ~500ms (defer engine import until after window shows)

Strategy: show the window immediately with a loading state, then initialize the engine in the background.

### 3. Memory Budget

Target: < 300MB RSS at steady state.

- Electron base: ~80MB
- React renderer: ~50MB
- Engine (router.js + dependencies): ~100MB
- Buffer for conversations, tool results: ~70MB

Monitor with `process.memoryUsage()` and log at startup + every 10 minutes.

### 4. Output Virtualization

If a session has 200+ output blocks, virtualize the output area:
- Only render blocks in viewport + 20 block buffer
- Estimate heights for off-screen blocks
- Recalculate on scroll

Only implement if profiling shows >16ms frame times during scroll.

---

## License Validation

### Flow

```typescript
// src/main/license.ts

async function validateLicense(key: string): Promise<LicenseResult> {
  // 1. Check cached validation (valid for 7 days offline)
  const cached = settings.get('license.cachedValidation');
  if (cached && Date.now() - cached.timestamp < 7 * 24 * 60 * 60 * 1000) {
    return cached.result;
  }

  // 2. Validate with server
  try {
    const response = await fetch('https://api.jeriko.dev/license/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, platform: process.platform, version: app.getVersion() }),
    });

    const result = await response.json();

    // Cache result
    settings.set('license.cachedValidation', { result, timestamp: Date.now() });

    return result;
  } catch {
    // Network error — use cached if available, otherwise assume free
    if (cached) return cached.result;
    return { valid: false, tier: 'free' };
  }
}
```

### Free Tier Enforcement

```typescript
// Track daily usage
function checkUsageLimit(): boolean {
  const today = new Date().toISOString().split('T')[0];
  const usage = settings.get(`usage.${today}`) || 0;
  const tier = settings.get('license.tier') || 'free';

  if (tier === 'pro') return true;
  if (usage >= 50) return false;

  settings.set(`usage.${today}`, usage + 1);
  return true;
}
```

---

## Code Signing

### macOS

```bash
# Sign with Developer ID
electron-builder --mac --config.mac.identity="Developer ID Application: Etheon LLC"

# Notarize with Apple
# electron-builder handles this with afterSign hook
```

Requires:
- Apple Developer account ($99/year)
- Developer ID Application certificate
- Notarization via `@electron/notarize`

### Windows

Requires:
- EV Code Signing Certificate (~$300/year)
- SignTool from Windows SDK
- electron-builder handles signing via `win.certificateFile` config

---

## Launch Checklist

### Before Release

- [ ] All Phase 1-3 acceptance criteria pass
- [ ] macOS .dmg builds and installs cleanly on Apple Silicon and Intel
- [ ] Windows .exe installs and runs on Windows 10 and 11
- [ ] Linux .AppImage runs on Ubuntu 22.04+
- [ ] Auto-updater works (publish test version, verify update flow)
- [ ] Code signed: macOS notarized, Windows signed
- [ ] Onboarding: tested with a non-technical user (someone who doesn't code)
- [ ] All 3 themes render correctly on all platforms
- [ ] RTL text works (test with Arabic input)
- [ ] Global hotkey works on all platforms
- [ ] System tray works on macOS and Windows (Linux: best-effort)
- [ ] Drag and drop: files, images, text — all three work
- [ ] Integration setup: tested Stripe, GitHub, Google Drive end-to-end
- [ ] OAuth flow: tested with real Google account
- [ ] Triggers: cron trigger fires on time
- [ ] Webhook relay: connected, receives events
- [ ] Credential backup: export + import cycle verified
- [ ] License validation: free tier limits enforced
- [ ] No console errors in production build
- [ ] Memory usage < 300MB after 30 minutes of use
- [ ] Startup time < 2 seconds
- [ ] No hardcoded API keys or secrets in code
- [ ] CSP headers set in renderer
- [ ] contextIsolation: true, nodeIntegration: false

### Release Artifacts

```
release/
├── Jeriko-1.0.0-arm64.dmg         ← macOS Apple Silicon
├── Jeriko-1.0.0-x64.dmg           ← macOS Intel
├── Jeriko-1.0.0-Setup.exe         ← Windows installer
├── Jeriko-1.0.0.AppImage          ← Linux
├── latest-mac.yml                  ← macOS update manifest
├── latest.yml                      ← Windows update manifest
├── latest-linux.yml                ← Linux update manifest
└── checksums.sha256                ← File hashes
```

### Distribution

1. Upload to releases.jeriko.dev (Cloudflare R2)
2. Update download links on Jeriko.vercel.app
3. Post release notes
4. Monitor crash reports and auto-update adoption rate

---

## Acceptance Criteria

Phase 4 is complete when ALL of the following are true:

- [ ] Windows: app installs, runs, all Phase 1-3 features work
- [ ] Windows: custom title bar with window controls (min/max/close)
- [ ] Windows: protocol handler (jeriko://) works for OAuth
- [ ] Windows: auto-start via Registry works
- [ ] Linux: AppImage runs on Ubuntu 22.04+
- [ ] Linux: notifications work via libnotify
- [ ] Platform-specific commands degrade gracefully with honest messaging
- [ ] Auto-updater: downloads delta update silently
- [ ] Auto-updater: shows update prompt in terminal
- [ ] Auto-updater: installs on restart
- [ ] Midnight theme: correct on all platforms
- [ ] Daylight theme: correct on all platforms
- [ ] Focus theme: correct on all platforms, larger font
- [ ] Theme switch applies instantly without restart
- [ ] RTL: Arabic text input displays correctly
- [ ] RTL: prompt chevron and layout flip
- [ ] RTL: output blocks respect text direction
- [ ] Go binaries bundled for all platforms
- [ ] Go parallel engine executes correctly on all platforms
- [ ] Credential export produces encrypted file
- [ ] Credential import restores from file
- [ ] License validation: free tier enforces 50 commands/day
- [ ] License validation: works offline with cached result
- [ ] macOS: notarized, installs without Gatekeeper warning
- [ ] Windows: signed, installs without SmartScreen warning
- [ ] Startup time < 2 seconds on all platforms
- [ ] Memory < 300MB after 30 minutes of use
- [ ] All checklist items above pass
