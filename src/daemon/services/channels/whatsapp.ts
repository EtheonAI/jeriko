// WhatsApp channel adapter — uses @whiskeysockets/baileys for multi-device.
//
// Implements the full ChannelAdapter interface:
//   - Text: send, sendLong, sendTracked, editMessage, deleteMessage
//   - Media: sendPhoto, sendDocument, sendVideo, sendAudio, sendVoice, downloadFile
//   - UI: sendKeyboard (formatted text with command hints), sendTyping
//   - Incoming: text + file attachment extraction (photos, documents, video, audio, voice)

import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
  type WASocket,
  type WAMessage,
  type ConnectionState,
  type WAMessageKey,
  type proto,
} from "@whiskeysockets/baileys";
import { join } from "node:path";
import { mkdirSync, readFileSync } from "node:fs";
import { getDataDir } from "../../../shared/config.js";
import { getLogger } from "../../../shared/logger.js";
import type {
  ChannelAdapter,
  MessageHandler,
  MessageMetadata,
  SentMessage,
  KeyboardLayout,
  FileAttachment,
} from "./index.js";

const log = getLogger();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** WhatsApp text message limit (~65KB, but we use a conservative split point). */
const MAX_MSG_LEN = 4000;

/** Directory for downloaded files. */
const FILES_DIR = "files";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface WhatsAppConfig {
  /** Directory to store multi-device auth state. Default: <dataDir>/whatsapp-auth */
  authDir?: string;
  /** Phone numbers allowed to interact. Empty = allow all. */
  allowedNumbers?: string[];
  /** Callback invoked when QR code is available for scanning. May be async. */
  onQR?: (qr: string) => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class WhatsAppChannel implements ChannelAdapter {
  readonly name = "whatsapp" as const;

  private socket: WASocket | null = null;
  private handlers: MessageHandler[] = [];
  private connected = false;
  private authDir: string;
  private allowedNumbers: Set<string>;
  private onQR: ((qr: string) => void | Promise<void>) | undefined;

  /** Tracks last incoming message per JID for downloadFile context. */
  private lastMessageByJid = new Map<string, WAMessage>();

  constructor(private config: WhatsAppConfig = {}) {
    this.authDir = config.authDir ?? join(getDataDir(), "whatsapp-auth");
    this.allowedNumbers = new Set(config.allowedNumbers ?? []);
    this.onQR = config.onQR;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────

  async connect(): Promise<void> {
    if (this.connected) return;

    // Baileys' standard pattern: on every "close" event, destroy the old
    // socket and create a fresh one. The new socket continues the handshake
    // (emitting QR, waiting for scan, etc.). All sockets share the same
    // auth state and creds listener, and feed into a single connectionReady
    // promise so the caller blocks until fully connected or timed out.
    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);

    // 120s gives the user time to open WhatsApp → Linked Devices → Scan.
    // Timer resets on each new QR code (Baileys rotates QR every ~20s).
    const CONNECT_TIMEOUT_MS = 120_000;

    const connectionReady = new Promise<void>((resolve, reject) => {
      let timer = setTimeout(() => {
        reject(new Error("WhatsApp connection timed out — scan the QR code to authenticate"));
      }, CONNECT_TIMEOUT_MS);
      let settled = false;

      const createSocket = () => {
        this.socket = makeWASocket({
          auth: state,
          printQRInTerminal: !this.onQR,
        });

        this.socket.ev.on("creds.update", saveCreds);
        this.socket.ev.on("messages.upsert", (m) => this.handleIncoming(m.messages));

        this.socket.ev.on("connection.update", (update: Partial<ConnectionState>) => {
          const { connection, lastDisconnect, qr } = update;

          if (qr) {
            // Reset timeout on each new QR — user is still trying to scan
            clearTimeout(timer);
            timer = setTimeout(() => {
              if (!settled) { settled = true; reject(new Error("WhatsApp connection timed out — scan the QR code to authenticate")); }
            }, CONNECT_TIMEOUT_MS);
            if (this.onQR) {
              Promise.resolve(this.onQR(qr)).catch((err) => {
                log.warn(`WhatsApp onQR callback error: ${err}`);
              });
            }
          }

          if (connection === "open") {
            log.info("WhatsApp connected");
            this.connected = true;
            clearTimeout(timer);
            if (!settled) { settled = true; resolve(); }
          }

          if (connection === "close") {
            const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
            const isLogout = statusCode === DisconnectReason.loggedOut;
            this.connected = false;

            if (isLogout) {
              log.info("WhatsApp logged out");
              clearTimeout(timer);
              if (!settled) { settled = true; reject(new Error("WhatsApp logged out — re-scan QR code to authenticate")); }
            } else if (settled) {
              // Post-connect disconnect — background reconnect
              log.warn("WhatsApp connection closed, reconnecting in 3s...");
              setTimeout(() => createSocket(), 3_000);
            } else {
              // Pre-connect close — Baileys normal handshake cycle.
              // Recreate socket immediately to continue the handshake.
              log.debug("WhatsApp socket recycled during handshake, recreating...");
              setTimeout(() => createSocket(), 500);
            }
          }
        });
      };

      createSocket();
    });

    await connectionReady;
  }

  async disconnect(): Promise<void> {
    if (!this.connected || !this.socket) return;
    this.socket.end(undefined);
    this.socket = null;
    this.connected = false;
    log.info("WhatsApp disconnected");
  }

  isConnected(): boolean {
    return this.connected;
  }

  // ─── Text Messaging ─────────────────────────────────────────────

  async send(target: string, message: string): Promise<void> {
    const jid = this.toJid(target);
    await this.requireSocket().sendMessage(jid, { text: message });
  }

  async sendLong(target: string, message: string): Promise<void> {
    const jid = this.toJid(target);
    const sock = this.requireSocket();
    const chunks = splitMessage(message, MAX_MSG_LEN);
    for (const chunk of chunks) {
      await sock.sendMessage(jid, { text: chunk });
    }
  }

  async sendTracked(target: string, message: string): Promise<SentMessage> {
    const jid = this.toJid(target);
    const sent = await this.requireSocket().sendMessage(jid, { text: message });
    return { messageId: sent!.key.id! };
  }

  async editMessage(target: string, messageId: string | number, text: string): Promise<void> {
    const jid = this.toJid(target);
    const key: WAMessageKey = { remoteJid: jid, id: String(messageId), fromMe: true };
    try {
      await this.requireSocket().sendMessage(jid, { edit: key, text });
    } catch (err) {
      // Edit may fail on older WhatsApp versions — fall back to new message
      log.debug(`WhatsApp edit failed, sending new message: ${err}`);
      await this.send(target, text);
    }
  }

  async deleteMessage(target: string, messageId: string | number): Promise<void> {
    const jid = this.toJid(target);
    const key: WAMessageKey = { remoteJid: jid, id: String(messageId), fromMe: true };
    try {
      await this.requireSocket().sendMessage(jid, { delete: key });
    } catch {
      // Best effort — may fail if message too old or insufficient permissions
    }
  }

  // ─── Media Sending ──────────────────────────────────────────────

  async sendPhoto(target: string, photo: string, caption?: string): Promise<void> {
    const jid = this.toJid(target);
    const image = readMediaSource(photo);
    await this.requireSocket().sendMessage(jid, {
      image,
      caption: caption ?? undefined,
    });
  }

  async sendDocument(target: string, path: string, caption?: string): Promise<void> {
    const jid = this.toJid(target);
    await this.requireSocket().sendMessage(jid, {
      document: readFileSync(path),
      mimetype: guessMime(path),
      fileName: basename(path),
      caption: caption ?? undefined,
    });
  }

  async sendVideo(target: string, path: string, caption?: string): Promise<void> {
    const jid = this.toJid(target);
    await this.requireSocket().sendMessage(jid, {
      video: readFileSync(path),
      caption: caption ?? undefined,
    });
  }

  async sendAudio(target: string, path: string, caption?: string): Promise<void> {
    const jid = this.toJid(target);
    await this.requireSocket().sendMessage(jid, {
      audio: readFileSync(path),
      mimetype: "audio/mpeg",
    });
    // WhatsApp audio doesn't support captions — send as follow-up if provided
    if (caption) await this.send(target, caption);
  }

  async sendVoice(target: string, path: string, caption?: string): Promise<void> {
    const jid = this.toJid(target);
    await this.requireSocket().sendMessage(jid, {
      audio: readFileSync(path),
      mimetype: "audio/ogg; codecs=opus",
      ptt: true,
    });
    if (caption) await this.send(target, caption);
  }

  // ─── File Download ──────────────────────────────────────────────

  async downloadFile(fileId: string, filename?: string): Promise<string> {
    // In WhatsApp, fileId is the JID of the chat that sent the media.
    // We stored the last incoming message with media per JID.
    const msg = this.lastMessageByJid.get(fileId);
    if (!msg) {
      throw new Error(`No downloadable media found for: ${fileId}`);
    }

    const buffer = await downloadMediaMessage(msg, "buffer", {});
    const ext = filename?.split(".").pop() ?? detectMediaExtension(msg) ?? "bin";
    const dir = join(getDataDir(), FILES_DIR);
    mkdirSync(dir, { recursive: true });

    const safeName = filename ?? `wa-${Date.now()}.${ext}`;
    const localPath = join(dir, safeName);
    await Bun.write(localPath, buffer);
    return localPath;
  }

  // ─── Typing Indicator ──────────────────────────────────────────

  async sendTyping(target: string): Promise<void> {
    const jid = this.toJid(target);
    try {
      await this.requireSocket().sendPresenceUpdate("composing", jid);
    } catch {
      // Best effort
    }
  }

  // ─── Keyboard (formatted text fallback) ─────────────────────────

  async sendKeyboard(target: string, text: string, keyboard: KeyboardLayout): Promise<void> {
    // WhatsApp doesn't have native inline keyboards like Telegram.
    // Format as a clean text list with numbered commands so users can tap/type them.
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

  // ─── Message Handler ────────────────────────────────────────────

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  // ─── Internals ──────────────────────────────────────────────────

  /** Get socket or throw if not connected. */
  private requireSocket(): WASocket {
    if (!this.socket || !this.connected) {
      throw new Error("WhatsApp channel is not connected");
    }
    return this.socket;
  }

  /** Normalize target to WhatsApp JID. */
  private toJid(target: string): string {
    return target.includes("@") ? target : `${target}@s.whatsapp.net`;
  }

  /** Process incoming messages — extract text, attachments, dispatch to handlers. */
  private handleIncoming(messages: WAMessage[]): void {
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      const jid = msg.key.remoteJid ?? "";
      const senderId = msg.key.participant ?? jid;
      const senderNumber = senderId.replace(/@.*$/, "");

      // Number filter
      if (this.allowedNumbers.size > 0 && !this.allowedNumbers.has(senderNumber)) {
        log.debug(`WhatsApp: ignoring message from ${senderNumber}`);
        continue;
      }

      const text = this.extractText(msg);
      const attachments = this.extractAttachments(msg);

      // Store message for later downloadFile calls
      if (attachments.length > 0) {
        this.lastMessageByJid.set(jid, msg);
      }

      // Skip messages with no text and no attachments
      if (!text && attachments.length === 0) continue;

      const isGroup = jid.endsWith("@g.us");
      const metadata: MessageMetadata = {
        channel: "whatsapp",
        chat_id: jid,
        is_group: isGroup,
        sender_name: msg.pushName ?? senderNumber,
        reply_to: msg.message?.extendedTextMessage?.contextInfo?.stanzaId ?? undefined,
        message_id: msg.key.id ?? undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
      };

      const displayText = text ?? this.attachmentSummary(attachments);

      for (const handler of this.handlers) {
        try {
          handler(senderNumber, displayText, metadata);
        } catch (err) {
          log.error(`WhatsApp message handler error: ${err}`);
        }
      }
    }
  }

  /** Extract text content from a WhatsApp message. */
  private extractText(msg: WAMessage): string | null {
    const m = msg.message;
    if (!m) return null;
    return (
      m.conversation ??
      m.extendedTextMessage?.text ??
      m.imageMessage?.caption ??
      m.videoMessage?.caption ??
      m.documentMessage?.caption ??
      null
    );
  }

  /** Extract file attachments from a WhatsApp message. */
  private extractAttachments(msg: WAMessage): FileAttachment[] {
    const m = msg.message;
    if (!m) return [];

    const attachments: FileAttachment[] = [];
    const jid = msg.key.remoteJid ?? "";

    if (m.imageMessage) {
      attachments.push({
        type: "photo",
        fileId: jid,
        caption: m.imageMessage.caption ?? undefined,
        mimeType: m.imageMessage.mimetype ?? undefined,
      });
    }

    if (m.documentMessage) {
      attachments.push({
        type: "document",
        fileId: jid,
        filename: m.documentMessage.fileName ?? undefined,
        mimeType: m.documentMessage.mimetype ?? undefined,
        caption: m.documentMessage.caption ?? undefined,
      });
    }

    if (m.videoMessage) {
      attachments.push({
        type: "video",
        fileId: jid,
        caption: m.videoMessage.caption ?? undefined,
        mimeType: m.videoMessage.mimetype ?? undefined,
        duration: m.videoMessage.seconds ?? undefined,
      });
    }

    if (m.audioMessage) {
      const isVoice = m.audioMessage.ptt === true;
      attachments.push({
        type: isVoice ? "voice" : "audio",
        fileId: jid,
        mimeType: m.audioMessage.mimetype ?? undefined,
        duration: m.audioMessage.seconds ?? undefined,
      });
    }

    if (m.stickerMessage) {
      attachments.push({
        type: "sticker",
        fileId: jid,
        mimeType: m.stickerMessage.mimetype ?? "image/webp",
      });
    }

    return attachments;
  }

  /** Generate a summary string for attachments without text. */
  private attachmentSummary(attachments: FileAttachment[]): string {
    return attachments
      .map((a) => {
        if (a.type === "photo") return "[photo]";
        if (a.type === "document") return `[document: ${a.filename ?? "file"}]`;
        if (a.type === "video") return "[video]";
        if (a.type === "voice") return "[voice message]";
        if (a.type === "audio") return `[audio${a.filename ? `: ${a.filename}` : ""}]`;
        if (a.type === "sticker") return "[sticker]";
        return `[${a.type}]`;
      })
      .join(" ");
  }
}

// ---------------------------------------------------------------------------
// Utilities (module-level, pure functions)
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

    // Find the last newline within the limit
    let splitIdx = remaining.lastIndexOf("\n", maxLen);
    if (splitIdx <= 0) {
      // No newline found — split at a space
      splitIdx = remaining.lastIndexOf(" ", maxLen);
    }
    if (splitIdx <= 0) {
      // No space either — hard split
      splitIdx = maxLen;
    }

    chunks.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx).replace(/^\n/, "");
  }

  return chunks;
}

/** Read a media source — file path returns Buffer, URL returns the URL string. */
function readMediaSource(pathOrUrl: string): Buffer | { url: string } {
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    return { url: pathOrUrl };
  }
  return readFileSync(pathOrUrl);
}

/** Detect media extension from a WhatsApp message. */
function detectMediaExtension(msg: WAMessage): string | null {
  const m = msg.message;
  if (!m) return null;
  if (m.imageMessage) return "jpg";
  if (m.videoMessage) return "mp4";
  if (m.audioMessage) return m.audioMessage.ptt ? "ogg" : "mp3";
  if (m.documentMessage) {
    const name = m.documentMessage.fileName;
    if (name) return name.split(".").pop() ?? "bin";
    return "bin";
  }
  if (m.stickerMessage) return "webp";
  return null;
}

/** Extract basename from a file path. */
function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

/** Guess MIME type from file extension. */
function guessMime(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  const mimes: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    csv: "text/csv",
    txt: "text/plain",
    json: "application/json",
    zip: "application/zip",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    mp4: "video/mp4",
    mp3: "audio/mpeg",
    ogg: "audio/ogg",
    wav: "audio/wav",
  };
  return mimes[ext ?? ""] ?? "application/octet-stream";
}
