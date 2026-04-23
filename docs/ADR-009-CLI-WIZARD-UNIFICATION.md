# ADR-009 — CLI Wizard Unification

Status: **Accepted — shipped**
Date: 2026-04-23
Author: Jeriko core
Depends on: ADR-006 (UI v2), ADR-007 (Theme v2), ADR-008 (Keybindings)

## Context

Before this subsystem the CLI shipped **two** wizard components:

- `src/cli/components/Wizard.tsx` (416 lines) — the generic multi-step
  engine used by every slash-command flow (`/model add`, `/channel add`,
  `/connector add`).
- `src/cli/components/Setup.tsx` (227 lines) — a hand-written first-launch
  provider + API-key flow.

Setup.tsx duplicated ~70 % of Wizard's rendering logic, hardcoded its own
color tokens, and — crucially — was **dead code**. Nothing in the
production code path set `phase === "setup"`; the real onboarding happened
pre-Ink in `chat.tsx` via `@clack/prompts`. The component stayed in the
tree as an unreachable in-app re-setup affordance that never shipped.

Separately, `Wizard.tsx` supported only static step arrays. The onboarding
flow has an obvious need for a conditional second step — ask for an API
key only when the chosen provider requires one — which the existing API
couldn't express.

## Decision

Unify the two components into one engine, and formalize the concept of a
**flow** as a typed, registrable wrapper around a `WizardConfig`.

### Type changes in `src/cli/types.ts`

1. **`WizardStepResolver`** — new union:
   ```ts
   type WizardStepResolver =
     | WizardStep
     | ((previous: readonly string[]) => WizardStep | null);
   ```
   `WizardStep` remains a subtype, so every existing static step array is
   still valid without change. Dynamic steps receive prior answers and
   may return `null` to skip.

2. **`WizardConfig.steps`** widened to `readonly WizardStepResolver[]`.
   `WizardConfig.onComplete` accepts `readonly string[]`. Both changes are
   source-compatible for the three existing handler call sites (updated
   in the same commit).

3. **`Phase`** loses `"setup"`. The dead phase is removed from the union
   and from `isPhase`; `Input.tsx`, `StatusBar.tsx`, and two test files
   are updated in the same commit.

### Wizard engine changes in `src/cli/components/Wizard.tsx`

- Step resolution is now a `useMemo` that applies the resolver (or returns
  the static step) given current `results`.
- An `useEffect` auto-advances past `null` steps, pushing `""` into the
  results array so later step indices remain stable.
- PALETTE direct reads replaced with `useTheme().colors`, so Wizard is
  now a full Subsystem-2 citizen — a theme switch re-renders the wizard
  with new colors instantly.
- Small glyph constants (`pointer`, `checked`, `unchecked`, `maskBullet`)
  moved into a named `GLYPHS` object — no Unicode escapes scattered
  through render code.

### New subsystem in `src/cli/flows/`

```
flows/
  types.ts       WizardFlow<T>, FlowContext, toWizardConfig<T>
  registry.ts    registerFlow / getFlow / hasFlow / listFlowIds
                 DuplicateFlowError / UnknownFlowError
  onboarding.ts  createOnboardingFlow — replaces Setup.tsx behaviour
  index.ts       Public barrel
```

A `WizardFlow<TResult>` is the typed contract:

```ts
interface WizardFlow<T> {
  id: string;
  title: string;
  steps: readonly WizardStepResolver[];
  parseResults: (raw: readonly string[]) => T;
  onComplete: (result: T) => void | Promise<void>;
  onParseError?: (err: unknown, raw: readonly string[]) => void;
}
```

`toWizardConfig(flow)` lowers a flow into the engine's raw shape. The
parse step runs inside the engine's `onComplete`, so thrown errors route
through the flow's `onParseError` instead of becoming unhandled
rejections. Missing `onParseError` is swallowed — fail-quiet is the
intentional default because the engine isn't the right place to surface
domain errors.

`createOnboardingFlow({ providers?, onComplete })` replaces Setup.tsx:

- Step 0: dynamic `select` over `getProviderOptions()` (or an injected
  list for tests). The first entry is labelled "recommended"; providers
  where `needsApiKey === false` are labelled "no API key needed".
- Step 1: `WizardStepResolver` that reads the previous answer. If the
  chosen provider needs no API key, returns `null` (skipped); otherwise
  returns a `password` step with a validator enforcing minimum length,
  non-whitespace, and the shared `validateApiKey()` rules.
- `parseResults` rehydrates the full `ProviderOption` object from the
  raw string id; callers get `{ provider, apiKey }`, never
  `["openai", "sk-..."]`.

### Deletions

- `src/cli/components/Setup.tsx` — removed.
- `handleSetupComplete`, `handleSetupCancel` in `app.tsx` — removed.
- `persistSetup` import in `app.tsx` — removed (it's still used by
  `chat.tsx`'s pre-Ink clack flow, which is not touched).
- `phase === "setup"` render branch in `app.tsx` — removed.
- `"setup"` literal from `Phase` union and `isPhase`.

## Tests

`test/unit/cli/flows/` — four files, 21 tests, 37 assertions:

- `types.test.ts` — `toWizardConfig` preserves title/steps, passes typed
  results to `onComplete`, routes parse errors through `onParseError`,
  and swallows parse errors without `onParseError`.
- `registry.test.ts` — `registerFlow` + unregister + duplicate rejection
  + `getFlow` missing-id error + `hasFlow` + `listFlowIds` + idempotent
  unregister after replacement.
- `onboarding.test.ts` — step 0 surface (three options from injected
  providers); step 1 skip-null path (`needsApiKey=false`); step 1
  password-step path (`needsApiKey=true`); validator accepts/rejects
  short/empty/whitespace keys; `parseResults` happy paths for both
  paths + unknown-provider throw; end-to-end `toWizardConfig` →
  `onComplete` typed callback.
- `wizard-resolver.test.ts` — live Wizard with static steps renders the
  first step; live Wizard with an all-skip resolver auto-advances and
  fires `onComplete([""])` via the polling `waitFor` helper.

Full CLI suite after the subsystem lands: **all tests pass**, zero
regressions, typecheck clean. `Setup.tsx` and the `"setup"` phase are
gone from every source and test file.

## Consequences

Positive

- One wizard engine. Adding a new interactive flow is writing a
  `WizardFlow<T>` file, not cloning a component.
- Onboarding's skip-when-no-API-key case is expressed declaratively
  through `WizardStepResolver`, not as a phase machine inside a
  component's `useState`.
- Wizard is now theme-reactive (Subsystem 2). A `setTheme` call restyles
  it the same way it restyles everything else.
- Flow registry enables slash-commands to trigger any registered flow
  by id — ready for a future `/onboard` wiring without any engine
  changes.
- Two components (Wizard + Setup, ~643 lines) collapsed into one
  (Wizard, ~400 lines) + one flow module (~100 lines). Net negative
  LOC with strictly more capability.

Negative / costs

- `persistSetup` in `chat.tsx` remains the real onboarding path for
  first launch. When Subsystem 5 migrates `chat.tsx` onto the new
  flow/Wizard stack, the clack-based onboarding disappears too. That
  work is out of scope for this ADR.
- Flow registry is unused today — registered flows are consumed only
  when a slash command resolves them. Dead code in the sense of
  "no live caller," but intentional scaffolding for Subsystem 5+.

## References

- `src/cli/flows/` — subsystem source.
- `src/cli/components/Wizard.tsx` — refactored engine.
- `test/unit/cli/flows/` — subsystem tests.
- ADR-006 (UI primitives), ADR-007 (Theme context), ADR-008
  (Keybindings) — subsystems the refactored Wizard now composes with.
