import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool, flagStr } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline";
import { getConfigDir } from "../../../shared/config.js";

const JERIKO_DIR = join(homedir(), ".jeriko");
const CONFIG_DIR = getConfigDir();              // ~/.config/jeriko/
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

/**
 * Deploy AGENT.md to ~/.config/jeriko/agent.md so the daemon can load it.
 * Searches for AGENT.md in the project root (walking up from CWD).
 */
function deployAgentPrompt(): void {
  const dest = join(CONFIG_DIR, "agent.md");

  // Find AGENT.md by walking up from CWD
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, "AGENT.md");
    if (existsSync(candidate)) {
      copyFileSync(candidate, dest);
      console.log(`  Agent prompt deployed to ${dest}`);
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // If no AGENT.md found, leave existing or skip
  if (existsSync(dest)) {
    console.log("  Agent prompt already deployed (no AGENT.md found to update).");
  } else {
    console.log("  Warning: No AGENT.md found. Agent will have no system prompt.");
  }
}

export const command: CommandHandler = {
  name: "init",
  description: "Setup wizard (API keys, Telegram, tunnel)",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko init [options]");
      console.log("\nInteractive setup wizard for Jeriko configuration.");
      console.log("\nSteps:");
      console.log("  1. API keys (Claude, OpenAI, or local model)");
      console.log("  2. Telegram bot setup");
      console.log("  3. Security (NODE_AUTH_SECRET)");
      console.log("  4. Tunnel configuration (for webhooks)");
      console.log("  5. Integration credentials");
      console.log("  6. Verify setup");
      console.log("\nFlags:");
      console.log("  --step <n>        Start from specific step");
      console.log("  --non-interactive Use env vars instead of prompts");
      console.log("  --force           Overwrite existing config");
      process.exit(0);
    }

    const nonInteractive = flagBool(parsed, "non-interactive");
    const force = flagBool(parsed, "force");

    // Ensure directories exist
    if (!existsSync(JERIKO_DIR)) mkdirSync(JERIKO_DIR, { recursive: true });
    if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });

    // Check for existing config
    if (existsSync(CONFIG_FILE) && !force) {
      const existing = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
      console.log("Existing configuration found. Use --force to overwrite.");
      ok({ status: "exists", config_path: CONFIG_FILE, configured: Object.keys(existing) });
      return;
    }

    if (nonInteractive) {
      // Build config matching JerikoConfig schema (see shared/config.ts)
      const config: Record<string, unknown> = {
        agent: {
          model: process.env.ANTHROPIC_API_KEY ? "claude" :
                 process.env.OPENAI_API_KEY ? "gpt4" : "local",
        },
        channels: {
          telegram: {
            token: process.env.TELEGRAM_BOT_TOKEN ?? "",
            adminIds: process.env.ADMIN_TELEGRAM_IDS
              ? process.env.ADMIN_TELEGRAM_IDS.split(",").map(s => s.trim())
              : [],
          },
          whatsapp: { enabled: false },
        },
        connectors: {
          stripe:  { webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "" },
          github:  { webhookSecret: process.env.GITHUB_WEBHOOK_SECRET ?? "" },
          twilio:  {
            accountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
            authToken: process.env.TWILIO_AUTH_TOKEN ?? "",
          },
        },
        logging: { level: "info" },
      };

      writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n");
      deployAgentPrompt();
      ok({ status: "configured", config_path: CONFIG_FILE, config });
      return;
    }

    // Interactive mode
    console.log("\n  Jeriko Setup Wizard\n");
    console.log("  This wizard will configure your Jeriko installation.\n");

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q: string): Promise<string> =>
      new Promise((resolve) => rl.question(`  ${q}: `, resolve));

    try {
      // Step 1: AI Provider
      console.log("  Step 1/6 — AI Provider");
      const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
      const hasOpenAI = !!process.env.OPENAI_API_KEY;
      console.log(`    ANTHROPIC_API_KEY: ${hasAnthropic ? "set" : "not set"}`);
      console.log(`    OPENAI_API_KEY: ${hasOpenAI ? "set" : "not set"}`);

      // Step 2: Telegram
      console.log("\n  Step 2/6 — Telegram");
      const hasTelegram = !!process.env.TELEGRAM_BOT_TOKEN;
      console.log(`    TELEGRAM_BOT_TOKEN: ${hasTelegram ? "set" : "not set"}`);

      // Step 3: Security
      console.log("\n  Step 3/6 — Security");
      const hasAuth = !!process.env.NODE_AUTH_SECRET;
      console.log(`    NODE_AUTH_SECRET: ${hasAuth ? "set" : "NOT SET (required!)"}`);

      // Step 4: Tunnel
      console.log("\n  Step 4/6 — Tunnel (for webhooks)");
      console.log("    Options: cloudflare-named, cloudflare-quick, localtunnel");

      // Step 5: Integrations
      console.log("\n  Step 5/6 — Integrations");
      const integrations = ["STRIPE_SECRET_KEY", "GITHUB_TOKEN", "TWILIO_ACCOUNT_SID"];
      for (const key of integrations) {
        console.log(`    ${key}: ${process.env[key] ? "set" : "not set"}`);
      }

      // Step 6: Verify
      console.log("\n  Step 6/6 — Verification");

      // Build config matching JerikoConfig schema (see shared/config.ts)
      const config: Record<string, unknown> = {
        agent: {
          model: hasAnthropic ? "claude" : hasOpenAI ? "gpt4" : "local",
        },
        channels: {
          telegram: {
            token: process.env.TELEGRAM_BOT_TOKEN ?? "",
            adminIds: process.env.ADMIN_TELEGRAM_IDS
              ? process.env.ADMIN_TELEGRAM_IDS.split(",").map(s => s.trim())
              : [],
          },
          whatsapp: { enabled: false },
        },
        connectors: {
          stripe:  { webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "" },
          github:  { webhookSecret: process.env.GITHUB_WEBHOOK_SECRET ?? "" },
          twilio:  {
            accountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
            authToken: process.env.TWILIO_AUTH_TOKEN ?? "",
          },
        },
        logging: { level: "info" },
      };

      writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n");
      console.log(`\n  Configuration saved to ${CONFIG_FILE}`);
      deployAgentPrompt();
      console.log();

      rl.close();
      ok({ status: "configured", config_path: CONFIG_FILE });
    } catch (err) {
      rl.close();
      const msg = err instanceof Error ? err.message : String(err);
      fail(`Setup failed: ${msg}`);
    }
  },
};
