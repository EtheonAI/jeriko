# Jeriko Terminal — Product Specification

**Status:** Approved
**Date:** 2026-02-25
**Author:** Khaleel Musleh / Etheon
**Version:** 1.0

---

## 1. Product Vision

Jeriko Terminal is a conversational AI command center that looks like a terminal, controls everything, and requires zero technical knowledge to operate.

The terminal aesthetic is the UI language. Natural language is the input. Everything else is invisible.

**What it is:** A desktop application where users type in their own language (English, Arabic, Spanish, etc.) and the computer executes real commands — file operations, web searches, email, payments, code generation, system control, automation.

**What it is NOT:** A chatbot. Not a dashboard. Not a dev tool. Not another Warp.

**The identity:** A terminal where humans speak human, and the computer does the translating.

---

## 2. Target Users

Everyone. Specifically:

- Non-technical professionals (lawyers, accountants, consultants, managers)
- Small business owners managing Stripe, email, files
- Technical users who want faster workflows
- Anyone who uses a computer daily but doesn't know what a terminal is

The common thread: people who want things done without learning tools.

---

## 3. Core Principles

### 3.1 The Prompt Is Everything

No sidebar. No panels. No navigation menu. The prompt `> _` is the single interface. Users type what they want. Results appear above. That's the entire UX.

Why: Adding panels turns this into a dashboard. Every SaaS tool is a dashboard. This is a terminal. The prompt IS the navigation, the search bar, the settings menu, the help system.

### 3.2 Three UI Exceptions (Exhaustive List)

| Exception | When | Why |
|-----------|------|-----|
| Onboarding screen | First launch only | User hasn't learned the prompt yet |
| Settings overlay | Gear icon or "settings" command | Configuration needs scannable layout |
| OAuth browser redirect | During integration setup | External flow, not controlled by Jeriko |

Everything else goes through the prompt. This list is complete. No other exceptions.

### 3.3 Connect When Needed

No integration marketplace. No "set up your tools" step. When the user asks for something that requires an integration, Jeriko says "X isn't connected yet. Want to set it up?" and handles it inline.

### 3.4 Outcomes Not Features

User-facing text never mentions command counts, tool names, or technical capabilities. Instead: "I can manage your Stripe invoices, send emails, organize files, and remember everything."

### 3.5 Zero Learning Curve

The user already knows how to type their language. That's the only skill required. Everything else is handled by Jeriko.

### 3.6 Honest Degradation

When something isn't available (offline, platform limitation, missing integration), Jeriko explains clearly what it can and can't do, and offers alternatives. Never silently fails.

---

## 4. The Interface

### 4.1 Window Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Jeriko    [+]  Tab 1  │  Tab 2  │  Tab 3        ● Pro  ⚙  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                                                             │
│                    [output area]                             │
│               scrollable, rich blocks                       │
│            each command + response here                     │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  > _                                                        │
└─────────────────────────────────────────────────────────────┘
```

Three zones:
1. **Title bar** — App name, tab bar, license status, settings gear
2. **Output area** — Scrollable, renders rich components per command
3. **Prompt input** — Single line, blinking block cursor, always at bottom

### 4.2 Title Bar

Left: "Jeriko" text + [+] new tab button + tab labels
Right: AI provider indicator (dim) + license tier badge + gear icon

The AI provider indicator shows "Claude" or "GPT-4" or "Ollama" in dim text. Signals which brain is active without being noisy.

License badge: "Free" or "Pro". Clicking "Free" opens upgrade prompt inline. Clicking "Pro" does nothing (already upgraded).

Gear icon opens Settings overlay.

### 4.3 Output Area

Scrollable container. Content flows top-to-bottom, newest at bottom. Auto-scrolls to bottom on new output. User can scroll up to review history.

Each interaction is a "block" containing:
1. The user's command (echoed, styled differently from output)
2. Status indicators (thinking, tool calls)
3. Rich result components
4. AI's text response

Blocks are visually separated by spacing, not lines or dividers.

### 4.4 Prompt Input

```
> _
```

Single `>` chevron. Blinking block cursor. Monospace font. Pinned to bottom of window.

Behavior:
- Enter: submit command
- Up/Down arrows: navigate command history
- Ctrl+C: cancel current operation
- Ctrl+L: clear output area
- Ctrl+A: move cursor to start of line
- Ctrl+E: move cursor to end of line
- Ctrl+U: clear current line
- Ctrl+K: kill to end of line
- Tab: no autocomplete in v1 (add later)

When Jeriko is processing:
- Chevron pulses with subtle animation
- Prompt shows "Thinking..." in dim text to the right of chevron
- User cannot submit another command in the same tab (but can switch tabs)

When processing completes:
- Chevron stops pulsing
- Prompt returns to `> _`
- Cursor regains focus

---

## 5. Onboarding Flow

### 5.1 First Launch — Single Screen

User opens Jeriko for the first time. One screen:

```
┌─────────────────────────────────────────────────────────────┐
│  Jeriko                                                  ⚙  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                                                             │
│                                                             │
│                     Welcome to Jeriko.                      │
│                                                             │
│           To get started, choose how Jeriko thinks.         │
│                                                             │
│       ┌─────────────────┐    ┌─────────────────┐           │
│       │   Cloud AI       │    │   Local AI       │           │
│       │                  │    │                  │           │
│       │   Claude, GPT-4  │    │   Ollama         │           │
│       │   Most powerful  │    │   Private, free  │           │
│       │   Needs API key  │    │   Runs on device │           │
│       └─────────────────┘    └─────────────────┘           │
│                                                             │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  > _                                                        │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Cloud AI Path

User selects Cloud AI. The card expands inline:

```
│       Choose your provider:                                │
│                                                             │
│       (*) Anthropic Claude  (recommended)                   │
│       ( ) OpenAI GPT-4                                      │
│       ( ) Google Gemini                                     │
│                                                             │
│       Your API key:                                         │
│       ┌─────────────────────────────────────────────┐      │
│       │  sk-ant-                                    │      │
│       └─────────────────────────────────────────────┘      │
│                                                             │
│       Don't have one? Get a key at anthropic.com            │
│       Your key is encrypted and stored locally.             │
│                                                             │
│       [Continue]                                            │
```

Key is validated (test API call). If valid: green checkmark, continue. If invalid: red error, try again.

### 5.3 Local AI Path

User selects Local AI. Jeriko checks for Ollama:

**If Ollama found:**
```
│       Ollama detected.                                     │
│                                                             │
│       Available models:                                     │
│       (*) llama3.1  (recommended)                           │
│       ( ) mistral                                           │
│       ( ) phi3                                              │
│                                                             │
│       [Continue]                                            │
```

**If Ollama NOT found:**
```
│       Ollama is not installed.                             │
│                                                             │
│       Ollama runs AI models privately on your machine.     │
│       No data leaves your computer.                        │
│                                                             │
│       [Install Ollama automatically]                       │
│       [I'll set it up myself]                              │
│       [Go back to Cloud AI]                                │
```

If user clicks "Install Ollama automatically":
- macOS: runs `brew install ollama` or downloads .dmg from ollama.com
- Windows: downloads Ollama installer and runs it
- Linux: runs the official install script
- Progress bar shown during download/install
- After install: auto-pulls recommended model, then continues

### 5.4 Post-Onboarding — Drop Into Terminal

After choosing AI, the onboarding screen dissolves. The terminal appears:

```
│                                                             │
│  Welcome to Jeriko. Type anything to get started.           │
│                                                             │
│  Try:  "what can you do"                                    │
│        "search my files for tax documents"                  │
│        "take a screenshot"                                  │
│                                                             │
│                                                             │
│  > _                                                        │
```

Three suggestions in dim text. They disappear after the user's first command and never return.

Total onboarding time: under 60 seconds. One decision. Done.

---

## 6. Tabs System

### 6.1 Behavior

- `[+]` button or `Cmd+T` (Mac) / `Ctrl+T` (Win/Linux) opens new tab
- Each tab is an independent conversation with its own `history[]` and scroll position
- Tab label auto-generated from first command (e.g., "check my stripe invoices" → "Stripe invoices")
- Right-click tab to rename or close
- `Cmd+W` / `Ctrl+W` closes current tab
- `Cmd+1-9` / `Ctrl+1-9` switches to tab by position
- `Cmd+Shift+]` / `Ctrl+Tab` cycles tabs forward
- `Cmd+Shift+[` / `Ctrl+Shift+Tab` cycles tabs backward
- Minimum 1 tab always open (closing last tab creates a new empty one)
- Maximum 10 tabs (prevents runaway resource usage)

### 6.2 Persistence

Tabs persist between sessions. When user quits and reopens Jeriko:
- All tabs restore with their labels
- Output history restores (stored via conversation persistence)
- Scroll position restores
- Processing state does NOT restore (any in-flight command is treated as completed)

### 6.3 Tab Isolation

Each tab has:
- Its own `conversationHistory[]` (passed to `route()`)
- Its own scroll position
- Its own "is processing" state

Tabs share:
- The same AI backend
- The same credential store
- The same settings

---

## 7. Output Rendering System

### 7.1 Status Event → Component Mapping

The engine (`router.js`) emits status events via `onStatus()`. Each maps to a React component:

| Status Event | Component | Visual |
|---|---|---|
| `thinking` | `<ThinkingIndicator />` | Pulsing chevron, dim "Thinking..." |
| `thinking_text` | `<ThinkingIndicator />` | Updates text: "Thinking... (3s)" |
| `reasoning` | `<ReasoningBlock />` | Collapsible dim block with AI reasoning |
| `tool_call` | `<ToolCallCard />` | Card: "Running: search files..." |
| `tool_result` | `<ToolResultBlock />` | Rich formatted result (see 7.2) |
| `responding` | `<StreamedResponse />` | Text streaming character by character |
| `context_compacted` | `<SystemNote />` | Dim note: "Summarized older context" |
| `security_blocked` | `<SecurityWarning />` | Warning card: "Blocked dangerous command" |

### 7.2 Tool Result Components

Each tool produces a different result type, rendered by a specialized component:

| Tool | Component | Renders |
|---|---|---|
| `bash` (system output) | `<SystemInfoResult />` | Gauges, progress bars, tables |
| `bash` (general) | `<CodeBlock />` | Monospace code block with syntax highlighting |
| `read_file` | `<CodeBlock />` | Code block with filename header, line numbers |
| `write_file` | `<FileActionCard />` | Success card: "Created file.txt" [Open] |
| `edit_file` | `<FileActionCard />` | Diff view: old → new |
| `list_files` | `<FileListResult />` | File list: icons, sizes, dates, [Open] buttons |
| `search_files` | `<SearchResults />` | Grep results with highlighted matches |
| `web_search` | `<WebSearchResults />` | Search cards: title, snippet, URL |
| `screenshot` | `<ImagePreview />` | Inline image, click to enlarge |
| `parallel_tasks` | `<ParallelResults />` | Multiple sub-results in cards |

### 7.3 Special Output Components

| Component | When | Visual |
|---|---|---|
| `<ConfirmationPrompt />` | Destructive actions | Warning with details + [Proceed] [Cancel] |
| `<IntegrationSetup />` | Missing integration | "X not connected" + setup flow inline |
| `<UpgradePrompt />` | Pro feature on free tier | "Pro feature" + [Upgrade] [Not now] |
| `<ErrorRecovery />` | Command failed | Friendly error + suggestions + [Retry] [Try different] |
| `<WelcomeMessage />` | First use / empty tab | Suggestions, disappears after first command |
| `<WhileYouWereAway />` | After reopening with trigger events | List of events that fired |

### 7.4 Streaming Behavior

AI text responses stream character by character (via `onChunk()`). This makes 3-second responses feel fast.

Tool call cards appear immediately when a tool starts. Tool result cards appear when the tool completes. There is no batching — everything renders as it happens.

### 7.5 Animations

- Output blocks: fade-in with 150ms ease-out
- Thinking indicator: subtle pulse animation on the chevron
- Confirmation prompt: slight scale-up on appear (105% → 100%, 200ms)
- Stream text: no animation, just character-by-character append
- Tab switch: instant (no animation — speed matters here)

---

## 8. Integration System

### 8.1 Philosophy

Integrations are invisible until needed. No marketplace. No browse-and-click. The user says what they want. If the tool isn't connected, the connection happens inline.

### 8.2 Available Integrations (v1)

From the existing codebase:

| Integration | Auth Type | What It Enables |
|---|---|---|
| Stripe | API key | Invoices, payments, customers, subscriptions |
| GitHub | PAT | Repos, issues, PRs, actions |
| Google Drive | OAuth 2.0 | File listing, search, download, upload |
| OneDrive | OAuth 2.0 (device code) | File listing, search, download, upload |
| X (Twitter) | OAuth 2.0 PKCE | Post tweets, read timeline, manage account |
| Vercel | API token | Deploy, list projects, manage domains |
| Twilio | Account SID + token | SMS, calls |
| PayPal | Client ID + secret | Transactions, balances, payouts |
| Email (SMTP/IMAP) | Credentials | Send/receive email |
| Telegram | Bot token | Send messages, manage bot |
| WhatsApp | QR scan | Send/receive messages |

### 8.3 Inline Setup Flow — API Key Type

When user requests an action requiring an unconnected API-key integration:

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  Stripe isn't connected yet.                            │
│                                                         │
│  To connect, I need your Stripe API key.                │
│  Get one at: stripe.com/dashboard/apikeys               │
│                                                         │
│  Paste your key:                                        │
│  ┌─────────────────────────────────────────────────┐    │
│  │  sk-live-                                       │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  Your key is encrypted and stored locally.              │
│                                                         │
│  [Connect]    [Cancel]                                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 8.4 Inline Setup Flow — OAuth Type

When user requests an action requiring an unconnected OAuth integration:

```
│  Google Drive isn't connected yet.                      │
│                                                         │
│  [Connect with Google]                                  │
```

Flow:
1. User clicks "Connect with Google"
2. Default browser opens to Google OAuth consent screen
3. User approves in browser
4. Browser redirects to `jeriko://oauth/google/callback?code=...`
5. Electron catches via registered protocol handler
6. Main process exchanges code for tokens
7. Tokens encrypted via `safeStorage` and stored
8. Terminal shows: "Google Drive connected. Let me get that for you..."
9. Original command resumes automatically

**Edge cases:**
- User closes browser without completing OAuth → Terminal shows "Connection cancelled. Try again anytime."
- OAuth fails → "Connection failed: [reason]. Try again? [Retry] [Skip]"
- Token expires during session → Auto-refresh using refresh token. If refresh fails, prompt re-auth.

### 8.5 Integration Management

User types "my integrations" or "what's connected":

```
│  Connected:                                             │
│    Stripe        ● Connected since Feb 20               │
│    Google Drive   ● Connected since Feb 22               │
│                                                         │
│  Available:                                             │
│    GitHub, Vercel, OneDrive, X, Twilio, PayPal,        │
│    Email, Telegram, WhatsApp                            │
│                                                         │
│  To connect one, just ask me to do something with it.   │
```

To disconnect: "disconnect Stripe" → Confirmation → Credentials deleted.

Also manageable in Settings overlay.

---

## 9. Trigger System

### 9.1 Creating Triggers

Through natural language:

```
> alert me on Slack when any Stripe payment fails

┌─ Trigger Created ────────────────────────────────────────┐
│                                                          │
│  When:    Stripe payment.failed webhook received         │
│  Do:      Send notification (Slack not connected yet)    │
│                                                          │
│  Webhook URL: https://relay.jeriko.dev/hooks/abc/def     │
│  Add this URL to Stripe's webhook settings.              │
│                                                          │
│  Status:  ● Active                                       │
│                                                          │
│  [Test it]    [Edit]    [Disable]                        │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 9.2 Trigger Types

| Type | Creation Example | How It Works |
|---|---|---|
| Cron | "every morning at 8am summarize my email" | Cron job via `croner` |
| Webhook | "alert me when Stripe payment fails" | Webhook relay receives event |
| File watch | "tell me when report.xlsx changes" | `fs.watch()` on file |
| HTTP monitor | "check if mysite.com goes down" | Periodic fetch |
| Email | "alert me when I get email from john@" | IMAP polling |

### 9.3 Managing Triggers

User types "my triggers" or "show triggers":

```
│  Active Triggers:                                       │
│                                                         │
│  ● 8am email summary       Cron     12 runs  [Edit]    │
│  ● Stripe payment alerts   Webhook  3 runs   [Edit]    │
│  ● mysite.com monitor      HTTP     47 runs  [Edit]    │
│                                                         │
│  "edit", "pause", or "delete" any trigger by name.      │
```

Also manageable in Settings overlay.

### 9.4 Webhook Relay

Non-technical users can't expose ports. The relay handles inbound webhooks:

```
External Service  →  relay.jeriko.dev/hooks/{userId}/{triggerId}
                         ↓
                    WebSocket to user's Electron app
                         ↓
                    Trigger engine fires
                         ↓
                    Notification to user
```

See ARCHITECTURE.md for full relay specification.

---

## 10. Settings Overlay

Opened by clicking gear icon or typing "settings".

### 10.1 Layout

Full-screen overlay on top of terminal (not a new window). Dark semi-transparent backdrop. Content scrollable.

```
┌─────────────────────────────────────────────────────────────┐
│  Settings                                              [x]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  AI Provider                                                │
│  (*) Claude (Anthropic)   ( ) GPT-4 (OpenAI)               │
│  ( ) Ollama (Local)       ( ) Custom endpoint               │
│  API Key: sk-ant-••••••••••  [Change]                       │
│  Model: claude-sonnet-4-6  [Change]                         │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  Appearance                                                 │
│  Theme:  (*) Midnight  ( ) Daylight  ( ) Focus              │
│  Font size:  [14px]                                         │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  Integrations                                               │
│  Stripe         ● Connected    [Disconnect]                 │
│  Google Drive   ● Connected    [Disconnect]                 │
│  GitHub         ○ Not connected [Connect]                   │
│  Vercel         ○ Not connected [Connect]                   │
│  ...                                                        │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  Triggers                                                   │
│  ● 8am email summary      Active  [Edit] [Pause]           │
│  ● Stripe payment alerts  Active  [Edit] [Pause]           │
│  [+ New Trigger]                                            │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  Global Hotkey                                              │
│  Current: Cmd+Shift+Space  [Change]                         │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  Credentials                                                │
│  [Export credentials]  [Import credentials]                  │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  License                                                    │
│  Free tier · 47/50 commands remaining today                 │
│  [Upgrade to Pro]                                           │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  About                                                      │
│  Jeriko Terminal v1.0.0                                     │
│  [Check for updates]                                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 10.2 Behavior

- Opened: gear icon click or "settings" command
- Closed: [x] button or Escape key
- Changes apply immediately (no "Save" button needed)
- AI provider change: validates new key before switching
- Theme change: applies instantly
- Closing settings returns focus to the prompt

---

## 11. Memory and History

### 11.1 Conversation Persistence

Every conversation (tab) auto-saves to disk:
- Storage: `~/.jeriko/terminal/conversations/{id}.jsonl`
- Metadata: `{id}.meta.json` with label, created, last active
- Saved on every AI response (not on every keystroke)
- Loaded on app start (tab restoration)

### 11.2 Command History

Global command history across all tabs:
- Storage: `~/.jeriko/terminal/history.jsonl`
- Up/Down arrows cycle through history (current tab commands first, then global)
- Persistent between sessions
- Maximum 10,000 entries (FIFO rotation)

### 11.3 Session Memory

Powered by existing `jeriko memory`:
- Every command + result logged to session
- "What did I do yesterday" retrieves from session log
- "What did I do last week" aggregates by day
- Memory context injected into AI system prompt for continuity

---

## 12. Offline Mode

### 12.1 Cloud AI Users

When internet is unavailable:

```
│  I'm offline right now.                                 │
│                                                         │
│  I can still:                                           │
│    Search and manage your files                         │
│    Show system information                              │
│    Take screenshots                                     │
│    Play and control music                               │
│    Manage clipboard                                     │
│                                                         │
│  I need internet for:                                   │
│    Web search, email, Stripe, GitHub, etc.              │
│                                                         │
│  Tip: Use Ollama for full offline AI.                   │
│  Type "settings" to switch.                             │
```

### 12.2 Local Intent Classifier

For basic commands, a local pattern matcher handles intent without the LLM:

| Pattern | Maps To |
|---|---|
| "show/list/find files/documents" | `jeriko fs --ls` / `jeriko fs --find` |
| "system info/status/memory/cpu" | `jeriko sys` |
| "screenshot/capture screen" | `jeriko screenshot` |
| "play/pause/next/volume" | `jeriko music` |
| "clipboard/copy/paste" | `jeriko clipboard` |
| "what time/date" | Direct response |

This handles ~20 common intents instantly with zero latency, online or offline.

### 12.3 Local AI Users (Ollama)

Everything works offline. All commands, all tools. Full AI reasoning. No internet required except for web search and cloud integrations.

---

## 13. Multi-Language and RTL Support

### 13.1 Language Detection

No language selector. The AI detects the user's language from their input and responds in the same language. If user types in Arabic, response is in Arabic.

### 13.2 RTL Implementation

- CSS `direction: rtl` applied when RTL language detected
- Prompt chevron flips to right side: `_ <`
- Text alignment flips
- Output cards mirror horizontally
- Designed in from Phase 1 (CSS custom properties for direction-aware spacing)

### 13.3 Supported Languages

Whatever the AI model supports. Claude and GPT-4 handle 50+ languages. No Jeriko-specific language limitation.

---

## 14. Drag and Drop

### 14.1 File Drop

User drags a file into the terminal window:

```
│  Received: quarterly_report.pdf (2.1 MB)                │
│                                                         │
│  What would you like to do with it?                     │
│                                                         │
│  [Summarize]  [Convert]  [Email it]  [Open]             │
```

### 14.2 Image Drop

User drags an image:

```
│  Received: screenshot.png (1.4 MB)                      │
│                                                         │
│  [Preview shown inline]                                 │
│                                                         │
│  What would you like to do with it?                     │
│                                                         │
│  [Describe it]  [Extract text]  [Edit]  [Email it]      │
```

### 14.3 Text Drop

User drags selected text from another app:

```
│  Received text (240 characters):                        │
│  "The quarterly results show a 15% increase..."         │
│                                                         │
│  What would you like to do with it?                     │
│                                                         │
│  [Summarize]  [Translate]  [Save to file]               │
```

### 14.4 Implementation

Electron's `ondragover` + `ondrop` on the main window. Files → read path, show preview. Text → capture content. Images → show inline preview. All trigger an inline action selector.

---

## 15. Global Hotkey

### 15.1 Behavior

- Default: `Cmd+Shift+Space` (Mac) / `Ctrl+Shift+Space` (Win/Linux)
- Configurable in Settings
- Summons Jeriko from anywhere (even when minimized or hidden)
- If Jeriko is visible: brings to front and focuses prompt
- If Jeriko is hidden: shows window, focuses prompt
- Second press (while Jeriko is focused): hides window back

### 15.2 Quick Command Mode

When summoned via hotkey while another app is focused:
- Jeriko appears
- User types command
- When command completes and user presses Escape: Jeriko hides, previous app regains focus

This makes Jeriko feel like Spotlight/Alfred — summon, command, dismiss.

---

## 16. Notifications

### 16.1 Dock/Taskbar Badge

When a trigger fires while Jeriko is minimized/hidden:
- macOS: dock icon bounces once + shows numeric badge
- Windows: taskbar icon flashes + shows badge overlay
- Linux: notification via system notification daemon

### 16.2 OS Notifications

Trigger events also fire native OS notifications via `node-notifier`:
- Title: "Jeriko: [trigger name]"
- Body: Brief summary of the event
- Click notification → opens Jeriko, scrolls to the event

### 16.3 In-App Notifications

When user returns to Jeriko after trigger events:

```
│  While you were away:                                   │
│  ● Stripe payment failed: Acme Corp $2,400 (2h ago)    │
│  ● Daily report posted to Slack (8:00 AM)               │
│  [Dismiss]                                              │
```

Appears at top of output area. Dismisses on click, scroll, or after 15 seconds.

---

## 17. Themes

### 17.1 Available Themes

Three themes. Ship with Midnight only in Phase 1. Add Daylight and Focus in Phase 4.

**Midnight** (default):
- Background: `#0d1117` (dark, slightly warm, not pure black)
- Text: `#e6edf3`
- Prompt chevron: `#58a6ff`
- Success: `#3fb950`
- Warning: `#d29922`
- Error: `#f85149`
- Info: `#58a6ff`
- Dim: `#484f58`
- Cards background: `#161b22`
- Card border: `#30363d`

**Daylight**:
- Light theme for users who prefer it
- Background: `#ffffff`
- Text: `#1f2328`
- (Full color spec defined in Phase 4)

**Focus**:
- High contrast for accessibility
- Larger default font (16px)
- Increased line height (1.8)
- Background: `#000000` (pure black)
- Text: `#ffffff` (pure white)
- (Full color spec defined in Phase 4)

### 17.2 Font

Primary: `JetBrains Mono` (bundled with app)
Fallback: `SF Mono`, `Cascadia Code`, `Consolas`, `monospace`
Size: 14px default (configurable 12-20px in Settings)
Line height: 1.6

---

## 18. Credential Management

### 18.1 Storage

All credentials (API keys, OAuth tokens) encrypted via Electron's `safeStorage` API:
- macOS: Keychain
- Windows: DPAPI
- Linux: libsecret (GNOME Keyring / KDE Wallet)

Never stored in plaintext. Never stored in `.env` files (unlike the CLI).

### 18.2 Credential Backup

In Settings: [Export credentials] / [Import credentials]

**Export:**
1. User sets a backup passphrase
2. All credentials encrypted with AES-256-GCM (key derived via PBKDF2 from passphrase)
3. Saved as `jeriko-credentials.backup` file (user chooses location)

**Import:**
1. User selects backup file
2. Enters passphrase
3. Credentials decrypted and stored via safeStorage

Also accessible via prompt: "export my credentials" / "import my credentials"

### 18.3 Credential Lifecycle

- Created: during integration setup or onboarding
- Stored: safeStorage encrypted
- Used: decrypted in-memory only when needed, never written to disk as plaintext
- Rotated: when OAuth tokens expire, auto-refresh via refresh token
- Deleted: when user disconnects an integration
- Backed up: manual export only (no cloud sync in v1)

---

## 19. Monetization

### 19.1 Free Tier

- 50 commands per day (resets at midnight local time)
- All commands available (no feature gating)
- All integrations available
- 3 active triggers maximum
- 5 tabs maximum
- No credential backup/export

### 19.2 Pro Tier

- Unlimited commands
- Unlimited triggers
- 10 tabs
- Credential backup/export
- Priority support
- Price: TBD (likely $19-29/month)

### 19.3 Upgrade Prompt

When user hits a limit:

```
│  You've used your 50 free commands for today.           │
│  Commands reset at midnight.                            │
│                                                         │
│  Upgrade to Pro for unlimited commands.                 │
│  [Upgrade — $X/mo]    [Wait until tomorrow]             │
```

Inline in the terminal. Not a popup. Not a modal. Just another output block.

### 19.4 License Validation

- License key stored encrypted via safeStorage
- Validated on app start (cached result, no block)
- Re-validated every 24 hours (background, non-blocking)
- If validation fails (expired, revoked): graceful downgrade to Free tier with explanation
- If offline: use cached validation (valid for 7 days offline)

---

## 20. Platform Support

### 20.1 Primary Target

macOS (Apple Silicon + Intel) — Phase 1 launch.

### 20.2 Secondary Targets

Windows 10+ (x64) — Phase 4.
Linux (x64, .AppImage) — Phase 4.

### 20.3 Platform-Specific Commands

See ARCHITECTURE.md for the full platform command matrix.

Summary:
- ~30 commands work cross-platform (fs, exec, search, browse, email, stripe, github, etc.)
- ~13 commands are macOS-only (AppleScript: notes, reminders, calendar, contacts, messages, music, etc.)
- Windows/Linux: graceful degradation with honest messaging and alternatives

---

## 21. Security

### 21.1 Credential Security

All credentials encrypted at rest via OS-level encryption (Keychain/DPAPI/libsecret). Never in plaintext files.

### 21.2 Destructive Action Protection

Before any destructive action (file deletion, mass email, data modification):

```
│  This will delete 3 files:                              │
│    old_backup.zip (1.2 GB)                              │
│    temp_download.dmg (890 MB)                           │
│    cache.dat (45 MB)                                    │
│                                                         │
│  Total: 2.1 GB freed                                    │
│                                                         │
│  [Delete]    [Cancel]                                   │
```

The AI's tool calls go through `security.js` validation. Blocked commands (rm -rf /, sudo, etc.) never execute.

### 21.3 Content Security

- Electron's `contextIsolation: true` and `nodeIntegration: false` in renderer
- Preload script mediates all IPC
- No `eval()` or `innerHTML` with user content
- CSP headers to prevent XSS
- External links open in system browser, never in Electron

### 21.4 Update Security

- Auto-updates signed with Etheon's code signing certificate
- macOS: notarized by Apple
- Windows: signed with EV code signing certificate
- Update server over HTTPS only
- Binary hash verification before applying update
