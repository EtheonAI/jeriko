/**
 * TUI Session Header — Top bar showing session info, tokens, and cost.
 *
 * Layout:
 *   ┃ # bold-nexus-042          2,400  45%  ($0.12)
 */

import { Show } from "solid-js";
import { useTheme } from "../../context/theme.js";
import { useSession } from "../../context/session.js";
import { useAgent } from "../../context/agent.js";
import { SplitBorderChars } from "../../components/border.js";
import { formatTokens, estimateCost, formatCost } from "../../lib/format.js";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SessionHeader() {
  const theme = useTheme();
  const session = useSession();
  const agent = useAgent();

  const tokens = () => agent.lastTurnTokens();
  const totalTokens = () => tokens().in + tokens().out;
  const cost = () => estimateCost(tokens().in, tokens().out);

  return (
    <box
      border={["left"] as any}
      borderColor={theme().border}
      customBorderChars={SplitBorderChars}
      backgroundColor={theme().backgroundPanel}
      paddingX={1}
      paddingY={0}
      flexDirection="row"
      justifyContent="space-between"
    >
      {/* Left: session title */}
      <text fg={theme().text}>
        <span style={{ fg: theme().textMuted }}># </span>
        <span style={{ fg: theme().text, bold: true }}>
          {session.currentSession()?.slug ?? "new session"}
        </span>
      </text>

      {/* Right: model + tokens + cost */}
      <text fg={theme().textMuted}>
        <span style={{ fg: theme().textMuted }}>
          {agent.modelName()}
        </span>
        <Show when={totalTokens() > 0}>
          <span style={{ fg: theme().textMuted }}>
            {"  "}{formatTokens(totalTokens())}
          </span>
          <span style={{ fg: theme().textMuted }}>
            {"  "}{formatCost(cost())}
          </span>
        </Show>
      </text>
    </box>
  );
}
