// WhatsApp channel adapter — uses @whiskeysockets/baileys for multi-device.

import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  type WASocket,
  type WAMessage,
  type ConnectionState,
} from "@whiskeysockets/baileys";
import { join } from "node:path";
import { getDataDir } from "../../../shared/config.js";
import { getLogger } from "../../../shared/logger.js";
import type { ChannelAdapter, MessageHandler, MessageMetadata } from "./index.js";

const log = getLogger();

export interface WhatsAppConfig {
  /** Directory to store multi-device auth state. Default: <dataDir>/whatsapp-auth */
  authDir?: string;
  /** Phone numbers allowed to interact. Empty = allow all. */
  allowedNumbers?: string[];
  /** Callback invoked when QR code is available for scanning. */
  onQR?: (qr: string) => void;
}

export class WhatsAppChannel implements ChannelAdapter {
  readonly name = "whatsapp" as const;

  private socket: WASocket | null = null;
  private handlers: MessageHandler[] = [];
  private connected = false;
  private authDir: string;
  private allowedNumbers: Set<string>;
  private onQR: ((qr: string) => void) | undefined;

  constructor(private config: WhatsAppConfig = {}) {
    this.authDir = config.authDir ?? join(getDataDir(), "whatsapp-auth");
    this.allowedNumbers = new Set(config.allowedNumbers ?? []);
    this.onQR = config.onQR;
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);

    this.socket = makeWASocket({
      auth: state,
      printQRInTerminal: !this.onQR, // print to terminal if no callback
    });

    // Handle connection updates
    this.socket.ev.on("connection.update", (update: Partial<ConnectionState>) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr && this.onQR) {
        this.onQR(qr);
      }

      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        if (shouldReconnect) {
          log.warn("WhatsApp connection closed, reconnecting...");
          this.connected = false;
          // Attempt reconnect after a delay
          setTimeout(() => {
            this.connect().catch((err) => {
              log.error(`WhatsApp reconnect failed: ${err}`);
            });
          }, 3000);
        } else {
          log.info("WhatsApp logged out");
          this.connected = false;
        }
      }

      if (connection === "open") {
        log.info("WhatsApp connected");
        this.connected = true;
      }
    });

    // Persist credentials on update
    this.socket.ev.on("creds.update", saveCreds);

    // Handle incoming messages
    this.socket.ev.on("messages.upsert", (m) => {
      for (const msg of m.messages) {
        if (!msg.message || msg.key.fromMe) continue;

        const text = this.extractText(msg);
        if (!text) continue;

        const jid = msg.key.remoteJid ?? "";
        const senderId = msg.key.participant ?? jid;
        const senderNumber = senderId.replace(/@.*$/, "");

        // Number filter
        if (this.allowedNumbers.size > 0 && !this.allowedNumbers.has(senderNumber)) {
          log.debug(`WhatsApp: ignoring message from ${senderNumber}`);
          continue;
        }

        const isGroup = jid.endsWith("@g.us");
        const metadata: MessageMetadata = {
          channel: "whatsapp",
          chat_id: jid,
          is_group: isGroup,
          sender_name: msg.pushName ?? senderNumber,
          reply_to: msg.message?.extendedTextMessage?.contextInfo?.stanzaId ?? undefined,
        };

        for (const handler of this.handlers) {
          try {
            handler(senderNumber, text, metadata);
          } catch (err) {
            log.error(`WhatsApp message handler error: ${err}`);
          }
        }
      }
    });
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

  async send(target: string, message: string): Promise<void> {
    if (!this.socket || !this.connected) {
      throw new Error("WhatsApp channel is not connected");
    }

    // Normalize JID: if it doesn't contain @, assume it's a phone number
    const jid = target.includes("@") ? target : `${target}@s.whatsapp.net`;

    await this.socket.sendMessage(jid, { text: message });
  }

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

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
}
