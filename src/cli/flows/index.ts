/**
 * Flow Subsystem — public barrel.
 *
 * External consumers import from here. Each flow module (onboarding,
 * future: channel-add, connector-add, model-add, ...) exposes its typed
 * result interface and a factory returning a WizardFlow.
 */

// --- Types ------------------------------------------------------------------
export type { FlowContext, WizardFlow } from "./types.js";
export { toWizardConfig } from "./types.js";

// --- Registry ---------------------------------------------------------------
export {
  DuplicateFlowError,
  UnknownFlowError,
  getFlow,
  hasFlow,
  listFlowIds,
  registerFlow,
} from "./registry.js";
export type { FlowFactory } from "./registry.js";

// --- Flows ------------------------------------------------------------------
export {
  createOnboardingFlow,
} from "./onboarding.js";
export type {
  OnboardingFlowOptions,
  OnboardingResult,
} from "./onboarding.js";
