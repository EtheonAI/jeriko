// Channel lifecycle — shared factory and config persistence for live channel management.
//
// Used by both the kernel IPC handlers (CLI) and the channel router (Telegram/WhatsApp).
// Single source of truth for channel creation, config shape, and persistence.
//
// Flow:
//   1. createChannelAdapter() — instantiate adapter from type + config
//   2. ChannelRegistry.register() + connect() — activate at runtime
//   3. persistChannelConfig() — write to ~/.config/jeriko/config.json
//   4. removeChannelConfig() — delete from config.json

import { existsSync, readFileSync } from "node:fs";
import { writeSecretFile } from "../../../shared/secret-file.js";
import { join } from "node:path";
import { getConfigDir } from "../../../shared/config.js";
import { getLogger } from "../../../shared/logger.js";
import type { ChannelAdapter, ChannelRegistry } from "./index.js";

const log = getLogger();

// ---------------------------------------------------------------------------
// Channel metadata — describes each supported channel type
// ---------------------------------------------------------------------------

export interface ChannelDef {
  /** Channel type identifier (e.g. "telegram", "whatsapp"). */
  name: string;
  /** Human-readable label. */
  label: string;
  /** Whether the channel requires a token/credentials to add. */
  requiresToken: boolean;
  /** Description of required credentials (shown when prompting user). */
  tokenHint: string;
  /** Number of tokens expected. */
  tokenCount: number;
  /** Setup instructions for manual configuration. */
  setupGuide: string[];
}

export const CHANNEL_DEFS: readonly ChannelDef[] = [
  {
    name: "telegram",
    label: "Telegram",
    requiresToken: true,
    tokenHint: "Bot token from @BotFather",
    tokenCount: 1,
    setupGuide: [
      "1. Talk to @BotFather on Telegram",
      "2. Create a bot with /newbot",
      "3. Copy the bot token",
      "4. Send: /channel add telegram <token>",
    ],
  },
  {
    name: "whatsapp",
    label: "WhatsApp",
    requiresToken: false,
    tokenHint: "",
    tokenCount: 0,
    setupGuide: [
      "1. Send: /channel add whatsapp",
      "2. Scan the QR code in the terminal",
    ],
  },
] as const;

/** Look up a channel definition by name. */
export function getChannelDef(name: string): ChannelDef | undefined {
  return CHANNEL_DEFS.find((d) => d.name === name);
}

// ---------------------------------------------------------------------------
// Adapter factory — creates channel adapters from type + config
// ---------------------------------------------------------------------------

/** Options for channel creation — additional callbacks beyond raw config. */
export interface CreateChannelOptions {
  /** Called when a QR code is available (WhatsApp auth). May be async. */
  onQR?: (qr: string) => void | Promise<void>;
}

/**
 * Create a channel adapter for the given type and config.
 * Does NOT register or connect — caller does that.
 *
 * @param name   Channel type (telegram, whatsapp)
 * @param config Channel-specific configuration
 * @param opts   Optional lifecycle callbacks (e.g. onQR for WhatsApp)
 * @throws If the channel type is unknown or credentials are missing
 */
export async function createChannelAdapter(
  name: string,
  config?: Record<string, unknown>,
  opts?: CreateChannelOptions,
): Promise<ChannelAdapter> {
  switch (name) {
    case "telegram": {
      const token = config?.token as string;
      if (!token) throw new Error("Telegram requires a bot token");
      const { TelegramChannel } = await import("./telegram.js");
      return new TelegramChannel({
        token,
        adminIds: (config?.adminIds as string[]) ?? [],
      });
    }
    case "whatsapp": {
      const { WhatsAppChannel } = await import("./whatsapp.js");
      return new WhatsAppChannel({
        ...(config as Record<string, unknown> | undefined),
        onQR: opts?.onQR,
      });
    }
    default:
      throw new Error(`Unknown channel type: ${name}. Available: ${CHANNEL_DEFS.map((d) => d.name).join(", ")}`);
  }
}

// ---------------------------------------------------------------------------
// Full add/remove — factory + registry + config persistence
// ---------------------------------------------------------------------------

/**
 * Add a channel: create adapter, register, connect, persist to config.
 * Used by both kernel IPC (CLI) and channel router (Telegram commands).
 *
 * @param registry  Channel registry to register and connect through
 * @param name      Channel type (telegram, whatsapp)
 * @param config    Channel-specific configuration (tokens, etc.)
 * @param opts      Optional lifecycle callbacks (e.g. onQR for WhatsApp)
 * @returns The channel status after connection
 */
export async function addChannel(
  registry: ChannelRegistry,
  name: string,
  config?: Record<string, unknown>,
  opts?: CreateChannelOptions,
): Promise<{ name: string; status: string }> {
  if (registry.get(name)) {
    throw new Error(`Channel "${name}" is already registered`);
  }

  const adapter = await createChannelAdapter(name, config, opts);
  registry.register(adapter);

  try {
    await registry.connect(name);
  } catch (err) {
    // Rollback registration so the channel isn't stuck in limbo.
    // Without this, a failed connect (e.g. QR timeout) leaves the channel
    // registered but broken, blocking subsequent add attempts.
    await registry.unregister(name);
    throw err;
  }

  persistChannelConfig(name, config ?? { enabled: true });

  const channelStatus = registry.statusOf(name);
  return { name, status: channelStatus?.status ?? "connected" };
}

/**
 * Remove a channel: disconnect, unregister, remove from config.
 * Used by both kernel IPC (CLI) and channel router (Telegram commands).
 */
export async function removeChannel(
  registry: ChannelRegistry,
  name: string,
): Promise<{ name: string; status: string }> {
  const adapter = registry.get(name);
  if (!adapter) {
    throw new Error(`Channel "${name}" is not registered`);
  }

  await registry.unregister(name);
  removeChannelConfig(name);

  return { name, status: "removed" };
}

// ---------------------------------------------------------------------------
// QR code rendering — used to send WhatsApp QR codes over any channel
// ---------------------------------------------------------------------------

/**
 * Render a QR data string as Unicode text suitable for sending in chat.
 * Uses qrcode-terminal (Baileys peer dep) for small-mode Unicode rendering.
 *
 * @returns A monospaced Unicode QR code string, or null if rendering fails.
 */
export async function renderQRText(data: string): Promise<string | null> {
  try {
    const mod = await import("qrcode-terminal");
    // CJS module — generate lives on .default when loaded via ESM import()
    const qrt = mod.default ?? mod;
    return new Promise<string | null>((resolve) => {
      qrt.generate(data, { small: true }, (text: string) => {
        resolve(text || null);
      });
    });
  } catch {
    return null;
  }
}

/**
 * Render QR code as a PNG image buffer.
 * Used by channels that render proportional fonts (Telegram, etc.) where
 * Unicode block-art QR codes are unreadable.
 */
export async function renderQRImage(data: string): Promise<Buffer | null> {
  try {
    const QRCode = await import("qrcode");
    const qr = QRCode.default ?? QRCode;
    return await qr.toBuffer(data, { type: "png", width: 512, margin: 2 });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Config persistence
// ---------------------------------------------------------------------------

function getConfigPath(): string {
  return join(getConfigDir(), "config.json");
}

function readConfig(): Record<string, unknown> {
  const configPath = getConfigPath();
  if (existsSync(configPath)) {
    return JSON.parse(readFileSync(configPath, "utf-8"));
  }
  return {};
}

function writeConfig(config: Record<string, unknown>): void {
  // Channel config can hold bot tokens and webhook secrets — owner-only perms.
  writeSecretFile(getConfigPath(), JSON.stringify(config, null, 2) + "\n");
}

/** Persist a channel's config entry to config.json. */
function persistChannelConfig(name: string, config: Record<string, unknown>): void {
  try {
    const fileConfig = readConfig();
    const channelsObj = (fileConfig.channels as Record<string, unknown>) ?? {};
    channelsObj[name] = config;
    fileConfig.channels = channelsObj;
    writeConfig(fileConfig);
    log.info(`Channel config persisted: ${name}`);
  } catch (err) {
    log.warn(`Failed to persist channel config for ${name}: ${err}`);
  }
}

/** Remove a channel's config entry from config.json. */
function removeChannelConfig(name: string): void {
  try {
    const fileConfig = readConfig();
    const channelsObj = (fileConfig.channels as Record<string, unknown>) ?? {};
    delete channelsObj[name];
    fileConfig.channels = channelsObj;
    writeConfig(fileConfig);
    log.info(`Channel config removed: ${name}`);
  } catch (err) {
    log.warn(`Failed to remove channel config for ${name}: ${err}`);
  }
}
