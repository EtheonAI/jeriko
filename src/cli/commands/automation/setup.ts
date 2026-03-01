/**
 * `jeriko setup` — Post-install shell integration.
 *
 * Called by the install script after the binary is in place.
 * Handles:
 *   1. Create data + config directories
 *   2. Shell completions (bash, zsh, fish)
 *   3. PATH integration
 *   4. Verify installation
 *
 * Modeled after `claude install` from Claude Code.
 */

import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool } from "../../../shared/args.js";
import {
  setupDirectories,
  setupCompletions,
  setupPath,
  setupTemplates,
  verifyInstallation,
  success,
} from "./install-utils.js";

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export const command: CommandHandler = {
  name: "setup",
  description: "Post-install shell integration",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko setup");
      console.log("\nPost-install setup: directories, shell completions, PATH.");
      console.log("Called automatically by the install script.");
      process.exit(0);
    }

    console.log();
    console.log("\x1b[1m  Jeriko Setup\x1b[0m");
    console.log();

    setupDirectories();
    setupTemplates();
    setupCompletions();
    setupPath();
    verifyInstallation();

    console.log();
    success("Setup complete!");
    console.log();
    console.log("  Get started:");
    console.log("    \x1b[1mjeriko --help\x1b[0m          Show all commands");
    console.log("    \x1b[1mjeriko init\x1b[0m            Run setup wizard (API keys)");
    console.log("    \x1b[1mjeriko\x1b[0m                 Start interactive chat");
    console.log("    \x1b[1mjeriko server start\x1b[0m    Start the daemon");
    console.log();
  },
};
