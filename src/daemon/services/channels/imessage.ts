// iMessage channel adapter — uses BlueBubbles REST API.
//
// BlueBubbles runs on a Mac and exposes a REST API for iMessage.
// This adapter communicates via HTTP (send) and receives via webhooks (receive).
//
// Implements the full ChannelAdapter interface:
//   - Text: send, sendLong, sendTracked, editMessage, deleteMessage
//   - Media: sendPhoto, sendDocument, sendVideo, sendAudio, sendVoice, downloadFile
//   - UI: sendKeyboard (formatted text fallback), sendTyping (Private API)
//   - Incoming: webhooks registered with BlueBubbles server
//
// Requirements:
//   - BlueBubbles Server running on a Mac with iMessage configured
//   - Server URL + password (configured in BlueBubbles GUI)
//   - For typing indicators: Private API helper installed

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

// iMessage has no hard text limit but we split at 4000 for readability.
const MAX_MSG_LEN = 4000;

const FILES_DIR = "files";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface IMessageConfig {
  /** BlueBubbles server URL (e.g. "http://192.168.1.50:1234"). */
  serverUrl: string;
  /** BlueBubbles server password. */
  password: string;
  /** Phone numbers or emails allowed to interact. Empty = allow all. */
  allowedAddresses?: string[];
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class IMessageChannel implements ChannelAdapter {
  readonly name = "imessage" as const;

  private handlers: MessageHandler[] = [];
  private connected = false;
  private serverUrl: string;
  private password: string;
  private allowedAddresses: Set<string>;

  /** Registered webhook ID for cleanup on disconnect. */
  private webhookId: number | null = null;

  /** Polling interval for new messages (fallback when webhooks unavailable). */
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastPollTimestamp: number = 0;

  constructor(private config: IMessageConfig) {
    this.serverUrl = config.serverUrl.replace(/\/+$/, "");
    this.password = config.password;
    this.allowedAddresses = new Set(config.allowedAddresses ?? []);
  }

  // ── Lifecycle ───────────────────────────────────────────────────────

  async connect(): Promise<void> {
    if (this.connected) return;

    // Verify server is reachable
    const ping = await this.api("GET", "/api/v1/ping");
    if (ping.status !== 200) {
      throw new Error(`BlueBubbles server not reachable at ${this.serverUrl}`);
    }
    log.info(`BlueBubbles server connected: ${this.serverUrl}`);

    // Start polling for new messages.
    // BlueBubbles webhooks require a publicly-reachable URL, which isn't
    // always available. Polling every 2s is reliable and low-overhead.
    this.lastPollTimestamp = Date.now();
    this.pollTimer = setInterval(() => this.pollMessages(), 2000);

    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    // Clean up webhook if we registered one
    if (this.webhookId !== null) {
      try {
        await this.api("DELETE", `/api/v1/webhook/${this.webhookId}`);
      } catch {
        // Best effort
      }
      this.webhookId = null;
    }

    this.connected = false;
    log.info("iMessage channel disconnected");
  }

  isConnected(): boolean {
    return this.connected;
  }

  // ── Text Messaging ──────────────────────────────────────────────────

  async send(target: string, message: string): Promise<void> {
    this.requireConnected();
    await this.api("POST", "/api/v1/message/text", {
      chatGuid: this.toChatGuid(target),
      message,
      method: "apple-script",
    });
  }

  async sendLong(target: string, message: string): Promise<void> {
    this.requireConnected();
    const chunks = splitMessage(message, MAX_MSG_LEN);
    for (const chunk of chunks) {
      await this.send(target, chunk);
    }
  }

  async sendTracked(target: string, message: string): Promise<SentMessage> {
    this.requireConnected();
    const tempGuid = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const resp = await this.api("POST", "/api/v1/message/text", {
      chatGuid: this.toChatGuid(target),
      message,
      tempGuid,
      method: "apple-script",
    });
    // BlueBubbles returns the message object with a GUID
    const guid = resp.data?.guid ?? tempGuid;
    return { messageId: guid };
  }

  async editMessage(target: string, messageId: string | number, text: string): Promise<void> {
    try {
      await this.api("POST", `/api/v1/message/${messageId}/edit`, {
        editedMessage: text,
        backwardsCompatibilityMessage: text,
        partIndex: 0,
      });
    } catch {
      // Edit requires Private API — fall back to new message
      log.debug("iMessage edit failed (needs Private API), sending new message");
      await this.send(target, text);
    }
  }

  async deleteMessage(target: string, messageId: string | number): Promise<void> {
    try {
      await this.api("POST", `/api/v1/message/${messageId}/unsend`, {
        partIndex: 0,
      });
    } catch {
      // Unsend requires Private API and macOS 13+ — best effort
    }
  }

  // ── Media Sending ───────────────────────────────────────────────────

  async sendPhoto(target: string, photo: string, caption?: string): Promise<void> {
    await this.sendAttachment(target, photo, caption);
  }

  async sendDocument(target: string, path: string, caption?: string): Promise<void> {
    await this.sendAttachment(target, path, caption);
  }

  async sendVideo(target: string, path: string, caption?: string): Promise<void> {
    await this.sendAttachment(target, path, caption);
  }

  async sendAudio(target: string, path: string, caption?: string): Promise<void> {
    await this.sendAttachment(target, path, caption);
  }

  async sendVoice(target: string, path: string, _caption?: string): Promise<void> {
    await this.sendAttachment(target, path, undefined, true);
  }

  private async sendAttachment(
    target: string,
    filePath: string,
    caption?: string,
    isAudioMessage = false,
  ): Promise<void> {
    this.requireConnected();
    const chatGuid = this.toChatGuid(target);

    // Send caption as separate text if provided
    if (caption) {
      await this.send(target, caption);
    }

    // Upload via multipart form
    const file = Bun.file(filePath);
    const filename = filePath.split("/").pop() ?? "file";
    const formData = new FormData();
    formData.append("attachment", file, filename);
    formData.append("chatGuid", chatGuid);
    formData.append("name", filename);
    if (isAudioMessage) {
      formData.append("isAudioMessage", "true");
    }

    const url = `${this.serverUrl}/api/v1/message/attachment?password=${encodeURIComponent(this.password)}`;
    const resp = await fetch(url, { method: "POST", body: formData });
    if (!resp.ok) {
      throw new Error(`iMessage attachment send failed: HTTP ${resp.status}`);
    }
  }

  // ── File Download ───────────────────────────────────────────────────

  async downloadFile(fileId: string, filename?: string): Promise<string> {
    this.requireConnected();
    const url = `${this.serverUrl}/api/v1/attachment/${encodeURIComponent(fileId)}/download?password=${encodeURIComponent(this.password)}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`iMessage attachment download failed: HTTP ${resp.status}`);
    }

    const dir = join(getDataDir(), FILES_DIR);
    mkdirSync(dir, { recursive: true });

    const ext = filename?.split(".").pop() ?? "bin";
    const safeName = filename ?? `imsg-${Date.now()}.${ext}`;
    const localPath = join(dir, safeName);
    await Bun.write(localPath, resp);
    return localPath;
  }

  // ── Typing Indicator ────────────────────────────────────────────────

  async sendTyping(target: string): Promise<void> {
    try {
      const chatGuid = this.toChatGuid(target);
      await this.api("POST", `/api/v1/chat/${encodeURIComponent(chatGuid)}/typing`);
    } catch {
      // Typing requires Private API — best effort
    }
  }

  // ── Keyboard (text fallback) ────────────────────────────────────────

  async sendKeyboard(target: string, text: string, keyboard: KeyboardLayout): Promise<void> {
    const lines: string[] = [text, ""];
    let idx = 1;
    for (const row of keyboard) {
      for (const button of row) {
        if (button.url) {
          lines.push(`${idx}. ${button.label}: ${button.url}`);
        } else if (button.data) {
          lines.push(`${idx}. ${button.label} → ${button.data}`);
        }
        idx++;
      }
    }
    await this.sendLong(target, lines.join("\n"));
  }

  // ── Handler Registration ────────────────────────────────────────────

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  // ── Webhook Ingress (called by daemon HTTP route) ───────────────────

  /**
   * Process an incoming BlueBubbles webhook event.
   * Called by the daemon's HTTP server when it receives a POST from BlueBubbles.
   */
  handleWebhookEvent(event: { type: string; data: Record<string, unknown> }): void {
    if (event.type !== "new-message") return;

    const data = event.data;
    if (!data) return;

    // Skip outgoing messages (fromMe)
    if (data.isFromMe) return;

    const chatGuid = (data as any).chats?.[0]?.guid ?? "";
    const senderHandle = (data as any).handle?.address ?? "";
    const text = (data as any).text ?? "";
    const subject = (data as any).subject ?? "";
    const displayText = text || subject;

    if (!chatGuid || !displayText) return;

    // Address filter
    const senderAddr = normalizeAddress(senderHandle);
    if (this.allowedAddresses.size > 0 && !this.allowedAddresses.has(senderAddr)) {
      log.debug(`iMessage: ignoring message from ${senderAddr}`);
      return;
    }

    const isGroup = chatGuid.includes(";+;");
    const senderName = (data as any).handle?.displayName ?? senderHandle;

    // Extract attachments
    const attachments = this.extractAttachments(data);

    const metadata: MessageMetadata = {
      channel: "imessage",
      chat_id: chatGuid,
      is_group: isGroup,
      sender_name: senderName,
      message_id: (data as any).guid ?? undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
    };

    for (const handler of this.handlers) {
      try {
        handler(senderAddr, displayText, metadata);
      } catch (err) {
        log.error(`iMessage handler error: ${err}`);
      }
    }
  }

  // ── Polling (fallback when no webhook) ──────────────────────────────

  private async pollMessages(): Promise<void> {
    try {
      const after = this.lastPollTimestamp;
      const resp = await this.api("POST", "/api/v1/message/query", {
        limit: 20,
        sort: "DESC",
        after,
        with: ["chat", "handle", "attachment"],
      });

      if (!resp.data || !Array.isArray(resp.data)) return;

      // Process newest-first, then update timestamp
      const messages = (resp.data as any[]).reverse();
      for (const msg of messages) {
        this.handleWebhookEvent({ type: "new-message", data: msg });
      }

      if (messages.length > 0) {
        const newest = messages[messages.length - 1];
        const ts = newest.dateCreated ?? newest.dateDelivered ?? Date.now();
        this.lastPollTimestamp = ts;
      }
    } catch (err) {
      log.debug(`iMessage poll error: ${err}`);
    }
  }

  // ── Internals ───────────────────────────────────────────────────────

  private requireConnected(): void {
    if (!this.connected) throw new Error("iMessage channel is not connected");
  }

  /**
   * Convert a target (phone number, email, or chat GUID) to BlueBubbles chat GUID.
   * DM: "iMessage;-;+15551234567" or "iMessage;-;email@example.com"
   * Group: Already a GUID like "iMessage;+;chat123456"
   */
  private toChatGuid(target: string): string {
    if (target.includes(";")) return target;
    if (target.includes("@")) return `iMessage;-;${target}`;
    // Phone number — ensure + prefix
    const phone = target.startsWith("+") ? target : `+${target}`;
    return `iMessage;-;${phone}`;
  }

  private extractAttachments(data: Record<string, unknown>): FileAttachment[] {
    const rawAttachments = (data as any).attachments;
    if (!Array.isArray(rawAttachments)) return [];

    return rawAttachments.map((att: any) => {
      const mime = att.mimeType ?? "";
      let type: FileAttachment["type"] = "document";
      if (mime.startsWith("image/")) type = "photo";
      else if (mime.startsWith("video/")) type = "video";
      else if (mime.startsWith("audio/")) type = att.isAudioMessage ? "voice" : "audio";

      return {
        type,
        fileId: att.guid ?? "",
        filename: att.transferName ?? undefined,
        mimeType: mime || undefined,
      };
    });
  }

  /** Make a JSON API call to BlueBubbles server. */
  private async api(method: string, path: string, body?: unknown): Promise<any> {
    const sep = path.includes("?") ? "&" : "?";
    const url = `${this.serverUrl}${path}${sep}password=${encodeURIComponent(this.password)}`;

    const opts: RequestInit = { method };
    if (body !== undefined) {
      opts.headers = { "Content-Type": "application/json" };
      opts.body = JSON.stringify(body);
    }

    const resp = await fetch(url, opts);
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`BlueBubbles API error: ${method} ${path} → ${resp.status} ${text}`);
    }
    return resp.json();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    if (splitIdx <= 0) splitIdx = remaining.lastIndexOf(" ", maxLen);
    if (splitIdx <= 0) splitIdx = maxLen;

    chunks.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx).replace(/^\n/, "");
  }

  return chunks;
}

/** Normalize an iMessage address — strip whitespace, lowercase emails. */
function normalizeAddress(addr: string): string {
  const trimmed = addr.trim();
  if (trimmed.includes("@")) return trimmed.toLowerCase();
  return trimmed.replace(/[^+\d]/g, "");
}
