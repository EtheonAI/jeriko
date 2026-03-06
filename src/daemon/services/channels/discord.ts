// Discord channel adapter — uses discord.js for gateway connection.
//
// Implements the full ChannelAdapter interface:
//   - Text: send, sendLong, sendTracked, editMessage, deleteMessage
//   - Media: sendPhoto, sendDocument, sendVideo, sendAudio, sendVoice, downloadFile
//   - UI: sendKeyboard (Action Row buttons), sendTyping
//   - Incoming: text + file attachment extraction (images, documents, videos)
//
// Package is optional — only loaded when Discord is configured.

import type {
  ChannelAdapter,
  MessageHandler,
  MessageMetadata,
  SentMessage,
  FileAttachment,
  KeyboardLayout,
} from "./index.js";
import { getLogger } from "../../../shared/logger.js";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { getDataDir } from "../../../shared/config.js";

const log = getLogger();

// Discord message limit is 2000 chars.
const MAX_MSG_LEN = 1900;

/** Directory for downloaded files. */
const FILES_DIR = "files";

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
  private discord: any;
  private handlers: MessageHandler[] = [];
  private connected = false;
  private adminIds: Set<string>;
  private guildIds: Set<string>;
  private channelIds: Set<string>;

  /** Track sent messages for editMessage — Discord needs Message objects. */
  private sentMessages = new Map<string, any>();

  constructor(private config: DiscordConfig) {
    this.adminIds = new Set(config.adminIds ?? []);
    this.guildIds = new Set(config.guildIds ?? []);
    this.channelIds = new Set(config.channelIds ?? []);
  }

  // ─── SDK loader ───────────────────────────────────────────────────

  private async ensureDiscord(): Promise<any> {
    if (this.discord) return this.discord;

    try {
      // @ts-ignore — optional dependency, installed by user
      this.discord = await import("discord.js");
    } catch {
      throw new Error(
        "Discord channel requires discord.js. Install it: bun add discord.js",
      );
    }

    return this.discord;
  }

  private async ensureClient(): Promise<any> {
    if (this.client) return this.client;

    const discord = await this.ensureDiscord();

    this.client = new discord.Client({
      intents: [
        discord.GatewayIntentBits.Guilds,
        discord.GatewayIntentBits.GuildMessages,
        discord.GatewayIntentBits.MessageContent,
        discord.GatewayIntentBits.DirectMessages,
      ],
    });

    // ── Text messages ─────────────────────────────────────────────
    this.client.on("messageCreate", (msg: any) => {
      if (msg.author.bot) return;

      const senderId = msg.author.id;

      // Admin filter
      if (this.adminIds.size > 0 && !this.adminIds.has(senderId)) return;

      // Guild filter
      if (this.guildIds.size > 0 && msg.guildId && !this.guildIds.has(msg.guildId)) return;

      // Channel filter
      if (this.channelIds.size > 0 && !this.channelIds.has(msg.channelId)) return;

      const text = msg.content;
      const attachments = this.extractAttachments(msg);

      // Skip messages with no text and no attachments
      if (!text && attachments.length === 0) return;

      const isGroup = !msg.channel.isDMBased();
      const metadata: MessageMetadata = {
        channel: "discord",
        chat_id: msg.channelId,
        is_group: isGroup,
        sender_name: msg.author.displayName ?? msg.author.username,
        message_id: msg.id,
        reply_to: msg.reference?.messageId ?? undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
      };

      const displayText = text || this.attachmentSummary(attachments);

      for (const handler of this.handlers) {
        try {
          handler(senderId, displayText, metadata);
        } catch (err) {
          log.error(`Discord message handler error: ${err}`);
        }
      }
    });

    // ── Button interactions ─────────────────────────────────────────
    this.client.on("interactionCreate", async (interaction: any) => {
      if (!interaction.isButton()) return;

      const senderId = interaction.user.id;
      if (this.adminIds.size > 0 && !this.adminIds.has(senderId)) return;

      // Acknowledge the button press
      try {
        await interaction.deferUpdate();
      } catch {
        // May already be acknowledged
      }

      const data = interaction.customId;
      const channelId = interaction.channelId;
      const isGroup = !interaction.channel?.isDMBased?.();

      const metadata: MessageMetadata = {
        channel: "discord",
        chat_id: channelId,
        is_group: isGroup ?? false,
        sender_name: interaction.user.displayName ?? interaction.user.username,
      };

      for (const handler of this.handlers) {
        try {
          handler(senderId, data, metadata);
        } catch (err) {
          log.error(`Discord button handler error: ${err}`);
        }
      }
    });

    return this.client;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────

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
    this.client = null;
    this.sentMessages.clear();
    this.connected = false;
    log.info("Discord bot disconnected");
  }

  isConnected(): boolean {
    return this.connected;
  }

  // ─── Text Messaging ───────────────────────────────────────────────

  async send(target: string, message: string): Promise<void> {
    if (!this.connected) throw new Error("Discord channel is not connected");

    const channel = await this.fetchTextChannel(target);
    await channel.send(message.slice(0, 2000));
  }

  async sendLong(target: string, message: string): Promise<void> {
    if (!this.connected) throw new Error("Discord channel is not connected");

    const channel = await this.fetchTextChannel(target);
    const chunks = splitMessage(message, MAX_MSG_LEN);
    for (const chunk of chunks) {
      await channel.send(chunk);
    }
  }

  async sendTracked(target: string, message: string): Promise<SentMessage> {
    if (!this.connected) throw new Error("Discord channel is not connected");

    const channel = await this.fetchTextChannel(target);
    const sent = await channel.send(message.slice(0, 2000));
    this.sentMessages.set(sent.id, sent);
    return { messageId: sent.id };
  }

  async editMessage(target: string, messageId: string | number, text: string): Promise<void> {
    try {
      // Try cached message object first (faster, no API call)
      const cached = this.sentMessages.get(String(messageId));
      if (cached) {
        await cached.edit(text.slice(0, 2000));
        return;
      }

      // Fall back to channel fetch + message fetch
      const channel = await this.fetchTextChannel(target);
      const msg = await channel.messages?.fetch(String(messageId));
      if (msg) {
        await msg.edit(text.slice(0, 2000));
      }
    } catch (err) {
      // Edit can fail if message too old or bot lacks permission — best effort
      log.debug(`Discord edit failed: ${err}`);
    }
  }

  async deleteMessage(target: string, messageId: string | number): Promise<void> {
    if (!this.connected) return;
    try {
      const cached = this.sentMessages.get(String(messageId));
      if (cached) {
        await cached.delete();
        this.sentMessages.delete(String(messageId));
        return;
      }

      const channel = await this.fetchTextChannel(target);
      const msg = await channel.messages?.fetch(String(messageId));
      if (msg) await msg.delete();
    } catch {
      // Best effort — may fail if message too old or insufficient permissions
    }
  }

  // ─── Media Sending ────────────────────────────────────────────────

  async sendPhoto(target: string, photo: string, caption?: string): Promise<void> {
    if (!this.connected) throw new Error("Discord channel is not connected");

    const discord = await this.ensureDiscord();
    const channel = await this.fetchTextChannel(target);

    // Discord accepts URLs directly as embeds, or files via AttachmentBuilder
    if (photo.startsWith("http://") || photo.startsWith("https://")) {
      await channel.send({
        content: caption ?? undefined,
        embeds: [{ image: { url: photo } }],
      });
    } else {
      await channel.send({
        content: caption ?? undefined,
        files: [new discord.AttachmentBuilder(photo)],
      });
    }
  }

  async sendDocument(target: string, path: string, caption?: string): Promise<void> {
    if (!this.connected) throw new Error("Discord channel is not connected");

    const discord = await this.ensureDiscord();
    const channel = await this.fetchTextChannel(target);
    await channel.send({
      content: caption ?? undefined,
      files: [new discord.AttachmentBuilder(path)],
    });
  }

  async sendVideo(target: string, path: string, caption?: string): Promise<void> {
    if (!this.connected) throw new Error("Discord channel is not connected");

    const discord = await this.ensureDiscord();
    const channel = await this.fetchTextChannel(target);
    await channel.send({
      content: caption ?? undefined,
      files: [new discord.AttachmentBuilder(path)],
    });
  }

  async sendAudio(target: string, path: string, caption?: string): Promise<void> {
    if (!this.connected) throw new Error("Discord channel is not connected");

    const discord = await this.ensureDiscord();
    const channel = await this.fetchTextChannel(target);
    await channel.send({
      content: caption ?? undefined,
      files: [new discord.AttachmentBuilder(path)],
    });
  }

  async sendVoice(target: string, path: string, caption?: string): Promise<void> {
    // Discord doesn't have a native voice message type — send as audio file
    await this.sendAudio(target, path, caption);
  }

  // ─── File Download ────────────────────────────────────────────────

  async downloadFile(fileId: string, filename?: string): Promise<string> {
    // In Discord, fileId is the attachment URL (stored in FileAttachment.fileId)
    const resp = await fetch(fileId);
    if (!resp.ok) throw new Error(`File download failed: HTTP ${resp.status}`);

    const ext = filename?.split(".").pop() ?? fileId.split(".").pop()?.split("?")[0] ?? "bin";
    const name = filename ?? `discord-${Date.now()}.${ext}`;
    const dir = join(getDataDir(), FILES_DIR);
    mkdirSync(dir, { recursive: true });
    const localPath = join(dir, name);
    await Bun.write(localPath, resp);
    return localPath;
  }

  // ─── Typing Indicator ─────────────────────────────────────────────

  async sendTyping(target: string): Promise<void> {
    if (!this.connected) return;
    try {
      const channel = await this.fetchTextChannel(target);
      await channel.sendTyping();
    } catch {
      // Best effort
    }
  }

  // ─── Keyboard (Discord Action Row Buttons) ────────────────────────

  async sendKeyboard(target: string, text: string, keyboard: KeyboardLayout): Promise<void> {
    if (!this.connected) throw new Error("Discord channel is not connected");

    const discord = await this.ensureDiscord();
    const channel = await this.fetchTextChannel(target);

    // Discord supports up to 5 action rows, each with up to 5 buttons
    const rows: any[] = [];
    for (const row of keyboard) {
      if (rows.length >= 5) break; // Discord max 5 rows

      const actionRow = new discord.ActionRowBuilder();
      const buttons: any[] = [];

      for (const button of row) {
        if (buttons.length >= 5) break; // Discord max 5 buttons per row

        const btn = new discord.ButtonBuilder()
          .setLabel(button.label.slice(0, 80)); // Discord label max 80 chars

        if (button.url) {
          btn.setStyle(discord.ButtonStyle.Link);
          btn.setURL(button.url);
        } else if (button.data) {
          btn.setStyle(discord.ButtonStyle.Primary);
          // customId max 100 chars
          btn.setCustomId(button.data.slice(0, 100));
        }

        buttons.push(btn);
      }

      if (buttons.length > 0) {
        actionRow.addComponents(...buttons);
        rows.push(actionRow);
      }
    }

    await channel.send({
      content: text.slice(0, 2000),
      components: rows,
    });
  }

  // ─── Message Handler ──────────────────────────────────────────────

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  // ─── Internals ────────────────────────────────────────────────────

  /** Fetch a text channel by ID, throw if not sendable. */
  private async fetchTextChannel(target: string): Promise<any> {
    const channel = await this.client.channels.fetch(target);
    if (!channel || !channel.isTextBased() || !("send" in channel)) {
      throw new Error(`Discord channel ${target} is not a text channel`);
    }
    return channel;
  }

  /** Extract file attachments from a Discord message. */
  private extractAttachments(msg: any): FileAttachment[] {
    if (!msg.attachments || msg.attachments.size === 0) return [];

    const attachments: FileAttachment[] = [];

    for (const [, attachment] of msg.attachments) {
      const contentType = attachment.contentType ?? "";
      const url = attachment.url;

      let type: FileAttachment["type"] = "document";
      if (contentType.startsWith("image/")) type = "photo";
      else if (contentType.startsWith("video/")) type = "video";
      else if (contentType.startsWith("audio/")) type = "audio";

      attachments.push({
        type,
        fileId: url, // Use URL as fileId — downloadFile fetches from URL
        filename: attachment.name ?? undefined,
        mimeType: contentType || undefined,
      });
    }

    return attachments;
  }

  /** Generate a summary string for attachments without text. */
  private attachmentSummary(attachments: FileAttachment[]): string {
    return attachments
      .map((a) => {
        if (a.type === "photo") return "[image]";
        if (a.type === "document") return `[file: ${a.filename ?? "file"}]`;
        if (a.type === "video") return "[video]";
        if (a.type === "audio") return "[audio]";
        return `[${a.type}]`;
      })
      .join(" ");
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** Split a long message at newline boundaries, respecting the max length. */
function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    let splitIdx = remaining.lastIndexOf("\n", maxLen);
    if (splitIdx <= 0) {
      splitIdx = remaining.lastIndexOf(" ", maxLen);
    }
    if (splitIdx <= 0) {
      splitIdx = maxLen;
    }

    chunks.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx).replace(/^\n/, "");
  }

  return chunks;
}
