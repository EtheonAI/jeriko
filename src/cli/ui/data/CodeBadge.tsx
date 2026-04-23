/**
 * UI Subsystem — CodeBadge primitive.
 *
 * Small inline label used above code blocks and inline code references.
 *
 *   [ts]  [bash]  [json]
 *
 * Intentionally less loud than Badge — always "dim" tone, lower weight.
 */

import React from "react";
import { Text } from "ink";
import { useTheme } from "../../hooks/useTheme.js";
import { resolveTone } from "../tokens.js";

export interface CodeBadgeProps {
  readonly language: string;
}

export const CodeBadge: React.FC<CodeBadgeProps> = ({ language }) => {
  const { colors } = useTheme();
  const color = resolveTone("muted", colors);
  return <Text color={color}>{`[${language}]`}</Text>;
};
