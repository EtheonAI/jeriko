/**
 * UI Subsystem — Spinner primitive (v2).
 *
 * Phase-aware animated indicator. Key differences from the v1 spinner under
 * src/cli/components/Spinner.tsx (which this will eventually replace via
 * Subsystem 5 migration):
 *
 *   - Shared clock (no per-spinner setInterval)
 *   - Theme-reactive (colors resolved via useTheme context, not PALETTE read)
 *   - Motion-aware (reduced → static dot; none → hidden glyph)
 *   - Presets externalized via PRESET_BY_PHASE — adding a phase is a one-liner
 */

import React, { useRef } from "react";
import { Text } from "ink";
import { useTheme } from "../../hooks/useTheme.js";
import { formatDuration } from "../../format.js";
import type { Tone } from "../types.js";
import { resolveTone } from "../tokens.js";
import { useAnimationClock } from "../motion/clock.js";
import { useMotion } from "../motion/context.js";

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export interface SpinnerPreset {
  readonly frames: readonly string[];
  readonly intervalMs: number;
  readonly tone: Tone;
  /** Glyph shown when motion is reduced (one frame, no animation). */
  readonly reducedGlyph: string;
}

/** Canonical phase keys Jeriko's reducer produces. */
export type SpinnerPhase =
  | "thinking"
  | "streaming"
  | "tool-executing"
  | "sub-executing"
  | "idle";

export const PRESET_BY_PHASE: Record<SpinnerPhase, SpinnerPreset> = {
  thinking: {
    frames: ["◐", "◓", "◑", "◒"],
    intervalMs: 120,
    tone: "info",
    reducedGlyph: "●",
  },
  streaming: {
    frames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
    intervalMs: 80,
    tone: "info",
    reducedGlyph: "●",
  },
  "tool-executing": {
    frames: ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"],
    intervalMs: 80,
    tone: "tool",
    reducedGlyph: "●",
  },
  "sub-executing": {
    frames: ["◰", "◳", "◲", "◱"],
    intervalMs: 150,
    tone: "purple",
    reducedGlyph: "●",
  },
  idle: {
    frames: ["·"],
    intervalMs: 1000,
    tone: "dim",
    reducedGlyph: "·",
  },
};

// ---------------------------------------------------------------------------
// Duration display
// ---------------------------------------------------------------------------

const ELAPSED_DISPLAY_THRESHOLD_MS = 2_000;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SpinnerProps {
  readonly label: string;
  readonly phase?: SpinnerPhase;
  /** Override preset tone (e.g., per-agent color). */
  readonly tone?: Tone;
  /** Show elapsed time once threshold crossed (default: true). */
  readonly showElapsed?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Spinner: React.FC<SpinnerProps> = ({
  label,
  phase = "streaming",
  tone,
  showElapsed = true,
}) => {
  const { colors } = useTheme();
  const { mode } = useMotion();
  const preset = PRESET_BY_PHASE[phase];
  const color = resolveTone(tone ?? preset.tone, colors);

  // Anchor the start time so it survives re-renders but resets when phase changes.
  const startRef = useRef<{ phase: SpinnerPhase; startedAt: number }>({
    phase,
    startedAt: Date.now(),
  });
  if (startRef.current.phase !== phase) {
    startRef.current = { phase, startedAt: Date.now() };
  }

  // Subscribe only when motion is full; reduced/none returns tick=0 and no timer.
  const tick = useAnimationClock(preset.intervalMs, mode === "full");

  // ---- Frame selection ----
  let glyph: string;
  if (mode === "none") {
    glyph = "";
  } else if (mode === "reduced") {
    glyph = preset.reducedGlyph;
  } else {
    glyph = preset.frames[tick % preset.frames.length] ?? preset.frames[0] ?? "";
  }

  const elapsedMs = Date.now() - startRef.current.startedAt;
  const elapsedSuffix =
    showElapsed && elapsedMs >= ELAPSED_DISPLAY_THRESHOLD_MS
      ? ` ${formatDuration(elapsedMs)}`
      : "";

  return (
    <Text>
      {glyph !== "" && <Text color={color}>{glyph} </Text>}
      <Text color={colors.muted}>{label}…</Text>
      {elapsedSuffix !== "" && <Text color={colors.dim}>{elapsedSuffix}</Text>}
    </Text>
  );
};
