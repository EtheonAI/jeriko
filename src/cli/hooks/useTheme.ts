/**
 * useTheme — React hook for theme-aware components.
 *
 * Historical location preserved so Subsystem 1 primitives (and any other
 * component that already imports `../../hooks/useTheme.js`) continue to
 * resolve. The canonical implementation lives with the provider under
 * `src/cli/themes/provider.tsx` — this file re-exports it.
 *
 * Do not add behaviour here. Extend the provider instead.
 */

export {
  ThemeContext,
  ThemeProvider,
  useTheme,
} from "../themes/index.js";
export type { ThemeContextValue } from "../themes/index.js";
