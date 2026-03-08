/**
 * useTerminalWidth — responsive terminal width detection.
 *
 * Provides current terminal dimensions and derived layout helpers.
 * Listens for resize events to re-render on terminal size changes.
 *
 * Usage:
 *   const { width, height, isNarrow, isWide } = useTerminalWidth();
 */

import { useState, useEffect } from "react";
import { useStdout } from "ink";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NARROW_THRESHOLD = 60;
const WIDE_THRESHOLD = 100;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface TerminalLayout {
  /** Current terminal width in columns. */
  width: number;
  /** Current terminal height in rows. */
  height: number;
  /** Terminal is narrow (<60 cols) — use compact layout. */
  isNarrow: boolean;
  /** Terminal is wide (>=100 cols) — use full layout. */
  isWide: boolean;
  /** Truncate a path to fit within the given width. */
  truncatePath: (path: string, maxWidth?: number) => string;
}

export function useTerminalWidth(): TerminalLayout {
  const { stdout } = useStdout();
  const [width, setWidth] = useState(stdout?.columns ?? 80);
  const [height, setHeight] = useState(stdout?.rows ?? 24);

  useEffect(() => {
    if (!stdout) return;

    const onResize = () => {
      setWidth(stdout.columns);
      setHeight(stdout.rows);
    };

    stdout.on("resize", onResize);
    return () => {
      stdout.off("resize", onResize);
    };
  }, [stdout]);

  return {
    width,
    height,
    isNarrow: width < NARROW_THRESHOLD,
    isWide: width >= WIDE_THRESHOLD,
    truncatePath: (path: string, maxWidth?: number) => {
      const max = maxWidth ?? Math.floor(width * 0.4);
      if (path.length <= max) return path;
      return "..." + path.slice(-(max - 3));
    },
  };
}
