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
import { join } from "node:path";

import { App } from "./app.js";
import { printBanner } from "./components/Banner.js";
import { createBackend } from "./backend.js";
import { needsSetup } from "./lib/setup.js";
import { runOnboarding } from "./wizard/onboarding.js";
import { ClackPrompter } from "./wizard/clack-prompter.js";
import { persistSetup } from "./wizard/onboarding.js";
import type { Phase } from "./types.js";

// Re-export for backward compat (tests, dispatcher)
export { slashCompleter } from "./commands.js";

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

async function getVersion(): Promise<string> {
  try {
    const pkgPath = join(import.meta.dirname, "../../package.json");
    const pkg = await Bun.file(pkgPath).json();
    return pkg.version ?? "2.0.0";
  } catch {
    return "2.0.0";
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function startChat(): Promise<void> {
  // Bun stdin compatibility — ensure stdin is flowing
  process.stdin.resume();

  const version = await getVersion();

  // First-run onboarding wizard (before Ink mounts)
  if (needsSetup()) {
    const result = await runOnboarding(new ClackPrompter(), version);

    if (!result) {
      // User cancelled — can't proceed without a configured provider
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

    // Restore stdin after clack wizard — clack may leave it paused or
    // in raw mode, which prevents Ink from receiving keystrokes.
    if (process.stdin.isPaused()) process.stdin.resume();
    if (process.stdin.setRawMode) {
      try { process.stdin.setRawMode(false); } catch { /* not a TTY */ }
    }
  }

  // Choose backend (daemon or in-process)
  const backend = await createBackend();
  const model = backend.model;
  const cwd = process.cwd();

  // Print banner before Ink takes over (stays in scrollback)
  printBanner(version, model, cwd);

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
