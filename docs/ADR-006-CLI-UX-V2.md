# ADR-006 — CLI UX v2

Status: **Accepted — in progress**
Date: 2026-04-23
Author: Jeriko core

## Context

Claude Code's terminal UI is the 2026 benchmark for agent CLIs: phase-specific
spinners, paste detection, streaming cursor, theme-aware rendering, permission
dialogs, structured keybindings, sub-agent trees. The leaked Claude Code source
ships ~389 React/Ink components organised around a reusable design-system layer
under `design-system/`.

Jeriko's CLI today (see `src/cli/`) has strong foundations — centralised
reducer, `<Static>` for history, bracketed-paste adapter, phase-aware spinner,
sophisticated sub-agent tree — but it is missing the design-system layer. Ten
of the 13 components directly import `PALETTE` for colors, hardcode the same
tree glyphs, re-implement borders, and each primitive-level concern (colors,
motion, focus) is distributed across consumers rather than centralised. The
result: polish work requires touching many files, tests couple to component
internals, and adding a new theme or a reduced-motion mode is tedious.

## Decision

Implement seven subsystems under `src/cli/` that together bring Jeriko's CLI
UX to best-in-class without rewrites to existing surface code:

1. **UI Subsystem** (this ADR, Subsystem 1) — primitive design system.
2. **Theme Subsystem v2** — registry, multiple themes, OSC 11 auto-detect,
   React context for live theme switching.
3. **Keybinding Subsystem** — central registry, chord support, per-context
   scope, user config via `~/.config/jeriko/keybindings.json`.
4. **Wizard Unification** — collapse Setup.tsx into a typed `WizardFlow`.
5. **Rendering Performance** — selectors, memoization boundaries, markdown
   token cache, incremental streaming markdown.
6. **Code & Markdown Rendering v2** — 12+ languages, streaming parse,
   theme-aware CodeBlock composite on top of Subsystem 1.
7. **Permission UI** — bridges the daemon's lease gateway into an
   interactive Dialog with keybinding-driven decisions.

Each subsystem is additive first: new files under a dedicated directory, a
public barrel export, its own test suite, and a migration plan for consuming
components. No subsystem patches existing components mid-flight; migration
lands as a distinct step once the new subsystem is proven.

## Subsystem 1 — UI primitives (delivered)

Location: `src/cli/ui/`.

### Contracts

`types.ts` exports closed literal unions so the compiler enforces every
consumer. No arbitrary string props.

- `Tone` — 15 semantic color tokens (`brand`, `text`, `muted`, `tool`,
  `success`, `error`, etc.). Every visible color in the UI resolves through
  this type.
- `Intent` — reduced 6-item palette for status-shaped primitives.
- `Size` — `sm | md | lg`.
- `BorderStyle` — `single | double | round | bold | classic` (Ink-compatible).
- `MainAxis` / `CrossAxis` — flexbox alignment, mapped to Ink values by the
  layout primitives.
- `MotionMode` — `full | reduced | none`.
- `Status` — `success | error | warning | info | pending | running`.
- `KeyHint` — keys/action pair used by `KeyboardHint`.
- `TreePosition` — `middle | last`, drives tree connector glyphs.

`tokens.ts` resolves tokens against a `ThemeColors`:

- `resolveTone(tone, colors)` — exhaustive switch.
- `toneFromIntent(intent)` / `resolveIntent(intent, colors)`.
- `resolveStatus(status)` — single source of truth for the status glyph table.
- `sizeToCells(size)` — maps `sm|md|lg` to `1|2|3`.

### Motion

A shared animation clock (`motion/clock.ts`) runs one `setInterval` per
distinct tick-rate regardless of how many primitives subscribe. The timer is
`.unref()`'d so a stray spinner never delays process exit. `useAnimationClock`
bridges the clock to React via `useSyncExternalStore` for tear-free reads and
accepts an `enabled` flag so reduced-motion paths schedule no timer.

`motion/context.tsx` resolves a `MotionMode` from env (`JERIKO_NO_MOTION`,
`TERM=dumb`, `NO_COLOR`) or from an explicit prop on `MotionProvider`.
`useMotion()` is the consumer hook. All motion primitives branch off this.

### Primitives

Grouped by concern; each exports one focused component:

- `layout/` — `Row`, `Column`, `Gap`, `Divider`.
- `chrome/` — `Pane`, `Dialog`, `Badge`, `StatusIcon`, `KeyboardHint`.
- `motion-primitives/` — `Spinner`, `Shimmer`, `FlashingChar`, `ProgressBar`.
- `data/` — `ListItem`, `TreeNode`, `TreeChild`, `CodeBadge`.

Every primitive:

- Resolves color via `useTheme()` + `resolveTone` — no hardcoded hex.
- Honors reduced-motion and no-motion modes where animation applies.
- Has typed props (`readonly` where appropriate, no `any`).
- Has snapshot + interaction tests under `test/unit/cli/ui/`.

### Public API

`src/cli/ui/index.ts` is the barrel export. Consumers should import from it
(`import { Dialog, Spinner } from "../ui/index.js"`). Deep imports are legal
but reserved for circular-dependency-sensitive cases.

### Tests

`test/unit/cli/ui/` — six files, 78 tests, 202 assertions:

- `tokens.test.ts` — exhaustive resolver coverage.
- `motion.test.ts` — clock lifecycle (subscribe/unsubscribe/multi-subscriber/
  idempotent unsubscribe) and `detectMotionMode` env matrix.
- `layout.test.ts` — structural checks on Row, Column, Gap, Divider.
- `chrome.test.ts` — content assertions for Pane, Dialog, Badge, StatusIcon,
  KeyboardHint across every variant.
- `motion-primitives.test.ts` — Spinner/Shimmer/FlashingChar/ProgressBar
  across every motion mode, plus clamp and label rendering on ProgressBar.
- `data.test.ts` — ListItem selection/hint/leading/trailing, TreeNode middle/
  last/depth, TreeChild branch vs space, CodeBadge.

### Non-goals for Subsystem 1

- Migration of existing components (`components/Spinner.tsx` coexists
  with `ui/motion-primitives/Spinner.tsx`; migration happens in Subsystem 5).
- Theme-switching UX (`setActiveTheme` exists but the theme registry upgrade
  lives in Subsystem 2).
- Any permission or keybinding behaviour (Subsystems 3 & 7).

## Migration plan

Subsystems 2–7 each consume Subsystem 1 primitives. The migration path for
existing components:

1. Subsystem 5 replaces direct `PALETTE` imports with `useTheme()` where
   color semantics apply, and swaps ad-hoc `<Box borderStyle=...>` for `Pane`.
2. The old `components/Spinner.tsx` becomes a thin re-export of
   `ui/motion-primitives/Spinner.tsx`; once all sites use the new one, the
   shim is deleted in a single atomic commit.
3. `components/SubAgent.tsx` migrates its tree-rendering to `TreeNode` /
   `TreeChild`; its glyph constants are deleted in favour of `TREE_GLYPHS`.

No existing file is modified as part of Subsystem 1.

## Consequences

Positive

- Every new composite (PermissionDialog, WelcomeScreen, ThemePicker, etc.)
  is built against a tested primitive surface.
- Theme and motion changes become one-line PRs instead of codebase-wide sweeps.
- Reduced-motion and no-motion are first-class — no component gets to ignore
  them.
- Tree glyphs, status icons, size tokens, border styles live in exactly one
  place each.

Negative / costs

- Short-term duplication: the old Spinner coexists with the new one until
  Subsystem 5 migration. This is intentional; avoids a sweeping patch to
  unproven code.
- One new directory to navigate. Mitigated by the barrel at `ui/index.ts`.

## References

- `src/cli/ui/` — subsystem source.
- `test/unit/cli/ui/` — subsystem tests.
- Claude Code leak `design-system/` — structural inspiration for Pane, Dialog,
  KeyboardHint, Divider.
- Ink docs on `borderStyle`, `useSyncExternalStore` rationale for tear-free
  external stores.
