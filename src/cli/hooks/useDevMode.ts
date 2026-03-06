/**
 * useDevMode — Development mode state for tool execution control.
 *
 * Three modes (cycled with Shift+Tab):
 *   normal      — Show tool calls, require confirmation before execution
 *   auto-accept — Execute tools immediately without confirmation
 *   plan        — Show tool calls but don't execute (preview only)
 *
 * Provides context so deep components can check the current mode.
 */

import { createContext, useContext, useState, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DevMode = "normal" | "auto-accept" | "plan";

const MODE_CYCLE: DevMode[] = ["normal", "auto-accept", "plan"];

const MODE_LABELS: Record<DevMode, string> = {
  normal:       "Normal",
  "auto-accept": "Auto-Accept",
  plan:          "Plan",
};

const MODE_DESCRIPTIONS: Record<DevMode, string> = {
  normal:        "Tools require confirmation",
  "auto-accept": "Tools execute automatically",
  plan:          "Tools shown but not executed",
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface DevModeContextValue {
  mode: DevMode;
  label: string;
  description: string;
  setMode: (mode: DevMode) => void;
  cycleMode: () => void;
}

export const DevModeContext = createContext<DevModeContextValue>({
  mode: "normal",
  label: MODE_LABELS.normal,
  description: MODE_DESCRIPTIONS.normal,
  setMode: () => {},
  cycleMode: () => {},
});

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDevMode(): DevModeContextValue {
  return useContext(DevModeContext);
}

/** Create dev mode state for the provider. */
export function useDevModeState(initial: DevMode = "normal") {
  const [mode, setMode] = useState<DevMode>(initial);

  const cycleMode = useCallback(() => {
    setMode((current) => {
      const idx = MODE_CYCLE.indexOf(current);
      return MODE_CYCLE[(idx + 1) % MODE_CYCLE.length]!;
    });
  }, []);

  return {
    mode,
    label: MODE_LABELS[mode],
    description: MODE_DESCRIPTIONS[mode],
    setMode,
    cycleMode,
  };
}

export { MODE_LABELS, MODE_DESCRIPTIONS };
