/**
 * Persistence-adapter boundary for the onboarding executor.
 *
 * The executor speaks a stable `PersistableOnboardingResult` shape so the
 * underlying `persistSetup` helper can evolve without dragging the executor
 * behind it. This file is the single import surface callers use to obtain
 * a live persister; tests inject a fake persister directly and never touch
 * this module.
 */

import { persistSetup as liveSetup } from "../wizard/onboarding.js";

/**
 * Data shape `persistSetup` needs. Deliberately narrower than the legacy
 * wizard's internal OnboardingResult because the executor assembles this
 * record from the new flow's typed result + side-effect outputs.
 */
export interface PersistableOnboardingResult {
  readonly provider: string;
  readonly model: string;
  /** Empty string when the provider does not use a key (Ollama, LM Studio). */
  readonly apiKey: string;
  /** Empty string when the provider has no env key (Ollama). */
  readonly envKey: string;
  /** Specific Ollama model selected, if any. */
  readonly localModel?: string;
}

/**
 * Live persister — writes config.json + .env atomically. Production callers
 * pass this straight through to {@link createOnboardingExecutor}.
 */
export async function persistOnboardingResult(result: PersistableOnboardingResult): Promise<void> {
  await liveSetup(result);
}
