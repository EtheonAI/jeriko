// Slack channel adapter — uses @slack/bolt for Socket Mode.
//
// Implements the full ChannelAdapter interface:
//   - Text: send, sendLong, sendTracked, editMessage, deleteMessage
//   - Media: sendPhoto, sendDocument, sendVideo, sendAudio, sendVoice, downloadFile
//   - UI: sendKeyboard (Block Kit buttons), sendTyping
//   - Incoming: text + file attachment extraction (shared files)
//
// Package is optional — only loaded when Slack is configured.

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
import { mkdirSync, readFileSync } from "node:fs";
import { getDataDir } from "../../../shared/config.js";

const log = getLogger();

// Slack message limit is 40,000 chars but we split at a comfortable 3000.
const MAX_MSG_LEN = 3000;

/** Directory for downloaded files. */
const FILES_DIR = "files";

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

  private app: any;
  private bolt: any;
  private handlers: MessageHandler[] = [];
  private connected = false;
  private adminIds: Set<string>;
  private channelIds: Set<string>;
  private botToken: string;

  /** Cache resolved user names to avoid repeated API calls. */
  private userNameCache = new Map<string, string>();

  constructor(private config: SlackConfig) {
    this.adminIds = new Set(config.adminIds ?? []);
    this.channelIds = new Set(config.channelIds ?? []);
    this.botToken = config.botToken;
  }

  // ─── SDK loader ───────────────────────────────────────────────────

  private async ensureApp(): Promise<any> {
    if (this.app) return this.app;

    try {
      // @ts-ignore — optional dependency, installed by user
      this.bolt = await import("@slack/bolt");
    } catch {
      throw new Error(
        "Slack channel requires @slack/bolt. Install it: bun add @slack/bolt",
      );
    }

    this.app = new this.bolt.App({
      token: this.config.botToken,
      appToken: this.config.appToken,
      socketMode: true,
    });

    // ── Text messages ─────────────────────────────────────────────
    this.app.message(async ({ message }: any) => {
      const msg = message as {
        subtype?: string;
        text?: string;
        user?: string;
        channel: string;
        channel_type?: string;
        thread_ts?: string;
        files?: Array<{
          id: string;
          name?: string;
          mimetype?: string;
          url_private?: string;
          url_private_download?: string;
          filetype?: string;
          size?: number;
        }>;
      };

      // Ignore bot messages and message changes
      if (msg.subtype) return;
      if (!msg.user) return;

      const senderId = msg.user;

      // Admin filter
      if (this.adminIds.size > 0 && !this.adminIds.has(senderId)) return;

      // Channel filter
      if (this.channelIds.size > 0 && !this.channelIds.has(msg.channel)) return;

      const senderName = await this.resolveUserName(senderId);
      const isGroup = msg.channel_type === "group" || msg.channel_type === "channel";

      const attachments = this.extractAttachments(msg);

      // Skip messages with no text and no attachments
      if (!msg.text && attachments.length === 0) return;

      const metadata: MessageMetadata = {
        channel: "slack",
        chat_id: msg.channel,
        is_group: isGroup,
        sender_name: senderName,
        reply_to: msg.thread_ts,
        attachments: attachments.length > 0 ? attachments : undefined,
      };

      const displayText = msg.text ?? this.attachmentSummary(attachments);

      for (const handler of this.handlers) {
        try {
          handler(senderId, displayText, metadata);
        } catch (err) {
          log.error(`Slack message handler error: ${err}`);
        }
      }
    });

    // ── Button interactions ────────────────────────────────────────
    this.app.action(/^jeriko_action_.*$/, async ({ action, ack, body }: any) => {
      await ack();

      const senderId = body?.user?.id;
      if (!senderId) return;
      if (this.adminIds.size > 0 && !this.adminIds.has(senderId)) return;

      // Extract command from action value
      const data = action?.value;
      if (!data) return;

      const channelId = body?.channel?.id ?? body?.container?.channel_id;
      if (!channelId) return;

      const senderName = await this.resolveUserName(senderId);

      const metadata: MessageMetadata = {
        channel: "slack",
        chat_id: channelId,
        is_group: true, // Slack actions always come from channels
        sender_name: senderName,
      };

      for (const handler of this.handlers) {
        try {
          handler(senderId, data, metadata);
        } catch (err) {
          log.error(`Slack button handler error: ${err}`);
        }
      }
    });

    return this.app;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────

  async connect(): Promise<void> {
    if (this.connected) return;

    if (!this.config.botToken || !this.config.appToken) {
      throw new Error("Slack bot token and app token are required");
    }

    const app = await this.ensureApp();
    await app.start();
    this.connected = true;
    log.info("Slack bot connected (Socket Mode)");
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;

    await this.app?.stop();
    this.app = null;
    this.userNameCache.clear();
    this.connected = false;
    log.info("Slack bot disconnected");
  }

  isConnected(): boolean {
    return this.connected;
  }

  // ─── Text Messaging ───────────────────────────────────────────────

  async send(target: string, message: string): Promise<void> {
    if (!this.connected) throw new Error("Slack channel is not connected");

    await this.app.client.chat.postMessage({
      channel: target,
      text: message,
    });
  }

  async sendLong(target: string, message: string): Promise<void> {
    if (!this.connected) throw new Error("Slack channel is not connected");

    const chunks = splitMessage(message, MAX_MSG_LEN);
    for (const chunk of chunks) {
      await this.app.client.chat.postMessage({
        channel: target,
        text: chunk,
      });
    }
  }

  async sendTracked(target: string, message: string): Promise<SentMessage> {
    if (!this.connected) throw new Error("Slack channel is not connected");

    const result = await this.app.client.chat.postMessage({
      channel: target,
      text: message,
    });

    // Slack uses `ts` (timestamp) as message ID
    return { messageId: result.ts ?? "" };
  }

  async editMessage(target: string, messageId: string | number, text: string): Promise<void> {
    try {
      await this.app.client.chat.update({
        channel: target,
        ts: String(messageId),
        text,
      });
    } catch (err) {
      // Edit can fail if message too old or bot lacks permission — best effort
      log.debug(`Slack edit failed: ${err}`);
    }
  }

  async deleteMessage(target: string, messageId: string | number): Promise<void> {
    if (!this.connected) return;
    try {
      await this.app.client.chat.delete({
        channel: target,
        ts: String(messageId),
      });
    } catch {
      // Best effort — may fail if message too old or insufficient permissions
    }
  }

  // ─── Media Sending ────────────────────────────────────────────────

  async sendPhoto(target: string, photo: string, caption?: string): Promise<void> {
    if (!this.connected) throw new Error("Slack channel is not connected");

    if (photo.startsWith("http://") || photo.startsWith("https://")) {
      // URL — send as an image block
      await this.app.client.chat.postMessage({
        channel: target,
        text: caption ?? "",
        blocks: [
          ...(caption ? [{ type: "section", text: { type: "mrkdwn", text: caption } }] : []),
          { type: "image", image_url: photo, alt_text: caption ?? "image" },
        ],
      });
    } else {
      // Local file — upload
      await this.uploadFile(target, photo, caption);
    }
  }

  async sendDocument(target: string, path: string, caption?: string): Promise<void> {
    if (!this.connected) throw new Error("Slack channel is not connected");
    await this.uploadFile(target, path, caption);
  }

  async sendVideo(target: string, path: string, caption?: string): Promise<void> {
    if (!this.connected) throw new Error("Slack channel is not connected");
    await this.uploadFile(target, path, caption);
  }

  async sendAudio(target: string, path: string, caption?: string): Promise<void> {
    if (!this.connected) throw new Error("Slack channel is not connected");
    await this.uploadFile(target, path, caption);
  }

  async sendVoice(target: string, path: string, caption?: string): Promise<void> {
    // Slack doesn't have native voice messages — send as audio file
    await this.sendAudio(target, path, caption);
  }

  // ─── File Download ────────────────────────────────────────────────

  async downloadFile(fileId: string, filename?: string): Promise<string> {
    // In Slack, fileId is the url_private of the file
    // Need bot token for authentication
    const resp = await fetch(fileId, {
      headers: { Authorization: `Bearer ${this.botToken}` },
    });

    if (!resp.ok) throw new Error(`File download failed: HTTP ${resp.status}`);

    const ext = filename?.split(".").pop() ?? fileId.split(".").pop()?.split("?")[0] ?? "bin";
    const name = filename ?? `slack-${Date.now()}.${ext}`;
    const dir = join(getDataDir(), FILES_DIR);
    mkdirSync(dir, { recursive: true });
    const localPath = join(dir, name);
    await Bun.write(localPath, resp);
    return localPath;
  }

  // ─── Typing Indicator ─────────────────────────────────────────────

  async sendTyping(target: string): Promise<void> {
    // Slack doesn't have a direct "typing" API for bots in Socket Mode.
    // The typing indicator is only available via RTM (deprecated).
    // No-op — gracefully ignored.
  }

  // ─── Keyboard (Slack Block Kit Buttons) ───────────────────────────

  async sendKeyboard(target: string, text: string, keyboard: KeyboardLayout): Promise<void> {
    if (!this.connected) throw new Error("Slack channel is not connected");

    // Build Block Kit action blocks from keyboard layout
    const blocks: any[] = [
      { type: "section", text: { type: "mrkdwn", text } },
    ];

    // Slack supports up to 25 elements per actions block, max 50 blocks total
    let actionIdx = 0;
    for (const row of keyboard) {
      const elements: any[] = [];

      for (const button of row) {
        if (elements.length >= 25) break; // Slack max per actions block

        if (button.url) {
          elements.push({
            type: "button",
            text: { type: "plain_text", text: button.label.slice(0, 75) },
            url: button.url,
            action_id: `jeriko_action_link_${actionIdx++}`,
          });
        } else if (button.data) {
          elements.push({
            type: "button",
            text: { type: "plain_text", text: button.label.slice(0, 75) },
            value: button.data,
            action_id: `jeriko_action_${actionIdx++}`,
          });
        }
      }

      if (elements.length > 0) {
        blocks.push({ type: "actions", elements });
      }
    }

    await this.app.client.chat.postMessage({
      channel: target,
      text, // Fallback text for notifications
      blocks,
    });
  }

  // ─── Message Handler ──────────────────────────────────────────────

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  // ─── Internals ────────────────────────────────────────────────────

  /** Upload a local file to a Slack channel. */
  private async uploadFile(channel: string, filePath: string, caption?: string): Promise<void> {
    const fileName = filePath.split("/").pop() ?? "file";
    const fileContent = readFileSync(filePath);

    await this.app.client.files.uploadV2({
      channel_id: channel,
      file: fileContent,
      filename: fileName,
      initial_comment: caption ?? undefined,
    });
  }

  /** Resolve a Slack user ID to a display name, with caching. */
  private async resolveUserName(userId: string): Promise<string> {
    const cached = this.userNameCache.get(userId);
    if (cached) return cached;

    try {
      const result = await this.app.client.users.info({ user: userId });
      const name = result.user?.real_name ?? result.user?.name ?? userId;
      this.userNameCache.set(userId, name);
      return name;
    } catch {
      return userId;
    }
  }

  /** Extract file attachments from a Slack message. */
  private extractAttachments(msg: { files?: Array<{
    id: string;
    name?: string;
    mimetype?: string;
    url_private?: string;
    url_private_download?: string;
    filetype?: string;
    size?: number;
  }> }): FileAttachment[] {
    if (!msg.files || msg.files.length === 0) return [];

    return msg.files.map((file) => {
      const mimeType = file.mimetype ?? "";
      let type: FileAttachment["type"] = "document";
      if (mimeType.startsWith("image/")) type = "photo";
      else if (mimeType.startsWith("video/")) type = "video";
      else if (mimeType.startsWith("audio/")) type = "audio";

      return {
        type,
        fileId: file.url_private ?? file.url_private_download ?? file.id,
        filename: file.name ?? undefined,
        mimeType: mimeType || undefined,
      };
    });
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
