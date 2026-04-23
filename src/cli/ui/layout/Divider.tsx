/**
 * UI Subsystem — Divider primitive.
 *
 * Horizontal or vertical rule with optional inline label. Theme-aware tone
 * resolution so it never hardcodes a gray.
 *
 *   ─────────── Section ───────────
 *   │
 */

import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../hooks/useTheme.js";
import type { Tone } from "../types.js";
import { resolveTone } from "../tokens.js";

// ---------------------------------------------------------------------------
// Glyphs
// ---------------------------------------------------------------------------

const HORIZONTAL_GLYPH = "─";
const VERTICAL_GLYPH   = "│";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DividerProps {
  readonly orientation?: "horizontal" | "vertical";
  readonly tone?: Tone;
  /** Optional inline label; only honored for horizontal dividers. */
  readonly label?: string;
  /** Minimum rule length (cells) on each side of the label. Horizontal only. */
  readonly minSide?: number;
  /** Explicit width/height — defaults to flexing to available space. */
  readonly length?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Divider: React.FC<DividerProps> = ({
  orientation = "horizontal",
  tone = "dim",
  label,
  minSide = 3,
  length,
}) => {
  const { colors } = useTheme();
  const color = resolveTone(tone, colors);

  if (orientation === "vertical") {
    const height = length ?? 1;
    return (
      <Box flexDirection="column" height={height}>
        {Array.from({ length: height }, (_, i) => (
          <Text key={i} color={color}>{VERTICAL_GLYPH}</Text>
        ))}
      </Box>
    );
  }

  if (label === undefined || label === "") {
    const width = length ?? 24;
    return <Text color={color}>{HORIZONTAL_GLYPH.repeat(width)}</Text>;
  }

  const side = Math.max(minSide, 3);
  return (
    <Box flexDirection="row">
      <Text color={color}>{HORIZONTAL_GLYPH.repeat(side)} </Text>
      <Text color={color} bold>{label}</Text>
      <Text color={color}> {HORIZONTAL_GLYPH.repeat(side)}</Text>
    </Box>
  );
};
