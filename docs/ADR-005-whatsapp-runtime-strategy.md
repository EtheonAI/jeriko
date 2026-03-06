# ADR-005: WhatsApp Runtime Strategy

**Status:** Proposed
**Date:** 2026-03-06
**Deciders:** @khaleelmusleh

## Context

Jeriko's WhatsApp channel uses `@whiskeysockets/baileys` (v6.17.16) for the WhatsApp Web
multi-device protocol. Baileys depends on the `ws` npm package for its WebSocket client
connection to WhatsApp servers.

**Problem:** Bun (our runtime, v1.3.10) does not implement the `ws` WebSocket `upgrade` and
`unexpected-response` events ([oven-sh/bun#5951](https://github.com/oven-sh/bun/issues/5951)).
This causes Baileys' WebSocket handshake to fail silently — it connects to WhatsApp servers but
never completes the handshake, so QR codes are never generated and authentication never succeeds.

This is a known, unresolved Bun limitation confirmed by:
- [oven-sh/bun#5287](https://github.com/oven-sh/bun/issues/5287) — Baileys.js specific
- [oven-sh/bun#5951](https://github.com/oven-sh/bun/issues/5951) — ws events not implemented
- OpenClaw documentation: "WhatsApp gateway runtime should use Node. Bun is flagged as incompatible."

The compiled binary (67MB) bundles the ws package but Bun's runtime still handles the actual
WebSocket connections, so the issue persists in both `bun run` and compiled binary modes.

## Decision Drivers

1. **User experience** — Users run `/channel add whatsapp`, scan QR, done. Must be simple.
2. **No external dependencies** — Jeriko is a single binary. No Docker, no separate servers.
3. **Reliability** — WhatsApp must reconnect automatically, survive daemon restarts.
4. **Cost** — Free for personal/developer use. No per-message fees.
5. **Legality** — Acceptable risk for personal AI assistant use.
6. **Bun-first architecture** — Jeriko compiles to a single Bun binary.

## Options Considered

### Option A: Node.js Subprocess Bridge (Baileys in Node, IPC to Bun)

Run Baileys in a managed Node.js child process. The Bun daemon spawns `node` with a
bridge script that handles all WhatsApp WebSocket traffic. Communication via JSON-line
stdio IPC.

```
┌─────────────────────┐     stdio/JSON     ┌──────────────────────┐
│  Bun Daemon          │◄──────────────────►│  Node.js subprocess   │
│  (kernel, CLI, API)  │  IPC messages      │  (Baileys + ws)       │
│  WhatsAppBridge      │                    │  wa-bridge.js         │
└─────────────────────┘                    └──────────────────────┘
```

**Architecture:**
- `wa-bridge.js` — Standalone Node.js script (~200 lines), bundled with Jeriko
- Spawned by `WhatsAppChannel.connect()` via `child_process.spawn("node", [bridgePath])`
- JSON-line protocol: `{type:"qr",qr:"..."}`, `{type:"connected"}`, `{type:"message",...}`, `{type:"send",...}`
- WhatsAppChannel adapter becomes a thin IPC client (same interface, different transport)
- Auth state: same `~/.jeriko/data/whatsapp-auth/` directory
- Lifecycle: subprocess started on connect, killed on disconnect, auto-restarted on crash

**Pros:**
- Uses the same Baileys library — no new API to learn, battle-tested protocol
- Full WhatsApp Web feature set (media, groups, reactions, typing, read receipts)
- Free, no API keys, no business account needed
- QR code flow works (Node.js has full ws support)
- Node.js is pre-installed on virtually every developer machine
- Small bridge script (~200 lines), easy to maintain
- Same ChannelAdapter interface — rest of codebase unchanged
- OpenClaw uses this exact pattern ("WhatsApp gateway should use Node")

**Cons:**
- Requires Node.js installed on user's machine (can't ship as single binary for WhatsApp)
- Extra process to manage (spawn, crash recovery, cleanup)
- IPC serialization overhead (negligible for chat messages)
- Two runtimes in production (Bun + Node)

**Risk:** Low — proven pattern (OpenClaw, fazer-ai/baileys-api), minimal code change.

---

### Option B: WhatsApp Cloud API (Official Meta API)

Use Meta's official WhatsApp Business Platform Cloud API with webhook-based messaging.

**Pros:**
- Official, sanctioned by Meta — no ToS risk
- Pure HTTP — works perfectly in Bun (no ws dependency)
- Webhook-based receiving — integrates with existing relay infrastructure
- No QR code needed — phone number registered via Meta Business Manager

**Cons:**
- **Requires Meta Business account** with business verification
- **Not free for personal use** — per-template pricing (from July 2025), 1,000 free service conversations/month
- **Cannot receive personal messages** — only works with WhatsApp Business numbers
- Complex onboarding: Meta developer account → App → WABA → phone number → verification
- Message templates need pre-approval for outbound
- 24-hour messaging window for free-form replies
- Users cannot use their personal WhatsApp number
- Fundamentally different product: business customer service, not personal AI assistant

**Risk:** High UX friction — completely changes the "scan QR and go" user experience.

---

### Option C: whatsapp-web.js (Puppeteer-based)

Use `whatsapp-web.js` which automates WhatsApp Web via headless Chromium/Puppeteer.

**Pros:**
- No ws event dependency — uses Puppeteer's Chrome DevTools Protocol
- QR code flow via browser automation
- Large community (13k GitHub stars)
- Might work in Bun (Puppeteer is HTTP-based, not ws-dependent)

**Cons:**
- **Requires headless Chromium** — 300-500MB download, 200-500MB RAM per session
- Severe memory leaks in production (documented: [#3459](https://github.com/pedroslopez/whatsapp-web.js/issues/3459), [#5817](https://github.com/pedroslopez/whatsapp-web.js/issues/5817))
- ~1GB memory leak over extended sessions
- CPU-intensive — browser rendering engine running 24/7
- Chromium version coupling — breaks when Chrome updates
- Completely incompatible with "single lightweight binary" philosophy
- Against Jeriko's architecture — we don't ship browsers

**Risk:** Very high — memory leaks, resource usage, fragile browser dependency.

---

### Option D: whatsmeow-node (Go FFI Bindings)

Use `whatsmeow-node` — TypeScript bindings for Go's `whatsmeow` library via koffi FFI.

**Pros:**
- Go-native WhatsApp protocol — no ws dependency, no browser
- Potentially works in Bun (FFI-based, not ws-based)
- whatsmeow is the most mature Go WhatsApp library (used by Matrix bridges)

**Cons:**
- **11 stars, 7 commits** — extremely immature, experimental
- Requires Go 1.25+ and CGO toolchain installed on user's machine
- Requires compiling a Go shared library (.so/.dylib) per platform
- koffi FFI compatibility with Bun is unconfirmed
- No production users
- Single maintainer, could be abandoned
- Complex build chain: Go → CGO → .so → koffi → Node/Bun

**Risk:** Very high — immature, complex build deps, unproven.

---

### Option E: Whapi.Cloud / Third-Party API Gateway

Use a cloud-hosted WhatsApp API gateway like Whapi.Cloud.

**Pros:**
- Pure HTTP REST API — perfect Bun compatibility
- QR code via their dashboard
- No business account needed
- Handles reconnection, session management

**Cons:**
- **$35/month per channel** — cost passed to every Jeriko user
- Vendor lock-in — depends on third-party staying in business
- Privacy concern — messages routed through third-party servers
- Against Jeriko's local-first, privacy-first philosophy
- Users' WhatsApp auth credentials stored on third-party servers

**Risk:** High — cost, privacy, vendor dependency.

---

### Option F: Wait for Bun Fix

Wait for Bun to implement the missing ws events.

**Pros:**
- Zero code change
- Cleanest long-term solution

**Cons:**
- Issue has been open since September 2023 (2.5+ years)
- No timeline from Bun team
- WhatsApp channel completely broken until fixed
- Users cannot use WhatsApp at all

**Risk:** Unacceptable — indefinite timeline, blocks a core feature.

## Decision Matrix

| Criteria                | A: Node Bridge | B: Cloud API | C: wwebjs | D: whatsmeow | E: Whapi | F: Wait |
|------------------------|:--------------:|:------------:|:---------:|:------------:|:--------:|:-------:|
| User simplicity        | ★★★★☆          | ★★☆☆☆        | ★★★☆☆     | ★☆☆☆☆        | ★★★☆☆    | ☆☆☆☆☆   |
| No external deps       | ★★★☆☆          | ★★★★★        | ★☆☆☆☆     | ★☆☆☆☆        | ★★★★★    | ★★★★★   |
| Reliability            | ★★★★☆          | ★★★★★        | ★★☆☆☆     | ★★☆☆☆        | ★★★★☆    | ☆☆☆☆☆   |
| Free / no cost         | ★★★★★          | ★★☆☆☆        | ★★★★★     | ★★★★★        | ★☆☆☆☆    | ★★★★★   |
| Personal number        | ★★★★★          | ☆☆☆☆☆        | ★★★★★     | ★★★★★        | ★★★★★    | ★★★★★   |
| Resource lightweight   | ★★★★☆          | ★★★★★        | ★☆☆☆☆     | ★★★★☆        | ★★★★★    | ★★★★★   |
| Maturity / proven      | ★★★★★          | ★★★★★        | ★★★★☆     | ★☆☆☆☆        | ★★★☆☆    | N/A     |
| Privacy / local-first  | ★★★★★          | ★★★☆☆        | ★★★★★     | ★★★★★        | ★★☆☆☆    | ★★★★★   |
| Implementation effort  | ★★★★☆          | ★★☆☆☆        | ★★☆☆☆     | ★☆☆☆☆        | ★★★☆☆    | ★★★★★   |
| **Total (out of 45)**  | **37**         | **27**       | **25**    | **21**       | **28**   | **25**  |

## Decision

**Option A: Node.js Subprocess Bridge.**

Spawn Baileys in a managed Node.js child process, communicating with the Bun daemon via
JSON-line stdio IPC. This is the same pattern used by OpenClaw (the closest competitor
with WhatsApp support) and is proven in production.

### Implementation Plan

1. **`src/daemon/services/channels/wa-bridge.ts`** — Node.js bridge script
   - Standalone, runs under `node` (not `bun`)
   - Initializes Baileys, manages auth state, handles reconnection
   - JSON-line protocol over stdin/stdout
   - Emits: `qr`, `connected`, `disconnected`, `message`, `sent`, `error`
   - Receives: `send`, `send_media`, `disconnect`, `typing`

2. **`src/daemon/services/channels/whatsapp.ts`** — Refactor to IPC client
   - `connect()` spawns `node wa-bridge.js` via `child_process.spawn`
   - JSON-line reader on subprocess stdout
   - Routes incoming messages to registered handlers
   - `send()` / `sendPhoto()` etc. write JSON commands to subprocess stdin
   - Auto-restart on subprocess crash (exponential backoff)
   - `disconnect()` kills subprocess gracefully

3. **`scripts/build.ts`** — Bundle bridge script separately
   - `wa-bridge.js` compiled/bundled as a standalone Node.js script
   - Shipped alongside the Jeriko binary (or embedded + extracted at runtime)

4. **Node.js detection** — Graceful degradation
   - On `connect()`, check if `node` is available in PATH
   - If not: clear error message with install instructions
   - `jeriko sys` reports Node.js availability for diagnostics

### Wire Protocol (JSON-line over stdio)

```
Bridge → Daemon:
  {"type":"qr","qr":"<base64-qr-data>"}
  {"type":"connected"}
  {"type":"disconnected","reason":"..."}
  {"type":"message","from":"...","text":"...","meta":{...}}
  {"type":"sent","id":"<correlation>","messageId":"..."}
  {"type":"error","message":"..."}

Daemon → Bridge:
  {"type":"send","id":"<correlation>","to":"...","text":"..."}
  {"type":"send_media","id":"<correlation>","to":"...","mediaType":"image","path":"..."}
  {"type":"typing","to":"..."}
  {"type":"disconnect"}
```

## Consequences

### Positive
- WhatsApp actually works — QR codes display, messages flow
- Same battle-tested Baileys library, full feature set
- ChannelAdapter interface unchanged — all CLI/Telegram commands work
- Privacy preserved — all data stays local
- Free for all users — no API keys or business accounts

### Negative
- Requires Node.js on user's machine (widespread but still a dep)
- Two-process architecture adds complexity to lifecycle management
- Bridge script must be maintained alongside Baileys version updates
- Slightly slower message delivery (IPC overhead, ~1-5ms, imperceptible)

### Neutral
- OpenClaw validates this pattern in production
- When/if Bun fixes ws events, migration back to in-process is straightforward

## References

- [oven-sh/bun#5951](https://github.com/oven-sh/bun/issues/5951) — ws events not implemented
- [oven-sh/bun#5287](https://github.com/oven-sh/bun/issues/5287) — Baileys + Bun issue
- [OpenClaw WhatsApp docs](https://docs.openclaw.ai/channels/whatsapp) — "Use Node for WhatsApp"
- [Baileys docs](https://baileys.wiki/docs/intro/) — Official Baileys documentation
- [WhatsApp Cloud API pricing](https://business.whatsapp.com/products/platform-pricing) — Meta pricing
- [whatsapp-web.js memory leaks](https://github.com/pedroslopez/whatsapp-web.js/issues/3459)
- [whatsmeow-node](https://github.com/vinikjkkj/whatsmeow-node) — Go FFI bindings (immature)
