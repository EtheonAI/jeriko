/**
 * TUI ToolCall — Renders tool invocations in the message stream.
 *
 * Two modes:
 *   - Inline: single-line summary for completed tools (dimmed)
 *   - Block: expandable view with output for tools that have results
 */

import { Show, createSignal } from "solid-js";
import { useTheme } from "../context/theme.js";
import { getToolIcon } from "../lib/icons.js";
import { SplitBorderChars } from "./border.js";
import { Spinner } from "./spinner.js";
import type { ToolCallState } from "../context/agent.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_PREVIEW_LINES = 10;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ToolCallProps {
  toolCall: ToolCallState;
}

export function ToolCallView(props: ToolCallProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = createSignal(false);

  const icon = () => getToolIcon(props.toolCall.name);
  const isActive = () => props.toolCall.status === "running";
  const isError = () => props.toolCall.status === "error";
  const isDone = () => props.toolCall.status === "done" || props.toolCall.status === "error";

  const summary = (): string => {
    const args = props.toolCall.arguments;
    try {
      const parsed = JSON.parse(args);
      if (parsed.command) return String(parsed.command);
      if (parsed.file_path) return String(parsed.file_path);
      if (parsed.path) return String(parsed.path);
      if (parsed.pattern) return String(parsed.pattern);
      if (parsed.query) return String(parsed.query);
      if (parsed.url) return String(parsed.url);
      const firstValue = Object.values(parsed).find((v) => typeof v === "string");
      return firstValue ? String(firstValue) : "";
    } catch {
      return args.length > 80 ? args.slice(0, 80) + "..." : args;
    }
  };

  const resultPreview = (): string => {
    const result = props.toolCall.result;
    if (!result) return "";
    const lines = result.split("\n");
    if (lines.length <= MAX_PREVIEW_LINES || expanded()) return result;
    return lines.slice(0, MAX_PREVIEW_LINES).join("\n") + `\n... (${lines.length - MAX_PREVIEW_LINES} more lines)`;
  };

  const hasResult = () => Boolean(props.toolCall.result);

  return (
    <box flexDirection="column" paddingTop={0}>
      {/* Header line: icon + name + summary */}
      <box flexDirection="row" gap={1}>
        <Show
          when={!isActive()}
          fallback={<Spinner color={theme().secondary} />}
        >
          <text
            fg={isError() ? theme().error : theme().secondary}
            content={icon().icon}
          />
        </Show>

        <text fg={isDone() ? theme().textMuted : theme().text}>
          <Show
            when={!isDone()}
            fallback={
              <span style={{ fg: theme().textMuted }}>
                {props.toolCall.name}
              </span>
            }
          >
            <strong>
              <span style={{ fg: theme().secondary }}>
                {props.toolCall.name}
              </span>
            </strong>
          </Show>
          {summary() ? (
            <span style={{ fg: theme().textMuted }}>
              {"  "}{summary()}
            </span>
          ) : null}
        </text>
      </box>

      {/* Expandable result block */}
      <Show when={hasResult() && isDone()}>
        <box
          border={["left"] as any}
          borderColor={isError() ? theme().error : theme().border}
          customBorderChars={SplitBorderChars}
          paddingLeft={1}
          marginLeft={2}
        >
          <text
            fg={isError() ? theme().error : theme().textMuted}
            content={resultPreview()}
            wrapMode="word"
          />
        </box>
      </Show>
    </box>
  );
}
