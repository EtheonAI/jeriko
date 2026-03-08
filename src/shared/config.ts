// Layer 0 — Config loader. No internal imports beyond types.

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// ---------------------------------------------------------------------------
// Config interfaces
// ---------------------------------------------------------------------------

export interface AgentConfig {
  /** Default model to use: "claude", "gpt4", "local" */
  model: string;
  /** Max tokens per response */
  maxTokens: number;
  /** Temperature (0-1) */
  temperature: number;
  /** Enable extended thinking for Claude */
  extendedThinking: boolean;
}

export interface ChannelsConfig {
  telegram: { token: string; adminIds: string[] };
  whatsapp: { enabled: boolean };
}

export interface ConnectorsConfig {
  stripe:  { webhookSecret: string };
  paypal:  { webhookId: string };
  github:  { webhookSecret: string };
  twilio:  { accountSid: string; authToken: string };
}

export interface SecurityConfig {
  /** Allowed filesystem paths (glob patterns) */
  allowedPaths: string[];
  /** Blocked shell command regexes */
  blockedCommands: string[];
  /** Env var names whose values must be redacted in logs */
  sensitiveKeys: string[];
}

export interface StorageConfig {
  /** Path to SQLite database (default: dataDir/jeriko.db) */
  dbPath: string;
  /** Path to memory JSONL log */
  memoryPath: string;
}

export interface LoggingConfig {
  /** Minimum log level */
  level: "debug" | "info" | "warn" | "error";
  /** Max log file size in bytes before rotation */
  maxFileSize: number;
  /** Number of rotated files to keep */
  maxFiles: number;
}

/**
 * Configuration for a custom LLM provider (OpenRouter, DeepInfra, Together, Groq, etc.).
 *
 * Each entry creates an OpenAI-compatible driver at boot, registered under `id`.
 * API keys support environment variable references: "{env:MY_API_KEY}".
 */
export interface ProviderConfig {
  /** Driver registry name — used as the backend identifier (e.g. "openrouter"). */
  id: string;
  /** Human-readable display name (e.g. "OpenRouter"). */
  name: string;
  /** API base URL (e.g. "https://openrouter.ai/api/v1"). */
  baseUrl: string;
  /** API key — literal string or "{env:VAR_NAME}" for env var reference. */
  apiKey: string;
  /** Protocol type (default: "openai-compatible"). */
  type?: "openai-compatible" | "anthropic";
  /** Extra HTTP headers sent with every request. */
  headers?: Record<string, string>;
  /** Alias → real model ID mapping (e.g. { "deepseek": "deepseek/deepseek-chat-v3" }). */
  models?: Record<string, string>;
  /** Default model for this provider (used when no model specified after colon). */
  defaultModel?: string;
}

/** Speech-to-text configuration for voice message transcription. */
export interface STTConfig {
  /** Provider: "openai" (Whisper API), "local" (whisper.cpp), "disabled". */
  provider: "openai" | "local" | "disabled";
  /** Language hint for transcription (ISO 639-1, e.g. "en"). Auto-detect if omitted. */
  language?: string;
  /** Path to whisper.cpp model file (for provider: "local"). */
  modelPath?: string;
}

/** Text-to-speech configuration for voice responses in channels. */
export interface TTSConfig {
  /** Provider: "openai" (tts-1), "native" (macOS say), "disabled". */
  provider: "openai" | "native" | "disabled";
  /** Voice name. OpenAI: "alloy"|"echo"|"fable"|"onyx"|"nova"|"shimmer". */
  voice?: string;
  /** OpenAI model: "tts-1" (fast) or "tts-1-hd" (quality). Default: "tts-1". */
  model?: string;
  /** Max text length to convert (chars). Default: 4096. */
  maxLength?: number;
}

/** Image generation configuration. */
export interface ImageGenConfig {
  /** Provider: "openai" (DALL-E 3), "auto" (first available). Default: "auto". */
  provider?: "openai" | "auto";
  /** Default size: "1024x1024", "1024x1792", "1792x1024". */
  defaultSize?: string;
  /** Default style: "vivid" or "natural" (DALL-E 3 only). */
  defaultStyle?: string;
}

/** Unified media configuration — STT, TTS, and image generation. */
export interface MediaConfig {
  /** Voice message transcription. Default: disabled. */
  stt?: STTConfig;
  /** Voice response synthesis. Default: disabled. */
  tts?: TTSConfig;
  /** Image generation. Default: auto-detect. */
  imageGen?: ImageGenConfig;
}

export interface BillingPlanConfig {
  /** Stripe billing secret key (separate from user's Stripe connector). */
  stripeSecretKey?: string;
  /** Stripe webhook signing secret for billing webhooks. */
  stripeWebhookSecret?: string;
  /** Stripe Price ID for the Pro plan. */
  stripePriceId?: string;
  /** Stripe Customer Portal configuration ID. */
  stripePortalConfigId?: string;
}

export interface JerikoConfig {
  agent: AgentConfig;
  channels: ChannelsConfig;
  connectors: ConnectorsConfig;
  security: SecurityConfig;
  storage: StorageConfig;
  logging: LoggingConfig;
  /** Custom LLM providers (OpenRouter, DeepInfra, Together, Groq, etc.). */
  providers?: ProviderConfig[];
  /** Media capabilities: voice transcription, TTS, image generation. */
  media?: MediaConfig;
  /** Stripe billing configuration for subscription management. */
  billing?: BillingPlanConfig;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULTS: JerikoConfig = {
  agent: {
    model: "claude",
    maxTokens: 4096,
    temperature: 0.3,
    extendedThinking: false,
  },
  channels: {
    telegram: { token: "", adminIds: [] },
    whatsapp: { enabled: false },
  },
  connectors: {
    stripe:  { webhookSecret: "" },
    paypal:  { webhookId: "" },
    github:  { webhookSecret: "" },
    twilio:  { accountSid: "", authToken: "" },
  },
  security: {
    allowedPaths: [os.homedir()],
    blockedCommands: ["rm -rf /", "mkfs", "dd if="],
    sensitiveKeys: [
      "ANTHROPIC_API_KEY",
      "OPENAI_API_KEY",
      "NODE_AUTH_SECRET",
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "PAYPAL_CLIENT_SECRET",
      "TELEGRAM_BOT_TOKEN",
      "GITHUB_TOKEN",
      "GH_TOKEN",
      "TWILIO_AUTH_TOKEN",
      "AWS_SECRET_ACCESS_KEY",
      "AWS_SESSION_TOKEN",
      "DATABASE_URL",
      "REDIS_URL",
      "GOOGLE_API_KEY",
      "WHATSAPP_TOKEN",
      "CLOUDFLARE_API_TOKEN",
      "VERCEL_TOKEN",
    ],
  },
  storage: {
    dbPath: "",
    memoryPath: "",
  },
  logging: {
    level: "info",
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5,
  },
};

// ---------------------------------------------------------------------------
// Daemon port
// ---------------------------------------------------------------------------

/**
 * Default port for the Jeriko daemon HTTP server.
 * Port 7741 chosen to avoid conflicts with common dev servers
 * (3000: React/Next/Rails, 5173: Vite, 8080: Tomcat/generic).
 * Override with JERIKO_PORT env var or --port flag.
 */
export const JERIKO_DEFAULT_PORT = 7741;

/** Resolve the daemon port: JERIKO_PORT env → default 7741. */
export function getDaemonPort(): number {
  const env = process.env.JERIKO_PORT;
  if (env) {
    const parsed = Number(env);
    if (!Number.isNaN(parsed) && parsed > 0 && parsed < 65536) return parsed;
  }
  return JERIKO_DEFAULT_PORT;
}

// ---------------------------------------------------------------------------
// User identity
// ---------------------------------------------------------------------------

/**
 * Get the stable user ID for this Jeriko installation.
 *
 * Generated at install time and persisted in ~/.config/jeriko/.env.
 * Used for relay routing (webhooks, OAuth callbacks, billing).
 *
 * Returns undefined when no user ID has been generated yet (fresh install
 * that hasn't run `jeriko install` or `jeriko init`).
 */
/** Matches hex strings (32-64 chars) or standard UUIDs. */
const USER_ID_PATTERN = /^(?:[0-9a-f]{32,64}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function getUserId(): string | undefined {
  const raw = process.env.JERIKO_USER_ID;
  if (!raw) return undefined;
  // Reject invalid formats to prevent path traversal in relay URLs
  return USER_ID_PATTERN.test(raw) ? raw : undefined;
}

// ---------------------------------------------------------------------------
// Directory helpers
// ---------------------------------------------------------------------------

/**
 * Return the user-level config directory: ~/.config/jeriko/
 * Respects XDG_CONFIG_HOME on Linux.
 */
export function getConfigDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg || path.join(os.homedir(), ".config");
  return path.join(base, "jeriko");
}

/**
 * Return the user-level data directory: ~/.local/share/jeriko/
 * Respects XDG_DATA_HOME on Linux.
 */
export function getDataDir(): string {
  const xdg = process.env.XDG_DATA_HOME;
  if (xdg) return path.join(xdg, "jeriko");
  // Co-locate with daemon operational directory (~/.jeriko/data)
  return path.join(os.homedir(), ".jeriko", "data");
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Load configuration by merging (in priority order, highest last):
 *   1. Built-in defaults
 *   2. ~/.config/jeriko/config.json      (user-level)
 *   3. ./jeriko.json                     (project-level)
 *   4. Environment variables             (JERIKO_*)
 *
 * Missing files are silently skipped — defaults always apply.
 */
export function loadConfig(): JerikoConfig {
  const config = structuredClone(DEFAULTS);

  // Fill in storage defaults that depend on dataDir
  const dataDir = getDataDir();
  if (!config.storage.dbPath) config.storage.dbPath = path.join(dataDir, "jeriko.db");
  if (!config.storage.memoryPath) config.storage.memoryPath = path.join(dataDir, "memory.jsonl");

  // 1. User-level config
  const userPath = path.join(getConfigDir(), "config.json");
  mergeFromFile(config, userPath);

  // 2. Project-level config
  const projectPath = path.resolve("jeriko.json");
  mergeFromFile(config, projectPath);

  // 3. Environment overrides
  applyEnvOverrides(config);

  return config;
}

/**
 * Read a JSON file and deep-merge it into the target config.
 * Silently returns if the file does not exist or is malformed.
 */
function mergeFromFile(target: JerikoConfig, filePath: string): void {
  if (!fs.existsSync(filePath)) return;

  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch {
    // Unreadable file (permissions, etc.) — skip silently
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      deepMerge(target as unknown as Record<string, unknown>, parsed);
    } else {
      console.warn(`Warning: ${filePath} does not contain a JSON object — using defaults`);
    }
  } catch {
    console.warn(`Warning: ${filePath} is malformed JSON — using defaults`);
  }
}

/**
 * Recursively merge `source` into `target`, overwriting leaf values.
 */
/** Keys that must never be merged — prevents prototype pollution attacks. */
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const key of Object.keys(source)) {
    if (UNSAFE_KEYS.has(key)) continue;
    const sv = source[key];
    const tv = target[key];
    if (
      sv !== null &&
      typeof sv === "object" &&
      !Array.isArray(sv) &&
      tv !== null &&
      typeof tv === "object" &&
      !Array.isArray(tv)
    ) {
      deepMerge(tv as Record<string, unknown>, sv as Record<string, unknown>);
    } else {
      target[key] = sv;
    }
  }
}

/**
 * Apply JERIKO_* environment variables as config overrides.
 *
 * Mapping (JERIKO_ prefixed vars take priority, standard names are fallbacks):
 *   JERIKO_MODEL / (none)                → agent.model
 *   JERIKO_MAX_TOKENS / (none)           → agent.maxTokens
 *   JERIKO_LOG_LEVEL / (none)            → logging.level
 *   JERIKO_TELEGRAM_TOKEN / TELEGRAM_BOT_TOKEN → channels.telegram.token
 *   JERIKO_ADMIN_IDS / ADMIN_TELEGRAM_IDS      → channels.telegram.adminIds
 *   WHATSAPP_ENABLED=true                       → channels.whatsapp.enabled
 *   JERIKO_DB_PATH / (none)              → storage.dbPath
 *
 *   Standard connector env vars (from .env):
 *   STRIPE_WEBHOOK_SECRET  → connectors.stripe.webhookSecret
 *   TWILIO_ACCOUNT_SID     → connectors.twilio.accountSid
 *   TWILIO_AUTH_TOKEN       → connectors.twilio.authToken
 */
function applyEnvOverrides(config: JerikoConfig): void {
  const env = process.env;

  // Agent
  if (env.JERIKO_MODEL)          config.agent.model = env.JERIKO_MODEL;
  if (env.JERIKO_MAX_TOKENS)     config.agent.maxTokens = parseInt(env.JERIKO_MAX_TOKENS, 10);
  if (env.JERIKO_LOG_LEVEL)      config.logging.level = env.JERIKO_LOG_LEVEL as JerikoConfig["logging"]["level"];
  if (env.JERIKO_DB_PATH)        config.storage.dbPath = env.JERIKO_DB_PATH;

  // Telegram — JERIKO_ prefix takes priority, then standard names
  const telegramToken = env.JERIKO_TELEGRAM_TOKEN || env.TELEGRAM_BOT_TOKEN;
  const adminIds = env.JERIKO_ADMIN_IDS || env.ADMIN_TELEGRAM_IDS;
  if (telegramToken) config.channels.telegram.token = telegramToken;
  if (adminIds)      config.channels.telegram.adminIds = adminIds.split(",").map(s => s.trim());

  // WhatsApp
  if (env.WHATSAPP_ENABLED === "true" || env.WHATSAPP_ENABLED === "1") {
    config.channels.whatsapp.enabled = true;
  }

  // Connectors
  if (env.STRIPE_WEBHOOK_SECRET)  config.connectors.stripe.webhookSecret = env.STRIPE_WEBHOOK_SECRET;
  if (env.TWILIO_ACCOUNT_SID)     config.connectors.twilio.accountSid = env.TWILIO_ACCOUNT_SID;
  if (env.TWILIO_AUTH_TOKEN)       config.connectors.twilio.authToken = env.TWILIO_AUTH_TOKEN;
}
