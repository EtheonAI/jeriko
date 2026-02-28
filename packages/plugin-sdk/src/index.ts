// @jeriko/plugin — Plugin SDK for building Jeriko plugins.

export type {
  // Core plugin interface
  JerikoPlugin,
  PluginContext,
  PluginManifest,

  // Logger
  Logger,

  // Channel adapter
  ChannelAdapter,
  MessageHandler,
  MessageMetadata,

  // Webhook handler
  WebhookHandler,
  WebhookRequest,
  WebhookResponse,

  // Command handler
  CommandHandler,
} from "./types.js";

// Re-export ToolDefinition so plugin authors don't need a separate import
export type { ToolDefinition, JsonSchemaProperty } from "@jeriko/protocol";
