/**
 * Interactive CLI — launched when `jeriko` is run with no arguments.
 *
 * Ink (React for terminals) based. Uses declarative components for
 * all rendering: animated spinners, static message history, live
 * streaming text, tool call visualization, and slash command completion.
 *
 * Entry point: startChat() → prints banner → render(<App />).
 * The dispatcher calls startChat(), Ink manages everything from there.
 */

import { render } from "ink";
import React from "react";

import { App } from "./app.js";
import { printBanner } from "./components/Banner.js";
import { createBackend } from "./backend.js";
import { needsSetup } from "./lib/setup.js";
import { runOnboarding } from "./wizard/onboarding.js";
import { ClackPrompter } from "./wizard/clack-prompter.js";
import { persistSetup } from "./wizard/onboarding.js";
import type { Phase } from "./types.js";
import { VERSION } from "../shared/version.js";

// Re-export for backward compat (tests, dispatcher)
export { slashCompleter } from "./commands.js";

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function startChat(): Promise<void> {
  // Bun stdin compatibility — ensure stdin is flowing
  process.stdin.resume();

  const version = VERSION;

  // First-run onboarding wizard (before Ink mounts).
  // Only handles provider setup — channels are added after via /connect.
  if (needsSetup()) {
    const result = await runOnboarding(new ClackPrompter(), version);

    if (!result) {
      console.log("\nNo provider configured. Run `jeriko` again to start setup.");
      process.exit(0);
    }

    try {
      await persistSetup(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`\nSetup failed: ${msg}`);
      console.error("Run `jeriko` again to retry, or configure manually:");
      console.error("  ~/.config/jeriko/config.json  (model config)");
      console.error("  ~/.config/jeriko/.env          (API keys)");
      process.exit(1);
    }

    // Restore stdin after clack wizard. Clack uses readline internally
    // which sets raw mode, pauses stdin, and may emit 'end'. Ink needs
    // a flowing, non-raw, referenced stdin to receive keystrokes.
    // Order matters: disable raw mode first, then resume, then ref.
    if (process.stdin.setRawMode) {
      try { process.stdin.setRawMode(false); } catch { /* not a TTY */ }
    }
    process.stdin.resume();
    if (typeof process.stdin.ref === "function") {
      process.stdin.ref();
    }

    // Give the event loop a tick to settle stdin state before proceeding.
    // Without this, Ink may see a stale stdin state and exit immediately.
    await new Promise((r) => setTimeout(r, 50));
  }

  // Single backend creation point — ensureDaemon() auto-starts if needed,
  // provides visible feedback on failure, and gracefully degrades.
  const backend = await createBackend();
  const model = backend.model;
  const cwd = process.cwd();

  // Print banner before Ink takes over (stays in scrollback)
  printBanner(version, model, cwd, backend.mode);

  // Always start idle (setup handled by wizard above)
  const initialPhase: Phase = "idle";

  // Render Ink app with optimized options:
  //   patchConsole: Intercepts console.log/warn/error so they don't break the TUI
  //   incrementalRendering: Only redraws changed lines (reduces flicker on fast updates)
  const { waitUntilExit } = render(
    <App backend={backend} initialModel={model} initialPhase={initialPhase} />,
    {
      patchConsole: true,
    },
  );

  await waitUntilExit();

  // Clean exit
  console.log("\x1b[0m"); // Reset any dangling ANSI
  process.exit(0);
}
