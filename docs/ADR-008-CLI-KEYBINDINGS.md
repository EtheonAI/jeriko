# ADR-008 — CLI Keybindings

Status: **Accepted — shipped**
Date: 2026-04-23
Author: Jeriko core
Depends on: ADR-006 (UI v2, Subsystem 1), ADR-007 (Theme v2, Subsystem 2)

## Context

Before this subsystem, keybinding behaviour lived directly inside three Ink
components (`Input.tsx`, `Wizard.tsx`, `Setup.tsx`) as hand-written
`useInput` blocks of approximately 260 total lines. Consequences:

- No single source of truth for what keys do what. A `/keybindings` slash
  command had nowhere to look.
- No chord support; every binding was a single key press.
- No user customisation — the keys were baked into the source.
- No per-context scope resolution: Input's handler had to explicitly check
  `phase` and exit early to avoid interfering with dialogs.
- Each site duplicated "Emacs bindings" (Ctrl+A/E/U/K/W/J), history
  navigation wiring, and Escape-handling logic.

## Decision

Introduce `src/cli/keybindings/` — a self-contained subsystem that owns
key event normalization, chord parsing and matching, a reactive per-app
store, declarative defaults, a zod-validated user config format, React
provider + hooks, and a theme-aware `KeybindingHelp` overlay built on
Subsystem 1 primitives.

The subsystem is **purely additive** in this ADR. No existing `useInput`
site is modified. Subsystem 5 migrates the three sites onto
`useKeybinding()` in a single atomic commit, once the full surface is
proven. That ordering eliminates the risk of regressing live key
handling during the build-out.

### Directory layout

```
src/cli/keybindings/
  types.ts          KeyEvent, Chord, Binding, BindingScope, StoreSnapshot
  matcher.ts        normalizeInkKey, parseChord, formatChord, chordMatches, chordStartsWith
  store.ts          createKeybindingStore + Scheduler injection for deterministic chord tests
  defaults.ts       DEFAULT_BINDINGS (every key currently handled, declaratively)
  schema.ts         Zod schema for user config file
  config.ts         loadKeybindings() — diagnostics-rich, never throws
  provider.tsx      KeybindingProvider + useKeybinding, useKeybindingScope, useKeybindingSnapshot
  Help.tsx          <KeybindingHelp> overlay (uses Dialog + Column + Divider from ui/)
  index.ts          Public barrel
```

### Types

`KeyEvent` is the canonical wire format between Ink and the store. Ink's
per-call `(input, key)` pair is normalized into
`{ key: "return" | "escape" | ... | "a" | "1" | ..., ctrl, meta, shift }`
via `normalizeInkKey`. Downstream code never sees Ink-specific flags.

A `Chord` is a non-empty readonly array of `KeyEvent`s. Single-key bindings
are length-1 chords so the matching surface is uniform.

`BindingScope` is a closed literal union: `"global" | "input" | "messages"
| "wizard" | "dialog" | "help"`. Scope precedence is innermost-first with
`"global"` always appended as a final fallback.

`BindingSpec` is data (id, description, chord, scope). `Binding` adds a
handler. The split lets defaults.ts ship specs without committing to any
behaviour, and the zod schema validate user overrides by id without
needing to know handlers.

### Store semantics

`createKeybindingStore()` returns a per-app instance — never a global
singleton. Test code spins up fresh stores; production wires one via the
provider.

Dispatch rules:

1. Candidate = `pendingChord ++ [event]`.
2. If a binding's chord **equals** Candidate AND its scope is active:
   fire handler, clear pending, return `true`. If the handler returns
   exactly `false`, keep looking (explicit pass-through).
3. Else if some active binding's chord **starts with** Candidate:
   set pending = Candidate, schedule a 1.5s timeout to clear it, return
   `true`.
4. Else: clear pending, return `false`.

Scope precedence: innermost → outermost, with `"global"` always appended.
Within a scope, first-registered wins for a full match.

The chord timeout is injected via a `Scheduler` interface so tests drive it
deterministically without `setTimeout` + `sleep`. `DEFAULT_CHORD_TIMEOUT_MS`
is 1,500 — matches VS Code / Emacs conventions.

### Defaults

`DEFAULT_BINDINGS` is a single declarative array covering every key
currently handled in `Input.tsx`, `Wizard.tsx`, and `Setup.tsx` — 22
entries across `global`, `input`, `wizard`, and `help` scopes. Chord
strings are parsed at module load; a bad spec fails the import (CI
catches it before shipping).

User overrides target entries by id and replace only the chord field.
Description and scope are stable source-of-truth — users cannot rename
bindings or move them between scopes (that would orphan the handler).

### Config file

Path: `~/.config/jeriko/keybindings.json`. Shape:

```json
{
  "bindings": {
    "input.submit":     "ctrl+return",
    "global.interrupt": "ctrl+q"
  }
}
```

`userConfigSchema` (zod, strict) rejects:
- top-level extra keys,
- non-object `bindings`,
- ids that don't match `^[a-z][a-z0-9._-]*$`,
- empty chord strings.

The loader (`loadKeybindings`) classifies every failure:
`missing-file | unreadable | malformed-json | shape-error |
unknown-binding | invalid-chord`. Every diagnostic is non-fatal — the
loader always returns defaults for ids that failed, so the user gets a
working CLI even with a broken config.

### Provider + hooks

`<KeybindingProvider specs={...}>` creates a store once per mount and
exposes it via React context.

- `useKeybinding(id, handler, opts?)` — registers the handler under `id`.
  The chord comes from the provider's spec map (defaults merged with user
  overrides). A `useRef` holds the latest handler closure so component
  re-renders never re-register the binding.
- `useKeybindingScope(scope)` — pushes `scope` while mounted, pops on
  unmount. Composes cleanly.
- `useKeybindingSnapshot()` — `useSyncExternalStore`-backed reactive view
  of active scopes, pending chord, and all bindings. Used by the help
  overlay and by future chord-pending indicators.

### Help overlay

`<KeybindingHelp bindings={...}>` groups bindings by scope and renders a
`Dialog` (Subsystem 1) with a `KeyboardHint` footer. Every color resolves
through the theme context (Subsystem 2) — a theme switch restyles the
overlay instantly. No chalk calls, no hardcoded hex.

The overlay is pure rendering: it doesn't own a scope or dismiss handler.
Callers wrap it in their own dialog-state flow and register the dismiss
binding via `useKeybinding("help.dismiss", onClose)`.

## Tests

`test/unit/cli/keybindings/` — five files, 70 tests, 250 assertions.

- `matcher.test.ts` — `parseChord` across every legal and malformed
  variant; `formatChord` round-trips; `normalizeInkKey` for every Ink
  key flag plus paste → null; `keyEventsEqual`, `chordMatches`,
  `chordStartsWith` (strict prefix).
- `store.test.ts` — register/unregister/replace; scope push/pop;
  dispatch full matches + inactive scope + global fallback + explicit
  pass-through; chord pending/continuation/timeout/clear via injected
  Scheduler; subscribe/unsubscribe.
- `defaults.test.ts` — unique ids, non-empty descriptions, valid scopes,
  non-empty chords, canonical-id presence.
- `config.test.ts` — every diagnostic path (missing file, unreadable,
  malformed JSON, shape error, extra keys, bad id format, unknown id,
  invalid chord per-entry) + happy path preserving description/scope.
- `help.test.ts` — renders title, close hint, every description, every
  formatted chord, every scope heading; empty list doesn't throw.

All tests pass in isolation and in the full-suite run. Full CLI suite
after the subsystem lands: **1,184 / 1,184** (up from 1,114), zero
regressions, typecheck clean.

## Non-regression strategy

Subsystem 3 ships with no changes to `Input.tsx`, `Wizard.tsx`, or
`Setup.tsx`. Key handling continues exactly as before — the existing
`useInput` handlers remain the authoritative dispatch path.

Subsystem 5 will:
1. Add `<KeybindingProvider specs={loaded}>` in `app.tsx`.
2. Replace each `useInput` handler site with a cluster of
   `useKeybinding(id, handler)` calls.
3. Delete the hand-written key tables.
4. Wire `/keybindings` (slash command) to render `<KeybindingHelp>`.

That migration is one commit, easy to review, and trivially revertible
because this subsystem is additive until then.

## Consequences

Positive

- Every key the CLI responds to is discoverable from `DEFAULT_BINDINGS`,
  documented with a user-facing description, and overridable via a
  validated config file.
- Chord bindings (e.g. `Ctrl+K Ctrl+S`) are now possible — the store
  already supports them; Subsystem 5 just has to use them.
- `/keybindings` has a real implementation to back it (the help overlay).
- The three useInput sites can be collapsed from ~260 lines of key
  matching into one `useKeybinding` call per action.
- Theme-aware overlay, no chalk strings, no hardcoded layout — matches the
  rest of the subsystem discipline.

Negative / costs

- Two parallel dispatch paths exist until Subsystem 5 (existing
  `useInput` + the new store). Documented trade-off; necessary to avoid
  mid-flight regressions.
- Config file path (`~/.config/jeriko/keybindings.json`) is a new
  user-facing contract. Any future shape change needs a migration.

## References

- `src/cli/keybindings/` — subsystem source.
- `test/unit/cli/keybindings/` — subsystem tests.
- ADR-006 — UI primitives (Dialog, Column, Divider).
- ADR-007 — Theme context consumed by the help overlay.
- VS Code keybindings doc — inspiration for the chord-timeout + config
  override semantics.
