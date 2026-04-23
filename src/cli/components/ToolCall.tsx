/**
 * ToolCall — renders a single tool call with status icon and result.
 *
 * Visual style (Claude Code-inspired):
 *   ⏺ Read src/cli/chat.ts
 *     ⎿  (332 lines)
 *
 *   ⏺ Bash npm test
 *     ⎿  12 tests passed
 *
 * Status tones (theme-invariant, resolved at render time):
 *   running:   info
 *   completed: tool
 *   pending:   dim
 *
 * The pure helper `getStatusGlyph` returns a semantic Tone, never a hex
 * value — themes restyle the entire component through one useTheme() read.
 */

import React from "react";
import { Text, Box } from "ink";
import { ICONS } from "../theme.js";
import { useTheme } from "../hooks/useTheme.js";
import { resolveTone } from "../ui/tokens.js";
import type { Tone } from "../ui/types.js";
import {
  capitalize,
  extractToolSummary,
  shortenHome,
  truncateResult,
} from "../format.js";
import type { DisplayToolCall } from "../types.js";

// ---------------------------------------------------------------------------
// Status → glyph + tone (pure, theme-invariant)
// ---------------------------------------------------------------------------

interface StatusGlyph {
  readonly char: string;
  readonly tone: Tone;
}

function getStatusGlyph(status: DisplayToolCall["status"]): StatusGlyph {
  switch (status) {
    case "completed": return { char: ICONS.tool,    tone: "tool" };
    case "running":   return { char: ICONS.tool,    tone: "info" };
    case "pending":   return { char: ICONS.pending, tone: "dim" };
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ToolCallViewProps {
  readonly toolCall: DisplayToolCall;
}

const ToolCallViewImpl: React.FC<ToolCallViewProps> = ({ toolCall }) => {
  const { colors } = useTheme();
  const name = capitalize(toolCall.name);
  const rawSummary = extractToolSummary(toolCall.args);
  const summary = shortenHome(rawSummary);
  const { char: statusChar, tone: statusTone } = getStatusGlyph(toolCall.status);
  const statusColor = resolveTone(statusTone, colors);

  return (
    <Box flexDirection="column" marginTop={0}>
      {/* Header: ⏺ ToolName summary */}
      <Text>
        <Text color={statusColor}>{statusChar} </Text>
        <Text bold color={colors.text}>{name}</Text>
        {summary ? <Text color={colors.muted}> {summary}</Text> : null}
      </Text>

      {/* Result: ⎿ output */}
      {toolCall.result !== undefined && (
        <ToolResult
          result={toolCall.result}
          isError={!!toolCall.isError}
        />
      )}
    </Box>
  );
};

/** Memoized by toolCall reference — skips re-render during stream deltas. */
export const ToolCallView = React.memo(ToolCallViewImpl);

// ---------------------------------------------------------------------------
// Tool result sub-component
// ---------------------------------------------------------------------------

interface ToolResultProps {
  readonly result: string;
  readonly isError: boolean;
}

const ToolResult: React.FC<ToolResultProps> = ({ result, isError }) => {
  const { colors } = useTheme();
  const connectorColor = isError ? colors.error : colors.dim;
  const textColor      = isError ? colors.error : colors.muted;

  return (
    <Box marginLeft={2}>
      <Text color={connectorColor}>{ICONS.result}  </Text>
      <Text color={textColor} wrap="truncate-end">{truncateResult(result)}</Text>
    </Box>
  );
};
