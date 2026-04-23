/**
 * ContextBar — visual context window usage indicator.
 *
 * Appears when context utilization exceeds the visibility threshold (50%).
 * Shows a progress bar with semantic-tone thresholds and token counts.
 *
 * Color transitions:
 *   0-50%  → hidden (no bar shown)
 *   50-80% → warning tone (normal usage)
 *   80%+   → error tone (approaching limit)
 *
 * The pure `computeContextBar` returns semantic tokens, not hex values, so
 * it stays theme-invariant and unit-testable. The React component resolves
 * tokens → colors via useTheme() — swapping themes instantly restyles the
 * bar without recomputing thresholds.
 *
 * Format:
 *   ░░░░░░░░░░░░████████████████ 72% · 144k / 200k tokens · compacted 2x
 */

import React from "react";
import { Text, Box } from "ink";
import { ICONS } from "../theme.js";
import { useTheme } from "../hooks/useTheme.js";
import { resolveTone } from "../ui/tokens.js";
import type { Tone } from "../ui/types.js";
import { formatTokens } from "../format.js";
import type { ContextInfo } from "../types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Bar width in characters. */
const BAR_WIDTH = 30;

/** Don't show the bar below this percentage. */
const VISIBILITY_THRESHOLD = 0.5;

/** Transition to error tone above this percentage. */
const DANGER_THRESHOLD = 0.8;

// ---------------------------------------------------------------------------
// Pure computation — semantic tones only; no hex, no chalk, no theme import.
// ---------------------------------------------------------------------------

export interface ContextBarDisplay {
  readonly visible: boolean;
  readonly percentage: number;
  readonly filledWidth: number;
  readonly emptyWidth: number;
  readonly tone: Tone;
  readonly label: string;
}

/** Compute display parameters from context info and token counts. */
export function computeContextBar(
  totalUsed: number,
  context: ContextInfo,
): ContextBarDisplay {
  if (context.maxTokens <= 0) {
    return { visible: false, percentage: 0, filledWidth: 0, emptyWidth: BAR_WIDTH, tone: "dim", label: "" };
  }

  const percentage = Math.min(1, totalUsed / context.maxTokens);

  if (percentage < VISIBILITY_THRESHOLD) {
    return { visible: false, percentage, filledWidth: 0, emptyWidth: BAR_WIDTH, tone: "dim", label: "" };
  }

  const filledWidth = Math.round(percentage * BAR_WIDTH);
  const emptyWidth = BAR_WIDTH - filledWidth;
  const tone: Tone = percentage >= DANGER_THRESHOLD ? "error" : "warning";
  const pctStr = `${Math.round(percentage * 100)}%`;
  const usedStr = formatTokens(totalUsed);
  const maxStr = formatTokens(context.maxTokens);
  const compactStr = context.compactionCount > 0
    ? ` ${ICONS.dot} compacted ${context.compactionCount}x`
    : "";

  return {
    visible: true,
    percentage,
    filledWidth,
    emptyWidth,
    tone,
    label: `${pctStr} ${ICONS.dot} ${usedStr} / ${maxStr} tokens${compactStr}`,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ContextBarProps {
  readonly totalUsed: number;
  readonly context: ContextInfo;
}

export const ContextBar: React.FC<ContextBarProps> = ({ totalUsed, context }) => {
  const { colors } = useTheme();
  const bar = computeContextBar(totalUsed, context);

  if (!bar.visible) return null;

  const filledColor = resolveTone(bar.tone, colors);

  return (
    <Box marginLeft={2} overflowX="hidden">
      <Text wrap="truncate-end">
        <Text color={colors.dim}>{ICONS.empty.repeat(bar.emptyWidth)}</Text>
        <Text color={filledColor}>{ICONS.filled.repeat(bar.filledWidth)}</Text>
        <Text color={colors.muted}> {bar.label}</Text>
      </Text>
    </Box>
  );
};
