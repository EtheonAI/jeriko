// Google Chat channel adapter — uses Google Chat REST API with Service Account auth.
//
// Google Chat bots receive events via HTTPS endpoint (the daemon's HTTP server)
// and send messages via the Chat REST API.
//
// Implements the full ChannelAdapter interface:
//   - Text: send, sendLong, sendTracked, editMessage, deleteMessage
//   - Media: sendDocument (via attachment upload), downloadFile
//   - UI: sendKeyboard (Card buttons)
//   - Incoming: HTTP endpoint receives events from Google Chat
//
// Requirements:
//   - Google Cloud project with Chat API enabled
//   - Service Account with chat.bot scope
//   - Bot configured with HTTPS endpoint pointing to daemon
//
// No typing indicator API exists in Google Chat.

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

const MAX_MSG_LEN = 4000;
const FILES_DIR = "files";
const API_BASE = "https://chat.googleapis.com/v1";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/chat.bot";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface GoogleChatConfig {
  /** Path to Service Account JSON key file. */
  serviceAccountKeyPath?: string;
  /** Inline Service Account JSON (alternative to file path). */
  serviceAccountKey?: ServiceAccountKey;
  /** Space IDs to restrict to. Empty = all spaces the bot is in. */
  spaceIds?: string[];
}

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class GoogleChatChannel implements ChannelAdapter {
  readonly name = "googlechat" as const;

  private handlers: MessageHandler[] = [];
  private connected = false;
  private serviceAccount: ServiceAccountKey;
  private spaceIds: Set<string>;

  /** Cached OAuth2 access token. */
  private accessToken: string | null = null;
  private tokenExpiry = 0;

  constructor(private config: GoogleChatConfig) {
    // Load service account from file or inline config
    if (config.serviceAccountKey) {
      this.serviceAccount = config.serviceAccountKey;
    } else if (config.serviceAccountKeyPath) {
      const raw = readFileSync(config.serviceAccountKeyPath, "utf-8");
      this.serviceAccount = JSON.parse(raw);
    } else {
      throw new Error("Google Chat requires serviceAccountKeyPath or serviceAccountKey");
    }
    this.spaceIds = new Set(config.spaceIds ?? []);
  }

  // ── Lifecycle ───────────────────────────────────────────────────────

  async connect(): Promise<void> {
    if (this.connected) return;

    // Validate credentials by fetching an access token
    await this.getToken();
    log.info("Google Chat connected (service account authenticated)");
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    this.accessToken = null;
    this.tokenExpiry = 0;
    this.connected = false;
    log.info("Google Chat disconnected");
  }

  isConnected(): boolean {
    return this.connected;
  }

  // ── Text Messaging ──────────────────────────────────────────────────

  async send(target: string, message: string): Promise<void> {
    this.requireConnected();
    const space = this.toSpaceName(target);
    await this.chatApi("POST", `/${space}/messages`, {
      text: message,
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
    const space = this.toSpaceName(target);
    const resp = await this.chatApi("POST", `/${space}/messages`, {
      text: message,
    });
    // Response contains message.name like "spaces/SPACE/messages/MSG_ID"
    const msgName = resp.name ?? "";
    return { messageId: msgName };
  }

  async editMessage(target: string, messageId: string | number, text: string): Promise<void> {
    try {
      // messageId is the full message resource name: spaces/X/messages/Y
      const msgName = String(messageId);
      await this.chatApi("PATCH", `/${msgName}?updateMask=text`, {
        text,
      });
    } catch (err) {
      log.debug(`Google Chat edit failed, sending new message: ${err}`);
      await this.send(target, text);
    }
  }

  async deleteMessage(_target: string, messageId: string | number): Promise<void> {
    try {
      const msgName = String(messageId);
      await this.chatApi("DELETE", `/${msgName}`);
    } catch {
      // Best effort
    }
  }

  // ── Media ───────────────────────────────────────────────────────────

  async sendPhoto(target: string, photo: string, caption?: string): Promise<void> {
    // Google Chat doesn't have a direct photo send — send as text with link or document
    if (photo.startsWith("http")) {
      const text = caption ? `${caption}\n${photo}` : photo;
      await this.send(target, text);
    } else {
      await this.sendDocument(target, photo, caption);
    }
  }

  async sendDocument(target: string, path: string, caption?: string): Promise<void> {
    this.requireConnected();
    const space = this.toSpaceName(target);

    // Upload attachment
    const file = Bun.file(path);
    const filename = path.split("/").pop() ?? "file";

    try {
      // Step 1: Upload
      const token = await this.getToken();
      const uploadUrl = `https://chat.googleapis.com/upload/v1/${space}/attachments:upload`;
      const formData = new FormData();
      formData.append("file", file, filename);

      const uploadResp = await fetch(uploadUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (uploadResp.ok) {
        const uploadData = await uploadResp.json() as any;
        const attachmentToken = uploadData.attachmentDataRef?.attachmentUploadToken;

        if (attachmentToken) {
          // Step 2: Send message with attachment
          await this.chatApi("POST", `/${space}/messages`, {
            text: caption ?? "",
            attachment: [{
              attachmentDataRef: { attachmentUploadToken: attachmentToken },
            }],
          });
          return;
        }
      }
    } catch (err) {
      log.debug(`Google Chat attachment upload failed: ${err}`);
    }

    // Fallback: send caption as text
    await this.send(target, caption ? `${caption}\n[File: ${filename}]` : `[File: ${filename}]`);
  }

  async sendVideo(target: string, path: string, caption?: string): Promise<void> {
    await this.sendDocument(target, path, caption);
  }

  async sendAudio(target: string, path: string, caption?: string): Promise<void> {
    await this.sendDocument(target, path, caption);
  }

  async sendVoice(target: string, path: string, caption?: string): Promise<void> {
    await this.sendDocument(target, path, caption);
  }

  // ── File Download ───────────────────────────────────────────────────

  async downloadFile(fileId: string, filename?: string): Promise<string> {
    this.requireConnected();

    // fileId is the attachment resourceName: spaces/X/attachments/Y
    const token = await this.getToken();
    const url = `${API_BASE}/media/${fileId}?alt=media`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) {
      throw new Error(`Google Chat file download failed: HTTP ${resp.status}`);
    }

    const dir = join(getDataDir(), FILES_DIR);
    mkdirSync(dir, { recursive: true });

    const safeName = filename ?? `gchat-${Date.now()}.bin`;
    const localPath = join(dir, safeName);
    await Bun.write(localPath, resp);
    return localPath;
  }

  // ── Typing Indicator ────────────────────────────────────────────────

  // Google Chat API does not support typing indicators.
  // Method exists for interface compliance but is a no-op.

  // ── Keyboard (Card buttons) ─────────────────────────────────────────

  async sendKeyboard(target: string, text: string, keyboard: KeyboardLayout): Promise<void> {
    this.requireConnected();
    const space = this.toSpaceName(target);

    // Build cardsV2 with button sections
    const buttons: any[] = [];
    for (const row of keyboard) {
      for (const button of row) {
        if (button.url) {
          buttons.push({
            text: button.label,
            onClick: { openLink: { url: button.url } },
          });
        } else if (button.data) {
          buttons.push({
            text: button.label,
            onClick: {
              action: {
                function: "command",
                parameters: [{ key: "cmd", value: button.data }],
              },
            },
          });
        }
      }
    }

    await this.chatApi("POST", `/${space}/messages`, {
      text,
      cardsV2: [{
        cardId: `kb-${Date.now()}`,
        card: {
          sections: [{
            widgets: [{
              buttonList: { buttons },
            }],
          }],
        },
      }],
    });
  }

  // ── Handler Registration ────────────────────────────────────────────

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  // ── Event Ingress (called by daemon HTTP route) ─────────────────────

  /**
   * Process an incoming Google Chat event.
   * Called by the daemon's HTTP server when Google posts to the bot endpoint.
   *
   * For synchronous responses, returns a message body to send back.
   * For async processing (agent), returns null and sends via API later.
   */
  handleEvent(event: Record<string, unknown>): { text: string } | null {
    const type = event.type as string;

    if (type === "ADDED_TO_SPACE") {
      return { text: "Hello! I'm Jeriko. Send me a message or use /help to get started." };
    }

    if (type !== "MESSAGE") return null;

    const message = event.message as any;
    if (!message) return null;

    const space = message.space ?? event.space ?? {};
    const spaceName = space.name ?? "";
    const spaceType = space.spaceType ?? space.type ?? "";

    // Space filter
    if (this.spaceIds.size > 0) {
      const spaceId = spaceName.replace("spaces/", "");
      if (!this.spaceIds.has(spaceId) && !this.spaceIds.has(spaceName)) {
        return null;
      }
    }

    const sender = message.sender ?? event.user ?? {};
    const senderName = sender.displayName ?? "Unknown";
    const senderId = sender.name ?? "";
    const isDm = spaceType === "DIRECT_MESSAGE" || space.singleUserBotDm === true;

    // Use argumentText (bot @mention stripped) or full text
    const text = (message.argumentText ?? message.text ?? "").trim();
    if (!text) return null;

    // Extract attachments
    const attachments = this.extractAttachments(message);

    const metadata: MessageMetadata = {
      channel: "googlechat",
      chat_id: spaceName,
      is_group: !isDm,
      sender_name: senderName,
      message_id: message.name ?? undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
    };

    for (const handler of this.handlers) {
      try {
        handler(senderId, text, metadata);
      } catch (err) {
        log.error(`Google Chat handler error: ${err}`);
      }
    }

    // Return null — router will send response async via API
    return null;
  }

  /**
   * Process a CARD_CLICKED event (button press).
   * Extracts the command from action parameters and dispatches as a message.
   */
  handleCardClick(event: Record<string, unknown>): void {
    const action = event.action as any;
    if (!action) return;

    const params = action.parameters as Array<{ key: string; value: string }> | undefined;
    const cmdParam = params?.find((p) => p.key === "cmd");
    if (!cmdParam?.value) return;

    const space = (event as any).space ?? {};
    const sender = (event as any).user ?? {};

    const metadata: MessageMetadata = {
      channel: "googlechat",
      chat_id: space.name ?? "",
      is_group: space.spaceType !== "DIRECT_MESSAGE",
      sender_name: sender.displayName ?? "",
    };

    for (const handler of this.handlers) {
      try {
        handler(sender.name ?? "", cmdParam.value, metadata);
      } catch (err) {
        log.error(`Google Chat card click handler error: ${err}`);
      }
    }
  }

  // ── Internals ───────────────────────────────────────────────────────

  private requireConnected(): void {
    if (!this.connected) throw new Error("Google Chat channel is not connected");
  }

  /** Normalize target to spaces/{id} format. */
  private toSpaceName(target: string): string {
    return target.startsWith("spaces/") ? target : `spaces/${target}`;
  }

  private extractAttachments(message: any): FileAttachment[] {
    const rawAttachments = message.attachment;
    if (!Array.isArray(rawAttachments)) return [];

    return rawAttachments.map((att: any) => {
      const contentType = att.contentType ?? "";
      let type: FileAttachment["type"] = "document";
      if (contentType.startsWith("image/")) type = "photo";
      else if (contentType.startsWith("video/")) type = "video";
      else if (contentType.startsWith("audio/")) type = "audio";

      return {
        type,
        fileId: att.attachmentDataRef?.resourceName ?? att.name ?? "",
        filename: att.contentName ?? undefined,
        mimeType: contentType || undefined,
      };
    });
  }

  // ── Auth (Service Account JWT → OAuth2 token) ──────────────────────

  private async getToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry - 60_000) {
      return this.accessToken;
    }

    const jwt = await this.createJWT();

    const resp = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Google OAuth2 token exchange failed: ${resp.status} ${text}`);
    }

    const data = await resp.json() as any;
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in ?? 3600) * 1000;
    return this.accessToken!;
  }

  /** Create a signed JWT for service account auth. */
  private async createJWT(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);

    const header = { alg: "RS256", typ: "JWT" };
    const payload = {
      iss: this.serviceAccount.client_email,
      sub: this.serviceAccount.client_email,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
      scope: SCOPE,
    };

    const headerB64 = base64url(JSON.stringify(header));
    const payloadB64 = base64url(JSON.stringify(payload));
    const signingInput = `${headerB64}.${payloadB64}`;

    // Import the PEM private key
    const pemKey = this.serviceAccount.private_key;
    const pemBody = pemKey
      .replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----/, "")
      .replace(/-----END (?:RSA )?PRIVATE KEY-----/, "")
      .replace(/\s/g, "");
    const keyBuffer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

    const cryptoKey = await crypto.subtle.importKey(
      "pkcs8",
      keyBuffer,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      new TextEncoder().encode(signingInput),
    );

    const sigB64 = base64url(signature);
    return `${signingInput}.${sigB64}`;
  }

  /** Make an authenticated call to the Google Chat API. */
  private async chatApi(method: string, path: string, body?: unknown): Promise<any> {
    const token = await this.getToken();
    const url = `${API_BASE}${path}`;

    const opts: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    };
    if (body !== undefined && method !== "DELETE") {
      opts.body = JSON.stringify(body);
    }

    const resp = await fetch(url, opts);
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Google Chat API error: ${method} ${path} → ${resp.status} ${text}`);
    }

    const contentType = resp.headers.get("content-type") ?? "";
    if (contentType.includes("json")) {
      return resp.json();
    }
    return {};
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

/** Base64url encode a string or ArrayBuffer (no padding). */
function base64url(input: string | ArrayBuffer): string {
  let b64: string;
  if (typeof input === "string") {
    b64 = btoa(input);
  } else {
    const bytes = new Uint8Array(input);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    b64 = btoa(binary);
  }
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
