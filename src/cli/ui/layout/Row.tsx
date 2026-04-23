/**
 * UI Subsystem — Row layout primitive.
 *
 * Horizontal flex container with typed alignment and gap tokens.
 * Prefer <Row> over raw <Box flexDirection="row"> so we can sweep layout
 * semantics in one place (e.g., introduce responsive breakpoints later).
 */

import React from "react";
import { Box } from "ink";
import type { CrossAxis, MainAxis, Size } from "../types.js";
import { sizeToCells } from "../tokens.js";

// ---------------------------------------------------------------------------
// Flex mapping — closed to Ink's accepted values
// ---------------------------------------------------------------------------

type InkJustify = "flex-start" | "center" | "flex-end" | "space-between" | "space-around";
type InkAlign   = "flex-start" | "center" | "flex-end" | "stretch";

function mainToJustify(axis: MainAxis): InkJustify {
  switch (axis) {
    case "start":         return "flex-start";
    case "center":        return "center";
    case "end":           return "flex-end";
    case "space-between": return "space-between";
    case "space-around":  return "space-around";
  }
}

function crossToAlign(axis: CrossAxis): InkAlign {
  switch (axis) {
    case "start":   return "flex-start";
    case "center":  return "center";
    case "end":     return "flex-end";
    case "stretch": return "stretch";
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface RowProps {
  readonly main?: MainAxis;
  readonly cross?: CrossAxis;
  readonly gap?: Size | 0;
  readonly wrap?: boolean;
  readonly grow?: number;
  readonly shrink?: number;
  readonly width?: number | string;
  readonly children: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Row: React.FC<RowProps> = ({
  main = "start",
  cross = "center",
  gap = 0,
  wrap = false,
  grow,
  shrink,
  width,
  children,
}) => {
  const gapCells = gap === 0 ? 0 : sizeToCells(gap);
  return (
    <Box
      flexDirection="row"
      justifyContent={mainToJustify(main)}
      alignItems={crossToAlign(cross)}
      gap={gapCells}
      flexWrap={wrap ? "wrap" : "nowrap"}
      flexGrow={grow}
      flexShrink={shrink}
      width={width}
    >
      {children}
    </Box>
  );
};
