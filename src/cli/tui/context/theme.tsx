/**
 * TUI ThemeProvider — Provides reactive theme colors to all components.
 *
 * Theme mode is detected before render() starts (in render.tsx) and passed
 * down as a prop, avoiding conflicts with @opentui's terminal management.
 */

import {
  createContext,
  useContext,
  createSignal,
  type ParentProps,
  type Accessor,
} from "solid-js";
import {
  getThemeColors,
  type ThemeColors,
  type ThemeMode,
} from "../lib/theme.js";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type ThemeAccessor = Accessor<ThemeColors>;

const ThemeContext = createContext<ThemeAccessor>();

/**
 * Access the current theme colors. Must be used within a ThemeProvider.
 */
export function useTheme(): ThemeAccessor {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme() must be used within a <ThemeProvider>");
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface ThemeProviderProps extends ParentProps {
  /** Theme mode — detected before render and passed in */
  mode?: ThemeMode;
}

export function ThemeProvider(props: ThemeProviderProps) {
  const [mode] = createSignal<ThemeMode>(props.mode ?? "dark");
  const theme: ThemeAccessor = () => getThemeColors(mode());

  return (
    <ThemeContext.Provider value={theme}>
      {props.children}
    </ThemeContext.Provider>
  );
}
