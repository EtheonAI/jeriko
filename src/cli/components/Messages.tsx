/**
 * Messages — Static message history and live streaming text.
 *
 * Uses Ink's <Static> for completed messages (never re-rendered once committed).
 * The streaming text area shows the current assistant response as tokens arrive
 * with markdown rendering and an animated cursor.
 *
 * Message roles:
 *   user:      > message text
 *   assistant: markdown-rendered content + tool call summary
 *   system:    muted informational text
 *
 * Tool calls in history show in collapsed tree format:
 *   ⏺ Read(src/cli/app.tsx)
 *   ⎿ 588 lines
 */

import React from "react";
import { Text, Box, Static } from "ink";
import { PALETTE, ICONS } from "../theme.js";
import { ToolCallView } from "./ToolCall.js";
import { SubAgentView } from "./SubAgent.js";
import { Markdown } from "./Markdown.js";
import { SUB_AGENT_TOOLS } from "../commands.js";
import {
  capitalize,
  extractToolSummary,
  shortenHome,
} from "../format.js";
import type { DisplayMessage, DisplayToolCall, Phase } from "../types.js";

// ---------------------------------------------------------------------------
// Message list (Static — never re-rendered)
// ---------------------------------------------------------------------------

interface MessagesProps {
  messages: DisplayMessage[];
}

export const Messages: React.FC<MessagesProps> = ({ messages }) => (
  <Static items={messages}>
    {(msg, idx) => <MessageView key={`${msg.id}-${idx}`} message={msg} />}
  </Static>
);

// ---------------------------------------------------------------------------
// Single message view — role-based rendering
// ---------------------------------------------------------------------------

interface MessageViewProps {
  message: DisplayMessage;
}

const MessageView: React.FC<MessageViewProps> = ({ message }) => {
  switch (message.role) {
    case "user":
      return <UserMessage content={message.content} />;
    case "assistant":
      return <AssistantMessage content={message.content} toolCalls={message.toolCalls} />;
    case "system":
      return <SystemMessage content={message.content} />;
  }
};

// ---------------------------------------------------------------------------
// User message — prominent prompt marker
// ---------------------------------------------------------------------------

const UserMessage: React.FC<{ content: string }> = ({ content }) => (
  <Box marginTop={1}>
    <Text color={PALETTE.brand} bold>{">"} </Text>
    <Text color={PALETTE.text}>{content}</Text>
  </Box>
);

// ---------------------------------------------------------------------------
// Assistant message — markdown + tool call tree
// ---------------------------------------------------------------------------

const AssistantMessage: React.FC<{
  content: string;
  toolCalls?: DisplayToolCall[];
}> = ({ content, toolCalls }) => (
  <Box flexDirection="column" marginTop={1}>
    {content && <Markdown text={content} />}
    {toolCalls && toolCalls.length > 0 && (
      <ToolCallSummary toolCalls={toolCalls} />
    )}
  </Box>
);

// ---------------------------------------------------------------------------
// System message — muted with contextual icon
// ---------------------------------------------------------------------------

const SystemMessage: React.FC<{ content: string }> = ({ content }) => (
  <Box marginTop={1}>
    <Text color={PALETTE.dim}>{ICONS.info} </Text>
    <Text color={PALETTE.muted}>{content}</Text>
  </Box>
);

// ---------------------------------------------------------------------------
// Tool call summary (collapsed tree view in history)
// ---------------------------------------------------------------------------

interface ToolCallSummaryProps {
  toolCalls: DisplayToolCall[];
}

/**
 * Renders tool calls in collapsed format for message history.
 * Sub-agent tools get their own rendering, regular tools show a compact line.
 */
const ToolCallSummary: React.FC<ToolCallSummaryProps> = ({ toolCalls }) => (
  <Box flexDirection="column" marginTop={0}>
    {toolCalls.map((tc) => {
      if (SUB_AGENT_TOOLS.has(tc.name)) {
        return <SubAgentView key={tc.id} toolCall={tc} />;
      }
      return <CompactToolCall key={tc.id} toolCall={tc} />;
    })}
  </Box>
);

/**
 * Compact tool call — one line for the call, one for the result summary.
 *
 *   ⏺ Read(src/cli/app.tsx)
 *   ⎿ 588 lines
 */
const CompactToolCall: React.FC<{ toolCall: DisplayToolCall }> = ({ toolCall }) => {
  const name = capitalize(toolCall.name);
  const rawSummary = extractToolSummary(toolCall.args);
  const summary = shortenHome(rawSummary);
  const argStr = summary ? `(${truncateArg(summary)})` : "";
  const resultLine = toolCall.result
    ? summarizeResult(toolCall.result, toolCall.isError)
    : null;

  return (
    <Box flexDirection="column">
      <Text>
        <Text color={PALETTE.blue}>{ICONS.tool} </Text>
        <Text bold color={PALETTE.text}>{name}</Text>
        <Text color={PALETTE.muted}>{argStr}</Text>
      </Text>
      {resultLine && (
        <Box marginLeft={2}>
          <Text color={toolCall.isError ? PALETTE.red : PALETTE.dim}>{ICONS.result}  </Text>
          <Text color={toolCall.isError ? PALETTE.red : PALETTE.muted}>{resultLine}</Text>
        </Box>
      )}
    </Box>
  );
};

// ---------------------------------------------------------------------------
// Streaming text (live area — re-rendered on each token)
// ---------------------------------------------------------------------------

interface StreamingTextProps {
  text: string;
  phase: Phase;
}

/**
 * Live streaming text — renders markdown as tokens arrive.
 * Shows a block cursor at the end to indicate active streaming.
 */
export const StreamingText: React.FC<StreamingTextProps> = ({ text, phase }) => {
  if (!text || phase !== "streaming") return null;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Markdown text={text} />
      <Text color={PALETTE.dim}>{ICONS.cursor}</Text>
    </Box>
  );
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Truncate a tool argument for compact display. */
function truncateArg(arg: string, maxLen: number = 50): string {
  return arg.length > maxLen ? arg.slice(0, maxLen - 1) + "…" : arg;
}

/** Extract a one-line summary from a tool result. */
function summarizeResult(result: string, isError?: boolean): string {
  if (!result || result.length === 0) return "";

  const lines = result.split("\n");
  if (lines.length > 3 && !isError) {
    return `${lines.length} lines`;
  }

  const firstLine = lines.find((l) => l.trim().length > 0) ?? "";
  const maxLen = 80;
  return firstLine.length > maxLen
    ? firstLine.slice(0, maxLen - 1) + "…"
    : firstLine;
}
