# ADR-007 — CLI Theme v2

Status: **Accepted — shipped**
Date: 2026-04-23
Author: Jeriko core
Depends on: ADR-006 (CLI UX v2, Subsystem 1)

## Context

Before Theme v2 the CLI shipped a single `jeriko.ts` file containing exactly
one theme (`"jeriko"` — Electric Indigo) against a `ThemePreset` literal
union of length 1. A React context `ThemeContext` existed in
`src/cli/hooks/useTheme.ts` with a no-op `setTheme` in its default value,
meaning theme switching was structurally possible but never actually worked.
`src/cli/theme.ts` mutated a module-level PALETTE whose colors were read
both by Ink components (inconsistently — some primitives imported PALETTE
directly) and by non-React chalk consumers (format.ts, channel renderers).

This ADR captures the replacement: a directory-scoped Theme Subsystem with
six built-in themes, runtime extensibility, OSC 11 auto-detection, and a
real `<ThemeProvider>` that causes React re-renders on switch AND keeps the
legacy chalk PALETTE in sync.

## Decision

### Directory layout

`src/cli/themes/` replaces the single-file `src/cli/themes.ts`. The old
file is deleted — no shim, no dual module. Every consumer imports from the
barrel at `themes/index.ts`.

```
src/cli/themes/
  types.ts                 Theme, ThemeColors, ThemeId, BuiltinThemeId, ThemeKind
  registry.ts              THEMES, getTheme, resolveTheme, listThemes*, registerTheme
  provider.tsx             ThemeContext + ThemeProvider + useTheme hook
  palette-bridge.ts        One-call bridge to legacy setActiveTheme() in theme.ts
  detect/
    osc11.ts               queryBackgroundColor + parseOSC11
    system.ts              detectSystemTheme + luminance + $COLORFGBG
  presets/
    jeriko.ts              (migrated; Electric Indigo dark)
    jeriko-light.ts        (new; light mirror)
    nocturne.ts            (new; neutral dark w/ blue brand)
    solarized-dark.ts      (new; canonical palette)
    high-contrast.ts       (new; WCAG AAA on black)
    ansi-dark.ts           (new; 16-color safe)
  index.ts                 Public barrel
```

### Type shape

- `BuiltinThemeId` — closed literal union of the six preset ids.
- `ThemeId = BuiltinThemeId | (string & {})` — accepts runtime ids without
  widening the built-in surface (compile-time autocomplete still works).
- `ThemePreset` — back-compat alias of `ThemeId`.
- `Theme = { id, displayName, kind, colors }` where `colors: ThemeColors`
  is `readonly` on every field. Themes are immutable by type.
- `ThemeKind = "dark" | "light" | "high-contrast"`.
- `ThemeDescriptor = { id, displayName, kind }` — lightweight projection.

The preset record is typed `Record<BuiltinThemeId, Theme>`, so the compiler
enforces that every id in the union has a corresponding preset file. Adding
a preset is a two-line change: extend the union, add one entry.

### Registry

A `Map<ThemeId, Theme>` seeded with the six built-ins at module load. Public
API:

- `getTheme(id)` / `resolveTheme(id)` — lookup; resolve falls back to the
  registered default.
- `listThemes()` / `listThemeDescriptors()` / `listThemesByKind(kind)`.
- `registerTheme(theme)` — runtime add; returns an unregister handle;
  throws `DuplicateThemeError` for collisions (immutable-after-register).

The default id is `DEFAULT_THEME_ID = "jeriko"`. A back-compat alias
`DEFAULT_THEME` is re-exported for callers that used the old name.

### Provider + hook

`<ThemeProvider>` is the single writer of theme state:

1. React `useState` holds the active `ThemeId`.
2. A `useEffect([themeId])` calls `applyTheme(resolveTheme(themeId))`,
   which delegates to `setActiveTheme(theme)` in `theme.ts` — mutating
   PALETTE and rebuilding chalk formatters.
3. `setTheme(id)` is stable (`useCallback`), resolves the id, and setState.
4. `autoDetect` opt-in: on mount, if no `initialTheme` was provided, an
   injected detector (defaults to a `"dark"` resolver) is consulted and
   the provider picks the first theme of the detected kind.

`useTheme()` is re-exported from `src/cli/hooks/useTheme.ts` for Subsystem 1
primitives that import it there. The canonical definition lives with the
provider — `hooks/useTheme.ts` is now a pure re-export shim, zero behaviour.

### OSC 11 detection

`queryBackgroundColor(input, output, {timeoutMs})` writes `ESC]11;?ESC\`
to the output stream and parses one of the expected reply formats
(`rgb:RRRR/GGGG/BBBB` with 2, 4, or any 1–8 hex digits per channel; ESC\
or BEL termination). It never throws, never leaves stdin in raw mode after
completion (raw state is saved and restored), and resolves with a
classified `QueryOutcome`:

- `{ ok: true, value }`
- `{ ok: false, reason: "no-tty" | "timeout" | "unparseable" }`

Tests inject a `TerminalIO` fake so they never touch the real TTY.

`detectSystemTheme({env, input, output, timeoutMs})` chains:

1. OSC 11 (if streams provided) → luminance classification
2. `$COLORFGBG` parse
3. Default `"dark"`

Relative luminance uses ITU-R BT.709 gamma expansion; threshold is 0.5.

### theme.ts refactor

The legacy file shrinks to the narrow palette + chalk bridge:

- `PALETTE` is seeded from `resolveTheme(DEFAULT_THEME_ID).colors`.
- `MutableThemeColors` (a `{-readonly [K]: ThemeColors[K]}` mapped type)
  strips `readonly` so the palette can still be mutated without casting.
- `setActiveTheme` now accepts `Theme | ThemeId` — callers that already
  resolved a Theme pass it directly; handlers that only have an id get
  resolution via the registry.
- Unicode `ICONS`, `BOX`, and visual helpers are unchanged.

### Legacy surface preserved

Every symbol the old `themes.ts` exported is still exported from
`themes/index.ts`:

- `THEMES` (as `Record<BuiltinThemeId, Theme>`)
- `DEFAULT_THEME` (alias of `DEFAULT_THEME_ID`)
- `ThemePreset` (alias of `ThemeId`)
- `Theme`, `ThemeColors`
- `getTheme()`, `listThemes()`

Zero consumer changes were required beyond updating three import paths:
`theme.ts`, `hooks/useTheme.ts`, `ui/tokens.ts`.

## Tests

`test/unit/cli/themes/` — five files, 74 tests, 345 assertions:

- `registry.test.ts` — every built-in resolves; THEMES keys match the union;
  descriptors have expected shape; ids are unique; runtime register +
  unregister round-trip; duplicate rejection (including built-in ids).
- `presets.test.ts` — structural validation for every built-in: display
  name present, kind in the enum, every ThemeColors key present, every
  value is a 6-digit hex string.
- `osc11.test.ts` — parser accepts 4-digit / 2-digit / single-digit /
  BEL-terminated responses; rejects garbage; `queryBackgroundColor`
  returns the classified outcomes for TTY-absent / timeout / unparseable
  / success; detaches the data listener on resolve.
- `system.test.ts` — luminance math (black=0, white=1, green>red per
  BT.709); `parseColorFgBg` across common variants; detection default
  and env-based short-circuits.
- `provider.test.ts` — initial theme honored; unknown id falls back to
  default; `setTheme()` triggers re-render AND PALETTE propagation;
  `autoDetect` fires the detector and picks a matching theme; explicit
  `initialTheme` suppresses detection.

Provider tests use a `waitFor()` polling helper instead of hard-coded
`setTimeout`, so CPU load never flakes the assertions.

## Back-compat verification

All 1040 previous CLI tests continue to pass unchanged. Subsystem 1's 78
tests still pass. Zero regressions. Full typecheck clean.

## Consequences

Positive

- Six themes ship in the binary; the CLI `/theme` command now has real
  options. Adding a seventh is a two-line change.
- Every Subsystem 1 primitive is automatically theme-reactive — a single
  `setTheme` call re-renders the whole Ink tree AND rebuilds chalk.
- Auto-detection gives the user the right theme on first launch with
  zero config, failing gracefully when OSC 11 is unavailable.
- The type system enforces that every preset supplies every `ThemeColors`
  key — `presets.test.ts` would flag any drift at CI time.

Negative / costs

- `theme.ts` still owns mutable module state (PALETTE). This is a known
  crutch documented in `palette-bridge.ts`; Subsystem 5 eliminates it by
  threading colors through the React context exclusively.
- Callers who read colors by destructuring PALETTE outside React (format.ts,
  channels) do not re-render automatically on theme switch. They observe
  the new values on their next invocation. Subsystem 5 migrates them.

## References

- `src/cli/themes/` — subsystem source.
- `test/unit/cli/themes/` — subsystem tests.
- `src/cli/theme.ts` — refactored legacy palette + chalk bridge.
- `src/cli/hooks/useTheme.ts` — pure re-export of the canonical hook.
- ITU-R BT.709 — https://www.itu.int/rec/R-REC-BT.709
- OSC 11 spec — xterm Control Sequences, "Set / Query dynamic color".
