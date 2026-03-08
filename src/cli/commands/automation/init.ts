/**
 * `jeriko init` — Configuration wizard.
 *
 * Delegates to the shared onboarding wizard (same flow as first-run).
 * Additionally handles:
 *   - --non-interactive mode for CI/scripting
 *   - Agent prompt deployment
 *   - Existing config detection (reconfigure message)
 *
 * Flow:
 *   1. Provider select — Claude, GPT, Local, or 22+ presets
 *   2. Auth method — OAuth (if available) or API key
 *   3. Write config + env + deploy agent prompt
 *   4. Daemon starts on next `jeriko` via createBackend() → ensureDaemon()
 *
 * Flags:
 *   --non-interactive   Build config from env vars (CI/scripting)
 *   --force             Alias for default behavior (always reconfigures)
 */

import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { existsSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { getConfigDir } from "../../../shared/config.js";
import { ClackPrompter } from "../../wizard/clack-prompter.js";
import { runOnboarding, persistSetup } from "../../wizard/onboarding.js";
import { JERIKO_DIR } from "../../lib/daemon.js";

const CONFIG_DIR = getConfigDir();
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Deploy AGENT.md to ~/.config/jeriko/agent.md so the daemon can load it.
 */
function deployAgentPrompt(): void {
  const dest = join(CONFIG_DIR, "agent.md");

  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, "AGENT.md");
    if (existsSync(candidate)) {
      copyFileSync(candidate, dest);
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
}

/**
 * Build config from env vars for non-interactive mode.
 */
function buildNonInteractiveConfig(): Record<string, unknown> {
  return {
    agent: {
      model: process.env.ANTHROPIC_API_KEY ? "claude" :
             process.env.OPENAI_API_KEY ? "gpt4" : "local",
    },
    channels: {},
    connectors: {},
    logging: { level: "info" },
  };
}

/**
 * Get version string from package.json.
 */
async function getVersion(): Promise<string> {
  try {
    const pkgPath = join(import.meta.dirname, "../../../package.json");
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
  name: "init",
  description: "Setup wizard (provider, API key)",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko init [options]");
      console.log("\nInteractive setup wizard for Jeriko configuration.");
      console.log("Always runs the wizard. Pre-fills existing values if config exists.");
      console.log("\nSteps:");
      console.log("  1. AI provider (Claude, GPT, Local, or custom)");
      console.log("  2. Authentication (OAuth or API key)");
      console.log("  3. Write config + deploy agent prompt");
      console.log("  4. Auto-start daemon");
      console.log("\nFlags:");
      console.log("  --non-interactive Use env vars instead of prompts");
      process.exit(0);
    }

    const nonInteractive = flagBool(parsed, "non-interactive");

    // Ensure directories exist
    if (!existsSync(JERIKO_DIR)) mkdirSync(JERIKO_DIR, { recursive: true });
    if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });

    if (nonInteractive) {
      const config = buildNonInteractiveConfig();
      writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n");
      deployAgentPrompt();
      ok({ status: "configured", config_path: CONFIG_FILE, config });
      return;
    }

    // Interactive mode — same wizard as first-run onboarding
    try {
      const prompter = new ClackPrompter();
      const version = await getVersion();
      const result = await runOnboarding(prompter, version);

      if (result) {
        await persistSetup(result);
        deployAgentPrompt();
        ok({ status: "configured", config_path: CONFIG_FILE });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fail(`Setup failed: ${msg}`);
    }
  },
};

/**
 * Exported for `onboard` command delegation.
 * @deprecated Use runOnboarding + persistSetup from wizard/onboarding.ts directly.
 */
export async function runInteractiveInit(prompter: import("../../wizard/prompter.js").WizardPrompter): Promise<void> {
  const version = await getVersion();
  const result = await runOnboarding(prompter, version);
  if (result) {
    await persistSetup(result);
    deployAgentPrompt();
    ok({ status: "configured", config_path: CONFIG_FILE });
  }
}
