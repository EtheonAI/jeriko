// Plugin SDK types — interfaces that plugin authors implement.

import type { ToolDefinition } from "@jeriko/protocol";

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

/** Logger provided to plugins by the host. Plugins must not write to stdout. */
export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

// ---------------------------------------------------------------------------
// Plugin context
// ---------------------------------------------------------------------------

/** Runtime context injected into the plugin during init(). */
export interface PluginContext {
  /** Plugin-specific configuration from the user's jeriko.json. */
  config: Record<string, unknown>;
  /** Persistent data directory for this plugin (~/.jeriko/plugins/<name>/data/). */
  dataDir: string;
  /** Scoped logger — messages are prefixed with the plugin name. */
  logger: Logger;
}

// ---------------------------------------------------------------------------
// Channel adapter
// ---------------------------------------------------------------------------

/** Metadata attached to incoming messages. */
export interface MessageMetadata {
  /** Channel name (e.g. "telegram", "discord"). */
  channel: string;
  /** Chat/conversation identifier. */
  chat_id: string;
  /** Whether the message came from a group chat. */
  is_group: boolean;
  /** Display name of the sender, if available. */
  sender_name?: string;
  /** ID of the message being replied to, if any. */
  reply_to?: string;
}

/** Handler function invoked when a message arrives on a channel. */
export type MessageHandler = (
  from: string,
  message: string,
  metadata: MessageMetadata,
) => void;

/** A messaging channel adapter provided by a plugin. */
export interface ChannelAdapter {
  /** Machine-readable channel name (e.g. "discord", "slack"). */
  readonly name: string;
  /** Open the connection to the messaging platform. */
  connect(): Promise<void>;
  /** Close the connection gracefully. */
  disconnect(): Promise<void>;
  /** Whether the channel is currently connected. */
  isConnected(): boolean;
  /** Send a message to a target (chat ID, user ID, etc). */
  send(target: string, message: string): Promise<void>;
  /** Register a handler for incoming messages. */
  onMessage(handler: MessageHandler): void;
}

// ---------------------------------------------------------------------------
// Webhook handler
// ---------------------------------------------------------------------------

/** Parsed HTTP request passed to webhook handlers. */
export interface WebhookRequest {
  /** HTTP method (GET, POST, etc). */
  method: string;
  /** Request path relative to the webhook mount point. */
  path: string;
  /** Lowercased HTTP headers. */
  headers: Record<string, string>;
  /** Raw request body as a string. */
  body: string;
  /** Parsed query parameters. */
  query: Record<string, string>;
}

/** Response returned by a webhook handler. */
export interface WebhookResponse {
  /** HTTP status code (default: 200). */
  status?: number;
  /** Response headers. */
  headers?: Record<string, string>;
  /** Response body (string or JSON-serializable object). */
  body?: string | Record<string, unknown>;
}

/** A webhook endpoint provided by a plugin. */
export interface WebhookHandler {
  /** URL path suffix for this webhook (mounted at /webhooks/<plugin>/<path>). */
  path: string;
  /** HTTP methods this webhook accepts (default: ["POST"]). */
  methods?: string[];
  /** Human-readable description. */
  description?: string;
  /** Handle an incoming webhook request. */
  handle(req: WebhookRequest): Promise<WebhookResponse>;
}

// ---------------------------------------------------------------------------
// Command handler
// ---------------------------------------------------------------------------

/** A CLI command provided by a plugin. */
export interface CommandHandler {
  /** Command name (registered as `jeriko <name>`). */
  name: string;
  /** Short description shown in help text. */
  description: string;
  /** Detailed usage string (e.g. "jeriko my-cmd [--flag] <arg>"). */
  usage?: string;
  /** Execute the command with parsed arguments. */
  run(args: string[], flags: Record<string, string | boolean>): Promise<number>;
}

// ---------------------------------------------------------------------------
// Plugin manifest
// ---------------------------------------------------------------------------

/** Declarative plugin manifest (jeriko-plugin.json). */
export interface PluginManifest {
  /** Machine-readable plugin name. */
  name: string;
  /** SemVer version string. */
  version: string;
  /** Human-readable description. */
  description: string;
  /** Plugin author name or email. */
  author?: string;
  /** Plugin homepage or repository URL. */
  homepage?: string;
  /** Whether this plugin has been explicitly trusted by the user. */
  trusted: boolean;
  /** Capabilities this plugin requires (e.g. "network", "filesystem", "exec"). */
  capabilities: string[];
  /** Environment variables the plugin needs access to. */
  env_vars?: string[];
}

// ---------------------------------------------------------------------------
// Plugin interface
// ---------------------------------------------------------------------------

/**
 * The main interface that plugin authors implement.
 *
 * A plugin is a module that default-exports an object satisfying this interface.
 *
 * @example
 * ```ts
 * import type { JerikoPlugin, PluginContext } from "@jeriko/plugin";
 *
 * const plugin: JerikoPlugin = {
 *   name: "my-plugin",
 *   version: "1.0.0",
 *   description: "Does cool things",
 *
 *   async init(ctx) {
 *     ctx.logger.info("Plugin loaded");
 *   },
 *
 *   tools: [
 *     {
 *       name: "my_tool",
 *       description: "A custom tool",
 *       input_schema: {
 *         type: "object",
 *         properties: {
 *           query: { type: "string", description: "Search query" },
 *         },
 *         required: ["query"],
 *       },
 *     },
 *   ],
 * };
 *
 * export default plugin;
 * ```
 */
export interface JerikoPlugin {
  /** Machine-readable plugin name. Must be unique across all installed plugins. */
  readonly name: string;
  /** SemVer version string. */
  readonly version: string;
  /** Human-readable description. */
  readonly description: string;

  /**
   * Called once when the plugin is loaded.
   * Use this to validate configuration, open connections, etc.
   */
  init?(context: PluginContext): Promise<void>;

  /**
   * Called when the daemon starts (after init).
   * Use this to start background tasks, polling loops, etc.
   */
  onStart?(): Promise<void>;

  /**
   * Called when the daemon is shutting down.
   * Use this to flush buffers, close connections, etc.
   */
  onStop?(): Promise<void>;

  /** Tool definitions provided by this plugin. */
  tools?: ToolDefinition[];

  /** Channel adapters provided by this plugin. */
  channels?: ChannelAdapter[];

  /** Webhook handlers provided by this plugin. */
  webhooks?: WebhookHandler[];

  /** CLI commands added by this plugin. */
  commands?: CommandHandler[];
}
