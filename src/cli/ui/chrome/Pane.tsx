/**
 * UI Subsystem — Pane primitive.
 *
 * Bordered, padded container. The workhorse of the chrome layer:
 * dialogs, permission prompts, info panels, sub-agent frames all build on it.
 *
 * Shape contract:
 *   <Pane tone="brand" title="Permission Request" footer={<KeyboardHint ... />}>
 *     ...body
 *   </Pane>
 *
 * Title + footer are rendered inside the border, separated by a Divider.
 */

import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../hooks/useTheme.js";
import type { BorderStyle, Size, Tone } from "../types.js";
import { resolveTone, sizeToCells } from "../tokens.js";
import { Divider } from "../layout/Divider.js";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PaneProps {
  readonly tone?: Tone;
  readonly border?: BorderStyle;
  readonly padding?: Size | 0;
  readonly title?: string;
  readonly footer?: React.ReactNode;
  readonly width?: number | string;
  readonly children: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Pane: React.FC<PaneProps> = ({
  tone = "dim",
  border = "round",
  padding = "md",
  title,
  footer,
  width,
  children,
}) => {
  const { colors } = useTheme();
  const borderColor = resolveTone(tone, colors);
  const pad = padding === 0 ? 0 : sizeToCells(padding);

  return (
    <Box
      flexDirection="column"
      borderStyle={border}
      borderColor={borderColor}
      paddingX={pad}
      paddingY={Math.max(0, pad - 1)}
      width={width}
    >
      {title !== undefined && title !== "" && (
        <Box flexDirection="column">
          <Text color={borderColor} bold>{title}</Text>
          <Divider tone={tone} length={undefined} />
        </Box>
      )}
      <Box flexDirection="column">{children}</Box>
      {footer !== undefined && (
        <Box flexDirection="column" marginTop={1}>
          <Divider tone={tone} />
          <Box marginTop={1}>{footer}</Box>
        </Box>
      )}
    </Box>
  );
};
