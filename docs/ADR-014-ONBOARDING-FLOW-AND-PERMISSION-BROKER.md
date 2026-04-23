# ADR-014 — Onboarding flow unification + daemon-side permission broker

## Status

Accepted — 2026-04-23.

## Context

Two long-standing problems in the interactive CLI shared a root cause: no
stable boundary between declarative UI state and async side effects.

1. **`/onboard` was a chain of four nested `launchWizard` calls**
   (`onboardProvider` → `onboardAuth` → `onboardOAuth | onboardApiKey` →
   `onboardOllama | onboardLMStudio | onboardFinalize`). Each level
   launched the next from inside its `onComplete`. Flow state lived in a
   mutable `OnboardState` object passed by reference. Adding a branch
   meant threading a new helper through every parent. Tests could only
   cover the outermost wizard because the others were private locals.
2. **The `PermissionProvider` in `chat.tsx` was wired to a
   `createAutoApproveBridge()` stub.** The exec gateway had no way to
   request consent: every medium/high-risk command ran silently. ADR-012
   specified the CLI side (dialog, matcher, store) but not the daemon
   seam — so the contract was declared, not honoured.

Both issues violated the project rule that all new subsystems land as
fully-integrated modules, not as inlined junk inside call sites.

## Decision

### Onboarding

- Keep `createOnboardingFlow` in `src/cli/flows/onboarding.ts` as a
  **pure** factory. It owns the step layout and one pure
  `parseResults` mapper, nothing else. Injectable `providers` and
  `daemonAvailable` keep the factory test-free of driver presets and
  socket IO.
- Introduce `src/cli/handlers/onboarding.ts` — the **executor**.
  Receives a typed `OnboardingResult`, runs verification, OAuth,
  Ollama detection, LM Studio detection, and persistence, and talks
  back through a narrow `OnboardingHost` surface (announce, setModel,
  updateSessionModel, pickFromList). Every external dependency is
  injected via `OnboardingDependencies`.
- Introduce `src/cli/handlers/onboarding-persist.ts` — a stable
  `PersistableOnboardingResult` adapter between the executor and the
  shared `persistSetup` helper. Keeps the executor's contract
  orthogonal to how the file-system writes happen.
- Delete the legacy helper chain from `system.ts` (`onboardProvider`,
  `onboardAuth`, `onboardOAuth`, `onboardApiKey`, `onboardOllama`,
  `onboardLMStudio`, `onboardFinalize`, `OnboardState`). The
  `async onboard()` handler is now ~25 lines of wire-up that builds the
  host, the deps, the executor, and the flow — then calls
  `launchWizard(toWizardConfig(flow))`.

### Permission broker

- Introduce `src/daemon/exec/broker.ts` — a tiny injected surface with
  `shouldAsk(lease)` + `ask({ lease, leaseId }) → boolean`. A
  module-scope registry (`registerBroker` / `getActiveBroker`) lets
  tools reach the active broker without threading context. Default
  policy (`askAtOrAbove: "medium"`) lives alongside the interface so
  adapters can delegate.
- Extend the exec gateway pipeline with a single consent step: after
  audit-allow, if a broker is registered and its `shouldAsk` returns
  true, route the lease through `broker.ask`. Deny verdicts (or thrown
  exceptions) convert the audited-allow into an audited-deny and
  return `exit_code: 126`.
- Introduce `src/cli/permission/daemon-broker.ts` — the adapter that
  wraps an `InMemoryBridge` as a `PermissionBroker`. Pure
  `leaseToRequest` mapper, `createBrokerFromBridge` factory.
- Teach `createBackend()` + `createInProcessBackend()` to accept a
  `permissionBridge`. When supplied, in-process mode registers a
  broker derived from the bridge. Daemon mode ignores it — the daemon
  carries its own broker registry.
- In `chat.tsx`, build a single `createInMemoryBridge()` and thread it
  through both the backend and the `PermissionProvider`. The rendezvous
  wires the exec gateway to the UI dialog with no new wire protocol.

## Consequences

- `/onboard` now has five public, typed branches (api-key, oauth,
  ollama, lmstudio, none) each covered by a unit test with fake
  dependencies — no mocked network, no real filesystem.
- Every medium+/high-risk shell command routed through the exec
  gateway in in-process mode reaches the CLI dialog before running.
  The auto-approve stub is gone from the production path (retained as
  an opt-in test fixture).
- Tests added: 41 new assertions across 4 files (flow, executor,
  broker, daemon-broker) + a 7-case gateway integration suite covering
  low-risk short-circuit, allow/deny verdicts, broker exceptions,
  lease-id continuity, and the no-broker default.
- No regressions: `bun test test/unit` reports 3,228 tests passing,
  zero failures (22 pre-existing audit-test failures are outside this
  ADR's scope — legacy fetch-mock timeouts).

## Alternatives considered

- **Extend `WizardConfig` with async step resolvers** so the Ollama
  detection could live as a pre-step inside the flow. Rejected: the
  wizard engine is intentionally synchronous, and mixing
  verification/persistence side effects into declarative step state
  would re-create the exact coupling this ADR removes.
- **Route consent through a new IPC method** instead of the
  module-scope broker registry. Rejected for in-process mode — the
  broker and the CLI dialog live in the same process. The daemon
  socket will layer on top of the same interface later without
  changing call sites.
- **Make every lease ask**. Rejected: low-risk reads (`ls`, `pwd`,
  `cat`) would thrash the user and erode trust in the dialog.

## References

- `src/cli/flows/onboarding.ts`
- `src/cli/handlers/onboarding.ts`
- `src/cli/handlers/onboarding-persist.ts`
- `src/daemon/exec/broker.ts`
- `src/daemon/exec/gateway.ts` (lines 276-304 — the consent step)
- `src/cli/permission/daemon-broker.ts`
- `src/cli/backend.ts` (`createBackend` / `createInProcessBackend`
  options)
- `src/cli/chat.tsx` (bridge rendezvous)
- ADR-009 (wizard unification), ADR-012 (permission UI), ADR-013 (CLI
  integration) — direct predecessors.
