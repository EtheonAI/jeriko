/**
 * Interactive CLI — launched when `jeriko` is run with no arguments.
 *
 * Ink (React for terminals) based. Uses declarative components for
 * all rendering: animated spinners, static message history, live
 * streaming text, tool call visualization, and slash command completion.
 *
 * Entry point: startChat() → loads boot config → wraps providers → renders <App />.
 * The dispatcher calls startChat(), Ink manages everything from there.
 *
 * Integration (ADR-013):
 *   - Loads theme + keybindings + permissions config in parallel before
 *     mount (loadCLIBootConfig).
 *   - Wraps <App> in <ThemeProvider> → <KeybindingProvider> →
 *     <PermissionProvider> so every subsystem hooks the store/context
 *     it needs from one place.
 *   - Theme auto-detects when no saved preference exists.
 */

import { render } from "ink";
import React from "react";

import { App } from "./app.js";
import { printBanner } from "./components/Banner.js";
import { createBackend } from "./backend.js";
import { needsSetup } from "./lib/setup.js";
import { StdinFilter } from "./lib/paste.js";
import { runOnboarding } from "./wizard/onboarding.js";
import { ClackPrompter } from "./wizard/clack-prompter.js";
import { persistSetup } from "./wizard/onboarding.js";
import type { Phase } from "./types.js";
import { VERSION } from "../shared/version.js";

// Subsystem 2: theme context + OSC 11 detection.
import { ThemeProvider } from "./themes/index.js";
// Subsystem 3: keybinding registry + user config.
import { KeybindingProvider } from "./keybindings/index.js";
// Subsystem 7: permission store + bridge.
import { PermissionProvider, createInMemoryBridge } from "./permission/index.js";
// Subsystem 8 (this integration): unified boot-time config.
import { loadCLIBootConfig, actionableDiagnostics } from "./boot/index.js";

// Re-export for backward compat (tests, dispatcher)
export { slashCompleter } from "./commands.js";

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function startChat(): Promise<void> {
  // Bun stdin compatibility — ensure stdin is flowing
  process.stdin.resume();

  const version = VERSION;

  // ── First-run provider onboarding (pre-Ink, clack-based) ─────────────
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

    // Restore stdin after clack wizard (raw mode off, resume, ref).
    if (process.stdin.setRawMode) {
      try { process.stdin.setRawMode(false); } catch { /* not a TTY */ }
    }
    process.stdin.resume();
    if (typeof process.stdin.ref === "function") {
      process.stdin.ref();
    }
    await new Promise((r) => setTimeout(r, 50));
  }

  // ── Boot config (theme + keybindings + permissions) ─────────────────
  // Parallel, non-fatal load — any individual subsystem file may be
  // missing/malformed and we still boot with sensible defaults.
  const bootConfig = await loadCLIBootConfig();

  // ── Permission bridge ───────────────────────────────────────────────
  // Single instance shared between the backend (registers a daemon-side
  // broker) and the PermissionProvider (attaches the UI-side handler).
  // When the two endpoints rendezvous, medium+/high-risk lease decisions
  // round-trip through the Ink dialog instead of auto-approving.
  const permissionBridge = createInMemoryBridge();

  // ── Backend (daemon or in-process) ──────────────────────────────────
  const backend = await createBackend({ permissionBridge });
  const model = backend.model;
  const cwd = process.cwd();

  // Print banner before Ink takes over (stays in scrollback).
  printBanner(version, model, cwd, backend.mode);

  // Surface any non-fatal config diagnostics above the chat — helps users
  // spot a broken keybindings.json or permissions.json without silent drift.
  const issues = actionableDiagnostics(bootConfig.diagnostics);
  if (issues.length > 0) {
    for (const issue of issues) {
      const entry = issue.entry as { kind: string };
      console.log(`⚠ ${issue.subsystem} config: ${entry.kind}`);
    }
  }

  // Always start idle (setup handled by wizard above).
  const initialPhase: Phase = "idle";

  // Wrap stdin with a filter that strips bracketed paste escape markers
  // before Ink's input parser sees them.
  const filteredStdin = new StdinFilter(process.stdin);

  // ── Render the full provider tree ───────────────────────────────────
  // Composition order:
  //   ThemeProvider       — innermost colors/context consumed by everything
  //   KeybindingProvider  — feeds the dialog scope and help overlay
  //   PermissionProvider  — feeds the PermissionOverlay mounted inside App
  //
  // The same `permissionBridge` flows through the backend (which
  // registers it as the daemon-side {@link PermissionBroker}) and into
  // the PermissionProvider (which attaches the UI handler). This is the
  // rendezvous point documented in ADR-014.
  const tree = (
    <ThemeProvider
      initialTheme={bootConfig.themeId ?? undefined}
      autoDetect={bootConfig.themeId === null}
    >
      <KeybindingProvider
        specs={bootConfig.keybindingSpecs}
        initialScopes={["input"]}
      >
        <PermissionProvider
          initialPersistentRules={bootConfig.permissionRules}
          bridge={permissionBridge}
        >
          <App backend={backend} initialModel={model} initialPhase={initialPhase} />
        </PermissionProvider>
      </KeybindingProvider>
    </ThemeProvider>
  );

  const { waitUntilExit } = render(tree, {
    stdin: filteredStdin as unknown as NodeJS.ReadStream,
    patchConsole: true,
  });

  await waitUntilExit();

  // Clean exit
  console.log("\x1b[0m"); // Reset any dangling ANSI
  process.exit(0);
}
