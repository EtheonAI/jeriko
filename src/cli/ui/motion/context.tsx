/**
 * UI Subsystem — motion context.
 *
 * Exposes a MotionMode to all descendants. Primitives read via useMotion()
 * and branch between animated / static / hidden rendering.
 *
 * Detection order (first match wins):
 *   1. Explicit `mode` prop on MotionProvider
 *   2. JERIKO_NO_MOTION=1      → "none"
 *   3. JERIKO_NO_MOTION=reduced → "reduced"
 *   4. TERM=dumb               → "none"
 *   5. NO_COLOR set            → "reduced" (animations removed, color optional)
 *   6. default                 → "full"
 */

import React, { createContext, useContext, useMemo } from "react";
import type { MotionMode, MotionPreferences } from "../types.js";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const MotionContext = createContext<MotionPreferences>({ mode: "full" });

/** Access motion preferences inside a component tree. */
export function useMotion(): MotionPreferences {
  return useContext(MotionContext);
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Resolve a MotionMode from environment variables.
 * Pure — given the same env, returns the same result. Easy to test.
 */
export function detectMotionMode(
  env: Record<string, string | undefined> = process.env,
): MotionMode {
  const flag = env.JERIKO_NO_MOTION;
  if (flag === "1" || flag === "true" || flag === "none") return "none";
  if (flag === "reduced") return "reduced";
  if (env.TERM === "dumb") return "none";
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return "reduced";
  return "full";
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface MotionProviderProps {
  /** Explicit override — useful in tests and when a user flag forces a mode. */
  readonly mode?: MotionMode;
  readonly children: React.ReactNode;
}

export const MotionProvider: React.FC<MotionProviderProps> = ({ mode, children }) => {
  const value = useMemo<MotionPreferences>(
    () => ({ mode: mode ?? detectMotionMode() }),
    [mode],
  );
  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
};
