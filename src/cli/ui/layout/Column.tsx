/**
 * UI Subsystem — Column layout primitive.
 *
 * Vertical flex container. Symmetric partner to <Row>. Shares the same typed
 * alignment tokens so switching orientation never means re-learning props.
 */

import React from "react";
import { Box } from "ink";
import type { CrossAxis, MainAxis, Size } from "../types.js";
import { sizeToCells } from "../tokens.js";

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

export interface ColumnProps {
  readonly main?: MainAxis;
  readonly cross?: CrossAxis;
  readonly gap?: Size | 0;
  readonly grow?: number;
  readonly shrink?: number;
  readonly width?: number | string;
  readonly height?: number | string;
  readonly children: React.ReactNode;
}

export const Column: React.FC<ColumnProps> = ({
  main = "start",
  cross = "stretch",
  gap = 0,
  grow,
  shrink,
  width,
  height,
  children,
}) => {
  const gapCells = gap === 0 ? 0 : sizeToCells(gap);
  return (
    <Box
      flexDirection="column"
      justifyContent={mainToJustify(main)}
      alignItems={crossToAlign(cross)}
      gap={gapCells}
      flexGrow={grow}
      flexShrink={shrink}
      width={width}
      height={height}
    >
      {children}
    </Box>
  );
};
