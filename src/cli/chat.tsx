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

  // Choose backend (daemon or in-process)
  const backend = await createBackend();
  const model = backend.model;
  const cwd = process.cwd();

  // Print banner before Ink takes over (stays in scrollback)
  printBanner(version, model, cwd);

  // Determine initial phase
  const initialPhase: Phase = needsSetup() ? "setup" : "idle";

  // Render Ink app
  const { waitUntilExit } = render(
    <App backend={backend} initialModel={model} initialPhase={initialPhase} />,
  );

  await waitUntilExit();

  // Clean exit
  console.log("\x1b[0m"); // Reset any dangling ANSI
  process.exit(0);
}
