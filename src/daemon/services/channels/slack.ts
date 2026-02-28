// Slack channel adapter — uses @slack/bolt for Socket Mode.

import { App, type MessageEvent } from "@slack/bolt";
import type { ChannelAdapter, MessageHandler, MessageMetadata } from "./index.js";
import { getLogger } from "../../../shared/logger.js";

const log = getLogger();

export interface SlackConfig {
  /** Slack bot token (xoxb-...) */
  botToken: string;
  /** Slack app-level token for Socket Mode (xapp-...) */
  appToken: string;
  /** Channel IDs to listen on. Empty = all channels the bot is in. */
  channelIds?: string[];
  /** User IDs allowed to interact. Empty = allow all. */
  adminIds?: string[];
}

export class SlackChannel implements ChannelAdapter {
  readonly name = "slack" as const;

  private app: App;
  private handlers: MessageHandler[] = [];
  private connected = false;
  private adminIds: Set<string>;
  private channelIds: Set<string>;

  constructor(private config: SlackConfig) {
    this.adminIds = new Set(config.adminIds ?? []);
    this.channelIds = new Set(config.channelIds ?? []);

    this.app = new App({
      token: config.botToken,
      appToken: config.appToken,
      socketMode: true,
    });

    // Listen for all message events
    this.app.message(async ({ message }) => {
      const msg = message as MessageEvent & { text?: string; user?: string; thread_ts?: string };

      // Ignore bot messages and message changes
      if (msg.subtype) return;
      if (!msg.text || !msg.user) return;

      const senderId = msg.user;

      // Admin filter
      if (this.adminIds.size > 0 && !this.adminIds.has(senderId)) return;

      // Channel filter
      if (this.channelIds.size > 0 && !this.channelIds.has(msg.channel)) return;

      const isGroup = msg.channel_type === "group" || msg.channel_type === "channel";
      const metadata: MessageMetadata = {
        channel: "slack",
        chat_id: msg.channel,
        is_group: isGroup,
        sender_name: senderId, // Slack user ID; resolve display name via API if needed
        reply_to: msg.thread_ts,
      };

      for (const handler of this.handlers) {
        try {
          handler(senderId, msg.text, metadata);
        } catch (err) {
          log.error(`Slack message handler error: ${err}`);
        }
      }
    });
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    if (!this.config.botToken || !this.config.appToken) {
      throw new Error("Slack bot token and app token are required");
    }

    await this.app.start();
    this.connected = true;
    log.info("Slack bot connected (Socket Mode)");
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;

    await this.app.stop();
    this.connected = false;
    log.info("Slack bot disconnected");
  }

  isConnected(): boolean {
    return this.connected;
  }

  async send(target: string, message: string): Promise<void> {
    if (!this.connected) {
      throw new Error("Slack channel is not connected");
    }

    await this.app.client.chat.postMessage({
      channel: target,
      text: message,
    });
  }

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }
}
