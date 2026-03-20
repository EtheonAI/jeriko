/**
 * useBracketedPaste — terminal bracketed paste mode management.
 *
 * Enables bracketed paste mode on the terminal when the input is active,
 * and provides a cleaning function that strips paste marker artifacts
 * from input strings before they reach the input handler logic.
 *
 * Bracketed paste mode prevents the terminal from interpreting pasted
 * newlines as Enter key presses, which is essential for multi-line paste
 * support. Without it, pasting a multi-line prompt would submit after
 * the first line.
 *
 * Usage:
 *   const { cleanInput } = useBracketedPaste(isIdle);
 *
 *   useInput((rawInput, key) => {
 *     const input = cleanInput(rawInput);
 *     if (!input) return;
 *     // ... handle cleaned input
 *   });
 */

import { useEffect, useCallback } from "react";
import { useStdout } from "ink";
import { stripPasteMarkers, enableBracketedPaste } from "../lib/paste.js";

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface BracketedPasteResult {
  /**
   * Clean paste marker artifacts from a raw input string.
   *
   * Returns the input unchanged when no markers are present (fast path).
   * Returns empty string when the input consisted entirely of markers.
   *
   * @param rawInput - Raw input string from Ink's useInput callback
   * @returns Cleaned input string safe for processing
   */
  cleanInput: (rawInput: string) => string;
}

/**
 * Manage bracketed paste mode lifecycle and provide input cleaning.
 *
 * @param active - Whether paste mode should be enabled (typically `phase === "idle"`)
 * @returns Object with `cleanInput` function for stripping paste artifacts
 */
export function useBracketedPaste(active: boolean): BracketedPasteResult {
  const { stdout } = useStdout();

  // Enable bracketed paste mode when active, disable on cleanup
  useEffect(() => {
    if (!active) return;
    return enableBracketedPaste(stdout);
  }, [stdout, active]);

  // Stable reference — stripPasteMarkers is pure and stateless
  const cleanInput = useCallback(
    (rawInput: string): string => stripPasteMarkers(rawInput),
    [],
  );

  return { cleanInput };
}
