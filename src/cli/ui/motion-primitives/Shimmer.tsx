/**
 * UI Subsystem — Shimmer primitive.
 *
 * Animates a bright highlight sweeping left→right across static text.
 * Used for "indexing…", "warming cache…", and other indeterminate progress
 * where a spinner would be visually noisier than warranted.
 *
 * Implementation: each character is colored `dim` by default; the window
 * around position `tick % (textLength + PAD)` is colored `muted`, with the
 * center cell colored `text` (the actual highlight).
 *
 * Motion modes:
 *   - full:    animated sweep
 *   - reduced: entire text rendered with `muted` tone, no animation
 *   - none:    plain text with `dim` tone
 *
 * Rules-of-hooks note: we call useAnimationClock unconditionally. When motion
 * is not "full" we pass `enabled=false`, which makes the clock return 0 and
 * subscribe to nothing — no timer is scheduled.
 */

import React from "react";
import { Text } from "ink";
import { useTheme } from "../../hooks/useTheme.js";
import { resolveTone } from "../tokens.js";
import { useAnimationClock } from "../motion/clock.js";
import { useMotion } from "../motion/context.js";

const SHIMMER_INTERVAL_MS = 90;
const SHIMMER_PAD = 4;

export interface ShimmerProps {
  readonly children: string;
}

export const Shimmer: React.FC<ShimmerProps> = ({ children }) => {
  const { colors } = useTheme();
  const { mode } = useMotion();

  // Always call the hook; `enabled` controls whether a timer is scheduled.
  const tick = useAnimationClock(SHIMMER_INTERVAL_MS, mode === "full");

  if (mode === "none") {
    return <Text color={resolveTone("dim", colors)}>{children}</Text>;
  }
  if (mode === "reduced") {
    return <Text color={resolveTone("muted", colors)}>{children}</Text>;
  }

  const len = children.length;
  const cycle = len + SHIMMER_PAD;
  const head = cycle > 0 ? tick % cycle : 0;

  const chars: React.ReactNode[] = [];
  for (let i = 0; i < len; i++) {
    const distance = Math.abs(i - head);
    let color: string;
    if (distance === 0) color = resolveTone("text", colors);
    else if (distance === 1) color = resolveTone("muted", colors);
    else color = resolveTone("dim", colors);
    chars.push(
      <Text key={i} color={color}>
        {children[i]}
      </Text>,
    );
  }
  return <Text>{chars}</Text>;
};
