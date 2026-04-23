/**
 * Messages — static message history and live streaming text.
 *
 * Uses Ink's <Static> for completed messages (never re-rendered once
 * committed). The streaming text area shows the current assistant response
 * as tokens arrive with markdown rendering and an animated cursor.
 *
 * Message roles:
 *   user:      > message text
 *   assistant: markdown-rendered content + tool call summary
 *   system:    muted informational text
 *
 * Tool calls in history show in collapsed tree format:
 *   ⏺ Read(src/cli/app.tsx)
 *   ⎿ 588 lines
 *
 * Every color flows through useTheme() so a setTheme call restyles every
 * sub-component on the next render. No direct PALETTE reads.
 */

import React from "react";
import { Text, Box, Static } from "ink";
import { ICONS } from "../theme.js";
import { useTheme } from "../hooks/useTheme.js";
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
  readonly messages: DisplayMessage[];
}

const MessagesImpl: React.FC<MessagesProps> = ({ messages }) => (
  <Static items={messages}>
    {(msg, idx) => <MessageView key={`${msg.id}-${idx}`} message={msg} />}
  </Static>
);

/**
 * Memoized so that updates to streamText, liveToolCalls, or any other app
 * state that does NOT mutate the messages array reference are a no-op here.
 * Critical for streaming perf — during a response, app.tsx re-renders on
 * every token delta, but Messages stays still.
 */
export const Messages = React.memo(MessagesImpl);

// ---------------------------------------------------------------------------
// Single message view — role-based rendering
// ---------------------------------------------------------------------------

interface MessageViewProps {
  readonly message: DisplayMessage;
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

const UserMessage: React.FC<{ readonly content: string }> = ({ content }) => {
  const { colors } = useTheme();
  return (
    <Box marginTop={1}>
      <Text color={colors.brand} bold>{">"} </Text>
      <Text color={colors.text}>{content}</Text>
    </Box>
  );
};

// ---------------------------------------------------------------------------
// Assistant message — markdown + tool call tree
// ---------------------------------------------------------------------------

const AssistantMessage: React.FC<{
  readonly content: string;
  readonly toolCalls?: DisplayToolCall[];
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

const SystemMessage: React.FC<{ readonly content: string }> = ({ content }) => {
  const { colors } = useTheme();
  return (
    <Box marginTop={1}>
      <Text color={colors.muted}>{content}</Text>
    </Box>
  );
};

// ---------------------------------------------------------------------------
// Tool call summary (collapsed tree view in history)
// ---------------------------------------------------------------------------

interface ToolCallSummaryProps {
  readonly toolCalls: DisplayToolCall[];
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
const CompactToolCall: React.FC<{ readonly toolCall: DisplayToolCall }> = ({ toolCall }) => {
  const { colors } = useTheme();
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
        <Text color={colors.tool}>{ICONS.tool} </Text>
        <Text bold color={colors.text}>{name}</Text>
        <Text color={colors.muted}>{argStr}</Text>
      </Text>
      {resultLine && (
        <Box marginLeft={2}>
          <Text color={toolCall.isError ? colors.error : colors.dim}>{ICONS.result}  </Text>
          <Text color={toolCall.isError ? colors.error : colors.muted} wrap="truncate-end">{resultLine}</Text>
        </Box>
      )}
    </Box>
  );
};

// ---------------------------------------------------------------------------
// Streaming text (live area — re-rendered on each token)
// ---------------------------------------------------------------------------

interface StreamingTextProps {
  readonly text: string;
  readonly phase: Phase;
}

/**
 * Live streaming text — renders markdown as tokens arrive.
 * Shows a block cursor at the end to indicate active streaming.
 */
const StreamingTextImpl: React.FC<StreamingTextProps> = ({ text, phase }) => {
  const { colors } = useTheme();
  if (!text || phase !== "streaming") return null;

  return (
    <Box flexDirection="column" marginTop={1} overflowX="hidden">
      <Markdown text={text} />
      <Text color={colors.info}>{ICONS.cursor}</Text>
    </Box>
  );
};

/** Memoized by text+phase — stable during non-streaming phases. */
export const StreamingText = React.memo(StreamingTextImpl);

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
