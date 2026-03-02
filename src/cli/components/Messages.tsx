/**
 * Messages — Static message history and live streaming text.
 *
 * Uses Ink's <Static> for completed messages (never re-rendered once committed).
 * The streaming text area shows the current assistant response as tokens arrive
 * with an animated block cursor.
 */

import React from "react";
import { Text, Box, Static } from "ink";
import { PALETTE } from "../theme.js";
import { ToolCallView } from "./ToolCall.js";
import { SubAgentView } from "./SubAgent.js";
import { Markdown } from "./Markdown.js";
import { SUB_AGENT_TOOLS } from "../commands.js";
import type { DisplayMessage, DisplayToolCall, Phase } from "../types.js";

// ---------------------------------------------------------------------------
// Message list (Static — never re-rendered)
// ---------------------------------------------------------------------------

interface MessagesProps {
  messages: DisplayMessage[];
}

export const Messages: React.FC<MessagesProps> = ({ messages }) => (
  <Static items={messages}>
    {(msg) => <MessageView key={msg.id} message={msg} />}
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
      return (
        <Box marginTop={1}>
          <Text color={PALETTE.brand} bold>{">"} </Text>
          <Text color={PALETTE.text}>{message.content}</Text>
        </Box>
      );

    case "assistant":
      return (
        <Box flexDirection="column" marginTop={1}>
          {message.content && (
            <Markdown text={message.content} />
          )}
          {message.toolCalls?.map((tc) => (
            <ToolCallOrSubAgent key={tc.id} toolCall={tc} />
          ))}
        </Box>
      );

    case "system":
      return (
        <Box marginTop={1}>
          <Text color={PALETTE.muted}>{message.content}</Text>
        </Box>
      );
  }
};

// ---------------------------------------------------------------------------
// Tool call routing (regular vs sub-agent)
// ---------------------------------------------------------------------------

const ToolCallOrSubAgent: React.FC<{ toolCall: DisplayToolCall }> = ({ toolCall }) => {
  if (SUB_AGENT_TOOLS.has(toolCall.name)) {
    return <SubAgentView toolCall={toolCall} />;
  }
  return <ToolCallView toolCall={toolCall} />;
};

// ---------------------------------------------------------------------------
// Streaming text (live area — re-rendered on each token)
// ---------------------------------------------------------------------------

interface StreamingTextProps {
  text: string;
  phase: Phase;
}

export const StreamingText: React.FC<StreamingTextProps> = ({ text, phase }) => {
  if (!text || phase !== "streaming") return null;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={PALETTE.text}>{text}</Text>
      <Text color={PALETTE.dim}>▊</Text>
    </Box>
  );
};
