/**
 * Spinner — Phase-aware animated spinner as a React component.
 *
 * Supports multiple spinner styles via presets:
 *   thinking:       ◐ ◓ ◑ ◒      (120ms, cyan)
 *   streaming:      ⠋ ⠙ ⠹ …       (80ms, cyan)
 *   tool-executing: ⣾ ⣽ ⣻ ⢿ …    (80ms, blue)
 *   sub-executing:  ◰ ◳ ◲ ◱      (150ms, purple)
 *
 * Uses useEffect + setInterval for smooth frame cycling.
 * Shows elapsed time after a threshold. Cleans up timer on unmount.
 */

import React, { useState, useEffect } from "react";
import { Text } from "ink";
import { PALETTE } from "../theme.js";
import { formatDuration } from "../format.js";
import type { Phase } from "../types.js";

// ---------------------------------------------------------------------------
// Spinner presets — phase-specific frame sets and timing
// ---------------------------------------------------------------------------

export interface SpinnerPreset {
  frames: readonly string[];
  intervalMs: number;
  color: string;
}

/** Phase-specific spinner presets. */
export const SPINNER_PRESETS: Record<string, SpinnerPreset> = {
  thinking: {
    frames: ["◐", "◓", "◑", "◒"],
    intervalMs: 120,
    color: PALETTE.cyan,
  },
  streaming: {
    frames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
    intervalMs: 80,
    color: PALETTE.cyan,
  },
  "tool-executing": {
    frames: ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"],
    intervalMs: 80,
    color: PALETTE.blue,
  },
  "sub-executing": {
    frames: ["◰", "◳", "◲", "◱"],
    intervalMs: 150,
    color: PALETTE.purple,
  },
} as const;

/** Default preset (braille dots) — used when no phase matches. */
const DEFAULT_PRESET: SpinnerPreset = SPINNER_PRESETS.streaming!;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ELAPSED_DISPLAY_THRESHOLD_MS = 2000;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SpinnerProps {
  label: string;
  /** Explicit color override — takes priority over preset. */
  color?: string;
  /** Phase preset selector — determines frame set and timing. */
  preset?: Phase | string;
}

export const Spinner: React.FC<SpinnerProps> = ({
  label,
  color,
  preset,
}) => {
  const resolvedPreset = preset
    ? ((SPINNER_PRESETS as Record<string, SpinnerPreset>)[preset] ?? DEFAULT_PRESET)
    : DEFAULT_PRESET;
  const resolvedColor = color ?? resolvedPreset.color;
  const { frames, intervalMs } = resolvedPreset;

  // Single state update per tick — frame index drives both animation and elapsed time.
  // Using a ref for startTime avoids unnecessary effect re-runs.
  const startTimeRef = React.useRef(Date.now());
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    startTimeRef.current = Date.now();
    setFrame(0);
  }, [preset]);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((f) => f + 1);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  const elapsed = Date.now() - startTimeRef.current;
  const frameIdx = frame % frames.length;
  const elapsedSuffix = elapsed >= ELAPSED_DISPLAY_THRESHOLD_MS
    ? ` ${formatDuration(elapsed)}`
    : "";

  return (
    <Text>
      <Text color={resolvedColor}>{frames[frameIdx]} </Text>
      <Text color={PALETTE.muted}>{label}…</Text>
      {elapsedSuffix && <Text color={PALETTE.dim}>{elapsedSuffix}</Text>}
    </Text>
  );
};
