/**
 * UI Subsystem — Badge primitive.
 *
 * Inline colored label. Two variants:
 *   - "solid":   [ ERROR ] — inverse background
 *   - "outline": [ERROR]   — bracket + colored text (default; reads clean in all terminals)
 */

import React from "react";
import { Text } from "ink";
import { useTheme } from "../../hooks/useTheme.js";
import type { Intent } from "../types.js";
import { resolveIntent } from "../tokens.js";

export interface BadgeProps {
  readonly intent?: Intent;
  readonly variant?: "solid" | "outline";
  readonly children: string;
}

export const Badge: React.FC<BadgeProps> = ({
  intent = "brand",
  variant = "outline",
  children,
}) => {
  const { colors } = useTheme();
  const color = resolveIntent(intent, colors);

  if (variant === "solid") {
    return (
      <Text backgroundColor={color} color={colors.text} bold>
        {` ${children} `}
      </Text>
    );
  }

  return (
    <Text color={color}>
      [<Text bold>{children}</Text>]
    </Text>
  );
};
