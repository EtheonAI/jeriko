/**
 * Flow Subsystem — type contracts.
 *
 * A "flow" is a named, strongly-typed wrapper around a WizardConfig. Each
 * flow owns:
 *   - a stable `id` (so slash commands can invoke it by name)
 *   - its own typed result shape (the engine speaks raw string[]; the flow
 *     deserializes into a meaningful domain object)
 *   - an opinionated `onComplete` that operates on the typed shape
 *
 * Why not just WizardConfig directly? Because WizardConfig's onComplete
 * receives `readonly string[]` — every caller that needs typed fields ends
 * up reimplementing the same `results[0], results[1]` dance. A Flow puts
 * that parse step in one place (the flow itself) so downstream code gets
 * domain types, not positional indices.
 */

import type { WizardConfig, WizardStepResolver } from "../types.js";

// ---------------------------------------------------------------------------
// Flow context — dependencies a flow needs at runtime
// ---------------------------------------------------------------------------

/**
 * Dependencies a flow closure may consume. Intentionally minimal — flows
 * that need more reach into the parent's closure (where the Provider or
 * other subsystems are available). Keeping this narrow prevents flows from
 * becoming an ambient God-object.
 */
export interface FlowContext {
  /** Invoked with a user-facing system message when the flow finishes. */
  readonly announce: (message: string) => void;
  /** Invoked on flow cancellation. */
  readonly onCancel?: () => void;
}

// ---------------------------------------------------------------------------
// WizardFlow — the contract every flow implements
// ---------------------------------------------------------------------------

/**
 * A typed flow. Parameterized on `TResult`, which is the domain object the
 * flow produces from raw step answers. Flow authors implement `parseResults`
 * once; callers read `onComplete` / `onError` as normal typed callbacks.
 */
export interface WizardFlow<TResult> {
  /** Stable, kebab-case id (e.g. "onboarding"). */
  readonly id: string;
  /** Title shown at the top of the wizard. */
  readonly title: string;
  /** The declarative step list (static or resolver functions). */
  readonly steps: readonly WizardStepResolver[];
  /** Parse raw step answers into the flow's domain result. May throw. */
  readonly parseResults: (raw: readonly string[]) => TResult;
  /** Invoked with the typed result after all steps complete. */
  readonly onComplete: (result: TResult) => void | Promise<void>;
  /** Invoked when parseResults throws — keeps failure handling explicit. */
  readonly onParseError?: (err: unknown, raw: readonly string[]) => void;
}

// ---------------------------------------------------------------------------
// Adapter — lowers a typed WizardFlow into a raw WizardConfig for the engine
// ---------------------------------------------------------------------------

/**
 * Adapt a WizardFlow to the WizardConfig shape the Wizard component renders.
 * This is where the typed/raw boundary is crossed: the flow's parseResults
 * runs inside the engine's onComplete callback, so errors stay scoped to
 * the flow's onParseError handler instead of escaping as an unhandled
 * promise rejection.
 */
export function toWizardConfig<T>(flow: WizardFlow<T>): WizardConfig {
  return {
    title: flow.title,
    steps: flow.steps,
    onComplete: async (raw) => {
      let result: T;
      try {
        result = flow.parseResults(raw);
      } catch (err) {
        if (flow.onParseError !== undefined) flow.onParseError(err, raw);
        return;
      }
      await flow.onComplete(result);
    },
  };
}
