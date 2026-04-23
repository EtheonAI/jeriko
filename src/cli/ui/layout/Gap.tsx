/**
 * UI Subsystem — Gap spacer primitive.
 *
 * An explicit, zero-content spacer. Prefer <Gap size="md" /> over invisible
 * blank <Text> or padded <Box> — it reads intentional in diffs and gives us
 * one place to tune spacing tokens.
 */

import React from "react";
import { Box } from "ink";
import type { Size } from "../types.js";
import { sizeToCells } from "../tokens.js";

export interface GapProps {
  readonly size?: Size;
  /** If true, the spacer is horizontal; otherwise vertical. */
  readonly horizontal?: boolean;
}

export const Gap: React.FC<GapProps> = ({ size = "md", horizontal = false }) => {
  const cells = sizeToCells(size);
  return horizontal ? <Box width={cells} /> : <Box height={cells} />;
};
