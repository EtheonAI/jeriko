/**
 * Theme Subsystem — public barrel.
 *
 * Every external caller imports from this module, never deep-paths into
 * presets/, detect/, or provider.tsx. The legacy single-file `themes.ts`
 * is gone; this barrel preserves its full public surface (THEMES,
 * DEFAULT_THEME, ThemePreset, Theme, ThemeColors, getTheme, listThemes)
 * and adds the v2 capabilities (registry, provider, detection).
 */

// --- Types ------------------------------------------------------------------
export type {
  Theme,
  ThemeColors,
  ThemeDescriptor,
  ThemeId,
  ThemeKind,
  ThemePreset,
  BuiltinThemeId,
} from "./types.js";
export { toDescriptor } from "./types.js";

// --- Registry ---------------------------------------------------------------
export {
  DEFAULT_THEME_ID,
  DEFAULT_THEME,
  THEMES,
  DuplicateThemeError,
  getTheme,
  resolveTheme,
  listThemes,
  listThemeDescriptors,
  listThemesByKind,
  registerTheme,
} from "./registry.js";

// --- Provider + hook --------------------------------------------------------
export {
  ThemeContext,
  ThemeProvider,
  useTheme,
} from "./provider.js";
export type { ThemeContextValue, ThemeProviderProps } from "./provider.js";

// --- Detection --------------------------------------------------------------
export {
  queryBackgroundColor,
  parseOSC11,
} from "./detect/osc11.js";
export type { OSC11Result, QueryOutcome, TerminalIO, QueryOptions } from "./detect/osc11.js";

export {
  detectSystemTheme,
  relativeLuminance,
  kindFromLuminance,
  parseColorFgBg,
} from "./detect/system.js";
export type { DetectOptions } from "./detect/system.js";

// --- Palette bridge ---------------------------------------------------------
// Exposed so tests can verify theme application without rendering a provider.
export { applyTheme } from "./palette-bridge.js";
