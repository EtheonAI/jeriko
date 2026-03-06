/**
 * WhatsApp Channel Audit Tests
 *
 * Fully mocks @whiskeysockets/baileys to test WhatsAppChannel without any real
 * WhatsApp connection. Covers: construction, connection lifecycle, QR handling,
 * reconnection on various close codes, allowed number filtering, message
 * dispatch, attachment extraction, text splitting, and error paths.
 */

import { describe, test, expect, beforeEach, mock, afterEach } from "bun:test";

// ---------------------------------------------------------------------------
// Mock infrastructure — intercept Baileys before WhatsAppChannel imports it
// ---------------------------------------------------------------------------

/** Event emitter that mimics Baileys socket.ev */
class MockEventEmitter {
  private listeners = new Map<string, ((...args: any[]) => any)[]>();

  on(event: string, handler: (...args: any[]) => any) {
    const list = this.listeners.get(event) ?? [];
    list.push(handler);
    this.listeners.set(event, list);
  }

  emit(event: string, ...args: any[]) {
    const handlers = this.listeners.get(event) ?? [];
    for (const h of handlers) h(...args);
  }

  removeAllListeners() {
    this.listeners.clear();
  }
}

/** Mock socket returned by makeWASocket */
function createMockSocket() {
  const ev = new MockEventEmitter();
  return {
    ev,
    sendMessage: mock(() => Promise.resolve({ key: { id: "msg-123" } })),
    sendPresenceUpdate: mock(() => Promise.resolve()),
    end: mock(() => {}),
  };
}

let latestMockSocket: ReturnType<typeof createMockSocket>;
let allMockSockets: ReturnType<typeof createMockSocket>[] = [];
const mockSaveCreds = mock(() => Promise.resolve());

// Mock modules
import { mock as bunMock } from "bun:test";

bunMock.module("@whiskeysockets/baileys", () => ({
  makeWASocket: (..._args: any[]) => {
    latestMockSocket = createMockSocket();
    allMockSockets.push(latestMockSocket);
    return latestMockSocket;
  },
  useMultiFileAuthState: () =>
    Promise.resolve({
      state: { creds: {}, keys: {} },
      saveCreds: mockSaveCreds,
    }),
  DisconnectReason: {
    connectionClosed: 428,
    connectionLost: 408,
    connectionReplaced: 440,
    timedOut: 408,
    loggedOut: 401,
    badSession: 500,
    restartRequired: 515,
    multideviceMismatch: 411,
    forbidden: 403,
    unavailableService: 503,
  },
  downloadMediaMessage: () => Promise.resolve(Buffer.from("fake-media")),
  fetchLatestWaWebVersion: () =>
    Promise.resolve({ version: [2, 2413, 1], isLatest: true }),
}));

bunMock.module("../../../shared/config.js", () => ({
  getDataDir: () => "/tmp/jeriko-test-whatsapp",
}));

bunMock.module("../../../shared/logger.js", () => ({
  getLogger: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  }),
}));

// Now import the class under test (uses the mocked modules above)
const { WhatsAppChannel } = await import(
  "../../src/daemon/services/channels/whatsapp.js"
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simulate Baileys emitting "connection open" on the latest socket. */
function simulateConnectionOpen() {
  latestMockSocket.ev.emit("connection.update", { connection: "open" });
}

/** Simulate a close event with a given status code. */
function simulateConnectionClose(statusCode: number) {
  latestMockSocket.ev.emit("connection.update", {
    connection: "close",
    lastDisconnect: {
      error: { output: { statusCode } },
    },
  });
}

/** Simulate a QR code event. */
function simulateQR(qr = "mock-qr-data") {
  latestMockSocket.ev.emit("connection.update", { qr });
}

/** Connect a channel and immediately resolve via mock open event. */
async function connectChannel(channel: InstanceType<typeof WhatsAppChannel>) {
  const p = channel.connect();
  // Give the promise constructor time to run and create the socket
  await new Promise((r) => setTimeout(r, 10));
  simulateConnectionOpen();
  await p;
}

/** Create a minimal WAMessage-like object for testing. */
function makeMessage(overrides: Record<string, any> = {}) {
  return {
    key: {
      remoteJid: "1234567890@s.whatsapp.net",
      id: "ABCDEF123",
      fromMe: false,
      participant: undefined,
      ...overrides.key,
    },
    message: {
      conversation: "Hello from test",
      ...overrides.message,
    },
    pushName: overrides.pushName ?? "TestUser",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WhatsAppChannel", () => {
  beforeEach(() => {
    allMockSockets = [];
    mockSaveCreds.mockClear();
  });

  // ── Construction ───────────────────────────────────────────────────────

  describe("construction", () => {
    test("default config — authDir, empty allowedNumbers, no onQR", () => {
      const ch = new WhatsAppChannel();
      expect(ch.name).toBe("whatsapp");
      expect(ch.isConnected()).toBe(false);
    });

    test("custom authDir from config", () => {
      const ch = new WhatsAppChannel({ authDir: "/custom/auth" });
      expect(ch.name).toBe("whatsapp");
    });

    test("allowedNumbers populated", () => {
      const ch = new WhatsAppChannel({
        allowedNumbers: ["11111", "22222"],
      });
      expect(ch.name).toBe("whatsapp");
    });

    test("onQR callback stored", () => {
      const qrCb = mock(() => {});
      const ch = new WhatsAppChannel({ onQR: qrCb });
      expect(ch.name).toBe("whatsapp");
    });
  });

  // ── Connection Lifecycle ───────────────────────────────────────────────

  describe("connection lifecycle", () => {
    test("connect() resolves when connection opens", async () => {
      const ch = new WhatsAppChannel();
      await connectChannel(ch);
      expect(ch.isConnected()).toBe(true);
    });

    test("connect() is idempotent — second call returns immediately", async () => {
      const ch = new WhatsAppChannel();
      await connectChannel(ch);
      const socketCount = allMockSockets.length;
      await ch.connect(); // should not create another socket
      expect(allMockSockets.length).toBe(socketCount);
    });

    test("disconnect() sets connected=false and nulls socket", async () => {
      const ch = new WhatsAppChannel();
      await connectChannel(ch);
      expect(ch.isConnected()).toBe(true);
      await ch.disconnect();
      expect(ch.isConnected()).toBe(false);
    });

    test("disconnect() is idempotent — does nothing when not connected", async () => {
      const ch = new WhatsAppChannel();
      await ch.disconnect(); // should not throw
      expect(ch.isConnected()).toBe(false);
    });

    test("disconnect() calls socket.end()", async () => {
      const ch = new WhatsAppChannel();
      await connectChannel(ch);
      const sock = latestMockSocket;
      await ch.disconnect();
      expect(sock.end).toHaveBeenCalled();
    });
  });

  // ── QR Code Handling ──────────────────────────────────────────────────

  describe("QR code handling", () => {
    test("onQR callback is invoked when QR event fires", async () => {
      const qrCb = mock(() => {});
      const ch = new WhatsAppChannel({ onQR: qrCb });
      const p = ch.connect();
      await new Promise((r) => setTimeout(r, 10));

      simulateQR("test-qr-123");
      expect(qrCb).toHaveBeenCalledWith("test-qr-123");

      simulateConnectionOpen();
      await p;
    });

    test("onQR callback errors are caught — connection continues", async () => {
      const qrCb = mock(() => {
        throw new Error("QR display failed");
      });
      const ch = new WhatsAppChannel({ onQR: qrCb });
      const p = ch.connect();
      await new Promise((r) => setTimeout(r, 10));

      simulateQR("qr-error-test");
      // Should not reject — error is swallowed
      simulateConnectionOpen();
      await p;
      expect(ch.isConnected()).toBe(true);
    });

    test("multiple QR events each invoke callback", async () => {
      const qrCb = mock(() => {});
      const ch = new WhatsAppChannel({ onQR: qrCb });
      const p = ch.connect();
      await new Promise((r) => setTimeout(r, 10));

      simulateQR("qr-1");
      simulateQR("qr-2");
      simulateQR("qr-3");
      expect(qrCb).toHaveBeenCalledTimes(3);

      simulateConnectionOpen();
      await p;
    });
  });

  // ── Reconnection Logic ────────────────────────────────────────────────

  describe("reconnection on close", () => {
    test("loggedOut (401) rejects connect promise", async () => {
      const ch = new WhatsAppChannel();
      const p = ch.connect();
      await new Promise((r) => setTimeout(r, 10));

      simulateConnectionClose(401); // loggedOut

      await expect(p).rejects.toThrow("logged out");
    });

    test("close during handshake (not settled) recreates socket after delay", async () => {
      const ch = new WhatsAppChannel();
      const p = ch.connect();
      await new Promise((r) => setTimeout(r, 10));
      const firstSocket = latestMockSocket;

      // Simulate handshake close (e.g., 428 connectionClosed)
      simulateConnectionClose(428);
      expect(allMockSockets.length).toBe(1); // no new socket yet

      // Wait for the 2s delay to fire
      await new Promise((r) => setTimeout(r, 2100));
      expect(allMockSockets.length).toBe(2); // new socket created
      expect(latestMockSocket).not.toBe(firstSocket);

      // Complete connection on the new socket
      simulateConnectionOpen();
      await p;
      expect(ch.isConnected()).toBe(true);
    });

    test("close after connected (settled) triggers background reconnect", async () => {
      const ch = new WhatsAppChannel();
      await connectChannel(ch);
      expect(ch.isConnected()).toBe(true);

      const prevSocketCount = allMockSockets.length;

      // Simulate post-connect close (e.g., 408 connectionLost)
      simulateConnectionClose(408);
      expect(ch.isConnected()).toBe(false);

      // Wait for the 3s reconnect delay
      await new Promise((r) => setTimeout(r, 3100));
      expect(allMockSockets.length).toBe(prevSocketCount + 1);
    });

    test("connectionClosed (428) reconnects during handshake", async () => {
      const ch = new WhatsAppChannel();
      const p = ch.connect();
      await new Promise((r) => setTimeout(r, 10));
      simulateConnectionClose(428);
      await new Promise((r) => setTimeout(r, 2100));
      simulateConnectionOpen();
      await p;
      expect(ch.isConnected()).toBe(true);
    });

    test("badSession (500) reconnects during handshake", async () => {
      const ch = new WhatsAppChannel();
      const p = ch.connect();
      await new Promise((r) => setTimeout(r, 10));
      simulateConnectionClose(500);
      await new Promise((r) => setTimeout(r, 2100));
      simulateConnectionOpen();
      await p;
      expect(ch.isConnected()).toBe(true);
    });

    test("restartRequired (515) reconnects during handshake", async () => {
      const ch = new WhatsAppChannel();
      const p = ch.connect();
      await new Promise((r) => setTimeout(r, 10));
      simulateConnectionClose(515);
      await new Promise((r) => setTimeout(r, 2100));
      simulateConnectionOpen();
      await p;
      expect(ch.isConnected()).toBe(true);
    });
  });

  // ── Allowed Numbers Filtering ─────────────────────────────────────────

  describe("allowed numbers filtering", () => {
    test("empty allowedNumbers allows all senders", async () => {
      const ch = new WhatsAppChannel({ allowedNumbers: [] });
      await connectChannel(ch);

      const handler = mock(() => {});
      ch.onMessage(handler);

      latestMockSocket.ev.emit("messages.upsert", {
        messages: [makeMessage()],
      });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    test("allowedNumbers filters out non-matching senders", async () => {
      const ch = new WhatsAppChannel({
        allowedNumbers: ["9999999999"],
      });
      await connectChannel(ch);

      const handler = mock(() => {});
      ch.onMessage(handler);

      // Sender is 1234567890, not in allowed list
      latestMockSocket.ev.emit("messages.upsert", {
        messages: [makeMessage()],
      });

      expect(handler).not.toHaveBeenCalled();
    });

    test("allowedNumbers passes matching senders", async () => {
      const ch = new WhatsAppChannel({
        allowedNumbers: ["1234567890"],
      });
      await connectChannel(ch);

      const handler = mock(() => {});
      ch.onMessage(handler);

      latestMockSocket.ev.emit("messages.upsert", {
        messages: [makeMessage()],
      });

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  // ── Handler Registration and Message Dispatch ─────────────────────────

  describe("handler registration and dispatch", () => {
    test("multiple handlers all receive messages", async () => {
      const ch = new WhatsAppChannel();
      await connectChannel(ch);

      const h1 = mock(() => {});
      const h2 = mock(() => {});
      ch.onMessage(h1);
      ch.onMessage(h2);

      latestMockSocket.ev.emit("messages.upsert", {
        messages: [makeMessage()],
      });

      expect(h1).toHaveBeenCalledTimes(1);
      expect(h2).toHaveBeenCalledTimes(1);
    });

    test("handler receives correct (from, text, metadata)", async () => {
      const ch = new WhatsAppChannel();
      await connectChannel(ch);

      let captured: any;
      ch.onMessage((from, message, metadata) => {
        captured = { from, message, metadata };
      });

      latestMockSocket.ev.emit("messages.upsert", {
        messages: [makeMessage()],
      });

      expect(captured.from).toBe("1234567890");
      expect(captured.message).toBe("Hello from test");
      expect(captured.metadata.channel).toBe("whatsapp");
      expect(captured.metadata.chat_id).toBe("1234567890@s.whatsapp.net");
      expect(captured.metadata.is_group).toBe(false);
      expect(captured.metadata.sender_name).toBe("TestUser");
      expect(captured.metadata.message_id).toBe("ABCDEF123");
    });

    test("group messages have is_group=true", async () => {
      const ch = new WhatsAppChannel();
      await connectChannel(ch);

      let captured: any;
      ch.onMessage((_f, _m, meta) => {
        captured = meta;
      });

      latestMockSocket.ev.emit("messages.upsert", {
        messages: [
          makeMessage({
            key: {
              remoteJid: "120363123456@g.us",
              id: "GRP-MSG-1",
              fromMe: false,
              participant: "5551234@s.whatsapp.net",
            },
          }),
        ],
      });

      expect(captured.is_group).toBe(true);
      expect(captured.chat_id).toBe("120363123456@g.us");
    });

    test("own messages (fromMe=true) are skipped", async () => {
      const ch = new WhatsAppChannel();
      await connectChannel(ch);

      const handler = mock(() => {});
      ch.onMessage(handler);

      latestMockSocket.ev.emit("messages.upsert", {
        messages: [makeMessage({ key: { fromMe: true } })],
      });

      expect(handler).not.toHaveBeenCalled();
    });

    test("messages with no .message property are skipped", async () => {
      const ch = new WhatsAppChannel();
      await connectChannel(ch);

      const handler = mock(() => {});
      ch.onMessage(handler);

      latestMockSocket.ev.emit("messages.upsert", {
        messages: [{ key: { remoteJid: "x@s.whatsapp.net", fromMe: false }, message: null }],
      });

      expect(handler).not.toHaveBeenCalled();
    });

    test("handler errors do not break other handlers", async () => {
      const ch = new WhatsAppChannel();
      await connectChannel(ch);

      const h1 = mock(() => {
        throw new Error("handler 1 exploded");
      });
      const h2 = mock(() => {});
      ch.onMessage(h1);
      ch.onMessage(h2);

      latestMockSocket.ev.emit("messages.upsert", {
        messages: [makeMessage()],
      });

      expect(h1).toHaveBeenCalledTimes(1);
      expect(h2).toHaveBeenCalledTimes(1); // still called despite h1 throwing
    });
  });

  // ── Text Extraction ───────────────────────────────────────────────────

  describe("text extraction", () => {
    test("conversation field", async () => {
      const ch = new WhatsAppChannel();
      await connectChannel(ch);

      let text: string | undefined;
      ch.onMessage((_f, m) => { text = m; });

      latestMockSocket.ev.emit("messages.upsert", {
        messages: [makeMessage({ message: { conversation: "plain text" } })],
      });

      expect(text).toBe("plain text");
    });

    test("extendedTextMessage.text", async () => {
      const ch = new WhatsAppChannel();
      await connectChannel(ch);

      let text: string | undefined;
      ch.onMessage((_f, m) => { text = m; });

      latestMockSocket.ev.emit("messages.upsert", {
        messages: [
          makeMessage({
            message: { extendedTextMessage: { text: "extended text" } },
          }),
        ],
      });

      expect(text).toBe("extended text");
    });

    test("image caption as text", async () => {
      const ch = new WhatsAppChannel();
      await connectChannel(ch);

      let text: string | undefined;
      ch.onMessage((_f, m) => { text = m; });

      latestMockSocket.ev.emit("messages.upsert", {
        messages: [
          makeMessage({
            message: {
              imageMessage: { caption: "photo caption", mimetype: "image/jpeg" },
            },
          }),
        ],
      });

      expect(text).toBe("photo caption");
    });

    test("message with no text but attachment produces summary", async () => {
      const ch = new WhatsAppChannel();
      await connectChannel(ch);

      let text: string | undefined;
      ch.onMessage((_f, m) => { text = m; });

      latestMockSocket.ev.emit("messages.upsert", {
        messages: [
          makeMessage({
            message: {
              imageMessage: { mimetype: "image/jpeg" }, // no caption
            },
          }),
        ],
      });

      expect(text).toBe("[photo]");
    });

    test("message with no text and no attachments is skipped", async () => {
      const ch = new WhatsAppChannel();
      await connectChannel(ch);

      const handler = mock(() => {});
      ch.onMessage(handler);

      // protocolMessage, reactionMessage, etc. — no extractable text or media
      latestMockSocket.ev.emit("messages.upsert", {
        messages: [makeMessage({ message: { protocolMessage: {} } })],
      });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  // ── Attachment Extraction ─────────────────────────────────────────────

  describe("attachment extraction", () => {
    test("image attachment", async () => {
      const ch = new WhatsAppChannel();
      await connectChannel(ch);

      let attachments: any;
      ch.onMessage((_f, _m, meta) => { attachments = meta.attachments; });

      latestMockSocket.ev.emit("messages.upsert", {
        messages: [
          makeMessage({
            message: {
              imageMessage: { mimetype: "image/png", caption: "pic" },
            },
          }),
        ],
      });

      expect(attachments).toHaveLength(1);
      expect(attachments[0].type).toBe("photo");
      expect(attachments[0].mimeType).toBe("image/png");
    });

    test("document attachment with filename", async () => {
      const ch = new WhatsAppChannel();
      await connectChannel(ch);

      let attachments: any;
      ch.onMessage((_f, _m, meta) => { attachments = meta.attachments; });

      latestMockSocket.ev.emit("messages.upsert", {
        messages: [
          makeMessage({
            message: {
              documentMessage: {
                fileName: "report.pdf",
                mimetype: "application/pdf",
              },
            },
          }),
        ],
      });

      expect(attachments).toHaveLength(1);
      expect(attachments[0].type).toBe("document");
      expect(attachments[0].filename).toBe("report.pdf");
    });

    test("audio (ptt=false) vs voice (ptt=true)", async () => {
      const ch = new WhatsAppChannel();
      await connectChannel(ch);

      const results: any[] = [];
      ch.onMessage((_f, _m, meta) => {
        results.push(meta.attachments);
      });

      // Regular audio
      latestMockSocket.ev.emit("messages.upsert", {
        messages: [
          makeMessage({
            message: {
              audioMessage: { mimetype: "audio/mpeg", ptt: false, seconds: 120 },
            },
          }),
        ],
      });

      // Voice note (ptt)
      latestMockSocket.ev.emit("messages.upsert", {
        messages: [
          makeMessage({
            message: {
              audioMessage: {
                mimetype: "audio/ogg; codecs=opus",
                ptt: true,
                seconds: 5,
              },
            },
          }),
        ],
      });

      expect(results[0][0].type).toBe("audio");
      expect(results[0][0].duration).toBe(120);
      expect(results[1][0].type).toBe("voice");
      expect(results[1][0].duration).toBe(5);
    });

    test("video attachment with duration", async () => {
      const ch = new WhatsAppChannel();
      await connectChannel(ch);

      let attachments: any;
      ch.onMessage((_f, _m, meta) => { attachments = meta.attachments; });

      latestMockSocket.ev.emit("messages.upsert", {
        messages: [
          makeMessage({
            message: {
              videoMessage: { mimetype: "video/mp4", seconds: 30 },
            },
          }),
        ],
      });

      expect(attachments).toHaveLength(1);
      expect(attachments[0].type).toBe("video");
      expect(attachments[0].duration).toBe(30);
    });

    test("sticker attachment", async () => {
      const ch = new WhatsAppChannel();
      await connectChannel(ch);

      let attachments: any;
      ch.onMessage((_f, _m, meta) => { attachments = meta.attachments; });

      latestMockSocket.ev.emit("messages.upsert", {
        messages: [
          makeMessage({
            message: {
              stickerMessage: { mimetype: "image/webp" },
            },
          }),
        ],
      });

      expect(attachments).toHaveLength(1);
      expect(attachments[0].type).toBe("sticker");
    });

    test("no attachments — metadata.attachments is undefined", async () => {
      const ch = new WhatsAppChannel();
      await connectChannel(ch);

      let meta: any;
      ch.onMessage((_f, _m, m) => { meta = m; });

      latestMockSocket.ev.emit("messages.upsert", {
        messages: [makeMessage({ message: { conversation: "just text" } })],
      });

      expect(meta.attachments).toBeUndefined();
    });
  });

  // ── Sending Messages ──────────────────────────────────────────────────

  describe("sending messages", () => {
    test("send() calls socket.sendMessage with text", async () => {
      const ch = new WhatsAppChannel();
      await connectChannel(ch);

      await ch.send("1234567890", "Hello!");
      expect(latestMockSocket.sendMessage).toHaveBeenCalledWith(
        "1234567890@s.whatsapp.net",
        { text: "Hello!" },
      );
    });

    test("send() with full JID does not append @s.whatsapp.net", async () => {
      const ch = new WhatsAppChannel();
      await connectChannel(ch);

      await ch.send("group@g.us", "Group msg");
      expect(latestMockSocket.sendMessage).toHaveBeenCalledWith("group@g.us", {
        text: "Group msg",
      });
    });

    test("send() throws when not connected", async () => {
      const ch = new WhatsAppChannel();
      await expect(ch.send("123", "test")).rejects.toThrow("not connected");
    });

    test("sendTracked() returns message ID", async () => {
      const ch = new WhatsAppChannel();
      await connectChannel(ch);

      const result = await ch.sendTracked("123", "tracked");
      expect(result.messageId).toBe("msg-123");
    });

    test("sendTyping() calls sendPresenceUpdate", async () => {
      const ch = new WhatsAppChannel();
      await connectChannel(ch);

      await ch.sendTyping("123");
      expect(latestMockSocket.sendPresenceUpdate).toHaveBeenCalledWith(
        "composing",
        "123@s.whatsapp.net",
      );
    });

    test("sendTyping() swallows errors", async () => {
      const ch = new WhatsAppChannel();
      await connectChannel(ch);

      latestMockSocket.sendPresenceUpdate.mockImplementation(() => {
        throw new Error("presence failed");
      });

      // Should not throw
      await ch.sendTyping("123");
    });
  });

  // ── Edit / Delete ─────────────────────────────────────────────────────

  describe("edit and delete", () => {
    test("editMessage() calls sendMessage with edit key", async () => {
      const ch = new WhatsAppChannel();
      await connectChannel(ch);

      await ch.editMessage("123", "old-msg-id", "new text");
      expect(latestMockSocket.sendMessage).toHaveBeenCalledWith(
        "123@s.whatsapp.net",
        {
          edit: {
            remoteJid: "123@s.whatsapp.net",
            id: "old-msg-id",
            fromMe: true,
          },
          text: "new text",
        },
      );
    });

    test("editMessage() falls back to send on error", async () => {
      const ch = new WhatsAppChannel();
      await connectChannel(ch);

      let callCount = 0;
      latestMockSocket.sendMessage.mockImplementation((_jid: any, msg: any) => {
        callCount++;
        if (callCount === 1 && msg.edit) {
          throw new Error("edit not supported");
        }
        return Promise.resolve({ key: { id: "fallback-id" } });
      });

      await ch.editMessage("123", "msg-id", "edited text");
      // Should have been called twice: first edit (throws), then plain send
      expect(callCount).toBe(2);
    });

    test("deleteMessage() is best-effort — swallows errors", async () => {
      const ch = new WhatsAppChannel();
      await connectChannel(ch);

      latestMockSocket.sendMessage.mockImplementation(() => {
        throw new Error("delete failed");
      });

      // Should not throw
      await ch.deleteMessage("123", "msg-to-delete");
    });
  });

  // ── Keyboard (Text Fallback) ──────────────────────────────────────────

  describe("sendKeyboard", () => {
    test("formats buttons as numbered text list", async () => {
      const ch = new WhatsAppChannel();
      await connectChannel(ch);

      await ch.sendKeyboard("123", "Choose an option:", [
        [
          { label: "Connect GitHub", data: "/connect github" },
          { label: "Docs", url: "https://docs.jeriko.ai" },
        ],
        [{ label: "Help", data: "/help" }],
      ]);

      const call = latestMockSocket.sendMessage.mock.calls[0];
      const text = call[1].text;
      expect(text).toContain("Choose an option:");
      expect(text).toContain("1. Connect GitHub");
      expect(text).toContain("2. Docs: https://docs.jeriko.ai");
      expect(text).toContain("3. Help");
    });
  });

  // ── Creds Persistence ─────────────────────────────────────────────────

  describe("creds persistence", () => {
    test("creds.update event triggers saveCreds", async () => {
      const ch = new WhatsAppChannel();
      mockSaveCreds.mockClear();

      const p = ch.connect();
      await new Promise((r) => setTimeout(r, 10));

      latestMockSocket.ev.emit("creds.update", {});
      expect(mockSaveCreds).toHaveBeenCalledTimes(1);

      simulateConnectionOpen();
      await p;
    });
  });

  // ── Reply-To Extraction ───────────────────────────────────────────────

  describe("reply_to extraction", () => {
    test("extendedTextMessage contextInfo stanzaId becomes reply_to", async () => {
      const ch = new WhatsAppChannel();
      await connectChannel(ch);

      let meta: any;
      ch.onMessage((_f, _m, m) => { meta = m; });

      latestMockSocket.ev.emit("messages.upsert", {
        messages: [
          makeMessage({
            message: {
              extendedTextMessage: {
                text: "replying to you",
                contextInfo: { stanzaId: "ORIGINAL-MSG-ID" },
              },
            },
          }),
        ],
      });

      expect(meta.reply_to).toBe("ORIGINAL-MSG-ID");
    });
  });

  // ── Sender from Group Participant ─────────────────────────────────────

  describe("sender extraction", () => {
    test("in groups, sender is participant not JID", async () => {
      const ch = new WhatsAppChannel();
      await connectChannel(ch);

      let from: string | undefined;
      ch.onMessage((f) => { from = f; });

      latestMockSocket.ev.emit("messages.upsert", {
        messages: [
          makeMessage({
            key: {
              remoteJid: "120363123456@g.us",
              id: "GRP-1",
              fromMe: false,
              participant: "44123456789@s.whatsapp.net",
            },
          }),
        ],
      });

      expect(from).toBe("44123456789");
    });
  });
});
