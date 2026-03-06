/**
 * `jeriko init` — Full configuration wizard.
 *
 * ALWAYS runs the interactive wizard. If config already exists, pre-fills
 * existing values so the user can review and update them.
 *
 * Flow (channel-first):
 *   1. Channel select — Telegram, WhatsApp, or skip
 *   2. Channel token input (Telegram only)
 *   3. Provider select — Claude, GPT, Local, or preset
 *   4. API key input + verification
 *   5. Ollama model selection (if local provider + Ollama running)
 *   6. Security token generation
 *   7. Write config + env
 *   8. Deploy agent prompt
 *   9. Auto-start daemon
 *
 * Flags:
 *   --non-interactive   Build config from env vars (CI/scripting)
 *   --force             Overwrite existing config (kept for CI compat)
 */

import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { getConfigDir } from "../../../shared/config.js";
import { ClackPrompter } from "../../wizard/clack-prompter.js";
import { validateApiKey, getProviderOptions, CHANNEL_OPTIONS } from "../../lib/setup.js";
import type { ChannelChoice } from "../../lib/setup.js";
import { verifyApiKey, verifyOllamaRunning, fetchOllamaModelList } from "../../wizard/verify.js";
import type { WizardPrompter } from "../../wizard/prompter.js";
import { JERIKO_DIR, spawnDaemon } from "../../lib/daemon.js";

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
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
}

function isCancel(value: unknown): value is symbol {
  return typeof value === "symbol";
}

/**
 * Load existing config values (if any) for pre-filling the wizard.
 */
function loadExistingConfig(): Record<string, unknown> | null {
  if (!existsSync(CONFIG_FILE)) return null;
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
  } catch {
    return null;
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
    channels: {
      telegram: {
        token: process.env.TELEGRAM_BOT_TOKEN ?? "",
        adminIds: process.env.ADMIN_TELEGRAM_IDS
          ? process.env.ADMIN_TELEGRAM_IDS.split(",").map(s => s.trim())
          : [],
      },
      whatsapp: { enabled: !!process.env.WHATSAPP_ENABLED },
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
}

/**
 * Prompt the user to select an installed Ollama model.
 * Returns the model name (e.g. "deepseek-coder:6.7b") or null if none available.
 */
async function selectOllamaModel(prompter: WizardPrompter): Promise<string | null> {
  const s = prompter.spinner();
  s.start("Checking Ollama...");

  const running = await verifyOllamaRunning();
  if (!running) {
    s.stop("Ollama not detected");
    prompter.note(
      "Install Ollama: https://ollama.com\nThen run: ollama pull <model>",
      "Ollama Required",
    );
    return null;
  }

  const models = await fetchOllamaModelList();
  s.stop(`Ollama is running (${models.length} model${models.length !== 1 ? "s" : ""} installed)`);

  if (models.length === 0) {
    prompter.note(
      "No models installed. Run: ollama pull <model>\nExamples: llama3, deepseek-coder, mistral, qwen2",
      "No Models Found",
    );
    return null;
  }

  if (models.length === 1) {
    prompter.note(`Auto-selected: ${models[0]!}`, "Ollama Model");
    return models[0]!;
  }

  // Multiple models — let the user pick
  const modelId = await prompter.select({
    message: "Choose an Ollama model",
    options: models.map((m) => ({
      value: m,
      label: m,
    })),
  });

  if (isCancel(modelId)) return null;
  return modelId as string;
}

/**
 * Run the interactive init wizard — channel-first flow with extra steps.
 * Exported so `onboard` can delegate to the same function.
 */
export async function runInteractiveInit(prompter: WizardPrompter): Promise<void> {
  const existing = loadExistingConfig();
  const existingChannels = (existing?.channels ?? {}) as Record<string, unknown>;
  const existingTelegram = (existingChannels.telegram ?? {}) as Record<string, unknown>;
  const existingWhatsapp = (existingChannels.whatsapp ?? {}) as Record<string, unknown>;

  if (existing) {
    prompter.intro("Jeriko Setup (reconfiguring)");
  } else {
    prompter.intro("Jeriko Setup");
  }

  // ── Step 1: Channel ──────────────────────────────────────────────
  const channelId = await prompter.select({
    message: "Set up a messaging channel",
    options: CHANNEL_OPTIONS.map((ch) => ({
      value: ch.id,
      label: ch.name,
      hint: ch.hint,
    })),
  });

  if (isCancel(channelId)) {
    prompter.outro("Setup cancelled.");
    return;
  }

  let telegramToken = process.env.TELEGRAM_BOT_TOKEN
    ?? (existingTelegram.token as string | undefined)
    ?? "";
  let whatsappEnabled = (existingWhatsapp.enabled as boolean | undefined) ?? false;

  if (channelId === "telegram" && !telegramToken) {
    const token = await prompter.text({
      message: "Telegram bot token (from @BotFather)",
      placeholder: "123456:ABC-DEF...",
      validate: (value) => {
        if (value.trim().length < 10) return "Token too short";
      },
    });

    if (isCancel(token)) {
      prompter.outro("Setup cancelled.");
      return;
    }
    telegramToken = (token as string).trim();
  } else if (channelId === "whatsapp") {
    whatsappEnabled = true;
    prompter.note(
      "WhatsApp will pair via QR code when the daemon starts.",
      "WhatsApp",
    );
  }

  // ── Step 2: AI Provider ──────────────────────────────────────────
  const providerOptions = getProviderOptions();
  const providerId = await prompter.select({
    message: "Choose your AI provider",
    options: providerOptions.map((p, i) => ({
      value: p.id,
      label: p.name,
      hint: i === 0 ? "recommended" : !p.needsApiKey ? "no API key needed" : undefined,
    })),
  });

  if (isCancel(providerId)) {
    prompter.outro("Setup cancelled.");
    return;
  }

  const provider = providerOptions.find((p) => p.id === providerId)!;

  // ── Step 3: API key ──────────────────────────────────────────────
  let apiKey = "";
  let resolvedModel = provider.model;

  if (provider.needsApiKey) {
    // Check env first
    const envValue = process.env[provider.envKey];
    if (envValue) {
      prompter.note(`${provider.envKey} already set in environment`, "API Key");
      apiKey = envValue;
    } else {
      const key = await prompter.password({
        message: `Enter your ${provider.name} API key`,
        validate: (value) => {
          if (!validateApiKey(value)) {
            return value.trim().length < 10
              ? "API key must be at least 10 characters"
              : "API key must not contain whitespace";
          }
        },
      });

      if (isCancel(key)) {
        prompter.outro("Setup cancelled.");
        return;
      }

      apiKey = (key as string).trim();

      // Verify
      const s = prompter.spinner();
      s.start("Verifying API key...");
      const valid = await verifyApiKey(provider.id, apiKey);
      s.stop(valid ? "API key verified" : "Could not verify (continuing anyway)");
    }
  } else if (provider.id === "local") {
    // ── Step 3b: Ollama model detection + selection ───────────────
    const ollamaModel = await selectOllamaModel(prompter);
    if (ollamaModel) {
      resolvedModel = `local/${ollamaModel}`;
    }
  }

  // ── Step 4: Security token ───────────────────────────────────────
  let authSecret = process.env.NODE_AUTH_SECRET ?? "";
  if (!authSecret) {
    const wantAuth = await prompter.confirm({
      message: "Generate a security token? (recommended for daemon API)",
      initialValue: true,
    });

    if (!isCancel(wantAuth) && wantAuth) {
      const { randomBytes } = await import("node:crypto");
      authSecret = randomBytes(32).toString("hex");
      prompter.note(`NODE_AUTH_SECRET=${authSecret}`, "Security Token");
    }
  }

  // ── Write config ─────────────────────────────────────────────────
  const config: Record<string, unknown> = {
    agent: { model: resolvedModel },
    channels: {
      telegram: {
        token: telegramToken,
        adminIds: process.env.ADMIN_TELEGRAM_IDS
          ? process.env.ADMIN_TELEGRAM_IDS.split(",").map(s => s.trim())
          : (existingTelegram.adminIds as string[] | undefined) ?? [],
      },
      whatsapp: { enabled: whatsappEnabled },
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

  // ── Write secrets to .env ────────────────────────────────────────
  const envPath = join(CONFIG_DIR, ".env");
  const envLines: string[] = [];
  if (apiKey && provider.envKey) {
    envLines.push(`${provider.envKey}=${apiKey}`);
  }
  if (authSecret) {
    envLines.push(`NODE_AUTH_SECRET=${authSecret}`);
  }
  if (envLines.length > 0) {
    const existingEnv = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
    const existingEnvLines = existingEnv.split("\n");
    const newLines = envLines.filter((l) => {
      const key = l.split("=")[0]!;
      return !existingEnvLines.some((el) => el.startsWith(`${key}=`));
    });
    if (newLines.length > 0) {
      writeFileSync(envPath, existingEnv + newLines.join("\n") + "\n");
    }
  }

  // ── Auto-start daemon ────────────────────────────────────────────
  const s2 = prompter.spinner();
  s2.start("Starting daemon...");
  const daemonPid = await spawnDaemon();
  if (daemonPid) {
    s2.stop(`Daemon started (PID ${daemonPid})`);
  } else {
    s2.stop("Could not start daemon — run: jeriko server start");
  }

  prompter.outro("Setup complete! Run `jeriko` to start chatting.");
  ok({ status: "configured", config_path: CONFIG_FILE });
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export const command: CommandHandler = {
  name: "init",
  description: "Setup wizard (API keys, channels, tunnel)",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko init [options]");
      console.log("\nInteractive setup wizard for Jeriko configuration.");
      console.log("Always runs the wizard. Pre-fills existing values if config exists.");
      console.log("\nSteps:");
      console.log("  1. Messaging channel (Telegram / WhatsApp / skip)");
      console.log("  2. AI provider (Claude, GPT, Local, or custom)");
      console.log("  3. API key verification");
      console.log("  4. Ollama model selection (if local provider)");
      console.log("  5. Security (NODE_AUTH_SECRET)");
      console.log("  6. Write config + deploy agent prompt");
      console.log("  7. Auto-start daemon");
      console.log("\nFlags:");
      console.log("  --non-interactive Use env vars instead of prompts");
      console.log("  --force           Alias for default behavior (always reconfigures)");
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

    // Interactive mode — always runs, pre-fills existing values
    try {
      const prompter: WizardPrompter = new ClackPrompter();
      await runInteractiveInit(prompter);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fail(`Setup failed: ${msg}`);
    }
  },
};
