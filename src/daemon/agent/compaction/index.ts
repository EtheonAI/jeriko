// Compaction subsystem — public API.
//
// Agent code imports `autoCompact`, `shouldAutoCompact`, `reactiveCompact`,
// and `isOversizedError` from here. Nothing else from `./auto`, `./reactive`,
// or `./summarize` should be imported directly — those are implementation
// details and may change.

export {
  autoCompact,
  shouldAutoCompact,
  type AutoCompactInput,
} from "./auto.js";
export {
  reactiveCompact,
  isOversizedError,
  type ReactiveCompactInput,
} from "./reactive.js";
export {
  DEFAULT_COMPACTION_POLICY,
  mergePolicy,
} from "./constants.js";
export type {
  CompactionPolicy,
  CompactionResult,
  CompactionStrategyName,
} from "./types.js";
