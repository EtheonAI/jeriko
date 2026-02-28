# ADR-005: Jeriko Terminal — A Dedicated GUI/TUI for Non-Technical Users

- **Status:** Proposed
- **Date:** 2026-02-24
- **Author:** Khaleel Musleh / Jeriko Analysis
- **Deciders:** Khaleel Musleh

---

## Context and Problem Statement

Jeriko is a Unix-first CLI toolkit with 46+ commands, designed for AI agents to control machines. It is powerful, composable, and model-agnostic — but it requires users to know how to install Node.js, run `npm install -g`, and operate in a terminal.

**The question:** Should Jeriko ship its own terminal/GUI application — "Jeriko Terminal" — that bundles the CLI, provides a visual interface, and makes Jeriko accessible to users who don't know how to use a terminal?

This is a **strategic product decision**, not just a technical one. It touches distribution, brand identity, target market, engineering investment, and the Unix-first philosophy that defines Jeriko.

---

## Decision Drivers

1. **Accessibility** — Non-technical users cannot install or use CLI tools
2. **Onboarding friction** — `npm install -g` requires Node.js, which requires Homebrew or an installer, which requires terminal knowledge. Each step loses users.
3. **Market expansion** — The TAM (total addressable market) for "people who use terminals" is ~30M developers. The TAM for "people who want AI to control their computer" is 100x larger.
4. **Competitive pressure** — Warp ($73M raised), Wave Terminal, Amazon Q CLI (ex-Fig) are all building AI-native terminal experiences
5. **Existing architecture** — Jeriko already has a server (Express + WebSocket), a chat REPL, and a Telegram bot. A GUI is the missing layer, not a rewrite.
6. **Brand coherence** — Jeriko's identity is "Unix-first, no-GUI, plain JavaScript." A GUI contradicts this positioning — or evolves it.
7. **Engineering bandwidth** — Solo/small team. Every new surface area competes with core CLI development.

---

## Considered Options

### Option A: Enhanced TUI Mode (Ink-based)
Build `jeriko ui` — a rich terminal user interface that runs inside the user's existing terminal.

### Option B: Tauri Desktop Application
Ship `Jeriko.app` / `Jeriko.exe` — a native-feeling desktop app with a web-based frontend and the CLI bundled inside.

### Option C: Localhost Web Dashboard
Extend the existing `jeriko server` to serve a web UI at `localhost:3000` — browser-based, no new framework.

### Option D: Electron Desktop Application
Ship a full Electron app wrapping Jeriko with a custom terminal + GUI panels.

### Option E: Do Nothing (Status Quo)
Keep Jeriko as a pure CLI. Telegram bot remains the only "GUI." Focus engineering on CLI features and integrations.

---

## Deep Analysis

### Option A: Enhanced TUI Mode (Ink)

**What it is:**
A `jeriko ui` command that launches a full-screen terminal interface with panels, menus, command palettes, and real-time output — all rendered inside the user's existing terminal using [Ink](https://github.com/vadimdemedes/ink) (React components for the terminal).

**Architecture:**
```
┌─────────────────────────────────────────────────┐
│  User's Terminal (iTerm2, Terminal.app, etc.)    │
│  ┌───────────────────────────────────────────┐  │
│  │  Jeriko TUI (Ink/React)                   │  │
│  │  ┌─────────────┐  ┌────────────────────┐  │  │
│  │  │ Command      │  │ Output Panel       │  │  │
│  │  │ Palette      │  │                    │  │  │
│  │  │              │  │ Real-time results  │  │  │
│  │  │ > browse     │  │ JSON / text / img  │  │  │
│  │  │   calendar   │  │                    │  │  │
│  │  │   contacts   │  │                    │  │  │
│  │  │   email      │  │                    │  │  │
│  │  └─────────────┘  └────────────────────┘  │  │
│  │  ┌───────────────────────────────────────┐ │  │
│  │  │ Status Bar: CPU 12% | RAM 4.2G | ↑2d │ │  │
│  │  └───────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────┘  │
│  (falls back to raw CLI on exit)                │
└─────────────────────────────────────────────────┘
```

**Strengths:**
- Ships with `npm install -g jeriko` — zero extra distribution
- Zero new dependencies beyond Ink (~200KB) and `@inkjs/ui`
- Stays inside the terminal — consistent with Unix-first brand
- Ink is battle-tested (used by GitHub Copilot CLI, Prisma, Shopify, Yarn)
- Lazygit/K9s/Lazydocker prove this pattern works — massive adoption
- No build chain changes (Ink is plain JS/React)
- Can show command palette, searchable history, autocomplete
- Could render tables, progress bars, live system stats

**Weaknesses:**
- **Still requires terminal knowledge** — user must open Terminal.app, run `jeriko ui`
- **Still requires npm/Node.js** — the core onboarding friction remains
- **No images/rich media** — terminals can't render screenshots, PDFs, charts (except iTerm2/Kitty with special protocols)
- **Not a "terminal replacement"** — it's a better CLI experience, not an entry point for non-technical users
- **Doesn't solve the stated problem** — "users who don't know how to use terminal" still can't use this

**Engineering cost:** 2-4 weeks for MVP
**Risk:** Low
**Impact on non-technical users:** Minimal — this serves power users, not beginners

---

### Option B: Tauri Desktop Application

**What it is:**
A standalone desktop app — `Jeriko.app` on macOS, `Jeriko.exe` on Windows — with a modern web UI (React/Svelte) rendered in a native webview. The CLI engine runs as a sidecar process. Users download and double-click to start.

**Architecture:**
```
┌─────────────────────────────────────────────────┐
│  Jeriko Terminal (Tauri native window)           │
│  ┌───────────────────────────────────────────┐  │
│  │  Web UI (React/Svelte + Tailwind)         │  │
│  │                                           │  │
│  │  ┌─────────┐ ┌────────────────────────┐   │  │
│  │  │ Sidebar │ │  Chat / Command View   │   │  │
│  │  │         │ │                        │   │  │
│  │  │ 🏠 Home │ │  You: check my email   │   │  │
│  │  │ 💬 Chat │ │                        │   │  │
│  │  │ 📧 Mail │ │  Jeriko: Found 3 new   │   │  │
│  │  │ 📁 Files│ │  emails. The one from   │   │  │
│  │  │ 🔧 Auto │ │  Sarah is urgent...     │   │  │
│  │  │ 💳 Pay  │ │                        │   │  │
│  │  │ ⚙ Set  │ │  [Screenshot preview]   │   │  │
│  │  │         │ │  [File attachment]      │   │  │
│  │  └─────────┘ └────────────────────────┘   │  │
│  │  ┌───────────────────────────────────────┐ │  │
│  │  │ > Type a message or command...    ⏎  │ │  │
│  │  └───────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────┐  │
│  │  Embedded Terminal (xterm.js)              │  │
│  │  $ jeriko sys --format text               │  │
│  │  CPU: 12% | RAM: 4.2GB | Disk: 45%       │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
   Tauri IPC ←→ Node.js sidecar (Jeriko CLI engine)
```

**Strengths:**
- **Solves the actual problem** — double-click install, no terminal required
- **Small bundle** — Tauri apps are 2.5-10MB (vs Electron's 100MB+)
- **Low memory** — 30-40MB idle (vs Electron's 150-300MB)
- **Rich media** — can render images, PDFs, charts, screenshots inline
- **Native feel** — uses OS webview (Safari on macOS, WebView2 on Windows)
- **Precedent works** — Docker Desktop, Lens (K8s), Postman all proved CLI+GUI coexistence
- **Monetization path** — GUI app can have free/pro tiers (Warp model)
- **Distribution** — Homebrew Cask, GitHub Releases, DMG/MSI, potentially app stores

**Weaknesses:**
- **Adds Rust to the build chain** — Tauri's core is Rust, requires `cargo` toolchain
- **Cross-platform rendering differences** — Safari WebView (macOS) vs WebView2 (Windows) vs WebKitGTK (Linux) have different CSS/JS capabilities
- **Significant engineering investment** — 2-4 months for a polished MVP
- **Bifurcated distribution** — CLI via npm, GUI via DMG/MSI — two install paths to maintain
- **Node.js sidecar complexity** — bundling Node.js inside the app adds ~40-60MB; or require system Node.js (defeats the purpose)
- **Contradicts "no build step" philosophy** — Tauri requires a compilation step
- **Auto-update mechanism needed** — GUI apps need self-updaters (Tauri has Sparkle/WinSparkle, but it's another surface)

**Engineering cost:** 2-4 months for MVP, ongoing maintenance
**Risk:** Medium-High
**Impact on non-technical users:** High — this is the only option that truly serves people who can't use a terminal

---

### Option C: Localhost Web Dashboard

**What it is:**
Extend the existing `jeriko server` (Express + WebSocket, already built) to serve a web UI at `localhost:3000`. Users run `jeriko server` once, then interact through their browser.

**Architecture:**
```
┌──────────────────────────────────────────────┐
│  Browser (localhost:3000)                     │
│  ┌──────────────────────────────────────────┐│
│  │  Jeriko Dashboard (React/Preact + WS)    ││
│  │                                          ││
│  │  [Chat] [Triggers] [System] [Settings]   ││
│  │                                          ││
│  │  Real-time command output via WebSocket   ││
│  │  Trigger management UI                    ││
│  │  System monitoring dashboard              ││
│  │  File browser                             ││
│  │  Integration status (Stripe, GitHub, etc.)││
│  └──────────────────────────────────────────┘│
└──────────────────────────────────────────────┘
         │ WebSocket
         ▼
┌──────────────────────────────────────────────┐
│  jeriko server (already exists!)              │
│  Express + WS + Telegram + Triggers          │
└──────────────────────────────────────────────┘
```

**Strengths:**
- **Lowest engineering cost** — server already exists, just add frontend routes
- **No new framework** — React/Preact/vanilla, served as static files
- **Rich media natively** — browsers render everything (images, PDFs, charts)
- **Shareable** — expose via tunnel (ngrok, Cloudflare) for remote access
- **Already has WebSocket** — real-time streaming is built in
- **Already has auth** — `NODE_AUTH_SECRET`, token generation exist
- **Deployable** — could become a SaaS (hosted Jeriko dashboard)
- **Mobile accessible** — works on phone browsers

**Weaknesses:**
- **Still requires terminal to start** — `jeriko server` must be running
- **Not a native app** — lives in a browser tab, no dock icon, no system tray
- **No offline mode** — requires the server process
- **"Please open localhost:3000" is confusing** for non-technical users
- **Browser tab management** — easily lost among other tabs
- **No terminal emulation** — would need xterm.js for raw terminal access

**Engineering cost:** 2-6 weeks for MVP
**Risk:** Low
**Impact on non-technical users:** Medium — easier than CLI, but requires initial setup

---

### Option D: Electron Desktop Application

**What it is:**
A full Electron app with embedded Node.js, bundled Chromium, and the Jeriko CLI engine.

**Strengths:**
- Full web capabilities, consistent cross-platform rendering
- Massive ecosystem (VS Code, Slack, Discord all use Electron)
- Can embed a real terminal (xterm.js)

**Weaknesses:**
- **100-120MB installer** — absurd for a CLI tool
- **150-300MB RAM idle** — Hyper terminal proved this kills adoption
- **Chromium bundling** — security updates, CVE exposure
- **Contradicts everything Jeriko stands for** — lightweight, Unix-first, minimal deps
- **Hyper is the cautionary tale** — 43k stars but nobody uses it daily because of performance

**Verdict:** **Eliminated.** The brand damage alone disqualifies this. Jeriko cannot ship a 120MB Electron app and maintain credibility as a Unix-first tool.

---

### Option E: Do Nothing (Status Quo)

**What it is:**
Keep Jeriko as a pure CLI. The Telegram bot already serves as a "GUI" for remote interaction. Focus engineering on more integrations, better AI routing, and the plugin ecosystem.

**Strengths:**
- Zero engineering cost, zero new surface area
- Maintains Unix-first purity
- Telegram bot already provides discoverability for non-CLI users
- WhatsApp bot adds another accessible channel
- Fewer things to maintain, document, and debug

**Weaknesses:**
- **Caps the addressable market** at terminal-literate developers
- **Telegram dependency** — the "GUI" requires a Telegram account and bot setup
- **No local-first visual experience** — everything is either terminal text or Telegram messages
- **Competitive disadvantage** — Warp, Wave, Amazon Q are all adding visual layers

**Engineering cost:** $0
**Risk:** Low (technical), Medium (strategic — may lose market positioning)

---

## Comparison Matrix

| Criterion | A: TUI (Ink) | B: Tauri App | C: Web Dashboard | D: Electron | E: Do Nothing |
|-----------|:---:|:---:|:---:|:---:|:---:|
| Solves non-technical user problem | ❌ | ✅ | 🟡 | ✅ | ❌ |
| Aligns with Unix-first philosophy | ✅ | 🟡 | ✅ | ❌ | ✅ |
| Engineering cost (time) | 2-4 wks | 2-4 mo | 2-6 wks | 3-6 mo | 0 |
| New dependencies | Ink (~200KB) | Rust + Tauri | React/Preact | Chromium (120MB) | None |
| Bundle size impact | ~0 | 5-10MB app | ~0 (served) | 100-120MB | 0 |
| RAM overhead | ~0 | 30-40MB | ~0 (browser) | 150-300MB | 0 |
| Rich media support | ❌ | ✅ | ✅ | ✅ | ❌ |
| Distribution complexity | None (npm) | DMG/MSI + npm | None (npm) | DMG/MSI + npm | None |
| Monetization potential | Low | High | Medium | Medium | Low |
| Competitive differentiation | Medium | High | Medium | Low | Declining |
| Risk | Low | Medium-High | Low | High | Medium (strategic) |
| Power user appeal | High | Medium | Medium | Low | High |
| Non-technical user appeal | Low | High | Medium | Medium | None |

---

## The Real Strategic Question

This decision isn't really about technology. It's about **who is Jeriko for?**

### Scenario 1: Jeriko is for developers and AI engineers
→ **Option A (TUI) + Option C (Web Dashboard)** is the right path. Make the existing CLI more powerful and visual. The TUI serves power users; the web dashboard serves monitoring and trigger management. Both ship via `npm install -g jeriko`. No new distribution headaches.

### Scenario 2: Jeriko is for everyone who wants AI to control their computer
→ **Option B (Tauri)** is the only real answer. Non-technical users will never open Terminal.app. They need a download → double-click → start chatting experience. This is a fundamentally different product positioning that expands the market 10-100x but requires significant investment.

### Scenario 3: Jeriko is a platform (both audiences)
→ **Phased approach: A → C → B.** Start with the TUI and web dashboard (weeks, not months), prove the value of visual interfaces, then build the Tauri app when there's market validation and potentially funding.

---

## My Honest Assessment

Khaleel, here's what I actually think:

### The idea is right. The timing question is what matters.

**Your instinct is correct.** The CLI-only approach caps Jeriko's market at developers who are comfortable in terminals. That's maybe 30M people globally. The market for "AI assistant that controls my computer" is potentially billions. A dedicated Jeriko Terminal app is the obvious bridge.

**But here's the tension:** Building a Tauri desktop app is a 2-4 month project that introduces Rust into your build chain, creates a second distribution path (DMG/MSI alongside npm), and doubles your support surface. For a solo developer or small team, that's a massive commitment — and every week spent on the GUI is a week not spent on new integrations, better AI routing, or the plugin ecosystem that makes the CLI more powerful.

### What I'd actually recommend:

**Phase 1 (Now — 2-3 weeks):**
Build the **Ink-based TUI** (`jeriko ui`). This is low-cost, high-impact for existing users, and serves as a design prototype for the eventual GUI. You'll learn what panels, layouts, and workflows people actually want. It ships with the next `npm` release — zero distribution overhead.

**Phase 2 (Next — 3-4 weeks):**
Build the **Web Dashboard** on top of the existing Express server. This gives you a visual interface that works in any browser, supports rich media (images, charts, PDFs), and can be accessed from mobile. It's also the foundation for a potential SaaS offering. Most importantly: the web frontend you build here can be **directly reused** inside a Tauri app later.

**Phase 3 (When ready — 2-3 months):**
Build **Jeriko Terminal** as a **Tauri app** that wraps the Phase 2 web dashboard in a native window, bundles the Node.js CLI as a sidecar, and adds system tray integration, auto-updates, and a first-run setup wizard. The web UI is already built — Tauri just puts a native frame around it. This is when you ship the DMG, the MSI, the Homebrew Cask.

**This phased approach means:**
- Phase 1 de-risks the UI design (what do users actually want to see?)
- Phase 2 de-risks the frontend code (the web UI works before you wrap it in Tauri)
- Phase 3 is "just" packaging — the hardest part (the UI) is already done
- Each phase delivers standalone value — you're never building something that only pays off later

### The killer insight from your idea:

What makes "Jeriko Terminal" genuinely different from Warp/Wave/Ghostty is this: **those are terminals with AI bolted on. Jeriko Terminal would be an AI agent with a terminal bolted on.** The primary interface is the chat/command view. The raw terminal is secondary — a power-user escape hatch. That's an inversion of the current market, and it's a real differentiation story.

---

## Decision

**Proposed:** Phased approach — A (TUI) → C (Web Dashboard) → B (Tauri App)

**Rationale:**
Each phase delivers standalone value, de-risks the next phase, and the final product (Jeriko Terminal as a Tauri app) reuses 80%+ of the code from Phase 2. This avoids the classic mistake of spending months on a GUI before validating what users actually want.

---

## Consequences

### If we proceed (Phased A → C → B):

**Good:**
- Expands addressable market beyond terminal-literate developers
- Creates monetization opportunity (free CLI + paid GUI features)
- Competitive differentiation: "AI-first terminal" vs "terminal with AI"
- Web dashboard enables SaaS pivot if desired
- Each phase is independently shippable and valuable

**Bad:**
- Engineering time diverted from core CLI and integrations
- Two (eventually three) interfaces to maintain and document
- Risk of spreading too thin as a small team
- Tauri introduces Rust into the build chain (Phase 3)
- Auto-update, code signing, and installer maintenance overhead (Phase 3)

**Neutral:**
- The CLI remains the core — all interfaces call the same commands
- The Unix-first identity evolves to "Unix-core, accessible everywhere"
- Plugin system works identically across all interfaces

### If we don't proceed (Option E):

**Good:**
- Full engineering focus on CLI features and integrations
- Simpler codebase, fewer moving parts
- Pure Unix-first brand positioning maintained

**Bad:**
- Market limited to terminal users
- Competitive disadvantage as Warp/Wave/Amazon Q add visual layers
- Telegram bot remains the only "GUI" (requires Telegram account)
- No clear monetization path beyond hosting/SaaS

---

## References

| Source | Relevance |
|--------|-----------|
| [Warp: Terminal to Agentic IDE](https://www.warp.dev/blog/2025-in-review) | Competitor positioning, $73M raised |
| [How Warp Works (Rust rendering)](https://www.warp.dev/blog/how-warp-works) | Why they abandoned Electron |
| [Fig → Amazon Q CLI](https://techcrunch.com/2023/08/29/amazon-fig-command-line-terminal-generative-ai/) | Acquisition precedent |
| [Wave Terminal](https://github.com/wavetermdev/waveterm) | Open-source AI terminal, model-agnostic |
| [Ghostty (Zig terminal)](https://ghostty.org/docs/about) | Native performance benchmark |
| [Ink (React for CLI)](https://github.com/vadimdemedes/ink) | TUI framework, 28k+ stars |
| [Tauri vs Electron benchmarks](https://www.gethopp.app/blog/tauri-vs-electron) | 2.5MB vs 120MB bundles |
| [Hyper memory issues](https://github.com/vercel/hyper/issues/2586) | Electron terminal failure case |
| [Lazygit](https://github.com/jesseduffield/lazygit) | Successful TUI-over-CLI pattern |
| [Lens (K8s GUI)](https://k8slens.dev/) | CLI+GUI coexistence, acquired |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | CLI+GUI distribution model |

---

## Appendix: Name Ideas

If the Tauri app ships, the name matters:

| Name | Vibe |
|------|------|
| **Jeriko Terminal** | Clear, descriptive, professional |
| **Jeriko Studio** | Implies creation and power |
| **Jeriko Console** | Technical but accessible |
| **Jeriko Desktop** | Simple, Docker Desktop parallel |
| **Jeriko** (just the app) | Clean — CLI is `jeriko`, app is `Jeriko.app` |

---

*This ADR will be updated with the decision outcome after review.*
