/**
 * ToolCall — Renders a single tool call with status icon and result.
 *
 * Visual style (Claude Code-inspired):
 *   ⏺ Read src/cli/chat.ts
 *     ⎿  (332 lines)
 *
 *   ⏺ Bash npm test
 *     ⎿  ✓ 12 tests passed
 */

import React from "react";
import { Text, Box } from "ink";
import { PALETTE } from "../theme.js";
import { capitalize, extractToolSummary, truncateResult } from "../format.js";
import type { DisplayToolCall } from "../types.js";

// ---------------------------------------------------------------------------
// Status mapping
// ---------------------------------------------------------------------------

function getStatusColor(status: DisplayToolCall["status"]): string {
  switch (status) {
    case "completed": return PALETTE.green;
    case "running":   return PALETTE.cyan;
    case "pending":   return PALETTE.dim;
  }
}

function getResultConnectorColor(isError: boolean): string {
  return isError ? PALETTE.red : PALETTE.dim;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ToolCallViewProps {
  toolCall: DisplayToolCall;
}

export const ToolCallView: React.FC<ToolCallViewProps> = ({ toolCall }) => {
  const name = capitalize(toolCall.name);
  const summary = extractToolSummary(toolCall.args);
  const statusColor = getStatusColor(toolCall.status);

  return (
    <Box flexDirection="column" marginTop={0}>
      {/* Header: ⏺ ToolName summary */}
      <Text>
        <Text color={statusColor}>⏺ </Text>
        <Text bold color={PALETTE.text}>{name}</Text>
        {summary ? <Text color={PALETTE.muted}> {summary}</Text> : null}
      </Text>

      {/* Result: ⎿ output */}
      {toolCall.result !== undefined && (
        <Box marginLeft={2}>
          <Text color={getResultConnectorColor(!!toolCall.isError)}>⎿  </Text>
          <Text color={toolCall.isError ? PALETTE.red : PALETTE.muted}>
            {truncateResult(toolCall.result)}
          </Text>
        </Box>
      )}
    </Box>
  );
};
