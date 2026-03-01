// Discord channel adapter — uses discord.js for gateway connection.
// Package is optional — only loaded when Discord is configured.

import type { ChannelAdapter, MessageHandler, MessageMetadata } from "./index.js";
import { getLogger } from "../../../shared/logger.js";

const log = getLogger();

export interface DiscordConfig {
  /** Discord bot token */
  token: string;
  /** Guild IDs to restrict to. Empty = all guilds. */
  guildIds?: string[];
  /** Channel IDs to restrict to. Empty = all channels. */
  channelIds?: string[];
  /** User IDs allowed to interact. Empty = allow all. */
  adminIds?: string[];
}

export class DiscordChannel implements ChannelAdapter {
  readonly name = "discord" as const;

  private client: any;
  private handlers: MessageHandler[] = [];
  private connected = false;
  private adminIds: Set<string>;
  private guildIds: Set<string>;
  private channelIds: Set<string>;

  constructor(private config: DiscordConfig) {
    this.adminIds = new Set(config.adminIds ?? []);
    this.guildIds = new Set(config.guildIds ?? []);
    this.channelIds = new Set(config.channelIds ?? []);
  }

  private async ensureClient(): Promise<any> {
    if (this.client) return this.client;

    let discord: any;
    try {
      discord = await import("discord.js");
    } catch {
      throw new Error(
        'Discord channel requires discord.js. Install it: bun add discord.js',
      );
    }

    this.client = new discord.Client({
      intents: [
        discord.GatewayIntentBits.Guilds,
        discord.GatewayIntentBits.GuildMessages,
        discord.GatewayIntentBits.MessageContent,
        discord.GatewayIntentBits.DirectMessages,
      ],
    });

    this.client.on("messageCreate", (msg: any) => {
      // Ignore bot messages
      if (msg.author.bot) return;

      const senderId = msg.author.id;

      // Admin filter
      if (this.adminIds.size > 0 && !this.adminIds.has(senderId)) return;

      // Guild filter
      if (this.guildIds.size > 0 && msg.guildId && !this.guildIds.has(msg.guildId)) return;

      // Channel filter
      if (this.channelIds.size > 0 && !this.channelIds.has(msg.channelId)) return;

      const isGroup = msg.channel.isDMBased() === false;
      const metadata: MessageMetadata = {
        channel: "discord",
        chat_id: msg.channelId,
        is_group: isGroup,
        sender_name: msg.author.displayName ?? msg.author.username,
        reply_to: msg.reference?.messageId ?? undefined,
      };

      const text = msg.content;
      if (!text) return;

      for (const handler of this.handlers) {
        try {
          handler(senderId, text, metadata);
        } catch (err) {
          log.error(`Discord message handler error: ${err}`);
        }
      }
    });

    return this.client;
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    if (!this.config.token) {
      throw new Error("Discord bot token is not configured");
    }

    const client = await this.ensureClient();
    await client.login(this.config.token);
    this.connected = true;
    log.info("Discord bot connected");
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;

    await this.client?.destroy();
    this.connected = false;
    log.info("Discord bot disconnected");
  }

  isConnected(): boolean {
    return this.connected;
  }

  async send(target: string, message: string): Promise<void> {
    if (!this.connected) {
      throw new Error("Discord channel is not connected");
    }

    const channel = await this.client.channels.fetch(target);
    if (!channel || !channel.isTextBased() || !("send" in channel)) {
      throw new Error(`Discord channel ${target} is not a text channel`);
    }

    await (channel as any).send(message);
  }

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }
}
