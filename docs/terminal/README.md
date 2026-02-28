# Jeriko Terminal — Documentation

The world's first natural language command center. A terminal where humans speak human.

## Documents

| Document | Purpose |
|----------|---------|
| [SPEC.md](./SPEC.md) | Complete product specification — vision, principles, UX, features |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Technical architecture — systems, data flow, file structure |
| [PHASE-1-SHELL.md](./PHASE-1-SHELL.md) | Phase 1: The Shell — Electron + React + IPC + router.js |
| [PHASE-2-RICH-OUTPUT.md](./PHASE-2-RICH-OUTPUT.md) | Phase 2: Rich Output — Components, animations, drag-drop, hotkey |
| [PHASE-3-INTEGRATIONS.md](./PHASE-3-INTEGRATIONS.md) | Phase 3: Integrations + Triggers + Webhook Relay |
| [PHASE-4-SHIP.md](./PHASE-4-SHIP.md) | Phase 4: Cross-Platform + Polish + Ship |

## Build Order

```
Phase 1 (Week 1-2)  →  User can type, get AI responses, basic tabs
Phase 2 (Week 3-4)  →  Rich output, drag-drop, hotkey, conversation memory
Phase 3 (Week 5-6)  →  Integrations, triggers, webhook relay
Phase 4 (Week 7-8)  →  Windows, Linux, themes, RTL, auto-update, ship
```

## Core Decisions (Locked)

- No sidebar. Everything through the prompt.
- One onboarding step: choose AI provider.
- router.js imported directly into Electron main process. No localhost server.
- Custom React input component. No xterm.js in v1.
- Basic tabs in v1. Each tab = independent conversation.
- Three UI exceptions: onboarding screen, settings overlay, OAuth browser redirect.
- Inline integration setup — connect when user first needs it.
- Outcomes not features in all user-facing text.
