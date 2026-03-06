/**
 * `jeriko onboard` — Alias for `jeriko init`.
 *
 * Delegates entirely to the init wizard. Kept for backward compatibility
 * with install scripts and `/onboard` REPL command.
 */

import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool } from "../../../shared/args.js";
import { fail } from "../../../shared/output.js";
import { existsSync, mkdirSync } from "node:fs";
import { getConfigDir } from "../../../shared/config.js";
import { ClackPrompter } from "../../wizard/clack-prompter.js";
import { runInteractiveInit } from "./init.js";
import { JERIKO_DIR } from "../../lib/daemon.js";

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export const command: CommandHandler = {
  name: "onboard",
  description: "Run the interactive setup wizard (alias for init)",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko onboard");
      console.log("\nAlias for `jeriko init`. Runs the full interactive setup wizard.");
      process.exit(0);
    }

    const configDir = getConfigDir();
    if (!existsSync(JERIKO_DIR)) mkdirSync(JERIKO_DIR, { recursive: true });
    if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });

    try {
      const prompter = new ClackPrompter();
      await runInteractiveInit(prompter);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fail(`Setup failed: ${msg}`);
    }
  },
};
