/**
 * ToolCall — Renders a single tool call with status icon and result.
 *
 * Visual style (Claude Code-inspired):
 *   ⏺ Read src/cli/chat.ts
 *     ⎿  (332 lines)
 *
 *   ⏺ Bash npm test
 *     ⎿  12 tests passed
 *
 * Status colors:
 *   running:   cyan spinner dot
 *   completed: blue solid dot
 *   pending:   dim dot
 */

import React from "react";
import { Text, Box } from "ink";
import { PALETTE, ICONS } from "../theme.js";
import {
  capitalize,
  extractToolSummary,
  shortenHome,
  truncateResult,
} from "../format.js";
import type { DisplayToolCall } from "../types.js";

// ---------------------------------------------------------------------------
// Status mapping
// ---------------------------------------------------------------------------

function getStatusIcon(status: DisplayToolCall["status"]): { char: string; color: string } {
  switch (status) {
    case "completed": return { char: ICONS.tool, color: PALETTE.blue };
    case "running":   return { char: ICONS.tool, color: PALETTE.cyan };
    case "pending":   return { char: ICONS.pending, color: PALETTE.dim };
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ToolCallViewProps {
  toolCall: DisplayToolCall;
}

export const ToolCallView: React.FC<ToolCallViewProps> = ({ toolCall }) => {
  const name = capitalize(toolCall.name);
  const rawSummary = extractToolSummary(toolCall.args);
  const summary = shortenHome(rawSummary);
  const { char: statusChar, color: statusColor } = getStatusIcon(toolCall.status);

  return (
    <Box flexDirection="column" marginTop={0}>
      {/* Header: ⏺ ToolName summary */}
      <Text>
        <Text color={statusColor}>{statusChar} </Text>
        <Text bold color={PALETTE.text}>{name}</Text>
        {summary ? <Text color={PALETTE.muted}> {summary}</Text> : null}
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

// ---------------------------------------------------------------------------
// Tool result sub-component
// ---------------------------------------------------------------------------

interface ToolResultProps {
  result: string;
  isError: boolean;
}

const ToolResult: React.FC<ToolResultProps> = ({ result, isError }) => {
  const connectorColor = isError ? PALETTE.red : PALETTE.dim;
  const textColor = isError ? PALETTE.red : PALETTE.muted;

  return (
    <Box marginLeft={2}>
      <Text color={connectorColor}>{ICONS.result}  </Text>
      <Text color={textColor}>{truncateResult(result)}</Text>
    </Box>
  );
};
