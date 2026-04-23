/**
 * UI Subsystem — KeyboardHint primitive.
 *
 *   [Enter] Submit  ·  [Esc] Cancel  ·  [?] Help
 *
 * Compact display of available keybindings. Three tone tiers:
 *   - bracket:  dim       (structural chrome)
 *   - key:      text bold (the thing you press)
 *   - action:   muted     (what it does)
 *
 * Accepts a list of typed KeyHint objects (see ../types.ts). The separator
 * is rendered with the "dim" tone and is never sent through as a hint.
 */

import React from "react";
import { Text } from "ink";
import { useTheme } from "../../hooks/useTheme.js";
import type { KeyHint } from "../types.js";

export interface KeyboardHintProps {
  readonly hints: readonly KeyHint[];
  readonly separator?: string;
}

const DEFAULT_SEPARATOR = "  ·  ";

export const KeyboardHint: React.FC<KeyboardHintProps> = ({
  hints,
  separator = DEFAULT_SEPARATOR,
}) => {
  const { colors } = useTheme();

  return (
    <Text>
      {hints.map((hint, idx) => (
        <Text key={`${hint.keys}:${hint.action}`}>
          {idx > 0 && <Text color={colors.dim}>{separator}</Text>}
          <Text color={colors.dim}>[</Text>
          <Text color={colors.text} bold>{hint.keys}</Text>
          <Text color={colors.dim}>]</Text>
          <Text color={colors.muted}> {hint.action}</Text>
        </Text>
      ))}
    </Text>
  );
};
