/**
 * TUI Session Footer — Bottom bar showing cwd and version.
 *
 * Layout:
 *   ~/Desktop/Projects/Etheon/jeriko                    v2.0.0-alpha.0
 */

import { useTheme } from "../../context/theme.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VERSION = "2.0.0-alpha.0";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SessionFooter() {
  const theme = useTheme();

  return (
    <box
      flexDirection="row"
      justifyContent="space-between"
      paddingX={2}
      paddingY={0}
    >
      <text fg={theme().textMuted} content={process.cwd()} />
      <text fg={theme().textMuted} content={`v${VERSION}`} />
    </box>
  );
}
