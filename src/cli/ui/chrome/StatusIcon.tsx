/**
 * UI Subsystem — StatusIcon primitive.
 *
 * Glyph + tone for a status value. Canonical mapping lives in tokens.ts,
 * so every ✓/✗/⚠/ℹ/●/○ in the UI comes from one source.
 */

import React from "react";
import { Text } from "ink";
import { useTheme } from "../../hooks/useTheme.js";
import type { Status } from "../types.js";
import { resolveStatus, resolveTone } from "../tokens.js";

export interface StatusIconProps {
  readonly status: Status;
  /** Override the default glyph; still uses status's tone. */
  readonly icon?: string;
}

export const StatusIcon: React.FC<StatusIconProps> = ({ status, icon }) => {
  const { colors } = useTheme();
  const { icon: defaultIcon, tone } = resolveStatus(status);
  return <Text color={resolveTone(tone, colors)}>{icon ?? defaultIcon}</Text>;
};
