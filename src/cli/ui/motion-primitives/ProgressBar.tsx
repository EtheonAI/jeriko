/**
 * UI Subsystem — ProgressBar primitive.
 *
 * Determinate horizontal bar. Ratio is clamped to [0, 1]; width controls
 * how many cells the bar occupies.
 *
 *   ████████████░░░░░░░░  62%
 *
 * Motion does not apply — this bar is determinate. Indeterminate progress
 * should use <Shimmer> or <Spinner> instead; those are motion-aware.
 */

import React from "react";
import { Text } from "ink";
import { useTheme } from "../../hooks/useTheme.js";
import type { Intent } from "../types.js";
import { resolveIntent, resolveTone } from "../tokens.js";

const FILLED = "█";
const EMPTY  = "░";

export interface ProgressBarProps {
  /** Value in [0, 1]. Out-of-range values are clamped. */
  readonly value: number;
  /** Total width of the bar in cells. */
  readonly width?: number;
  /** Color intent of the filled portion. */
  readonly intent?: Intent;
  /** Show the percentage label to the right. */
  readonly showLabel?: boolean;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  width = 20,
  intent = "brand",
  showLabel = true,
}) => {
  const { colors } = useTheme();
  const ratio = clamp01(value);
  const filled = Math.round(ratio * width);
  const empty = Math.max(0, width - filled);

  const fillColor  = resolveIntent(intent, colors);
  const trackColor = resolveTone("faint", colors);
  const labelColor = resolveTone("muted", colors);

  const pct = Math.round(ratio * 100);

  return (
    <Text>
      <Text color={fillColor}>{FILLED.repeat(filled)}</Text>
      <Text color={trackColor}>{EMPTY.repeat(empty)}</Text>
      {showLabel && <Text color={labelColor}>{` ${pct.toString().padStart(3, " ")}%`}</Text>}
    </Text>
  );
};
