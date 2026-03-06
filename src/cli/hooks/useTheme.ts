/**
 * useTheme — React context + hook for theme-aware components.
 *
 * Provides the current theme's colors to all components via context.
 * Components call `useTheme()` to get colors instead of importing PALETTE directly.
 *
 * Usage:
 *   const { colors, theme, setTheme } = useTheme();
 *   <Text color={colors.brand}>Jeriko</Text>
 */

import { createContext, useContext } from "react";
import type { ThemeColors, ThemePreset } from "../themes.js";
import { THEMES, DEFAULT_THEME } from "../themes.js";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface ThemeContextValue {
  /** Current theme preset name. */
  theme: ThemePreset;
  /** Resolved color values for the current theme. */
  colors: ThemeColors;
  /** Switch to a different theme. */
  setTheme: (theme: ThemePreset) => void;
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  colors: THEMES[DEFAULT_THEME].colors,
  setTheme: () => {},
});

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Access the current theme colors and setter from any component. */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
