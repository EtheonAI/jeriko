/**
 * Autocomplete — Popup with arrow key navigation and highlighted selection.
 *
 * Renders a vertical list of filtered slash commands below the input.
 * The active item is highlighted with a ▸ marker and brighter color.
 *
 * Controls (handled by parent Input component):
 *   Arrow up/down → change selection
 *   Tab           → accept selected item
 *   Escape        → dismiss popup
 *   Enter         → still submits (doesn't interact with autocomplete)
 *
 * Example:
 *   > /ch
 *     ▸ /channel      Connect or disconnect a channel
 *       /channels     List messaging channels
 *       /clear        Clear session messages
 */

import React from "react";
import { Text, Box } from "ink";
import { ICONS } from "../theme.js";
import { useTheme } from "../hooks/useTheme.js";
import type { AutocompleteItem } from "../lib/autocomplete.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum items to display in the popup (scroll window). */
const MAX_VISIBLE_ITEMS = 8;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface AutocompleteProps {
  /** Filtered command items to display. */
  items: AutocompleteItem[];
  /** Index of the currently highlighted item (-1 = none). */
  selectedIndex: number;
}

export const Autocomplete: React.FC<AutocompleteProps> = ({
  items,
  selectedIndex,
}) => {
  const { colors } = useTheme();
  if (items.length === 0) return null;

  // Compute the visible window (scroll if more than MAX_VISIBLE_ITEMS)
  const { start, end } = computeVisibleWindow(items.length, selectedIndex, MAX_VISIBLE_ITEMS);
  const visibleItems = items.slice(start, end);

  return (
    <Box flexDirection="column" marginLeft={2}>
      {visibleItems.map((item, i) => {
        const actualIndex = start + i;
        const isSelected = actualIndex === selectedIndex;

        return (
          <Text key={item.name}>
            <Text color={isSelected ? colors.brand : colors.dim}>
              {isSelected ? `${ICONS.arrow} ` : "  "}
            </Text>
            <Text color={isSelected ? colors.brand : colors.muted} bold={isSelected}>
              {item.name.padEnd(18)}
            </Text>
            <Text color={colors.dim}>{item.description}</Text>
          </Text>
        );
      })}
      {items.length > MAX_VISIBLE_ITEMS && (
        <Text color={colors.faint}>  ({items.length} total)</Text>
      )}
    </Box>
  );
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the visible window for scrolling through a long list.
 * Centers the selected item in the window when possible.
 */
export function computeVisibleWindow(
  totalItems: number,
  selectedIndex: number,
  maxVisible: number,
): { start: number; end: number } {
  if (totalItems <= maxVisible) {
    return { start: 0, end: totalItems };
  }

  // Center the selected item in the visible window
  const halfWindow = Math.floor(maxVisible / 2);
  let start = Math.max(0, selectedIndex - halfWindow);
  let end = start + maxVisible;

  // Clamp to the end of the list
  if (end > totalItems) {
    end = totalItems;
    start = Math.max(0, end - maxVisible);
  }

  return { start, end };
}
