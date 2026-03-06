/**
 * `jeriko onboard` — Interactive onboarding wizard.
 *
 * Runs the same @clack/prompts wizard used for first-launch setup.
 * Can be invoked:
 *   - By the install script as the final step
 *   - Manually with `jeriko onboard`
 *   - From the REPL via `/onboard`
 *
 * Steps:
 *   1. Provider selection (Claude, GPT, Local)
 *   2. API key input + verification
 *   3. Optional Telegram bot setup
 *   4. Persist config + env
 */

import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool } from "../../../shared/args.js";
import { runOnboarding, persistSetup } from "../../wizard/onboarding.js";
import { ClackPrompter } from "../../wizard/clack-prompter.js";

// ---------------------------------------------------------------------------
// Version helper (shared with chat.tsx)
// ---------------------------------------------------------------------------

async function getVersion(): Promise<string> {
  try {
    const { join } = await import("node:path");
    const pkgPath = join(import.meta.dirname, "../../../../package.json");
    const pkg = await Bun.file(pkgPath).json();
    return pkg.version ?? "2.0.0";
  } catch {
    return "2.0.0";
  }
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export const command: CommandHandler = {
  name: "onboard",
  description: "Run the interactive setup wizard",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko onboard");
      console.log("\nInteractive setup wizard for first-time configuration.");
      console.log("Sets up your AI provider, API key, and optional Telegram bot.");
      process.exit(0);
    }

    const version = await getVersion();
    const prompter = new ClackPrompter();
    const result = await runOnboarding(prompter, version);

    if (result) {
      await persistSetup(result);
      process.exit(0);
    } else {
      // User cancelled
      process.exit(1);
    }
  },
};
