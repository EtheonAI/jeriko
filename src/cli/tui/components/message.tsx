/**
 * TUI Message — Renders individual messages in the conversation stream.
 *
 * Supports user messages, assistant messages (with markdown), thinking blocks,
 * tool calls, and system messages. Each type has distinct visual treatment.
 */

import { For, Show, Switch, Match } from "solid-js";
import { useTheme } from "../context/theme.js";
import { SplitBorderChars } from "./border.js";
import { ToolCallView } from "./tool-call.js";
import { Spinner } from "./spinner.js";
import { formatDuration, formatTokens } from "../lib/format.js";
import { getSyntaxStyle } from "../lib/syntax.js";
import type { DisplayMessage } from "../context/session.js";
import type { ToolCallState } from "../context/agent.js";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface MessageProps {
  message: DisplayMessage;
}

export function Message(props: MessageProps) {
  return (
    <Switch>
      <Match when={props.message.role === "user"}>
        <UserMessage message={props.message} />
      </Match>
      <Match when={props.message.role === "assistant"}>
        <AssistantMessage message={props.message} />
      </Match>
      <Match when={props.message.role === "system"}>
        <SystemMessage message={props.message} />
      </Match>
    </Switch>
  );
}

// ---------------------------------------------------------------------------
// User message
// ---------------------------------------------------------------------------

function UserMessage(props: MessageProps) {
  const theme = useTheme();

  return (
    <box
      border={["left"] as any}
      borderColor={theme().primary}
      customBorderChars={SplitBorderChars}
      paddingLeft={1}
      paddingY={0}
    >
      <box
        backgroundColor={theme().backgroundPanel}
        paddingX={1}
        paddingY={0}
        flexGrow={1}
      >
        <text fg={theme().text} content={props.message.content} wrapMode="word" />
      </box>
    </box>
  );
}

// ---------------------------------------------------------------------------
// Assistant message
// ---------------------------------------------------------------------------

function AssistantMessage(props: MessageProps) {
  const theme = useTheme();

  return (
    <box flexDirection="column" gap={0}>
      {/* Thinking block (if present) */}
      <Show when={props.message.thinking}>
        <ThinkingBlock content={props.message.thinking!} />
      </Show>

      {/* Tool calls (if any) */}
      <Show when={props.message.toolCalls && props.message.toolCalls.length > 0}>
        <box flexDirection="column" gap={0} paddingLeft={1}>
          <For each={props.message.toolCalls}>
            {(tc) => <ToolCallView toolCall={tc} />}
          </For>
        </box>
      </Show>

      {/* Main text content */}
      <Show when={props.message.content}>
        <box paddingLeft={1}>
          <markdown
            content={props.message.content}
            syntaxStyle={getSyntaxStyle()}
            conceal={true}
          />
        </box>
      </Show>

      {/* Footer: agent info + timing */}
      <Show when={props.message.meta}>
        <box paddingLeft={1}>
          <text fg={theme().textMuted}>
            <span style={{ fg: theme().border }}>▣ </span>
            <span style={{ fg: theme().textMuted }}>
              {props.message.meta!.model}
            </span>
            <Show when={props.message.meta!.durationMs}>
              <span style={{ fg: theme().textMuted }}>
                {" · "}{formatDuration(props.message.meta!.durationMs!)}
              </span>
            </Show>
            <Show when={props.message.meta!.tokensOut}>
              <span style={{ fg: theme().textMuted }}>
                {" · "}{formatTokens(props.message.meta!.tokensOut!)} tokens
              </span>
            </Show>
          </text>
        </box>
      </Show>
    </box>
  );
}

// ---------------------------------------------------------------------------
// Thinking block
// ---------------------------------------------------------------------------

function ThinkingBlock(props: { content: string }) {
  const theme = useTheme();

  return (
    <box
      border={["left"] as any}
      borderColor={theme().backgroundMenu}
      customBorderChars={SplitBorderChars}
      paddingLeft={1}
      marginLeft={1}
    >
      <text fg={theme().textMuted}>
        <span style={{ fg: theme().accent }}>
          <strong>Thinking: </strong>
        </span>
        <span style={{ fg: theme().textMuted }}>{props.content}</span>
      </text>
    </box>
  );
}

// ---------------------------------------------------------------------------
// System message
// ---------------------------------------------------------------------------

function SystemMessage(props: MessageProps) {
  const theme = useTheme();

  return (
    <box paddingLeft={1} paddingY={0}>
      <text fg={theme().textMuted} content={props.message.content} wrapMode="word" />
    </box>
  );
}

// ---------------------------------------------------------------------------
// Streaming message (in-progress assistant response)
// ---------------------------------------------------------------------------

interface StreamingMessageProps {
  text: string;
  thinking: string;
  toolCalls: ToolCallState[];
  model: string;
}

export function StreamingMessage(props: StreamingMessageProps) {
  const theme = useTheme();

  return (
    <box flexDirection="column" gap={0}>
      {/* Thinking in progress */}
      <Show when={props.thinking}>
        <ThinkingBlock content={props.thinking} />
      </Show>

      {/* Active tool calls */}
      <Show when={props.toolCalls.length > 0}>
        <box flexDirection="column" gap={0} paddingLeft={1}>
          <For each={props.toolCalls}>
            {(tc) => <ToolCallView toolCall={tc} />}
          </For>
        </box>
      </Show>

      {/* Streaming text */}
      <Show when={props.text}>
        <box paddingLeft={1}>
          <markdown
            content={props.text}
            syntaxStyle={getSyntaxStyle()}
            conceal={true}
            streaming={true}
          />
        </box>
      </Show>

      {/* Streaming indicator */}
      <box paddingLeft={1}>
        <Spinner color={theme().secondary} label="" />
      </box>
    </box>
  );
}
