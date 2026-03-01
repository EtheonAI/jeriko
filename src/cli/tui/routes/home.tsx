/**
 * TUI Home Screen — Logo, centered prompt, tips, and version footer.
 *
 * This is the initial screen shown when `jeriko` launches with no args.
 * Transitions to the session screen on first message submit.
 */

import { useTerminalDimensions } from "@opentui/solid";
import { useTheme } from "../context/theme.js";
import { useRoute } from "../context/route.js";
import { useCommand } from "../context/command.js";
import { useAgent } from "../context/agent.js";
import { useSession } from "../context/session.js";
import { Logo } from "../components/logo.js";
import { Tips } from "../components/tips.js";
import { Prompt } from "../components/prompt.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VERSION = "2.0.0-alpha.0";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HomeScreen() {
  const theme = useTheme();
  const dims = useTerminalDimensions();
  const route = useRoute();
  const command = useCommand();
  const agent = useAgent();
  const session = useSession();

  const handleSubmit = (text: string) => {
    // Check for slash commands first
    if (command.tryCommand(text)) return;

    // Ensure we have a session before navigating
    if (!session.currentSession()) {
      session.newSession(agent.modelName());
    }

    // Navigate to session view and send the message
    route.navigate("session");
    agent.sendMessage(text);
  };

  return (
    <box
      flexDirection="column"
      width={dims().width}
      height={dims().height}
      backgroundColor={theme().background}
    >
      {/* Top spacer — push content to vertical center */}
      <box flexGrow={1} />

      {/* Logo */}
      <box justifyContent="center" paddingBottom={2}>
        <Logo />
      </box>

      {/* Prompt */}
      <box
        justifyContent="center"
        paddingX={Math.max(2, Math.floor(dims().width * 0.15))}
      >
        <box flexGrow={1} maxWidth={80}>
          <Prompt onSubmit={handleSubmit} focused={true} />
        </box>
      </box>

      {/* Tips */}
      <box justifyContent="center" paddingTop={2}>
        <Tips />
      </box>

      {/* Bottom spacer */}
      <box flexGrow={1} />

      {/* Footer */}
      <box
        flexDirection="row"
        justifyContent="space-between"
        paddingX={2}
        paddingBottom={0}
      >
        <text fg={theme().textMuted} content={process.cwd()} />
        <text fg={theme().textMuted} content={`v${VERSION}`} />
      </box>
    </box>
  );
}
