/**
 * Onboarding — First-run wizard using WizardPrompter interface.
 *
 * Flow (channels first, then AI provider):
 *   1. Intro — "Welcome to Jeriko"
 *   2. Channel select — Telegram, WhatsApp, or skip
 *   3. Channel token input (Telegram only — WhatsApp uses QR pairing at runtime)
 *   4. Provider select — Claude (recommended), GPT, Local/Ollama
 *   5. API key input — masked, validated
 *   6. API key verification — spinner testing the key works
 *   7. Outro — "You're all set!"
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { validateApiKey, getProviderOptions } from "../lib/setup.js";
import { CHANNEL_OPTIONS, type ChannelChoice } from "../lib/setup.js";
import { getConfigDir } from "../../shared/config.js";
import { verifyApiKey } from "./verify.js";
import type { WizardPrompter } from "./prompter.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OnboardingResult {
  provider: string;
  model: string;
  apiKey: string;
  envKey: string;
  channel?: ChannelChoice;
  telegramToken?: string;
  whatsappEnabled?: boolean;
}

// ---------------------------------------------------------------------------
// Main wizard
// ---------------------------------------------------------------------------

/**
 * Run the first-launch onboarding wizard.
 * Returns null if the user cancels.
 */
export async function runOnboarding(
  prompter: WizardPrompter,
  version: string,
): Promise<OnboardingResult | null> {
  prompter.intro(`jeriko v${version}`);

  // ── Step 1: Channel setup ──────────────────────────────────────
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
    return null;
  }

  let telegramToken: string | undefined;
  let whatsappEnabled = false;

  if (channelId === "telegram") {
    const token = await prompter.text({
      message: "Telegram bot token (from @BotFather)",
      placeholder: "123456:ABC-DEF...",
      validate: (value) => {
        if (value.trim().length < 10) return "Token too short";
      },
    });

    if (isCancel(token)) {
      prompter.outro("Setup cancelled.");
      return null;
    }
    telegramToken = (token as string).trim();
  } else if (channelId === "whatsapp") {
    whatsappEnabled = true;
    prompter.note(
      "WhatsApp will pair via QR code when the daemon starts.\nRun: jeriko server start",
      "WhatsApp",
    );
  }

  // ── Step 2: Provider selection ─────────────────────────────────
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
    return null;
  }

  const provider = providerOptions.find((p) => p.id === providerId)!;

  // ── Step 3: API key input (if needed) ──────────────────────────
  let apiKey = "";
  if (provider.needsApiKey) {
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
      return null;
    }

    apiKey = (key as string).trim();

    // Step 3b: Verify the key
    const s = prompter.spinner();
    s.start("Verifying API key...");

    const valid = await verifyApiKey(provider.id, apiKey);
    if (valid) {
      s.stop("API key verified");
    } else {
      s.stop("API key could not be verified (will try anyway)");
    }
  }

  prompter.outro("You're all set! Type /help for commands.");

  return {
    provider: provider.id,
    model: provider.model,
    apiKey,
    envKey: provider.envKey,
    channel: channelId as ChannelChoice,
    telegramToken,
    whatsappEnabled,
  };
}

// ---------------------------------------------------------------------------
// Persist setup result
// ---------------------------------------------------------------------------

/**
 * Write onboarding results to config + env files.
 */
export async function persistSetup(result: OnboardingResult): Promise<void> {
  const jerikoDir = join(homedir(), ".jeriko");
  const configDir = getConfigDir();

  if (!existsSync(jerikoDir)) mkdirSync(jerikoDir, { recursive: true });
  if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });

  // Write config.json
  const config: Record<string, unknown> = {
    agent: { model: result.model },
    channels: {
      telegram: {
        token: result.telegramToken ?? "",
        adminIds: [],
      },
      whatsapp: { enabled: result.whatsappEnabled ?? false },
    },
    connectors: {},
    logging: { level: "info" },
  };

  writeFileSync(
    join(configDir, "config.json"),
    JSON.stringify(config, null, 2) + "\n",
  );

  // Write API key to .env (append, don't overwrite)
  if (result.apiKey && result.envKey) {
    const envPath = join(configDir, ".env");
    const envLine = `${result.envKey}=${result.apiKey}\n`;
    const existing = existsSync(envPath)
      ? await Bun.file(envPath).text()
      : "";

    // Don't duplicate if already present
    if (!existing.includes(`${result.envKey}=`)) {
      writeFileSync(envPath, existing + envLine);
    }

    // Also set in current process so backend picks it up
    process.env[result.envKey] = result.apiKey;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isCancel(value: unknown): value is symbol {
  return typeof value === "symbol";
}
