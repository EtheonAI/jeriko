# ADR-013 — CLI Integration & Wiring

Status: **Accepted — shipped**
Date: 2026-04-23
Author: Jeriko core
Depends on: ADR-006 (UI v2), ADR-007 (Theme v2), ADR-008 (Keybindings),
            ADR-009 (Wizard), ADR-010 (Rendering v2), ADR-011 (Rendering v3),
            ADR-012 (Permission UI)

## Context

Subsystems 1–7 shipped as fully-tested modules with typed contracts and
clean public barrels. But the providers (`<ThemeProvider>`,
`<KeybindingProvider>`, `<PermissionProvider>`) were never mounted in the
running app; the new slash commands (`/theme switch`, `/keybindings`)
had no handlers wired; the permission overlay wasn't in the render
tree. Every subsystem worked in isolation and in its own tests, but
none of that reached the user.

This ADR closes the loop. Subsystem 8 is the integration layer — the
boot-time plumbing that threads each subsystem into the real app flow,
eliminates the legacy stubs, and verifies the whole stack end-to-end
against a live local LLM.

## Decision

### Directory: `src/cli/boot/`

```
src/cli/boot/
  paths.ts          Canonical paths for theme/keybindings/permissions files.
  theme-config.ts   zod-validated theme.json loader + atomic saver.
  load-config.ts    Unified parallel config loader (loadCLIBootConfig).
  controllers.ts    Typed ThemeController + HelpController + NULL defaults.
  Bridges.tsx       ThemeControllerBridge + HelpControllerBridge (render null).
  index.ts          Public barrel.
```

### Controller-ref pattern

Slash-command handlers are pure async functions that run outside React.
They can't call `useTheme()` or `useState`. The integration uses a
"controller ref" pattern: a `MutableRefObject<Controller>` lives in
`App`, a bridge component inside the provider tree populates it with
imperative accessors (`setTheme`, `showHelp`, …), and handlers read
`ref.current` to act.

```ts
export interface ThemeController {
  readonly current: ThemeId;
  readonly set: (id: ThemeId) => void;
  readonly list: () => readonly Theme[];
}
```

`NULL_THEME_CONTROLLER` and `NULL_HELP_CONTROLLER` are safe no-op
defaults so handlers that fire before the first effect commits don't
throw.

### App tree changes (`src/cli/app.tsx`)

- Creates `themeControllerRef` + `helpControllerRef` via `useRef`.
- Maintains `helpVisible` state separately (set by the bridge's
  visibility callback) so re-renders happen on toggle.
- Passes the refs through to `useSlashCommands`.
- Renders `<ThemeControllerBridge>` and `<HelpControllerBridge>` — both
  render null, they only populate the refs.
- Mounts `<PermissionOverlay>` inside the main Box — the overlay
  renders null when the queue is empty, so zero cost at idle.
- Conditionally renders `<KeybindingHelp>` when `showHelpOverlay` is
  true (suppressed while a wizard or permission dialog is active, to
  avoid stacking modal-ish UI the user can't disambiguate).
- `handleInterrupt` now first checks `helpControllerRef.current.visible`
  and dismisses the help overlay before any other interrupt behaviour.

### chat.tsx wrapping

`startChat()` now:

1. Runs the pre-Ink clack onboarding (unchanged).
2. Awaits `loadCLIBootConfig()` — parallel load of theme + keybindings
   + permissions files.
3. Creates the backend (unchanged).
4. Prints the banner (unchanged) + surfaces any *actionable*
   diagnostics (missing-file is the silent default; everything else
   logs as `⚠ subsystem: kind`).
5. Renders the React tree wrapped in all three providers:

```
<ThemeProvider initialTheme={bootConfig.themeId ?? undefined} autoDetect={bootConfig.themeId === null}>
  <KeybindingProvider specs={bootConfig.keybindingSpecs} initialScopes={["input"]}>
    <PermissionProvider initialPersistentRules={bootConfig.permissionRules} bridge={createAutoApproveBridge()}>
      <App .../>
    </PermissionProvider>
  </KeybindingProvider>
</ThemeProvider>
```

The `createAutoApproveBridge()` is documented as a placeholder until
the daemon exec-gateway emits lease-pending events (ADR-012). Swapping
in the real daemon adapter is a one-line change here.

### Slash command handlers (`src/cli/handlers/system.ts`)

- `SystemCommandContext` extended with `themeControllerRef` +
  `helpControllerRef`.
- `/theme` rewritten:
    - no args / `list` → renders a list with `▸` on the active theme,
      hinting the `/theme <id>` form.
    - known id → calls `ctrl.set(id)` (live switch) + persists via
      `saveThemeConfig(themeConfigPath(), id)`. On write failure,
      emits a message that separates "switched live" from "not
      persisted."
    - unknown id → clean error.
- `/keybindings` added as a new handler: calls `helpControllerRef.current.toggle()`.
  The help overlay renders from `App` conditional on visibility.

### Slash command registry (`src/cli/commands.ts`)

- `SLASH_COMMANDS` grows from 26 → 27 (`/keybindings` added).
- `COMMAND_CATEGORIES` System block gains the same entry so it shows
  up in `/help` automatically.

### Keybinding defaults

Six `permission.*` bindings already added to `defaults.ts` under the
`dialog` scope (see ADR-012). Subsystem 8 adds no new keybindings —
`/keybindings` is a slash command, not a key binding.

### Dead code removed

- `getAgentTypeColor` back-compat alias in `useSubAgents.ts` deleted;
  the two tests that referenced it retargeted to `getAgentTypeTone`
  (one unit test, one audit test) via `sed -i 's/getAgentTypeColor/
  getAgentTypeTone/g'`. Zero consumers left outside tests.

### Snapshot caching fix (both stores)

A React 18 covenant: `useSyncExternalStore` expects `getSnapshot()` to
return a stable reference when underlying state has not changed.
Without caching, React warns "The result of getSnapshot should be
cached to avoid an infinite loop" and either tears or bails out of
renders.

Both `KeybindingStore` and `PermissionStore` now cache a single
`cachedSnapshot: Snapshot | null` and invalidate on `notify()`. This is
identical logic; the Permission store had it since Subsystem 7; the
Keybinding store gained it here.

Without this fix, the integration tests against the full App tree
silently produced empty frames.

## Tests

`test/unit/cli/boot/` — **2 files, 13 tests, 17 assertions:**

- `integration.test.tsx` (5 tests)
    - Tree mounts under all three providers without throwing.
    - Initial theme renders the expected brand color.
    - PermissionOverlay appears when a request enqueues.
    - `y` keybinding resolves allow-once.
    - `Esc` keybinding resolves deny-once (safe default).
- `walkthrough.test.tsx` (8 tests)
    - Boot: frame non-empty after first commit.
    - Registry: every built-in theme reachable.
    - Every permission kind (bash/file-write/web-fetch/skill/
      connector) exercised end-to-end through its dedicated
      keybinding path.
    - Help overlay hidden at boot (no `Keybindings` header in frame).

`test/integration/ollama-live.test.ts` — **real local-LLM smoke:**

- Probes `localhost:11434/api/tags` — skips cleanly if unavailable.
- Sends a short prompt to `llama3.2:latest` through `LocalDriver`.
- Verifies streaming chunks arrive + a `done` chunk fires + a
  non-empty text response.
- Passed in ≈5s against the operator's local ollama (19 models available).

Full unit suite after Subsystem 8: **all tests pass, typecheck clean,
zero regressions.** The five pre-existing failing tests were updated
to reflect intentional behavior changes:

- `SLASH_COMMANDS.size` assertion: 26 → 27.
- `/theme` test expectations updated for the new list/switch/error
  behavior.
- `createTestCtx` helpers in slash-handlers + edge-cases tests gained
  `themeControllerRef` and `helpControllerRef` stubs.

## Out of scope (honest follow-ups)

1. **Daemon exec-gateway emission of lease-pending events.** The
   permission loop is closed on the CLI side; when the runtime agent
   lands the adapter, `createAutoApproveBridge()` in `chat.tsx` gets
   replaced with the real adapter and approval dialogs go live.

2. **`/onboard` migration to the unified flow registry.** The legacy
   `onboardProvider()` chain in `handlers/system.ts` still owns the
   interactive onboarding because it has Ollama-specific model selection
   + OAuth branches. Migrating it to `createOnboardingFlow()` +
   `toWizardConfig()` is mechanically simple but requires re-creating
   the model-selection and OAuth branches inside the flow — a
   dedicated subsystem's work, not a rushed rewrite here. The flow
   registry is ready for that work.

3. **`ThemePreset` type alias.** Kept as a type-only re-export in
   `theme.ts` + `themes/types.ts` + `themes/index.ts` for any
   downstream code that might import it. No runtime bytes; removing
   it is cosmetic and was deprioritized vs. shipping the integration.

## Consequences

Positive

- **`/theme dark` now actually switches themes live and persists the
  choice.** First Subsystem-2 capability to reach the user.
- **`/keybindings` opens the help overlay with every registered
  binding** — user can discover every keystroke without leaving the
  REPL.
- **Permission dialog will appear the moment the daemon bridge
  adapter lands** — nothing more to wire in the CLI.
- **Full provider stack composes cleanly.** Integration tests prove
  every subsystem reaches the user; live ollama test proves the
  agent-loop side still works end-to-end.
- **Two React covenant bugs caught and fixed pre-production**
  (snapshot caching in both stores).

Negative / costs

- Controller-ref pattern is a deliberate escape hatch for
  "non-React handler wants imperative access to React state." It's
  the right pattern, but it's one more indirection future contributors
  need to understand.
- `NULL_*` defaults hide "handler fires before mount" bugs as no-ops
  instead of loud errors. Trade-off: safer at runtime, subtler to
  debug. Mitigated by integration tests that exercise the live path.

## References

- `src/cli/boot/` — integration source.
- `src/cli/app.tsx` / `src/cli/chat.tsx` — wiring call sites.
- `src/cli/handlers/system.ts` — `/theme` + `/keybindings` handlers.
- `test/unit/cli/boot/integration.test.tsx` — integrated-tree tests.
- `test/unit/cli/boot/walkthrough.test.tsx` — per-kind permission
  walkthrough + help overlay tests.
- `test/integration/ollama-live.test.ts` — live LLM smoke.
- ADR-012 — permission bridge interface this integration consumes.
