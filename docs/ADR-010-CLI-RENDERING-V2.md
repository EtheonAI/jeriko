# ADR-010 — CLI Rendering v2: Component Migration + Memoization

Status: **Accepted — shipped**
Date: 2026-04-23
Author: Jeriko core
Depends on: ADR-006 (UI v2), ADR-007 (Theme v2), ADR-008 (Keybindings), ADR-009 (Wizard Unification)

## Context

After Subsystems 1–4, the theme system was strong but only partially
adopted. Nine CLI components — most of the surface the user actually sees
— still imported `PALETTE` directly from `src/cli/theme.ts`:

```
SubAgent.tsx   32 PALETTE refs
Messages.tsx    9
ToolCall.tsx    7
Spinner.tsx     6 (duplicate of ui/motion-primitives/Spinner)
ContextBar.tsx  5
Input.tsx       5
Autocomplete.tsx 4
StatusBar.tsx   3
ErrorBoundary.tsx 3
```

Direct `PALETTE` imports have two problems:

1. **No re-render on theme change.** PALETTE is a mutable module-level
   object. `setActiveTheme()` overwrites its fields, but React has no way
   to know that happened — so a theme switch only restyles components
   that already re-rendered for other reasons (e.g. on the next prop
   change). ThemeProvider's React state is the actual re-render trigger,
   and it reaches components via `useTheme()`.

2. **Pure functions that return hex colors are theme-invariant by
   construction.** `computeContextBar` returned `PALETTE.warning` as
   data; `getStatusIcon` in ToolCall similarly. Any caller that stored
   that hex in component state would freeze it at the theme active at
   capture time — a subtle, future-bug-inviting coupling.

Separately, two Spinner components existed side by side — the old
`src/cli/components/Spinner.tsx` from before Subsystem 1, and the newer
theme-aware `src/cli/ui/motion-primitives/Spinner.tsx`. The old one
needed to go.

Finally, app.tsx re-renders on every streamed token during an assistant
response. Every child component re-rendered in lockstep, even when its
own props hadn't changed by reference — wasted work the reducer's
immutable pattern already makes unnecessary if children are wrapped in
`React.memo`.

## Decision

Subsystem 5 executes in four phases:

### Phase B — Migrate every component off `PALETTE` onto `useTheme`

Nine components rewritten:

| File | Change |
|---|---|
| `ErrorBoundary.tsx` | Split class-only catcher from a functional `ErrorFallback` that calls `useTheme()`. Class no longer carries render concerns. |
| `Autocomplete.tsx`  | `useTheme()` hook at the top; all colors via `colors.*`. |
| `ContextBar.tsx`    | `computeContextBar` now returns a semantic `Tone` instead of a hex. Component resolves `tone → color` through `resolveTone(…, colors)`. Pure function is theme-invariant and easier to test. |
| `Input.tsx`         | `useTheme()` at function-component top; border / prompt / dim all from `colors.*`. |
| `ToolCall.tsx`      | `getStatusGlyph` returns a typed `{ char, tone }`. Component resolves tone. Sub-component `ToolResult` calls `useTheme()` itself — handles its own color decisions. |
| `Messages.tsx`      | Every sub-component (`UserMessage`, `SystemMessage`, `CompactToolCall`, `StreamingText`) calls `useTheme()`. Streaming cursor now uses `colors.info` for tinted ▊. |
| `StatusBar.tsx`     | `IdleStatus` uses `useTheme()`. Unused `formatDuration` import removed. |
| `SubAgent.tsx`      | Biggest migration (32 refs). `AGENT_TYPE_COLORS` repurposed from PALETTE-alias strings to semantic `Tone` union values. New `getAgentTypeTone()` + `getAgentTypeColor` (alias) return typed tones. Status icon resolution delegates to a `StatusIconByPhase` component that consumes theme context. Every `<Text color={…}>` now references `colors.*`. |
| `useSubAgents.ts`   | `AGENT_TYPE_COLORS: Record<string, Tone>` — semantic tones. `getAgentTypeTone(agentType): Tone`; `getAgentTypeColor` retained as back-compat alias. |

Invariant established by this phase: **no component under
`src/cli/components/` reads `PALETTE` directly.** `PALETTE` remains in
`theme.ts` solely as the bridge for non-React chalk consumers (format.ts,
channel renderers) — Subsystem 5b will retire that path.

### Phase C — React.memo around render-heavy consumers

Five top-level components gain memoization via the `Impl + React.memo`
pattern (preserves a named implementation function for React DevTools):

| Component | Expected benefit |
|---|---|
| `Messages`       | Skips re-render on every stream-text delta. Primary win. |
| `StreamingText`  | Stable during non-streaming phases. |
| `StatusBar`      | Stable through non-status-relevant changes. |
| `ToolCallView`   | Stable through non-tool-related changes. |
| `SubAgentList`   | Internal per-agent animation handled by each `AgentNode`'s own interval — list frame is still. |
| `SubAgentView`   | Frozen frames in history stay frozen. |

No custom `areEqual` comparator needed — the reducer produces new
references only when a slice actually changed, so `React.memo`'s default
shallow equal is sufficient. Claim is enforced by the reducer tests
(unchanged in this ADR).

### Phase D — Delete the duplicate Spinner

- `src/cli/components/Spinner.tsx` — deleted.
- `test/unit/cli/spinner.test.ts` and `test/unit/cli/components/spinner.test.ts` — deleted (`ui/motion-primitives/Spinner.tsx` has its own dedicated test suite covering every phase and motion mode).
- `src/cli/components/StatusBar.tsx` — imports updated to
  `../ui/motion-primitives/Spinner.js`; `preset=` prop renamed to
  `phase=` matching the new component's API at every call site.

### Phase E — Theme-reactivity tests

`test/unit/cli/components/theme-reactivity.test.ts` — 17 tests:

1. **Smoke** — every migrated component renders under `ThemeProvider`
   without throwing (10 components).
2. **Reactivity** — render each theme-reactive component under both
   `jeriko` (dark) and `jeriko-light` and assert the resulting frames
   differ. Any regression that severs the theme context re-render link
   will flip these assertions.

The existing `context-bar.test.ts` was updated: tone-based assertions
instead of hex comparisons. Tests are now theme-invariant — a future
theme-registry change can't break them.

## Tests

Full CLI suite after the subsystem: **all tests pass, typecheck clean,
zero regressions.** Full repo: **2,947 unit tests pass across 137
files.**

New files introduced by this subsystem: 1
Files migrated: 9 components + 1 hook (`useSubAgents`)
Files deleted: 3 (`components/Spinner.tsx` + two old spinner tests)
Public type changes: `ContextBarDisplay` (hex → tone), `AGENT_TYPE_COLORS`
(PALETTE aliases → Tone), `getAgentTypeTone` added.

## Out of scope (deferred to a subsequent subsystem)

- **Markdown LRU cache + streaming tokenizer.** Originally planned for
  Subsystem 5 but separated for coherent review. Will land in a
  dedicated rendering-v2 pass alongside the streaming markdown parser.
- **Retiring `PALETTE` entirely.** format.ts and channel renderers
  still read through the mutable singleton; migrating them to a
  theme-context-neighbour that re-renders would require restructuring
  their non-React call sites. Subsystem 5b territory.
- **Subsystem 3 keybinding dispatch migration.** The keybinding store
  is live but Input/Wizard/Setup still dispatch through their own
  `useInput`. Out of scope here; Subsystem 6+ will collapse them onto
  `useKeybinding`.

## Consequences

Positive

- **Theme switching actually works end-to-end.** Every component the
  user sees restyles instantly on `/theme switch`. Previously only UI
  primitives (Subsystem 1) and the Wizard (Subsystem 4) were
  theme-reactive.
- **Tests are theme-invariant.** Semantic tones replace hex assertions;
  a new theme can't accidentally break a passing test.
- **Render cost is predictable.** Messages and SubAgentList no longer
  re-render during token streaming — stream costs O(1) in component
  depth, not O(messages).
- **Single Spinner.** One canonical motion primitive; no drift risk.

Negative / costs

- `PALETTE` is still the truth for non-React chalk consumers. Documented
  as an interim coupling; eliminated later.
- `AGENT_TYPE_COLORS` values changed shape (PALETTE alias strings →
  Tone literals). The single test that asserted on these values was
  updated atomically; callers outside the module were already going
  through `getAgentTypeColor` and are unaffected.

## References

- `src/cli/components/` — all nine migrated files.
- `src/cli/hooks/useSubAgents.ts` — semantic-tone refactor.
- `src/cli/ui/motion-primitives/Spinner.tsx` — now the sole Spinner.
- `test/unit/cli/components/theme-reactivity.test.ts` — reactivity covenant.
- ADR-006 (UI primitives), ADR-007 (ThemeProvider) — the subsystems this
  migration makes live-reactive across the entire component surface.
