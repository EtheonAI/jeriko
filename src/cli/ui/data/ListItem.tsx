/**
 * UI Subsystem — ListItem primitive.
 *
 * A selectable row used by pickers, wizards, autocompletes, and settings.
 * Composable: leading/trailing slots accept arbitrary ReactNode so callers
 * can drop StatusIcon, Spinner, Badge, etc. into either side.
 *
 *   ▸ claude-sonnet-4.6               Anthropic  200K   $3 in / $15 out
 */

import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../hooks/useTheme.js";
import type { Tone } from "../types.js";
import { resolveTone } from "../tokens.js";

const SELECTED_MARKER   = "▸";
const UNSELECTED_MARKER = " ";

export interface ListItemProps {
  readonly label: string;
  readonly hint?: string;
  readonly selected?: boolean;
  readonly disabled?: boolean;
  /** Optional element shown before the label (e.g. StatusIcon). */
  readonly leading?: React.ReactNode;
  /** Optional element shown at the right edge (e.g. Badge, metadata). */
  readonly trailing?: React.ReactNode;
  /** Override for the color of the label when selected. */
  readonly selectedTone?: Tone;
}

export const ListItem: React.FC<ListItemProps> = ({
  label,
  hint,
  selected = false,
  disabled = false,
  leading,
  trailing,
  selectedTone = "brand",
}) => {
  const { colors } = useTheme();

  const markerColor = selected
    ? resolveTone(selectedTone, colors)
    : resolveTone("dim", colors);

  const labelColor = disabled
    ? resolveTone("faint", colors)
    : selected
      ? resolveTone(selectedTone, colors)
      : resolveTone("text", colors);

  const hintColor = resolveTone(disabled ? "faint" : "muted", colors);

  return (
    <Box flexDirection="row" gap={1}>
      <Text color={markerColor}>{selected ? SELECTED_MARKER : UNSELECTED_MARKER}</Text>
      {leading !== undefined && <Box>{leading}</Box>}
      <Box flexGrow={1}>
        <Text color={labelColor} bold={selected}>
          {label}
        </Text>
        {hint !== undefined && hint !== "" && (
          <Text color={hintColor}>{`  ${hint}`}</Text>
        )}
      </Box>
      {trailing !== undefined && <Box>{trailing}</Box>}
    </Box>
  );
};
