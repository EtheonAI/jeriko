/**
 * ThemeProvider — React context that powers live theme switching.
 *
 * Three concerns the provider owns:
 *
 *   1. React state for the current theme id — flips via `setTheme`, which
 *      triggers a re-render of every descendant consuming `useTheme()`.
 *
 *   2. PALETTE mutation + chalk formatter rebuild — delegated to the palette
 *      bridge (see ./palette-bridge). Non-React code that reads `PALETTE` or
 *      the `t.*` chalk wrappers sees the new values on the next access.
 *
 *   3. One-time system theme detection on mount when `autoDetect` is enabled
 *      and no theme was provided by the caller.
 *
 * The provider is the single writer of theme state. Callers never call
 * setActiveTheme() directly — they go through setTheme on the context.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import type { ThemeColors, ThemeId, ThemeKind } from "./types.js";
import { listThemesByKind, resolveTheme } from "./registry.js";
import { applyTheme } from "./palette-bridge.js";

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

export interface ThemeContextValue {
  /** Currently-active theme id. */
  readonly theme: ThemeId;
  /** Fully-resolved colors for the current theme. */
  readonly colors: ThemeColors;
  /** Switch to a different theme. Unknown ids fall back to default. */
  readonly setTheme: (id: ThemeId) => void;
}

// Context default is a live fallback to the registered default theme, so
// components that somehow render outside a provider still get valid colors.
const FALLBACK: ThemeContextValue = {
  theme: resolveTheme(undefined).id,
  colors: resolveTheme(undefined).colors,
  setTheme: () => {
    // Intentional no-op: a consumer without a provider cannot mutate state.
    // This keeps PALETTE stable and avoids silent cross-test pollution.
  },
};

export const ThemeContext = createContext<ThemeContextValue>(FALLBACK);

/** Access theme state. Must be called inside a <ThemeProvider>. */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface ThemeProviderProps {
  /** Initial theme id. If omitted, uses the registry default. */
  readonly initialTheme?: ThemeId;
  /** Run OSC 11 / $COLORFGBG detection at mount; only applies when initialTheme is undefined. */
  readonly autoDetect?: boolean;
  /** Async detector; injected for tests. Returns a ThemeKind, never throws. */
  readonly detect?: () => Promise<ThemeKind>;
  readonly children: React.ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  initialTheme,
  autoDetect = false,
  detect,
  children,
}) => {
  const seeded = resolveTheme(initialTheme);
  const [themeId, setThemeId] = useState<ThemeId>(seeded.id);

  // Mirror React state into PALETTE + chalk formatters on first mount and
  // whenever themeId changes.
  useEffect(() => {
    applyTheme(resolveTheme(themeId));
  }, [themeId]);

  // Auto-detect on mount if the caller did not pre-select.
  useEffect(() => {
    if (initialTheme !== undefined || !autoDetect) return;
    let cancelled = false;
    (async () => {
      const runner = detect ?? (async () => "dark" as ThemeKind);
      const kind = await runner();
      if (cancelled) return;
      // Pick the first theme that matches the detected kind; if no match,
      // fall through to the existing default (no state change).
      const match = listThemesByKind(kind)[0];
      if (match !== undefined) setThemeId(match.id);
    })();
    return () => {
      cancelled = true;
    };
    // initialTheme + autoDetect + detect are stable per instance by contract;
    // we want this to run exactly once at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTheme = useCallback((id: ThemeId) => {
    const resolved = resolveTheme(id);
    setThemeId(resolved.id);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: themeId,
      colors: resolveTheme(themeId).colors,
      setTheme,
    }),
    [themeId, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
