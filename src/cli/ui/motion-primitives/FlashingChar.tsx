/**
 * UI Subsystem — FlashingChar primitive.
 *
 * Pulses a single character between two tones at a fixed cadence.
 * Used when a new permission request arrives, when a notification
 * needs acknowledgement, etc. Never lives on screen long — it's an
 * attention grabber, not ambient animation.
 *
 * Rules-of-hooks note: useAnimationClock is called unconditionally;
 * `enabled` is driven by motion mode so reduced/none schedules no timer.
 */

import React from "react";
import { Text } from "ink";
import { useTheme } from "../../hooks/useTheme.js";
import type { Tone } from "../types.js";
import { resolveTone } from "../tokens.js";
import { useAnimationClock } from "../motion/clock.js";
import { useMotion } from "../motion/context.js";

const FLASH_INTERVAL_MS = 500;

export interface FlashingCharProps {
  readonly char: string;
  readonly toneA?: Tone;
  readonly toneB?: Tone;
}

export const FlashingChar: React.FC<FlashingCharProps> = ({
  char,
  toneA = "warning",
  toneB = "muted",
}) => {
  const { colors } = useTheme();
  const { mode } = useMotion();
  const tick = useAnimationClock(FLASH_INTERVAL_MS, mode === "full");

  if (mode === "none") {
    return <Text>{char}</Text>;
  }
  if (mode === "reduced") {
    return <Text color={resolveTone(toneA, colors)}>{char}</Text>;
  }

  const tone = tick % 2 === 0 ? toneA : toneB;
  return <Text color={resolveTone(tone, colors)}>{char}</Text>;
};
