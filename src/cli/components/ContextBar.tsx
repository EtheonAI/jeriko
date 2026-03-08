/**
 * ContextBar — Visual context window usage indicator.
 *
 * Appears when context utilization exceeds the visibility threshold (50%).
 * Shows a progress bar with color-coded thresholds and token counts.
 *
 * Color transitions:
 *   0-50%  → hidden (no bar shown)
 *   50-80% → yellow (normal usage)
 *   80%+   → red (approaching limit)
 *
 * Format:
 *   ░░░░░░░░░░░░████████████████ 72% · 144k / 200k tokens · compacted 2x
 */

import React from "react";
import { Text, Box } from "ink";
import { PALETTE, ICONS } from "../theme.js";
import { formatTokens } from "../format.js";
import type { ContextInfo } from "../types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Bar width in characters. */
const BAR_WIDTH = 30;

/** Don't show the bar below this percentage. */
const VISIBILITY_THRESHOLD = 0.5;

/** Transition to red above this percentage. */
const DANGER_THRESHOLD = 0.8;

// ---------------------------------------------------------------------------
// Pure computation
// ---------------------------------------------------------------------------

/** Compute display parameters from context info and token counts. */
export function computeContextBar(totalUsed: number, context: ContextInfo): {
  visible: boolean;
  percentage: number;
  filledWidth: number;
  emptyWidth: number;
  color: string;
  label: string;
} {
  if (context.maxTokens <= 0) {
    return { visible: false, percentage: 0, filledWidth: 0, emptyWidth: BAR_WIDTH, color: PALETTE.dim, label: "" };
  }

  const percentage = Math.min(1, totalUsed / context.maxTokens);

  if (percentage < VISIBILITY_THRESHOLD) {
    return { visible: false, percentage, filledWidth: 0, emptyWidth: BAR_WIDTH, color: PALETTE.dim, label: "" };
  }

  const filledWidth = Math.round(percentage * BAR_WIDTH);
  const emptyWidth = BAR_WIDTH - filledWidth;
  const color = percentage >= DANGER_THRESHOLD ? PALETTE.red : PALETTE.yellow;
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
    color,
    label: `${pctStr} ${ICONS.dot} ${usedStr} / ${maxStr} tokens${compactStr}`,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ContextBarProps {
  totalUsed: number;
  context: ContextInfo;
}

export const ContextBar: React.FC<ContextBarProps> = ({ totalUsed, context }) => {
  const bar = computeContextBar(totalUsed, context);

  if (!bar.visible) return null;

  return (
    <Box marginLeft={2} overflowX="hidden">
      <Text wrap="truncate-end">
        <Text color={PALETTE.dim}>{ICONS.empty.repeat(bar.emptyWidth)}</Text>
        <Text color={bar.color}>{ICONS.filled.repeat(bar.filledWidth)}</Text>
        <Text color={PALETTE.muted}> {bar.label}</Text>
      </Text>
    </Box>
  );
};
