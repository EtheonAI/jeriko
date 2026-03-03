// Channel registry — manages messaging channel adapters (Telegram, WhatsApp, etc.)

import { Bus } from "../../../shared/bus.js";
import { getLogger } from "../../../shared/logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SentMessage {
  messageId: string | number;
}

// ---------------------------------------------------------------------------
// Inline keyboard — platform-agnostic button layout
// ---------------------------------------------------------------------------

export interface InlineButton {
  /** Button text shown to the user. */
  label: string;
  /** Callback data sent when pressed — typically a slash command (e.g. "/connect github"). */
  data?: string;
  /** URL opened in browser when pressed. Use for external links (Stripe, OAuth, etc.). */
  url?: string;
}

/** Rows of inline buttons. Each inner array is one row. */
export type KeyboardLayout = InlineButton[][];

export interface FileAttachment {
  type: "photo" | "document" | "voice" | "video" | "audio" | "animation" | "sticker";
  fileId: string;
  filename?: string;
  mimeType?: string;
  caption?: string;
  duration?: number;
}

export interface MessageMetadata {
  channel: string;
  chat_id: string;
  is_group: boolean;
  sender_name?: string;
  reply_to?: string;
  /** Original message ID — used by /auth to delete messages containing secrets. */
  message_id?: string | number;
  attachments?: FileAttachment[];
}

export type MessageHandler = (
  from: string,
  message: string,
  metadata: MessageMetadata,
) => void;

export interface ChannelAdapter {
  readonly name: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  /** Send a text message. May truncate at platform limits. */
  send(target: string, message: string): Promise<void>;
  /** Send a long text message, auto-split across multiple messages if needed. */
  sendLong?(target: string, message: string): Promise<void>;
  /** Send a photo by file path or URL. */
  sendPhoto?(target: string, photo: string, caption?: string): Promise<void>;
  /** Send a document/file by path. */
  sendDocument?(target: string, path: string, caption?: string): Promise<void>;
  /** Send a video by file path. */
  sendVideo?(target: string, path: string, caption?: string): Promise<void>;
  /** Send an audio file by path. */
  sendAudio?(target: string, path: string, caption?: string): Promise<void>;
  /** Send a voice message by file path. */
  sendVoice?(target: string, path: string, caption?: string): Promise<void>;
  /** Send a "typing" indicator. */
  sendTyping?(target: string): Promise<void>;

  /** Send a message and return its ID for later editing. */
  sendTracked?(target: string, message: string): Promise<SentMessage>;
  /** Edit a previously sent message. */
  editMessage?(target: string, messageId: string | number, text: string): Promise<void>;
  /** Download a file by its platform-specific ID, return local path. */
  downloadFile?(fileId: string, filename?: string): Promise<string>;
  /** Delete a message by ID. Used to remove messages containing API keys. */
  deleteMessage?(target: string, messageId: string | number): Promise<void>;
  /** Send a message with inline keyboard buttons. Falls back to plain text. */
  sendKeyboard?(target: string, text: string, keyboard: KeyboardLayout): Promise<void>;

  onMessage(handler: MessageHandler): void;
}

export type ChannelConnectionStatus = "connected" | "disconnected" | "failed";

export interface ChannelStatus {
  name: string;
  status: ChannelConnectionStatus;
  error?: string;
  connected_at?: string;
}

// ---------------------------------------------------------------------------
// Bus events
// ---------------------------------------------------------------------------

export interface ChannelEvents extends Record<string, unknown> {
  "channel:status": ChannelStatus;
  "channel:message": { from: string; message: string; metadata: MessageMetadata };
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const log = getLogger();

export class ChannelRegistry {
  private adapters = new Map<string, ChannelAdapter>();
  private statuses = new Map<string, ChannelStatus>();
  private connectedTimes = new Map<string, string>();
  readonly bus = new Bus<ChannelEvents>();

  register(adapter: ChannelAdapter): void {
    if (this.adapters.has(adapter.name)) {
      throw new Error(`Channel "${adapter.name}" is already registered`);
    }

    this.adapters.set(adapter.name, adapter);
    this.statuses.set(adapter.name, {
      name: adapter.name,
      status: "disconnected",
    });

    adapter.onMessage((from, message, metadata) => {
      this.bus.emit("channel:message", { from, message, metadata });
    });

    log.debug(`Channel registered: ${adapter.name}`);
  }

  async unregister(name: string): Promise<void> {
    const adapter = this.adapters.get(name);
    if (!adapter) return;

    if (adapter.isConnected()) {
      await this.disconnect(name);
    }
    this.adapters.delete(name);
    this.statuses.delete(name);
    this.connectedTimes.delete(name);
  }

  get(name: string): ChannelAdapter | undefined {
    return this.adapters.get(name);
  }

  list(): string[] {
    return [...this.adapters.keys()];
  }

  async connect(name: string): Promise<void> {
    const adapter = this.adapters.get(name);
    if (!adapter) {
      throw new Error(`Channel "${name}" is not registered`);
    }

    if (adapter.isConnected()) {
      log.debug(`Channel "${name}" is already connected`);
      return;
    }

    try {
      await adapter.connect();
      const now = new Date().toISOString();
      this.connectedTimes.set(name, now);
      const status: ChannelStatus = {
        name,
        status: "connected",
        connected_at: now,
      };
      this.statuses.set(name, status);
      this.bus.emit("channel:status", status);
      log.info(`Channel connected: ${name}`);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const status: ChannelStatus = { name, status: "failed", error };
      this.statuses.set(name, status);
      this.bus.emit("channel:status", status);
      log.error(`Channel "${name}" failed to connect: ${error}`);
      throw err;
    }
  }

  async disconnect(name: string): Promise<void> {
    const adapter = this.adapters.get(name);
    if (!adapter) {
      throw new Error(`Channel "${name}" is not registered`);
    }

    if (!adapter.isConnected()) {
      log.debug(`Channel "${name}" is already disconnected`);
      return;
    }

    try {
      await adapter.disconnect();
    } catch (err) {
      log.warn(`Error disconnecting channel "${name}": ${err}`);
    }

    this.connectedTimes.delete(name);
    const status: ChannelStatus = { name, status: "disconnected" };
    this.statuses.set(name, status);
    this.bus.emit("channel:status", status);
    log.info(`Channel disconnected: ${name}`);
  }

  async connectAll(): Promise<void> {
    const results = await Promise.allSettled(
      this.list().map((name) => this.connect(name)),
    );
    for (const result of results) {
      if (result.status === "rejected") {
        log.error(`Channel connect error: ${result.reason}`);
      }
    }
  }

  async disconnectAll(): Promise<void> {
    const results = await Promise.allSettled(
      this.list().map((name) => this.disconnect(name)),
    );
    for (const result of results) {
      if (result.status === "rejected") {
        log.error(`Channel disconnect error: ${result.reason}`);
      }
    }
  }

  status(): ChannelStatus[] {
    return [...this.statuses.values()];
  }

  statusOf(name: string): ChannelStatus | undefined {
    return this.statuses.get(name);
  }

  /** Send text, auto-splitting long messages if the adapter supports it. */
  async send(channelName: string, target: string, message: string): Promise<void> {
    const adapter = this.getConnectedAdapter(channelName);
    if (adapter.sendLong) {
      await adapter.sendLong(target, message);
    } else {
      await adapter.send(target, message.slice(0, 4000));
    }
  }

  async sendPhoto(channelName: string, target: string, photo: string, caption?: string): Promise<void> {
    const adapter = this.getConnectedAdapter(channelName);
    if (adapter.sendPhoto) {
      await adapter.sendPhoto(target, photo, caption);
    } else {
      // Fallback: send as text
      await adapter.send(target, caption ? `${caption}\n${photo}` : photo);
    }
  }

  async sendDocument(channelName: string, target: string, path: string, caption?: string): Promise<void> {
    const adapter = this.getConnectedAdapter(channelName);
    if (adapter.sendDocument) {
      await adapter.sendDocument(target, path, caption);
    } else {
      await adapter.send(target, caption ? `${caption}\n${path}` : `File: ${path}`);
    }
  }

  async sendVideo(channelName: string, target: string, path: string, caption?: string): Promise<void> {
    const adapter = this.getConnectedAdapter(channelName);
    if (adapter.sendVideo) {
      await adapter.sendVideo(target, path, caption);
    } else if (adapter.sendDocument) {
      // Fallback: send video as document
      await adapter.sendDocument(target, path, caption);
    } else {
      await adapter.send(target, caption ? `${caption}\n${path}` : `Video: ${path}`);
    }
  }

  async sendAudio(channelName: string, target: string, path: string, caption?: string): Promise<void> {
    const adapter = this.getConnectedAdapter(channelName);
    if (adapter.sendAudio) {
      await adapter.sendAudio(target, path, caption);
    } else if (adapter.sendDocument) {
      await adapter.sendDocument(target, path, caption);
    } else {
      await adapter.send(target, caption ? `${caption}\n${path}` : `Audio: ${path}`);
    }
  }

  async sendVoice(channelName: string, target: string, path: string, caption?: string): Promise<void> {
    const adapter = this.getConnectedAdapter(channelName);
    if (adapter.sendVoice) {
      await adapter.sendVoice(target, path, caption);
    } else if (adapter.sendDocument) {
      await adapter.sendDocument(target, path, caption);
    } else {
      await adapter.send(target, caption ? `${caption}\n${path}` : `Voice: ${path}`);
    }
  }

  async sendTracked(channelName: string, target: string, text: string): Promise<SentMessage | null> {
    const adapter = this.getConnectedAdapter(channelName);
    if (adapter.sendTracked) {
      return adapter.sendTracked(target, text);
    }
    // Fallback: send normally, no tracking
    await adapter.send(target, text.slice(0, 4000));
    return null;
  }

  async editMessage(channelName: string, target: string, messageId: string | number, text: string): Promise<void> {
    const adapter = this.getConnectedAdapter(channelName);
    if (adapter.editMessage) {
      await adapter.editMessage(target, messageId, text);
    }
  }

  async downloadFile(channelName: string, fileId: string, filename?: string): Promise<string> {
    const adapter = this.getConnectedAdapter(channelName);
    if (adapter.downloadFile) {
      return adapter.downloadFile(fileId, filename);
    }
    throw new Error(`Channel "${channelName}" does not support file downloads`);
  }

  async deleteMessage(channelName: string, target: string, messageId: string | number): Promise<void> {
    const adapter = this.adapters.get(channelName);
    if (adapter?.deleteMessage) {
      await adapter.deleteMessage(target, messageId);
    }
  }

  async sendTyping(channelName: string, target: string): Promise<void> {
    const adapter = this.adapters.get(channelName);
    if (adapter?.sendTyping) {
      await adapter.sendTyping(target);
    }
  }

  async sendKeyboard(channelName: string, target: string, text: string, keyboard: KeyboardLayout): Promise<void> {
    const adapter = this.getConnectedAdapter(channelName);
    if (adapter.sendKeyboard) {
      await adapter.sendKeyboard(target, text, keyboard);
    } else {
      // Fallback: plain text with command hints
      await this.send(channelName, target, text);
    }
  }

  private getConnectedAdapter(channelName: string): ChannelAdapter {
    const adapter = this.adapters.get(channelName);
    if (!adapter) throw new Error(`Channel "${channelName}" is not registered`);
    if (!adapter.isConnected()) throw new Error(`Channel "${channelName}" is not connected`);
    return adapter;
  }
}
