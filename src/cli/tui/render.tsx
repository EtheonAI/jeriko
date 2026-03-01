/**
 * TUI Entry Point — Starts the terminal UI or falls back to plain REPL.
 *
 * Fallback conditions:
 *   - stdin is not a TTY (piped input)
 *   - JERIKO_NO_TUI=1 environment variable is set
 *   - TERM=dumb (minimal terminal)
 */

import type { ThemeMode } from "./lib/theme.js";

export async function startTUI(): Promise<void> {
  // Fallback to plain REPL for non-interactive environments
  if (shouldFallback()) {
    const { startChat } = await import("../chat.js");
    return startChat();
  }

  // Detect theme BEFORE render() takes over the terminal,
  // since OSC 11 probing conflicts with @opentui's stdin management.
  const { detectThemeMode } = await import("./lib/theme.js");
  const themeMode = await detectThemeMode();

  // Dynamic import to avoid loading @opentui in non-TUI paths
  const { render } = await import("@opentui/solid");
  const { App } = await import("./app.js");

  await render(() => <App themeMode={themeMode} />, {
    targetFps: 60,
    exitOnCtrlC: false,
    useAlternateScreen: true,
    autoFocus: true,
  });
}

/**
 * Determine if we should fall back to the plain readline REPL.
 */
function shouldFallback(): boolean {
  // Not a TTY — piped input
  if (!process.stdin.isTTY) return true;

  // Explicit opt-out
  if (process.env.JERIKO_NO_TUI === "1") return true;

  // Dumb terminal (no escape sequence support)
  if (process.env.TERM === "dumb") return true;

  return false;
}
