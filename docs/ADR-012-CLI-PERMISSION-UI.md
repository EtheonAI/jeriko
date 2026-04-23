# ADR-012 — CLI Permission UI

Status: **Accepted — shipped (CLI side; daemon adapter pending)**
Date: 2026-04-23
Author: Jeriko core
Depends on: ADR-006 (UI primitives), ADR-007 (Theme v2), ADR-008 (Keybindings),
            ADR-010 (Rendering component migration)

## Context

Every CLI-level tool call (bash, file writes/edits, web fetches, connector
calls, skill scripts) runs through the daemon's exec-gateway lease pipeline
(`src/daemon/exec/gateway.ts`). Today that pipeline decides allow/deny
using config-driven rules alone — there is no interactive approval path,
so a user-initiated sensitive action either succeeds silently or fails
silently based on the static rule set.

Claude Code's permission dialogs (Bash/FileEdit/FileWrite/WebFetch/etc.)
are one of the most visible UX affordances the reference CLI provides.
This ADR delivers the CLI-side equivalent: a typed permission-request
queue, a themed dialog rendered on Subsystem 1 primitives, keybinding-
driven decisions via Subsystem 3, and a persistent/session rule cache.

The **daemon-side lease-event emission** — the wire that transforms a
pending `ExecutionLease` into a `PermissionRequest` and awaits the UI's
decision before returning a `LeaseDecision` — is explicitly out of scope
for this ADR. It lives in the exec-gateway and belongs to the runtime
agent. Subsystem 7 builds the plug; the adapter slots in later.

## Decision

Create `src/cli/permission/` as a self-contained subsystem with typed
store, matcher, config, bridge contract, React provider, dialog, and
overlay. Add six permission-* bindings to the keybinding defaults so
`y / Shift+Y / a / n / d / Esc` behave uniformly everywhere.

### Directory layout

```
src/cli/permission/
  index.ts                       public barrel
  types.ts                       PermissionKind, RiskLevel,
                                 PermissionDecision, PermissionRequest,
                                 PermissionRule, PermissionSnapshot
  matcher.ts                     evaluate, targetFor, targetMatches
  schema.ts                      zod schema (persistedRuleSchema, permissionConfigSchema)
  config.ts                      loadPermissions + savePermissions (diagnostic-rich)
  store.ts                       createPermissionStore (queue + rules + auto-drain)
  bridge.ts                      PermissionBridge + createInMemoryBridge + createAutoApproveBridge
  provider.tsx                   PermissionProvider + usePermissionStore/Queue/Rules/Snapshot
  PermissionDialog.tsx           per-kind rendered dialog (Subsystem 1)
  PermissionOverlay.tsx          queue-head renderer + keybinding wiring
```

### Types

- `PermissionKind` — closed union of six: `bash`, `file-write`,
  `file-edit`, `web-fetch`, `connector`, `skill`. Each has its own
  typed body (e.g. `BashRequestBody { command, cwd? }`).
- `RiskLevel` — `low | medium | high | critical`. Drives the dialog's
  intent + badge tone via a pure mapping.
- `PermissionDecision` — `allow-once | allow-session | allow-always |
  deny-once | deny-always`. Three lifetime tiers: this request only,
  in-memory session cache, persisted to disk.
- `PermissionRequest` — envelope carrying id, agent, sessionId, risk,
  summary, issuedAt, and the kind-specific body.
- `PermissionRule` — `{ kind, target, decision: "allow"|"deny", origin:
  "session"|"persistent" }`. Target semantics documented on the type —
  it's a prefix / exact match depending on kind.

### Matcher

Pure `evaluate(request, sessionRules, persistentRules)`. Precedence:

1. Persistent deny wins over everything.
2. Session deny next.
3. Persistent allow.
4. Session allow.
5. No match → `null` (must ask user).

Within each tier, the longest matching `target` wins ("specificity beats
generality"). Deny rules at the same tier beat allow rules — a specific
deny can override a broader allow. Empty `target` is a wildcard for the
kind.

### Store

`createPermissionStore()` — per-app instance, not a singleton.

Core API:

```ts
enqueue(request): Promise<boolean>        // auto-resolves if rules match; otherwise queues
resolve(requestId, decision): void         // fires the pending promise + updates rules
snapshot(): PermissionSnapshot            // cached, stable-ref under unchanged state
subscribe(listener): () => void            // reactive notifications
rejectAllPending(): void                   // deny everything on shutdown
```

Snapshot caching is essential for React 18's `useSyncExternalStore` tear
check: the snapshot stays referentially stable between state changes,
invalidated only by `notify()`. Without this, repeated `getSnapshot`
calls return fresh objects and React assumes the store is "tearing",
retriggering renders endlessly.

**Auto-drain** on resolve: after a user decision creates a new rule,
the store re-matches every queued request. A user saying "allow-session
for git-*" simultaneously resolves every other git command waiting in
the queue — no UI churn.

### Config

`~/.config/jeriko/permissions.json`, strict-schema validated. Shape:

```json
{
  "rules": [
    { "kind": "bash",      "target": "git ",           "decision": "allow" },
    { "kind": "web-fetch", "target": "https://api.stripe.com", "decision": "allow" }
  ]
}
```

`loadPermissions()` never throws — six diagnostic kinds
(`missing-file | unreadable | malformed-json | shape-error |
unknown-binding | write-failed`) cover every failure path, each path
falls back to an empty rule list. `savePermissions()` writes atomically
via temp-file rename. IO is injectable so tests don't touch disk.

### Bridge

`PermissionBridge` is the CLI↔daemon interface:

```ts
interface PermissionBridge {
  attach(handler: PermissionRequestHandler): () => void;
}
interface InMemoryBridge extends PermissionBridge {
  submit(request: PermissionRequest): Promise<boolean>;
}
```

The daemon adapter calls `bridge.submit(request)`; the CLI-side handler
(wired in PermissionProvider's mount effect) returns `store.enqueue()`.
No attached handler → `submit` resolves `false` (deny) — the safe
default for non-interactive or headless contexts.

`createInMemoryBridge` and `createAutoApproveBridge` (always-true)
cover in-process + headless cases today.

### Provider + hooks

`<PermissionProvider bridge?={...}>` owns the store, wires it to the
bridge on mount, rejects any pending requests on unmount. Hooks:

- `usePermissionStore()` — direct store access (for dialogs that
  resolve).
- `usePermissionSnapshot()` — reactive snapshot of queue + rules.
- `usePermissionQueue()` — convenience reactive view of just the queue.
- `usePermissionRules()` — convenience reactive view of both rule
  lists.

### Dialog + Overlay

`PermissionDialog` (pure renderer) composes Subsystem 1's `Dialog`,
`Badge`, `Column`, `Divider`, and `KeyboardHint`. Per-kind preview
helpers produce the body (command + cwd; path + byte count; path +
diff; url + method; connector id + method; skill id + script).

`PermissionOverlay` reads `usePermissionQueue()`, renders the head
request's dialog, and registers keybindings via Subsystem 3's
`useKeybinding`:

| Key      | Binding id                    | Decision          |
|----------|-------------------------------|-------------------|
| y        | permission.allow-once         | allow-once        |
| Shift+Y  | permission.allow-session      | allow-session     |
| a        | permission.allow-always       | allow-always      |
| n        | permission.deny-once          | deny-once         |
| d        | permission.deny-always        | deny-always       |
| Esc      | permission.cancel             | deny-once (safe)  |

These live in Subsystem 3's `defaults.ts` under the `dialog` scope, so
users can re-chord them in `~/.config/jeriko/keybindings.json` without
touching any component code.

## Tests

`test/unit/cli/permission/` — five files, 66 tests, 125 assertions:

- `matcher.test.ts` — targetFor per kind, targetMatches prefix +
  wildcard + exact, evaluate precedence (deny over allow, persistent
  over session, specificity tie-breaking).
- `store.test.ts` — enqueue/resolve happy paths, rule lifetime per
  decision, auto-resolution from existing rules, auto-drain of queued
  siblings, subscribers, `rejectAllPending`, decision-semantics round
  trip.
- `config.test.ts` — every diagnostic path (missing / unreadable /
  malformed / shape / invalid-kind / invalid-decision), save atomicity
  (mkdir + temp-file rename), session-origin rules are stripped on
  save, round-trip save→load preserves every rule.
- `dialog.test.ts` — every kind renders expected content, risk label
  + keybinding hints present, theme reactivity (jeriko vs jeriko-light
  produce different frames).
- `overlay.test.ts` — end-to-end via direct store.enqueue (queue →
  dialog → keybinding dispatch → resolution → dialog unmounts); bridge
  attach/detach isolated.

React `useSyncExternalStore` integration required a snapshot-caching
contract on the store: `store.snapshot()` returns a stable reference
until `notify()` invalidates. Without that, the overlay never received
updates — React's tear-check bailed out. Fixed inside the store; both
sides now compose cleanly.

Full unit suite after Subsystem 7: all tests pass. Typecheck clean.

## Integration left to the daemon side

To complete the loop end-to-end, the exec-gateway needs to:

1. Emit a "pending lease" event when a non-auto-decidable lease appears.
2. Accept a decision (allow/deny) back over the same channel.
3. Convert the daemon's `ExecutionLease` into a `PermissionRequest` +
   the CLI-side decision back into a `LeaseDecision`.

The CLI's `PermissionBridge` is the single integration point for this —
the daemon adapter calls `bridge.submit(request)` from one side,
receives the resolved boolean, and hands a `LeaseDecision` back to the
gateway. Nothing in `src/cli/permission/` changes when the adapter
lands.

## Consequences

Positive

- **Every sensitive action can now ask the user.** The UI is in place;
  the daemon adapter is a straightforward plug.
- **Typed kinds + risk + bodies.** Rendering, matching, and rule
  storage all share the same closed unions — adding a new kind is a
  compile-time-enforced multi-file change.
- **Decision precedence is intuitive and documented.** Specificity +
  deny-over-allow + persistent-over-session covers every real case
  without a policy-language DSL.
- **Bridge decouples CLI from wire protocol.** The daemon-side
  implementation can evolve freely; the CLI sees only typed
  requests/decisions.
- **Theme-reactive dialog, keybinding-driven decisions.** Composes
  cleanly with every prior subsystem.

Negative / costs

- **No real interactive approval path until the daemon adapter lands.**
  Today the UI sits idle; the subsystem is dead weight until the
  runtime agent's work integrates. Documented as a known pending
  integration.
- **Conservative default rule target on `allow-session`.** The store
  derives the target from `targetFor(request)` verbatim — e.g. for a
  bash command the target is the whole command line. A future UI-side
  "edit rule target before confirming" affordance would widen targets
  so "allow-session for every `git *` command" works from a single
  dialog; for now the user must pick `allow-always` via the config
  file to get broad rules.
- **In-memory bridge's default-deny when unattached** could surprise a
  headless caller. `createAutoApproveBridge` is documented as the
  alternative for that case — explicit policy, not implicit.

## References

- `src/cli/permission/` — subsystem source.
- `test/unit/cli/permission/` — subsystem tests.
- `src/cli/keybindings/defaults.ts` — `permission.*` bindings added.
- ADR-006 (Dialog, Badge, KeyboardHint primitives).
- ADR-007 (theme context the dialog consumes).
- ADR-008 (keybinding registry + scope stack).
- `src/daemon/exec/gateway.ts` — where the daemon-side integration
  will land.
