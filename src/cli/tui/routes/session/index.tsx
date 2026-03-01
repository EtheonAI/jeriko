/**
 * TUI Session Screen — Full conversation view with messages, prompt, header, footer.
 *
 * Layout (top to bottom):
 *   Header    — session title, model, tokens
 *   Messages  — scrollable message list with auto-scroll
 *   Prompt    — input with colored left border
 *   Footer    — cwd + version
 */

import { For, Show } from "solid-js";
import { useTerminalDimensions, useKeyboard } from "@opentui/solid";
import type { ScrollBoxRenderable } from "@opentui/core";
import { useTheme } from "../../context/theme.js";
import { useSession } from "../../context/session.js";
import { useAgent } from "../../context/agent.js";
import { useCommand } from "../../context/command.js";
import { useRoute } from "../../context/route.js";
import { Message, StreamingMessage } from "../../components/message.js";
import { Prompt } from "../../components/prompt.js";
import { SessionHeader } from "./header.js";
import { SessionFooter } from "./footer.js";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SessionScreen() {
  const theme = useTheme();
  const dims = useTerminalDimensions();
  const session = useSession();
  const agent = useAgent();
  const command = useCommand();
  const route = useRoute();

  let scrollRef: ScrollBoxRenderable | undefined;

  const handleSubmit = (text: string) => {
    // Check for slash commands first
    if (command.tryCommand(text)) return;
    agent.sendMessage(text);
  };

  // Keyboard shortcuts
  useKeyboard((key) => {
    // Escape — cancel streaming
    if (key.name === "escape" && agent.isStreaming()) {
      agent.cancelStream();
      return;
    }

    // Ctrl+N — new session
    if (key.ctrl && key.name === "n") {
      session.newSession(agent.modelName());
      route.navigate("home");
      return;
    }

    // Page up/down — scroll messages
    if (key.name === "pageup" && scrollRef) {
      scrollRef.scrollBy(-scrollRef.height / 2);
      return;
    }
    if (key.name === "pagedown" && scrollRef) {
      scrollRef.scrollBy(scrollRef.height / 2);
      return;
    }
  });

  return (
    <box
      flexDirection="column"
      width={dims().width}
      height={dims().height}
      backgroundColor={theme().background}
    >
      {/* Header */}
      <SessionHeader />

      {/* Messages — scrollable area */}
      <scrollbox
        ref={(r: ScrollBoxRenderable) => { scrollRef = r; }}
        stickyScroll={true}
        stickyStart="bottom"
        flexGrow={1}
        viewportOptions={{ paddingRight: 1 }}
      >
        <box flexDirection="column" gap={1} paddingY={1}>
          {/* Persisted messages */}
          <For each={session.messages()}>
            {(msg) => <Message message={msg} />}
          </For>

          {/* Streaming message (in-progress) */}
          <Show when={agent.isStreaming()}>
            <StreamingMessage
              text={agent.streamingText()}
              thinking={agent.thinkingText()}
              toolCalls={agent.activeToolCalls()}
              model={agent.modelName()}
            />
          </Show>
        </box>
      </scrollbox>

      {/* Prompt */}
      <box paddingX={1} paddingTop={0}>
        <box flexGrow={1}>
          <Prompt onSubmit={handleSubmit} focused={true} />
        </box>
      </box>

      {/* Footer */}
      <SessionFooter />
    </box>
  );
}
