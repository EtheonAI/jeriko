// Telegram channel adapter — uses grammy bot SDK for long-polling.
//
// Supports:
//   - Text messages (send + receive)
//   - Long messages auto-split into multiple Telegram messages
//   - Inline keyboard buttons (interactive menus for commands)
//   - Callback query handling (button presses routed back as commands)
//   - Photos (send by file path or URL)
//   - Documents (send by file path)
//   - Photo/document/voice receive with file_id extraction for downloading
//   - Message tracking + editing (live streaming support)
//   - File downloading from Telegram servers
//   - Typing indicators
//   - Bot command registration (replaces stale v1 commands on connect)

import { Bot, InlineKeyboard, InputFile, type Context as GrammyContext } from "grammy";
import type {
  ChannelAdapter,
  MessageHandler,
  MessageMetadata,
  SentMessage,
  FileAttachment,
  KeyboardLayout,
} from "./index.js";
import { getLogger } from "../../../shared/logger.js";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const log = getLogger();

// Telegram message limit is 4096 chars. Split at 3900 to leave room for formatting.
const MAX_MSG_LEN = 3900;

export interface TelegramConfig {
  /** Bot token from @BotFather */
  token: string;
  /** Telegram user/chat IDs allowed to interact. Empty = allow all. */
  adminIds?: string[];
}

export class TelegramChannel implements ChannelAdapter {
  readonly name = "telegram" as const;

  private bot: Bot;
  private handlers: MessageHandler[] = [];
  private connected = false;
  private adminIds: Set<string>;

  constructor(private config: TelegramConfig) {
    this.bot = new Bot(config.token);
    this.adminIds = new Set(config.adminIds ?? []);

    // ── Text messages ───────────────────────────────────────────────
    this.bot.on("message:text", (ctx: GrammyContext) => {
      this.dispatchMessage(ctx, ctx.message!.text!);
    });

    // ── Photos — extract file_id + caption ──────────────────────────
    this.bot.on("message:photo", (ctx: GrammyContext) => {
      const photo = ctx.message!.photo!;
      const largest = photo[photo.length - 1]!; // highest resolution
      const caption = ctx.message?.caption ?? "";
      const attachments: FileAttachment[] = [{
        type: "photo",
        fileId: largest.file_id,
        caption: caption || undefined,
      }];
      this.dispatchMessage(ctx, caption || "[photo]", attachments);
    });

    // ── Documents — extract file_id, filename, mime ─────────────────
    this.bot.on("message:document", (ctx: GrammyContext) => {
      const doc = ctx.message!.document!;
      const caption = ctx.message?.caption ?? "";
      const attachments: FileAttachment[] = [{
        type: "document",
        fileId: doc.file_id,
        filename: doc.file_name ?? undefined,
        mimeType: doc.mime_type ?? undefined,
        caption: caption || undefined,
      }];
      this.dispatchMessage(
        ctx,
        caption || `[document: ${doc.file_name ?? "file"}]`,
        attachments,
      );
    });

    // ── Voice messages — extract file_id ────────────────────────────
    this.bot.on("message:voice", (ctx: GrammyContext) => {
      const voice = ctx.message!.voice!;
      const attachments: FileAttachment[] = [{
        type: "voice",
        fileId: voice.file_id,
        mimeType: voice.mime_type ?? undefined,
        duration: voice.duration,
      }];
      this.dispatchMessage(ctx, "[voice message]", attachments);
    });

    // ── Video — extract file_id + caption ────────────────────────────
    this.bot.on("message:video", (ctx: GrammyContext) => {
      const video = ctx.message!.video!;
      const caption = ctx.message?.caption ?? "";
      const attachments: FileAttachment[] = [{
        type: "video",
        fileId: video.file_id,
        filename: video.file_name ?? undefined,
        mimeType: video.mime_type ?? undefined,
        caption: caption || undefined,
        duration: video.duration,
      }];
      this.dispatchMessage(ctx, caption || "[video]", attachments);
    });

    // ── Audio files — extract file_id + caption ──────────────────────
    this.bot.on("message:audio", (ctx: GrammyContext) => {
      const audio = ctx.message!.audio!;
      const caption = ctx.message?.caption ?? "";
      const attachments: FileAttachment[] = [{
        type: "audio",
        fileId: audio.file_id,
        filename: audio.file_name ?? undefined,
        mimeType: audio.mime_type ?? undefined,
        caption: caption || undefined,
        duration: audio.duration,
      }];
      this.dispatchMessage(ctx, caption || `[audio: ${audio.title ?? audio.file_name ?? "file"}]`, attachments);
    });

    // ── Animations (GIFs) — extract file_id ──────────────────────────
    this.bot.on("message:animation", (ctx: GrammyContext) => {
      const anim = ctx.message!.animation!;
      const caption = ctx.message?.caption ?? "";
      const attachments: FileAttachment[] = [{
        type: "animation",
        fileId: anim.file_id,
        filename: anim.file_name ?? undefined,
        mimeType: anim.mime_type ?? undefined,
        caption: caption || undefined,
        duration: anim.duration,
      }];
      this.dispatchMessage(ctx, caption || "[animation/GIF]", attachments);
    });

    // ── Stickers — extract file_id ───────────────────────────────────
    this.bot.on("message:sticker", (ctx: GrammyContext) => {
      const sticker = ctx.message!.sticker!;
      const attachments: FileAttachment[] = [{
        type: "sticker",
        fileId: sticker.file_id,
        mimeType: sticker.is_animated ? "application/x-tgsticker" : sticker.is_video ? "video/webm" : "image/webp",
      }];
      this.dispatchMessage(ctx, `[sticker: ${sticker.emoji ?? ""}]`, attachments);
    });

    // ── Callback queries — button presses from inline keyboards ──────
    this.bot.on("callback_query:data", async (ctx: GrammyContext) => {
      const data = ctx.callbackQuery?.data;
      if (!data || !ctx.from) return;

      // Acknowledge the button press (removes loading spinner)
      await ctx.answerCallbackQuery().catch(() => {});

      // Route callback data as if the user typed the command
      this.dispatchCallback(ctx, data);
    });
  }

  /** Common message dispatch — admin filter + metadata extraction. */
  private dispatchMessage(
    ctx: GrammyContext,
    text: string,
    attachments?: FileAttachment[],
  ): void {
    if (!ctx.from) return;

    const senderId = String(ctx.from.id);
    if (this.adminIds.size > 0 && !this.adminIds.has(senderId)) {
      log.debug(`Telegram: ignoring message from non-admin ${senderId}`);
      return;
    }

    const chatId = String(ctx.chat?.id ?? ctx.from.id);
    const isGroup =
      ctx.chat?.type === "group" || ctx.chat?.type === "supergroup";
    const senderName =
      [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" ") ||
      ctx.from.username ||
      senderId;

    const metadata: MessageMetadata = {
      channel: "telegram",
      chat_id: chatId,
      is_group: isGroup,
      sender_name: senderName,
      message_id: ctx.message?.message_id,
      reply_to: ctx.message?.reply_to_message
        ? String(ctx.message.reply_to_message.message_id)
        : undefined,
      attachments,
    };

    for (const handler of this.handlers) {
      try {
        handler(senderId, text, metadata);
      } catch (err) {
        log.error(`Telegram message handler error: ${err}`);
      }
    }
  }

  /** Dispatch a callback query (button press) as a command through the handler chain. */
  private dispatchCallback(ctx: GrammyContext, data: string): void {
    if (!ctx.from) return;

    const senderId = String(ctx.from.id);
    if (this.adminIds.size > 0 && !this.adminIds.has(senderId)) return;

    const chatId = String(ctx.callbackQuery?.message?.chat?.id ?? ctx.from.id);
    const isGroup =
      ctx.callbackQuery?.message?.chat?.type === "group" ||
      ctx.callbackQuery?.message?.chat?.type === "supergroup";
    const senderName =
      [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" ") ||
      ctx.from.username ||
      senderId;

    const metadata: MessageMetadata = {
      channel: "telegram",
      chat_id: chatId,
      is_group: isGroup,
      sender_name: senderName,
    };

    for (const handler of this.handlers) {
      try {
        handler(senderId, data, metadata);
      } catch (err) {
        log.error(`Telegram callback handler error: ${err}`);
      }
    }
  }

  // ── Lifecycle ───────────────────────────────────────────────────────

  async connect(): Promise<void> {
    if (this.connected) return;

    if (!this.config.token) {
      throw new Error("Telegram bot token is not configured");
    }

    await this.bot.api.deleteWebhook({ drop_pending_updates: false });

    // Register all slash commands visible in the Telegram menu.
    // Must match the commands handled by the channel router in router.ts.
    await this.bot.api.setMyCommands([
      { command: "help", description: "Show available commands" },
      { command: "new", description: "Start a new session" },
      { command: "stop", description: "Stop current processing" },
      { command: "clear", description: "Clear session history" },
      { command: "kill", description: "Delete session and start fresh" },
      { command: "session", description: "Show session info" },
      { command: "sessions", description: "List recent sessions" },
      { command: "switch", description: "Resume a session by ID" },
      { command: "archive", description: "Archive current session" },
      { command: "model", description: "Get or set the active model" },
      { command: "connect", description: "OAuth login (GitHub, X, etc.)" },
      { command: "disconnect", description: "Remove OAuth token" },
      { command: "connectors", description: "Show integrations status" },
      { command: "auth", description: "Configure connector API keys" },
      { command: "health", description: "Test connector connectivity" },
      { command: "skill", description: "View and manage skill packages" },
      { command: "triggers", description: "List and manage triggers" },
      { command: "tasks", description: "List and manage tasks" },
      { command: "channels", description: "Show messaging channels" },
      { command: "notifications", description: "Toggle notifications on/off" },
      { command: "history", description: "Show recent messages" },
      { command: "compact", description: "Compact session context" },
      { command: "share", description: "Share this conversation via link" },
      { command: "status", description: "Show daemon status" },
      { command: "sys", description: "Show system info" },
    ]);

    this.bot.start({
      drop_pending_updates: false,
      onStart: () => log.info("Telegram bot started polling"),
    });

    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    await this.bot.stop();
    this.connected = false;
    log.info("Telegram bot stopped");
  }

  isConnected(): boolean {
    return this.connected;
  }

  // ── Sending ─────────────────────────────────────────────────────────

  async send(target: string, message: string): Promise<void> {
    if (!this.connected) throw new Error("Telegram channel is not connected");
    const chatId = Number(target);
    try {
      await this.bot.api.sendMessage(chatId, message.slice(0, 4096), {
        parse_mode: "Markdown",
      });
    } catch {
      // Markdown parse can fail on unescaped chars — retry as plain text
      await this.bot.api.sendMessage(chatId, message.slice(0, 4096));
    }
  }

  /** Send long text split across multiple messages at newline boundaries. */
  async sendLong(target: string, message: string): Promise<void> {
    if (!this.connected) throw new Error("Telegram channel is not connected");

    const chunks = splitMessage(message, MAX_MSG_LEN);
    for (const chunk of chunks) {
      await this.send(target, chunk);
    }
  }

  /** Send a message and return its ID for later editing. */
  async sendTracked(target: string, message: string): Promise<SentMessage> {
    if (!this.connected) throw new Error("Telegram channel is not connected");
    const chatId = Number(target);
    try {
      const msg = await this.bot.api.sendMessage(chatId, message.slice(0, 4096), {
        parse_mode: "Markdown",
      });
      return { messageId: msg.message_id };
    } catch {
      const msg = await this.bot.api.sendMessage(chatId, message.slice(0, 4096));
      return { messageId: msg.message_id };
    }
  }

  /** Edit a previously sent message in-place. Best-effort. */
  async editMessage(target: string, messageId: string | number, text: string): Promise<void> {
    const chatId = Number(target);
    try {
      await this.bot.api.editMessageText(chatId, Number(messageId), text.slice(0, 4096), {
        parse_mode: "Markdown",
      });
    } catch {
      try {
        await this.bot.api.editMessageText(chatId, Number(messageId), text.slice(0, 4096));
      } catch {
        // Edit can fail if content unchanged or message too old — best-effort
      }
    }
  }

  /** Download a file from Telegram by file_id. Saves to ~/.jeriko/data/files/. */
  async downloadFile(fileId: string, filename?: string): Promise<string> {
    const file = await this.bot.api.getFile(fileId);
    if (!file.file_path) throw new Error("No file path from Telegram");

    const url = `https://api.telegram.org/file/bot${this.config.token}/${file.file_path}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`File download failed: HTTP ${resp.status}`);

    const ext = file.file_path.split(".").pop() ?? "bin";
    const name = filename ?? `tg_${Date.now()}.${ext}`;
    const dir = join(process.env.HOME ?? "/tmp", ".jeriko", "data", "files");
    mkdirSync(dir, { recursive: true });
    const localPath = join(dir, name);
    await Bun.write(localPath, resp);
    return localPath;
  }

  async sendPhoto(target: string, photo: string, caption?: string): Promise<void> {
    if (!this.connected) throw new Error("Telegram channel is not connected");
    const chatId = Number(target);

    // photo can be a file path or a URL
    const source = existsSync(photo) ? new InputFile(photo) : photo;
    await this.bot.api.sendPhoto(chatId, source, {
      caption: caption?.slice(0, 1024),
    });
  }

  async sendDocument(target: string, path: string, caption?: string): Promise<void> {
    if (!this.connected) throw new Error("Telegram channel is not connected");
    const chatId = Number(target);

    await this.bot.api.sendDocument(chatId, new InputFile(path), {
      caption: caption?.slice(0, 1024),
    });
  }

  async sendVideo(target: string, path: string, caption?: string): Promise<void> {
    if (!this.connected) throw new Error("Telegram channel is not connected");
    const chatId = Number(target);

    await this.bot.api.sendVideo(chatId, new InputFile(path), {
      caption: caption?.slice(0, 1024),
    });
  }

  async sendAudio(target: string, path: string, caption?: string): Promise<void> {
    if (!this.connected) throw new Error("Telegram channel is not connected");
    const chatId = Number(target);

    await this.bot.api.sendAudio(chatId, new InputFile(path), {
      caption: caption?.slice(0, 1024),
    });
  }

  async sendVoice(target: string, path: string, caption?: string): Promise<void> {
    if (!this.connected) throw new Error("Telegram channel is not connected");
    const chatId = Number(target);

    await this.bot.api.sendVoice(chatId, new InputFile(path), {
      caption: caption?.slice(0, 1024),
    });
  }

  /** Send a message with inline keyboard buttons. */
  async sendKeyboard(target: string, text: string, keyboard: KeyboardLayout): Promise<void> {
    if (!this.connected) throw new Error("Telegram channel is not connected");
    const chatId = Number(target);

    const kb = new InlineKeyboard();
    for (const row of keyboard) {
      for (const button of row) {
        kb.text(button.label, button.data);
      }
      kb.row();
    }

    try {
      await this.bot.api.sendMessage(chatId, text.slice(0, 4096), {
        parse_mode: "Markdown",
        reply_markup: kb,
      });
    } catch {
      // Markdown failed — retry plain text
      await this.bot.api.sendMessage(chatId, text.slice(0, 4096), {
        reply_markup: kb,
      });
    }
  }

  /** Delete a message from a chat. Used to remove messages containing API keys. */
  async deleteMessage(target: string, messageId: string | number): Promise<void> {
    if (!this.connected) return;
    try {
      await this.bot.api.deleteMessage(Number(target), Number(messageId));
    } catch {
      // Best effort — may fail if message is too old or bot lacks permission
    }
  }

  async sendTyping(target: string): Promise<void> {
    if (!this.connected) return;
    try {
      await this.bot.api.sendChatAction(Number(target), "typing");
    } catch {
      // Best-effort
    }
  }

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Split a message into chunks at newline boundaries, respecting maxLen. */
function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    // Find the last newline within maxLen
    let splitAt = remaining.lastIndexOf("\n", maxLen);
    if (splitAt <= 0) {
      // No newline found — split at maxLen
      splitAt = maxLen;
    }

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\n/, "");
  }

  return chunks;
}
