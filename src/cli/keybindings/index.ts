/**
 * Keybinding Subsystem — public barrel.
 *
 * Consumers import from this module. Deep paths are legal but reserved for
 * circular-dependency-sensitive cases.
 */

// --- Types ------------------------------------------------------------------
export type {
  Binding,
  BindingHandler,
  BindingScope,
  BindingSpec,
  Chord,
  HandlerResult,
  KeyEvent,
  NamedKey,
  StoreSnapshot,
} from "./types.js";
export { BINDING_SCOPES, NAMED_KEYS } from "./types.js";

// --- Matcher ----------------------------------------------------------------
export {
  normalizeInkKey,
  parseChord,
  formatChord,
  keyEventsEqual,
  chordMatches,
  chordStartsWith,
  ChordParseError,
} from "./matcher.js";
export type { InkKey } from "./matcher.js";

// --- Store ------------------------------------------------------------------
export {
  createKeybindingStore,
  DEFAULT_CHORD_TIMEOUT_MS,
} from "./store.js";
export type {
  KeybindingStore,
  StoreOptions,
  Scheduler,
  ScheduledTask,
} from "./store.js";

// --- Defaults ---------------------------------------------------------------
export {
  DEFAULT_BINDINGS,
  DEFAULT_BINDINGS_BY_ID,
} from "./defaults.js";

// --- Config loader + schema -------------------------------------------------
export { loadKeybindings } from "./config.js";
export type { ConfigDiagnostic, LoadResult, LoaderOptions } from "./config.js";
export { userConfigSchema } from "./schema.js";
export type { UserConfig } from "./schema.js";

// --- Provider + hooks -------------------------------------------------------
export {
  KeybindingProvider,
  useKeybinding,
  useKeybindingScope,
  useKeybindingSnapshot,
  useKeybindingStore,
  useKeybindingSpecs,
} from "./provider.js";
export type {
  KeybindingProviderProps,
  UseKeybindingOptions,
} from "./provider.js";

// --- Help overlay -----------------------------------------------------------
export { KeybindingHelp } from "./Help.js";
export type { KeybindingHelpProps } from "./Help.js";
