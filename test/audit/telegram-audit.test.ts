// Telegram channel adapter audit tests.
//
// Covers: construction, admin filtering, message dispatch, message splitting,
// send/sendLong/sendTracked/editMessage, connect/disconnect lifecycle,
// callback queries, error handling, and all media type handlers.
//
// All Telegram API calls are mocked — no real network requests.

import { describe, expect, it, beforeEach, mock, spyOn } from "bun:test";

// ---------------------------------------------------------------------------
// Mock Grammy — must be set up before importing TelegramChannel
// ---------------------------------------------------------------------------

// Accumulate registered Grammy handlers so we can simulate incoming messages.
type HandlerEntry = { filter: string; fn: Function };
let grammyHandlers: HandlerEntry[] = [];

// Track API calls made through bot.api.*
let apiCalls: { method: string; args: any[] }[] = [];

// Control whether API calls throw
let apiShouldFail = false;
let apiFailOnMarkdown = false;

function resetMocks() {
  grammyHandlers = [];
  apiCalls = [];
  apiShouldFail = false;
  apiFailOnMarkdown = false;
}

const mockApi = {
  sendMessage: mock((...args: any[]) => {
    if (apiShouldFail) throw new Error("API error");
    const opts = args[2];
    if (apiFailOnMarkdown && opts?.parse_mode === "Markdown") {
      throw new Error("Markdown parse error");
    }
    apiCalls.push({ method: "sendMessage", args });
    return { message_id: apiCalls.length };
  }),
  editMessageText: mock((...args: any[]) => {
    if (apiShouldFail) throw new Error("API error");
    const opts = args[3];
    if (apiFailOnMarkdown && opts?.parse_mode === "Markdown") {
      throw new Error("Markdown parse error");
    }
    apiCalls.push({ method: "editMessageText", args });
  }),
  deleteMessage: mock((...args: any[]) => {
    apiCalls.push({ method: "deleteMessage", args });
  }),
  sendChatAction: mock((...args: any[]) => {
    apiCalls.push({ method: "sendChatAction", args });
  }),
  sendPhoto: mock((...args: any[]) => {
    apiCalls.push({ method: "sendPhoto", args });
  }),
  sendDocument: mock((...args: any[]) => {
    apiCalls.push({ method: "sendDocument", args });
  }),
  sendVideo: mock((...args: any[]) => {
    apiCalls.push({ method: "sendVideo", args });
  }),
  sendAudio: mock((...args: any[]) => {
    apiCalls.push({ method: "sendAudio", args });
  }),
  sendVoice: mock((...args: any[]) => {
    apiCalls.push({ method: "sendVoice", args });
  }),
  deleteWebhook: mock(async () => {}),
  setMyCommands: mock(async () => {}),
  getFile: mock(async (fileId: string) => ({
    file_path: `photos/${fileId}.jpg`,
  })),
};

// Grammy Bot mock — captures .on() handlers and exposes mock api
class MockBot {
  api = mockApi;
  private started = false;

  constructor(_token: string) {}

  on(filter: string, fn: Function) {
    grammyHandlers.push({ filter, fn });
  }

  start(opts?: any) {
    this.started = true;
    if (opts?.onStart) opts.onStart();
  }

  async stop() {
    this.started = false;
  }
}

class MockInlineKeyboard {
  private rows: any[][] = [[]];
  text(label: string, data: string) {
    this.rows[this.rows.length - 1].push({ label, data });
    return this;
  }
  url(label: string, url: string) {
    this.rows[this.rows.length - 1].push({ label, url });
    return this;
  }
  row() {
    this.rows.push([]);
    return this;
  }
}

class MockInputFile {
  constructor(public path: string) {}
}

// Mock the grammy module
mock.module("grammy", () => ({
  Bot: MockBot,
  InlineKeyboard: MockInlineKeyboard,
  InputFile: MockInputFile,
}));

// Mock logger
mock.module("../../../shared/logger.js", () => ({
  getLogger: () => ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }),
}));

// We need to resolve the logger relative to the actual source
mock.module(
  require.resolve("../../src/shared/logger.js"),
  () => ({
    getLogger: () => ({
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    }),
  }),
);

// ---------------------------------------------------------------------------
// Import the module under test (after mocks are set up)
// ---------------------------------------------------------------------------

import { TelegramChannel, type TelegramConfig } from "../../src/daemon/services/channels/telegram.js";

// ---------------------------------------------------------------------------
// Helpers — simulate Grammy contexts
// ---------------------------------------------------------------------------

function makeTextCtx(text: string, opts?: {
  userId?: number;
  chatId?: number;
  firstName?: string;
  lastName?: string;
  username?: string;
  chatType?: string;
  messageId?: number;
  replyToMessageId?: number;
}): any {
  const userId = opts?.userId ?? 12345;
  const chatId = opts?.chatId ?? userId;
  return {
    from: {
      id: userId,
      first_name: opts?.firstName ?? "Test",
      last_name: opts?.lastName ?? "User",
      username: opts?.username ?? "testuser",
    },
    chat: {
      id: chatId,
      type: opts?.chatType ?? "private",
    },
    message: {
      text,
      message_id: opts?.messageId ?? 1,
      reply_to_message: opts?.replyToMessageId
        ? { message_id: opts.replyToMessageId }
        : undefined,
    },
  };
}

function makePhotoCtx(opts?: {
  userId?: number;
  caption?: string;
  fileId?: string;
}): any {
  const userId = opts?.userId ?? 12345;
  return {
    from: { id: userId, first_name: "Test", username: "testuser" },
    chat: { id: userId, type: "private" },
    message: {
      photo: [
        { file_id: "small_id", width: 90, height: 90 },
        { file_id: opts?.fileId ?? "large_id", width: 800, height: 600 },
      ],
      caption: opts?.caption ?? null,
      message_id: 2,
    },
  };
}

function makeDocumentCtx(opts?: {
  userId?: number;
  caption?: string;
  fileName?: string;
  mimeType?: string;
}): any {
  const userId = opts?.userId ?? 12345;
  return {
    from: { id: userId, first_name: "Test", username: "testuser" },
    chat: { id: userId, type: "private" },
    message: {
      document: {
        file_id: "doc_file_id",
        file_name: opts?.fileName ?? "report.pdf",
        mime_type: opts?.mimeType ?? "application/pdf",
      },
      caption: opts?.caption ?? null,
      message_id: 3,
    },
  };
}

function makeVoiceCtx(opts?: { userId?: number }): any {
  const userId = opts?.userId ?? 12345;
  return {
    from: { id: userId, first_name: "Test", username: "testuser" },
    chat: { id: userId, type: "private" },
    message: {
      voice: {
        file_id: "voice_file_id",
        mime_type: "audio/ogg",
        duration: 5,
      },
      message_id: 4,
    },
  };
}

function makeVideoCtx(opts?: { userId?: number; caption?: string }): any {
  const userId = opts?.userId ?? 12345;
  return {
    from: { id: userId, first_name: "Test", username: "testuser" },
    chat: { id: userId, type: "private" },
    message: {
      video: {
        file_id: "video_file_id",
        file_name: "clip.mp4",
        mime_type: "video/mp4",
        duration: 30,
      },
      caption: opts?.caption ?? null,
      message_id: 5,
    },
  };
}

function makeAudioCtx(opts?: { userId?: number; caption?: string }): any {
  const userId = opts?.userId ?? 12345;
  return {
    from: { id: userId, first_name: "Test", username: "testuser" },
    chat: { id: userId, type: "private" },
    message: {
      audio: {
        file_id: "audio_file_id",
        file_name: "song.mp3",
        mime_type: "audio/mpeg",
        title: "My Song",
        duration: 180,
      },
      caption: opts?.caption ?? null,
      message_id: 6,
    },
  };
}

function makeAnimationCtx(opts?: { userId?: number; caption?: string }): any {
  const userId = opts?.userId ?? 12345;
  return {
    from: { id: userId, first_name: "Test", username: "testuser" },
    chat: { id: userId, type: "private" },
    message: {
      animation: {
        file_id: "anim_file_id",
        file_name: "funny.gif",
        mime_type: "image/gif",
        duration: 3,
      },
      caption: opts?.caption ?? null,
      message_id: 7,
    },
  };
}

function makeStickerCtx(opts?: {
  userId?: number;
  emoji?: string;
  isAnimated?: boolean;
  isVideo?: boolean;
}): any {
  const userId = opts?.userId ?? 12345;
  return {
    from: { id: userId, first_name: "Test", username: "testuser" },
    chat: { id: userId, type: "private" },
    message: {
      sticker: {
        file_id: "sticker_file_id",
        emoji: opts?.emoji ?? "😀",
        is_animated: opts?.isAnimated ?? false,
        is_video: opts?.isVideo ?? false,
      },
      message_id: 8,
    },
  };
}

function makeCallbackCtx(data: string, opts?: { userId?: number }): any {
  const userId = opts?.userId ?? 12345;
  return {
    from: { id: userId, first_name: "Test", username: "testuser" },
    callbackQuery: {
      data,
      message: { chat: { id: userId, type: "private" } },
    },
    answerCallbackQuery: mock(async () => {}),
  };
}

/** Fire the Grammy handler for a given filter. */
function fireHandler(filter: string, ctx: any) {
  const entry = grammyHandlers.find((h) => h.filter === filter);
  if (!entry) throw new Error(`No handler registered for filter: ${filter}`);
  return entry.fn(ctx);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TelegramChannel", () => {
  beforeEach(() => {
    resetMocks();
    // Reset all mock API call counts
    for (const fn of Object.values(mockApi)) {
      if (typeof fn === "function" && "mockClear" in fn) {
        (fn as any).mockClear();
      }
    }
  });

  // =========================================================================
  // Construction
  // =========================================================================

  describe("construction", () => {
    it("creates with valid config", () => {
      const channel = new TelegramChannel({ token: "123:ABC" });
      expect(channel.name).toBe("telegram");
      expect(channel.isConnected()).toBe(false);
    });

    it("creates with admin IDs", () => {
      const channel = new TelegramChannel({
        token: "123:ABC",
        adminIds: ["111", "222"],
      });
      expect(channel.name).toBe("telegram");
    });

    it("creates with empty admin IDs (open bot)", () => {
      const channel = new TelegramChannel({
        token: "123:ABC",
        adminIds: [],
      });
      expect(channel.name).toBe("telegram");
    });

    it("registers all expected Grammy handlers on construction", () => {
      resetMocks();
      new TelegramChannel({ token: "123:ABC" });
      const filters = grammyHandlers.map((h) => h.filter);
      expect(filters).toContain("message:text");
      expect(filters).toContain("message:photo");
      expect(filters).toContain("message:document");
      expect(filters).toContain("message:voice");
      expect(filters).toContain("message:video");
      expect(filters).toContain("message:audio");
      expect(filters).toContain("message:animation");
      expect(filters).toContain("message:sticker");
      expect(filters).toContain("callback_query:data");
    });
  });

  // =========================================================================
  // Admin ID Filtering
  // =========================================================================

  describe("admin ID filtering", () => {
    it("allows messages from admin when adminIds is set", () => {
      resetMocks();
      const channel = new TelegramChannel({
        token: "123:ABC",
        adminIds: ["12345"],
      });

      const received: { from: string; text: string }[] = [];
      channel.onMessage((from, text) => {
        received.push({ from, text });
      });

      const ctx = makeTextCtx("hello", { userId: 12345 });
      fireHandler("message:text", ctx);

      expect(received.length).toBe(1);
      expect(received[0].text).toBe("hello");
    });

    it("blocks messages from non-admin when adminIds is set", () => {
      resetMocks();
      const channel = new TelegramChannel({
        token: "123:ABC",
        adminIds: ["99999"],
      });

      const received: string[] = [];
      channel.onMessage((_from, text) => received.push(text));

      const ctx = makeTextCtx("hello", { userId: 12345 });
      fireHandler("message:text", ctx);

      expect(received.length).toBe(0);
    });

    it("allows all messages when adminIds is empty", () => {
      resetMocks();
      const channel = new TelegramChannel({
        token: "123:ABC",
        adminIds: [],
      });

      const received: string[] = [];
      channel.onMessage((_from, text) => received.push(text));

      fireHandler("message:text", makeTextCtx("hello", { userId: 1 }));
      fireHandler("message:text", makeTextCtx("world", { userId: 2 }));

      expect(received.length).toBe(2);
    });

    it("allows all messages when adminIds is undefined", () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });

      const received: string[] = [];
      channel.onMessage((_from, text) => received.push(text));

      fireHandler("message:text", makeTextCtx("hello", { userId: 999 }));

      expect(received.length).toBe(1);
    });

    it("blocks callback queries from non-admin", () => {
      resetMocks();
      const channel = new TelegramChannel({
        token: "123:ABC",
        adminIds: ["99999"],
      });

      const received: string[] = [];
      channel.onMessage((_from, text) => received.push(text));

      const ctx = makeCallbackCtx("/help", { userId: 12345 });
      fireHandler("callback_query:data", ctx);

      expect(received.length).toBe(0);
    });

    it("allows callback queries from admin", async () => {
      resetMocks();
      const channel = new TelegramChannel({
        token: "123:ABC",
        adminIds: ["12345"],
      });

      const received: string[] = [];
      channel.onMessage((_from, text) => received.push(text));

      const ctx = makeCallbackCtx("/help", { userId: 12345 });
      await fireHandler("callback_query:data", ctx);

      expect(received.length).toBe(1);
      expect(received[0]).toBe("/help");
    });
  });

  // =========================================================================
  // Message Dispatch — Text
  // =========================================================================

  describe("text message dispatch", () => {
    it("dispatches text messages with correct metadata", () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });

      let capturedMeta: any = null;
      channel.onMessage((_from, _text, meta) => {
        capturedMeta = meta;
      });

      const ctx = makeTextCtx("hello world", {
        userId: 42,
        chatId: 42,
        firstName: "John",
        lastName: "Doe",
        chatType: "private",
        messageId: 100,
      });
      fireHandler("message:text", ctx);

      expect(capturedMeta).not.toBeNull();
      expect(capturedMeta.channel).toBe("telegram");
      expect(capturedMeta.chat_id).toBe("42");
      expect(capturedMeta.is_group).toBe(false);
      expect(capturedMeta.sender_name).toBe("John Doe");
      expect(capturedMeta.message_id).toBe(100);
    });

    it("detects group chats", () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });

      let isGroup = false;
      channel.onMessage((_from, _text, meta) => {
        isGroup = meta.is_group;
      });

      fireHandler("message:text", makeTextCtx("hi", { chatType: "supergroup" }));
      expect(isGroup).toBe(true);
    });

    it("detects regular group chats", () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });

      let isGroup = false;
      channel.onMessage((_from, _text, meta) => {
        isGroup = meta.is_group;
      });

      fireHandler("message:text", makeTextCtx("hi", { chatType: "group" }));
      expect(isGroup).toBe(true);
    });

    it("drops messages without ctx.from", () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });

      const received: string[] = [];
      channel.onMessage((_from, text) => received.push(text));

      const ctx = { from: null, chat: { id: 1, type: "private" }, message: { text: "hi", message_id: 1 } };
      fireHandler("message:text", ctx);

      expect(received.length).toBe(0);
    });

    it("extracts reply_to message ID", () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });

      let replyTo: string | undefined;
      channel.onMessage((_from, _text, meta) => {
        replyTo = meta.reply_to;
      });

      fireHandler("message:text", makeTextCtx("replying", { replyToMessageId: 55 }));
      expect(replyTo).toBe("55");
    });

    it("builds sender name from username when name parts missing", () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });

      let senderName: string | undefined;
      channel.onMessage((_from, _text, meta) => {
        senderName = meta.sender_name;
      });

      const ctx = makeTextCtx("hi", { firstName: "", lastName: "", username: "cooluser" });
      // Override — clear name fields to trigger username fallback
      ctx.from.first_name = "";
      ctx.from.last_name = "";
      fireHandler("message:text", ctx);

      expect(senderName).toBe("cooluser");
    });

    it("falls back to sender ID when no name or username", () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });

      let senderName: string | undefined;
      channel.onMessage((_from, _text, meta) => {
        senderName = meta.sender_name;
      });

      const ctx = makeTextCtx("hi", { userId: 777 });
      ctx.from.first_name = "";
      ctx.from.last_name = undefined;
      ctx.from.username = undefined;
      fireHandler("message:text", ctx);

      expect(senderName).toBe("777");
    });
  });

  // =========================================================================
  // Message Dispatch — Media Types
  // =========================================================================

  describe("media message dispatch", () => {
    it("dispatches photo with largest resolution file_id", () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });

      let attachments: any[] | undefined;
      let text = "";
      channel.onMessage((_from, t, meta) => {
        text = t;
        attachments = meta.attachments;
      });

      fireHandler("message:photo", makePhotoCtx({ fileId: "big_photo_id" }));

      expect(text).toBe("[photo]");
      expect(attachments).toBeDefined();
      expect(attachments!.length).toBe(1);
      expect(attachments![0].type).toBe("photo");
      expect(attachments![0].fileId).toBe("big_photo_id");
    });

    it("dispatches photo with caption", () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });

      let text = "";
      let attachments: any[] | undefined;
      channel.onMessage((_from, t, meta) => {
        text = t;
        attachments = meta.attachments;
      });

      fireHandler("message:photo", makePhotoCtx({ caption: "Look at this!" }));

      expect(text).toBe("Look at this!");
      expect(attachments![0].caption).toBe("Look at this!");
    });

    it("dispatches document with filename and mime", () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });

      let text = "";
      let attachments: any[] | undefined;
      channel.onMessage((_from, t, meta) => {
        text = t;
        attachments = meta.attachments;
      });

      fireHandler("message:document", makeDocumentCtx({
        fileName: "data.csv",
        mimeType: "text/csv",
      }));

      expect(text).toBe("[document: data.csv]");
      expect(attachments![0].type).toBe("document");
      expect(attachments![0].fileId).toBe("doc_file_id");
      expect(attachments![0].filename).toBe("data.csv");
      expect(attachments![0].mimeType).toBe("text/csv");
    });

    it("dispatches voice message", () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });

      let text = "";
      let attachments: any[] | undefined;
      channel.onMessage((_from, t, meta) => {
        text = t;
        attachments = meta.attachments;
      });

      fireHandler("message:voice", makeVoiceCtx());

      expect(text).toBe("[voice message]");
      expect(attachments![0].type).toBe("voice");
      expect(attachments![0].duration).toBe(5);
    });

    it("dispatches video with caption", () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });

      let text = "";
      let attachments: any[] | undefined;
      channel.onMessage((_from, t, meta) => {
        text = t;
        attachments = meta.attachments;
      });

      fireHandler("message:video", makeVideoCtx({ caption: "Check this out" }));

      expect(text).toBe("Check this out");
      expect(attachments![0].type).toBe("video");
      expect(attachments![0].duration).toBe(30);
    });

    it("dispatches audio with title fallback", () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });

      let text = "";
      channel.onMessage((_from, t) => { text = t; });

      fireHandler("message:audio", makeAudioCtx());

      expect(text).toBe("[audio: My Song]");
    });

    it("dispatches animation/GIF", () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });

      let text = "";
      let attachments: any[] | undefined;
      channel.onMessage((_from, t, meta) => {
        text = t;
        attachments = meta.attachments;
      });

      fireHandler("message:animation", makeAnimationCtx());

      expect(text).toBe("[animation/GIF]");
      expect(attachments![0].type).toBe("animation");
    });

    it("dispatches sticker with emoji", () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });

      let text = "";
      let attachments: any[] | undefined;
      channel.onMessage((_from, t, meta) => {
        text = t;
        attachments = meta.attachments;
      });

      fireHandler("message:sticker", makeStickerCtx({ emoji: "🎉" }));

      expect(text).toContain("sticker");
      expect(attachments![0].type).toBe("sticker");
      expect(attachments![0].mimeType).toBe("image/webp");
    });

    it("sets correct mime type for animated sticker", () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });

      let attachments: any[] | undefined;
      channel.onMessage((_from, _t, meta) => {
        attachments = meta.attachments;
      });

      fireHandler("message:sticker", makeStickerCtx({ isAnimated: true }));

      expect(attachments![0].mimeType).toBe("application/x-tgsticker");
    });

    it("sets correct mime type for video sticker", () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });

      let attachments: any[] | undefined;
      channel.onMessage((_from, _t, meta) => {
        attachments = meta.attachments;
      });

      fireHandler("message:sticker", makeStickerCtx({ isVideo: true }));

      expect(attachments![0].mimeType).toBe("video/webm");
    });
  });

  // =========================================================================
  // Callback Query Handling
  // =========================================================================

  describe("callback query handling", () => {
    it("dispatches callback data as text through handlers", async () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });

      const received: string[] = [];
      channel.onMessage((_from, text) => received.push(text));

      const ctx = makeCallbackCtx("/new");
      await fireHandler("callback_query:data", ctx);

      expect(received).toEqual(["/new"]);
    });

    it("acknowledges the callback query", async () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });
      channel.onMessage(() => {});

      const ctx = makeCallbackCtx("/test");
      await fireHandler("callback_query:data", ctx);

      expect(ctx.answerCallbackQuery).toHaveBeenCalled();
    });

    it("drops callback with no data", async () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });

      const received: string[] = [];
      channel.onMessage((_from, text) => received.push(text));

      const ctx = {
        from: { id: 12345, first_name: "Test" },
        callbackQuery: { data: "", message: { chat: { id: 12345, type: "private" } } },
        answerCallbackQuery: mock(async () => {}),
      };
      await fireHandler("callback_query:data", ctx);

      expect(received.length).toBe(0);
    });

    it("drops callback with no ctx.from", async () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });

      const received: string[] = [];
      channel.onMessage((_from, text) => received.push(text));

      const ctx = {
        from: null,
        callbackQuery: { data: "/help", message: { chat: { id: 12345, type: "private" } } },
        answerCallbackQuery: mock(async () => {}),
      };
      await fireHandler("callback_query:data", ctx);

      expect(received.length).toBe(0);
    });
  });

  // =========================================================================
  // Message Splitting (splitMessage via sendLong)
  // =========================================================================

  describe("message splitting (sendLong)", () => {
    it("sends short message as single chunk", async () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });
      // Manually set connected state
      (channel as any).connected = true;

      await channel.sendLong("123", "Short message");

      // Should produce exactly one sendMessage call
      expect(apiCalls.filter((c) => c.method === "sendMessage").length).toBe(1);
    });

    it("splits long message into multiple chunks", async () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });
      (channel as any).connected = true;

      // Create a message longer than MAX_MSG_LEN (3900)
      const lines: string[] = [];
      for (let i = 0; i < 200; i++) {
        lines.push(`Line ${i}: ${"x".repeat(30)}`);
      }
      const longMsg = lines.join("\n");
      expect(longMsg.length).toBeGreaterThan(3900);

      await channel.sendLong("123", longMsg);

      const sends = apiCalls.filter((c) => c.method === "sendMessage");
      expect(sends.length).toBeGreaterThan(1);

      // Each chunk should be <= 4096 (send() truncates at 4096)
      for (const call of sends) {
        expect(call.args[1].length).toBeLessThanOrEqual(4096);
      }
    });

    it("splits at newline boundaries when possible", async () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });
      (channel as any).connected = true;

      // Create message with known newline positions
      const part1 = "A".repeat(3800) + "\n";
      const part2 = "B".repeat(100);
      const msg = part1 + part2;

      await channel.sendLong("123", msg);

      const sends = apiCalls.filter((c) => c.method === "sendMessage");
      expect(sends.length).toBe(2);
      // First chunk should end at or before the newline
      expect(sends[0].args[1].length).toBeLessThanOrEqual(3900);
    });

    it("hard-splits when no newlines available", async () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });
      (channel as any).connected = true;

      // Single line longer than MAX_MSG_LEN with no newlines
      const msg = "X".repeat(8000);

      await channel.sendLong("123", msg);

      const sends = apiCalls.filter((c) => c.method === "sendMessage");
      expect(sends.length).toBeGreaterThan(1);
    });
  });

  // =========================================================================
  // send() — Markdown fallback
  // =========================================================================

  describe("send()", () => {
    it("sends with Markdown parse_mode first", async () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });
      (channel as any).connected = true;

      await channel.send("123", "Hello *world*");

      expect(apiCalls.length).toBe(1);
      expect(apiCalls[0].args[2]?.parse_mode).toBe("Markdown");
    });

    it("retries as plain text when Markdown fails", async () => {
      resetMocks();
      apiFailOnMarkdown = true;
      const channel = new TelegramChannel({ token: "123:ABC" });
      (channel as any).connected = true;

      await channel.send("123", "Hello [broken");

      // Should have two calls: failed Markdown + successful plain
      const sends = apiCalls.filter((c) => c.method === "sendMessage");
      expect(sends.length).toBe(1);
      expect(sends[0].args[2]).toBeUndefined(); // no parse_mode
    });

    it("throws when not connected", async () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });

      await expect(channel.send("123", "test")).rejects.toThrow("not connected");
    });

    it("truncates message at 4096 chars", async () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });
      (channel as any).connected = true;

      const longMsg = "X".repeat(5000);
      await channel.send("123", longMsg);

      const sentText = apiCalls[0].args[1];
      expect(sentText.length).toBe(4096);
    });
  });

  // =========================================================================
  // sendTracked()
  // =========================================================================

  describe("sendTracked()", () => {
    it("returns messageId on success", async () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });
      (channel as any).connected = true;

      const result = await channel.sendTracked("123", "Processing...");

      expect(result.messageId).toBeDefined();
      expect(typeof result.messageId).toBe("number");
    });

    it("falls back to plain text and returns messageId", async () => {
      resetMocks();
      apiFailOnMarkdown = true;
      const channel = new TelegramChannel({ token: "123:ABC" });
      (channel as any).connected = true;

      const result = await channel.sendTracked("123", "Processing...");

      expect(result.messageId).toBeDefined();
    });

    it("throws when not connected", async () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });

      await expect(channel.sendTracked("123", "test")).rejects.toThrow("not connected");
    });
  });

  // =========================================================================
  // editMessage()
  // =========================================================================

  describe("editMessage()", () => {
    it("edits with Markdown first", async () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });
      (channel as any).connected = true;

      await channel.editMessage("123", 1, "Updated text");

      expect(apiCalls.length).toBe(1);
      expect(apiCalls[0].method).toBe("editMessageText");
    });

    it("retries as plain text when Markdown fails", async () => {
      resetMocks();
      apiFailOnMarkdown = true;
      const channel = new TelegramChannel({ token: "123:ABC" });
      (channel as any).connected = true;

      await channel.editMessage("123", 1, "Updated text");

      const edits = apiCalls.filter((c) => c.method === "editMessageText");
      expect(edits.length).toBe(1);
      // Plain text edit should succeed (no parse_mode)
      expect(edits[0].args[3]).toBeUndefined();
    });

    it("silently fails when both Markdown and plain text fail", async () => {
      resetMocks();
      apiShouldFail = true;
      const channel = new TelegramChannel({ token: "123:ABC" });
      (channel as any).connected = true;

      // Should not throw
      await channel.editMessage("123", 1, "Updated text");
    });

    it("truncates at 4096 chars", async () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });
      (channel as any).connected = true;

      const longText = "Y".repeat(5000);
      await channel.editMessage("123", 1, longText);

      expect(apiCalls[0].args[2].length).toBe(4096);
    });
  });

  // =========================================================================
  // connect() / disconnect() Lifecycle
  // =========================================================================

  describe("connect/disconnect lifecycle", () => {
    it("connect sets connected to true", async () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });

      expect(channel.isConnected()).toBe(false);
      await channel.connect();
      expect(channel.isConnected()).toBe(true);
    });

    it("connect is idempotent", async () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });

      await channel.connect();
      await channel.connect(); // should not throw

      // deleteWebhook + setMyCommands should only be called once
      expect(mockApi.deleteWebhook).toHaveBeenCalledTimes(1);
      expect(mockApi.setMyCommands).toHaveBeenCalledTimes(1);
    });

    it("connect throws with empty token", async () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "" });

      await expect(channel.connect()).rejects.toThrow("token");
    });

    it("connect deletes existing webhook", async () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });

      await channel.connect();

      expect(mockApi.deleteWebhook).toHaveBeenCalled();
    });

    it("connect registers bot commands", async () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });

      await channel.connect();

      expect(mockApi.setMyCommands).toHaveBeenCalled();
    });

    it("disconnect sets connected to false", async () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });

      await channel.connect();
      expect(channel.isConnected()).toBe(true);

      await channel.disconnect();
      expect(channel.isConnected()).toBe(false);
    });

    it("disconnect is idempotent", async () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });

      await channel.disconnect(); // should not throw when not connected
      expect(channel.isConnected()).toBe(false);
    });
  });

  // =========================================================================
  // sendKeyboard()
  // =========================================================================

  describe("sendKeyboard()", () => {
    it("sends message with inline keyboard", async () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });
      (channel as any).connected = true;

      await channel.sendKeyboard("123", "Pick one:", [
        [{ label: "Option A", data: "/a" }],
        [{ label: "Google", url: "https://google.com" }],
      ]);

      const sends = apiCalls.filter((c) => c.method === "sendMessage");
      expect(sends.length).toBe(1);
      expect(sends[0].args[2]?.reply_markup).toBeDefined();
    });

    it("retries as plain text when Markdown keyboard fails", async () => {
      resetMocks();
      apiFailOnMarkdown = true;
      const channel = new TelegramChannel({ token: "123:ABC" });
      (channel as any).connected = true;

      await channel.sendKeyboard("123", "Pick one:", [
        [{ label: "A", data: "/a" }],
      ]);

      const sends = apiCalls.filter((c) => c.method === "sendMessage");
      expect(sends.length).toBe(1);
      // Plain text fallback should still have reply_markup
      expect(sends[0].args[2]?.reply_markup).toBeDefined();
    });

    it("throws when not connected", async () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });

      await expect(
        channel.sendKeyboard("123", "test", [[{ label: "A", data: "/a" }]]),
      ).rejects.toThrow("not connected");
    });
  });

  // =========================================================================
  // sendTyping() / deleteMessage()
  // =========================================================================

  describe("sendTyping()", () => {
    it("sends typing indicator when connected", async () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });
      (channel as any).connected = true;

      await channel.sendTyping("123");

      expect(apiCalls.some((c) => c.method === "sendChatAction")).toBe(true);
    });

    it("does nothing when not connected", async () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });

      await channel.sendTyping("123"); // should not throw
      expect(apiCalls.length).toBe(0);
    });
  });

  describe("deleteMessage()", () => {
    it("deletes message when connected", async () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });
      (channel as any).connected = true;

      await channel.deleteMessage("123", 42);

      expect(apiCalls.some((c) => c.method === "deleteMessage")).toBe(true);
    });

    it("does nothing when not connected", async () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });

      await channel.deleteMessage("123", 42); // should not throw
      expect(apiCalls.length).toBe(0);
    });
  });

  // =========================================================================
  // sendPhoto / sendDocument / sendVideo / sendAudio / sendVoice
  // =========================================================================

  describe("media sending", () => {
    it("sendPhoto throws when not connected", async () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });

      await expect(channel.sendPhoto("123", "https://example.com/photo.jpg")).rejects.toThrow("not connected");
    });

    it("sendDocument throws when not connected", async () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });

      await expect(channel.sendDocument("123", "/tmp/file.pdf")).rejects.toThrow("not connected");
    });

    it("sendVideo throws when not connected", async () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });

      await expect(channel.sendVideo("123", "/tmp/video.mp4")).rejects.toThrow("not connected");
    });

    it("sendAudio throws when not connected", async () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });

      await expect(channel.sendAudio("123", "/tmp/audio.mp3")).rejects.toThrow("not connected");
    });

    it("sendVoice throws when not connected", async () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });

      await expect(channel.sendVoice("123", "/tmp/voice.ogg")).rejects.toThrow("not connected");
    });

    it("sendPhoto with caption truncates at 1024", async () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });
      (channel as any).connected = true;

      const longCaption = "C".repeat(2000);
      await channel.sendPhoto("123", "https://example.com/photo.jpg", longCaption);

      const call = apiCalls.find((c) => c.method === "sendPhoto");
      expect(call).toBeDefined();
      expect(call!.args[2]?.caption.length).toBe(1024);
    });
  });

  // =========================================================================
  // Handler Error Isolation
  // =========================================================================

  describe("handler error isolation", () => {
    it("catches errors in message handlers without crashing", () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });

      const received: string[] = [];

      // First handler throws
      channel.onMessage(() => {
        throw new Error("handler crash");
      });

      // Second handler should still fire
      channel.onMessage((_from, text) => {
        received.push(text);
      });

      fireHandler("message:text", makeTextCtx("test"));

      expect(received).toEqual(["test"]);
    });

    it("catches errors in callback handlers without crashing", async () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });

      const received: string[] = [];

      channel.onMessage(() => {
        throw new Error("callback crash");
      });

      channel.onMessage((_from, text) => {
        received.push(text);
      });

      const ctx = makeCallbackCtx("/test");
      await fireHandler("callback_query:data", ctx);

      expect(received).toEqual(["/test"]);
    });
  });

  // =========================================================================
  // Multiple Handlers
  // =========================================================================

  describe("multiple handlers", () => {
    it("calls all registered handlers in order", () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });

      const order: number[] = [];
      channel.onMessage(() => order.push(1));
      channel.onMessage(() => order.push(2));
      channel.onMessage(() => order.push(3));

      fireHandler("message:text", makeTextCtx("test"));

      expect(order).toEqual([1, 2, 3]);
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================

  describe("edge cases", () => {
    it("sendLong with empty string sends empty message", async () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });
      (channel as any).connected = true;

      await channel.sendLong("123", "");

      // splitMessage("", 3900) returns [""] — one empty message
      const sends = apiCalls.filter((c) => c.method === "sendMessage");
      expect(sends.length).toBe(1);
      expect(sends[0].args[1]).toBe("");
    });

    it("sendLong with message exactly at MAX_MSG_LEN sends single chunk", async () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });
      (channel as any).connected = true;

      const msg = "A".repeat(3900);
      await channel.sendLong("123", msg);

      const sends = apiCalls.filter((c) => c.method === "sendMessage");
      expect(sends.length).toBe(1);
    });

    it("handles document without file_name gracefully", () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });

      let text = "";
      channel.onMessage((_from, t) => { text = t; });

      const ctx = makeDocumentCtx();
      ctx.message.document.file_name = undefined;
      fireHandler("message:document", ctx);

      expect(text).toBe("[document: file]");
    });

    it("handles sticker without emoji", () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });

      let text = "";
      channel.onMessage((_from, t) => { text = t; });

      fireHandler("message:sticker", makeStickerCtx({ emoji: undefined as any }));

      expect(text).toContain("sticker");
    });

    it("converts chatId to Number for API calls", async () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });
      (channel as any).connected = true;

      await channel.send("456", "test");

      expect(apiCalls[0].args[0]).toBe(456);
      expect(typeof apiCalls[0].args[0]).toBe("number");
    });

    it("multiple onMessage handlers can coexist", () => {
      resetMocks();
      const channel = new TelegramChannel({ token: "123:ABC" });

      const results: string[] = [];
      channel.onMessage((from) => results.push(`a:${from}`));
      channel.onMessage((from) => results.push(`b:${from}`));

      fireHandler("message:text", makeTextCtx("hi", { userId: 42 }));

      expect(results).toEqual(["a:42", "b:42"]);
    });
  });
});
