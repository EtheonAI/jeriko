// Channel adapter unit tests — iMessage (BlueBubbles) and Google Chat.
//
// Tests the adapter classes directly. Verifies all ChannelAdapter methods
// produce correct behavior without requiring live external services.

import { describe, expect, it, mock } from "bun:test";

// ---------------------------------------------------------------------------
// iMessage (BlueBubbles) Adapter Tests
// ---------------------------------------------------------------------------

describe("IMessageChannel adapter", () => {
  it("has correct name", async () => {
    const { IMessageChannel } = await import(
      "../../src/daemon/services/channels/imessage.js"
    );
    const adapter = new IMessageChannel({
      serverUrl: "http://localhost:1234",
      password: "test-pass",
    });
    expect(adapter.name).toBe("imessage");
  });

  it("reports disconnected initially", async () => {
    const { IMessageChannel } = await import(
      "../../src/daemon/services/channels/imessage.js"
    );
    const adapter = new IMessageChannel({
      serverUrl: "http://localhost:1234",
      password: "test-pass",
    });
    expect(adapter.isConnected()).toBe(false);
  });

  it("throws on send when not connected", async () => {
    const { IMessageChannel } = await import(
      "../../src/daemon/services/channels/imessage.js"
    );
    const adapter = new IMessageChannel({
      serverUrl: "http://localhost:1234",
      password: "test-pass",
    });
    await expect(adapter.send("+15551234567", "hello")).rejects.toThrow("not connected");
  });

  it("throws on sendLong when not connected", async () => {
    const { IMessageChannel } = await import(
      "../../src/daemon/services/channels/imessage.js"
    );
    const adapter = new IMessageChannel({
      serverUrl: "http://localhost:1234",
      password: "test-pass",
    });
    await expect(adapter.sendLong("+15551234567", "hello")).rejects.toThrow("not connected");
  });

  it("throws on sendTracked when not connected", async () => {
    const { IMessageChannel } = await import(
      "../../src/daemon/services/channels/imessage.js"
    );
    const adapter = new IMessageChannel({
      serverUrl: "http://localhost:1234",
      password: "test-pass",
    });
    await expect(adapter.sendTracked("+15551234567", "hello")).rejects.toThrow("not connected");
  });

  it("throws on sendPhoto when not connected", async () => {
    const { IMessageChannel } = await import(
      "../../src/daemon/services/channels/imessage.js"
    );
    const adapter = new IMessageChannel({
      serverUrl: "http://localhost:1234",
      password: "test-pass",
    });
    await expect(adapter.sendPhoto("+15551234567", "/tmp/test.png")).rejects.toThrow("not connected");
  });

  it("throws on downloadFile when not connected", async () => {
    const { IMessageChannel } = await import(
      "../../src/daemon/services/channels/imessage.js"
    );
    const adapter = new IMessageChannel({
      serverUrl: "http://localhost:1234",
      password: "test-pass",
    });
    await expect(adapter.downloadFile("att-guid")).rejects.toThrow("not connected");
  });

  it("accepts onMessage handlers", async () => {
    const { IMessageChannel } = await import(
      "../../src/daemon/services/channels/imessage.js"
    );
    const adapter = new IMessageChannel({
      serverUrl: "http://localhost:1234",
      password: "test-pass",
    });
    const handler = mock(() => {});
    adapter.onMessage(handler);
    expect(handler).not.toHaveBeenCalled();
  });

  it("handleWebhookEvent dispatches new-message to handlers", async () => {
    const { IMessageChannel } = await import(
      "../../src/daemon/services/channels/imessage.js"
    );
    const adapter = new IMessageChannel({
      serverUrl: "http://localhost:1234",
      password: "test-pass",
    });

    const received: any[] = [];
    adapter.onMessage((from, msg, meta) => {
      received.push({ from, msg, meta });
    });

    adapter.handleWebhookEvent({
      type: "new-message",
      data: {
        isFromMe: false,
        text: "Hello Jeriko",
        chats: [{ guid: "iMessage;-;+15551234567" }],
        handle: { address: "+15551234567", displayName: "John" },
        guid: "msg-guid-123",
      },
    });

    expect(received.length).toBe(1);
    expect(received[0].msg).toBe("Hello Jeriko");
    expect(received[0].meta.channel).toBe("imessage");
    expect(received[0].meta.chat_id).toBe("iMessage;-;+15551234567");
    expect(received[0].meta.is_group).toBe(false);
    expect(received[0].meta.sender_name).toBe("John");
  });

  it("handleWebhookEvent skips outgoing messages", async () => {
    const { IMessageChannel } = await import(
      "../../src/daemon/services/channels/imessage.js"
    );
    const adapter = new IMessageChannel({
      serverUrl: "http://localhost:1234",
      password: "test-pass",
    });

    const received: any[] = [];
    adapter.onMessage((from, msg, meta) => {
      received.push({ from, msg, meta });
    });

    adapter.handleWebhookEvent({
      type: "new-message",
      data: {
        isFromMe: true,
        text: "sent by us",
        chats: [{ guid: "iMessage;-;+15551234567" }],
        handle: { address: "+15551234567" },
      },
    });

    expect(received.length).toBe(0);
  });

  it("handleWebhookEvent detects group chats", async () => {
    const { IMessageChannel } = await import(
      "../../src/daemon/services/channels/imessage.js"
    );
    const adapter = new IMessageChannel({
      serverUrl: "http://localhost:1234",
      password: "test-pass",
    });

    const received: any[] = [];
    adapter.onMessage((from, msg, meta) => {
      received.push({ from, msg, meta });
    });

    adapter.handleWebhookEvent({
      type: "new-message",
      data: {
        isFromMe: false,
        text: "group msg",
        chats: [{ guid: "iMessage;+;chat123456" }],
        handle: { address: "+15551234567" },
      },
    });

    expect(received[0].meta.is_group).toBe(true);
  });

  it("handleWebhookEvent respects allowedAddresses filter", async () => {
    const { IMessageChannel } = await import(
      "../../src/daemon/services/channels/imessage.js"
    );
    const adapter = new IMessageChannel({
      serverUrl: "http://localhost:1234",
      password: "test-pass",
      allowedAddresses: ["+15559999999"],
    });

    const received: any[] = [];
    adapter.onMessage((from, msg) => received.push(msg));

    adapter.handleWebhookEvent({
      type: "new-message",
      data: {
        isFromMe: false,
        text: "blocked",
        chats: [{ guid: "iMessage;-;+15551234567" }],
        handle: { address: "+15551234567" },
      },
    });

    expect(received.length).toBe(0);
  });

  it("handleWebhookEvent extracts attachments", async () => {
    const { IMessageChannel } = await import(
      "../../src/daemon/services/channels/imessage.js"
    );
    const adapter = new IMessageChannel({
      serverUrl: "http://localhost:1234",
      password: "test-pass",
    });

    const received: any[] = [];
    adapter.onMessage((from, msg, meta) => received.push(meta));

    adapter.handleWebhookEvent({
      type: "new-message",
      data: {
        isFromMe: false,
        text: "check this",
        chats: [{ guid: "iMessage;-;+15551234567" }],
        handle: { address: "+15551234567" },
        attachments: [
          { guid: "att-1", mimeType: "image/jpeg", transferName: "photo.jpg" },
          { guid: "att-2", mimeType: "video/mp4", transferName: "video.mp4" },
        ],
      },
    });

    expect(received[0].attachments.length).toBe(2);
    expect(received[0].attachments[0].type).toBe("photo");
    expect(received[0].attachments[0].fileId).toBe("att-1");
    expect(received[0].attachments[1].type).toBe("video");
  });

  it("ignores non new-message events", async () => {
    const { IMessageChannel } = await import(
      "../../src/daemon/services/channels/imessage.js"
    );
    const adapter = new IMessageChannel({
      serverUrl: "http://localhost:1234",
      password: "test-pass",
    });

    const received: any[] = [];
    adapter.onMessage((from, msg) => received.push(msg));

    adapter.handleWebhookEvent({ type: "typing-indicator", data: {} });
    adapter.handleWebhookEvent({ type: "updated-message", data: {} });

    expect(received.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Google Chat Adapter Tests
// ---------------------------------------------------------------------------

describe("GoogleChatChannel adapter", () => {
  it("has correct name", async () => {
    const { GoogleChatChannel } = await import(
      "../../src/daemon/services/channels/googlechat.js"
    );
    const adapter = new GoogleChatChannel({
      serviceAccountKey: {
        client_email: "bot@test.iam.gserviceaccount.com",
        private_key: "-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----",
      },
    });
    expect(adapter.name).toBe("googlechat");
  });

  it("reports disconnected initially", async () => {
    const { GoogleChatChannel } = await import(
      "../../src/daemon/services/channels/googlechat.js"
    );
    const adapter = new GoogleChatChannel({
      serviceAccountKey: {
        client_email: "bot@test.iam.gserviceaccount.com",
        private_key: "-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----",
      },
    });
    expect(adapter.isConnected()).toBe(false);
  });

  it("throws on send when not connected", async () => {
    const { GoogleChatChannel } = await import(
      "../../src/daemon/services/channels/googlechat.js"
    );
    const adapter = new GoogleChatChannel({
      serviceAccountKey: {
        client_email: "bot@test.iam.gserviceaccount.com",
        private_key: "-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----",
      },
    });
    await expect(adapter.send("spaces/123", "hello")).rejects.toThrow("not connected");
  });

  it("throws on sendLong when not connected", async () => {
    const { GoogleChatChannel } = await import(
      "../../src/daemon/services/channels/googlechat.js"
    );
    const adapter = new GoogleChatChannel({
      serviceAccountKey: {
        client_email: "bot@test.iam.gserviceaccount.com",
        private_key: "-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----",
      },
    });
    await expect(adapter.sendLong("spaces/123", "hello")).rejects.toThrow("not connected");
  });

  it("throws when no credentials provided", () => {
    expect(() => {
      const { GoogleChatChannel: GC } = require(
        "../../src/daemon/services/channels/googlechat.js"
      );
      new GC({});
    }).toThrow();
  });

  it("accepts onMessage handlers", async () => {
    const { GoogleChatChannel } = await import(
      "../../src/daemon/services/channels/googlechat.js"
    );
    const adapter = new GoogleChatChannel({
      serviceAccountKey: {
        client_email: "bot@test.iam.gserviceaccount.com",
        private_key: "-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----",
      },
    });
    const handler = mock(() => {});
    adapter.onMessage(handler);
    expect(handler).not.toHaveBeenCalled();
  });

  it("handleEvent dispatches MESSAGE events to handlers", async () => {
    const { GoogleChatChannel } = await import(
      "../../src/daemon/services/channels/googlechat.js"
    );
    const adapter = new GoogleChatChannel({
      serviceAccountKey: {
        client_email: "bot@test.iam.gserviceaccount.com",
        private_key: "-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----",
      },
    });

    const received: any[] = [];
    adapter.onMessage((from, msg, meta) => {
      received.push({ from, msg, meta });
    });

    const result = adapter.handleEvent({
      type: "MESSAGE",
      message: {
        text: "@Bot hello world",
        argumentText: " hello world",
        sender: { name: "users/123", displayName: "John Doe", type: "HUMAN" },
        space: { name: "spaces/abc", spaceType: "DIRECT_MESSAGE", singleUserBotDm: true },
        name: "spaces/abc/messages/msg1",
      },
      user: { name: "users/123", displayName: "John Doe" },
      space: { name: "spaces/abc", spaceType: "DIRECT_MESSAGE", singleUserBotDm: true },
    });

    expect(result).toBeNull(); // async response
    expect(received.length).toBe(1);
    expect(received[0].msg).toBe("hello world");
    expect(received[0].meta.channel).toBe("googlechat");
    expect(received[0].meta.chat_id).toBe("spaces/abc");
    expect(received[0].meta.is_group).toBe(false);
    expect(received[0].meta.sender_name).toBe("John Doe");
  });

  it("handleEvent returns welcome on ADDED_TO_SPACE", async () => {
    const { GoogleChatChannel } = await import(
      "../../src/daemon/services/channels/googlechat.js"
    );
    const adapter = new GoogleChatChannel({
      serviceAccountKey: {
        client_email: "bot@test.iam.gserviceaccount.com",
        private_key: "-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----",
      },
    });

    const result = adapter.handleEvent({ type: "ADDED_TO_SPACE" });
    expect(result).not.toBeNull();
    expect(result!.text).toContain("Hello");
  });

  it("handleEvent detects group spaces", async () => {
    const { GoogleChatChannel } = await import(
      "../../src/daemon/services/channels/googlechat.js"
    );
    const adapter = new GoogleChatChannel({
      serviceAccountKey: {
        client_email: "bot@test.iam.gserviceaccount.com",
        private_key: "-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----",
      },
    });

    const received: any[] = [];
    adapter.onMessage((from, msg, meta) => received.push(meta));

    adapter.handleEvent({
      type: "MESSAGE",
      message: {
        text: "@Bot test",
        argumentText: " test",
        sender: { name: "users/123", displayName: "Jane" },
        space: { name: "spaces/xyz", spaceType: "SPACE" },
        name: "spaces/xyz/messages/msg2",
      },
      space: { name: "spaces/xyz", spaceType: "SPACE" },
    });

    expect(received[0].is_group).toBe(true);
  });

  it("handleEvent ignores empty text", async () => {
    const { GoogleChatChannel } = await import(
      "../../src/daemon/services/channels/googlechat.js"
    );
    const adapter = new GoogleChatChannel({
      serviceAccountKey: {
        client_email: "bot@test.iam.gserviceaccount.com",
        private_key: "-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----",
      },
    });

    const received: any[] = [];
    adapter.onMessage((from, msg) => received.push(msg));

    adapter.handleEvent({
      type: "MESSAGE",
      message: {
        text: "",
        argumentText: "",
        sender: { name: "users/123" },
        space: { name: "spaces/abc" },
      },
    });

    expect(received.length).toBe(0);
  });

  it("handleEvent respects spaceIds filter", async () => {
    const { GoogleChatChannel } = await import(
      "../../src/daemon/services/channels/googlechat.js"
    );
    const adapter = new GoogleChatChannel({
      serviceAccountKey: {
        client_email: "bot@test.iam.gserviceaccount.com",
        private_key: "-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----",
      },
      spaceIds: ["allowed-space"],
    });

    const received: any[] = [];
    adapter.onMessage((from, msg) => received.push(msg));

    adapter.handleEvent({
      type: "MESSAGE",
      message: {
        text: "blocked",
        argumentText: "blocked",
        sender: { name: "users/123" },
        space: { name: "spaces/not-allowed" },
      },
      space: { name: "spaces/not-allowed" },
    });

    expect(received.length).toBe(0);
  });

  it("handleCardClick dispatches button commands", async () => {
    const { GoogleChatChannel } = await import(
      "../../src/daemon/services/channels/googlechat.js"
    );
    const adapter = new GoogleChatChannel({
      serviceAccountKey: {
        client_email: "bot@test.iam.gserviceaccount.com",
        private_key: "-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----",
      },
    });

    const received: any[] = [];
    adapter.onMessage((from, msg, meta) => received.push({ msg, meta }));

    adapter.handleCardClick({
      action: {
        function: "command",
        parameters: [{ key: "cmd", value: "/help" }],
      },
      user: { name: "users/123", displayName: "Jane" },
      space: { name: "spaces/abc", spaceType: "DIRECT_MESSAGE" },
    });

    expect(received.length).toBe(1);
    expect(received[0].msg).toBe("/help");
    expect(received[0].meta.channel).toBe("googlechat");
  });

  it("handleEvent extracts attachments", async () => {
    const { GoogleChatChannel } = await import(
      "../../src/daemon/services/channels/googlechat.js"
    );
    const adapter = new GoogleChatChannel({
      serviceAccountKey: {
        client_email: "bot@test.iam.gserviceaccount.com",
        private_key: "-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----",
      },
    });

    const received: any[] = [];
    adapter.onMessage((from, msg, meta) => received.push(meta));

    adapter.handleEvent({
      type: "MESSAGE",
      message: {
        text: "check this file",
        argumentText: "check this file",
        sender: { name: "users/123" },
        space: { name: "spaces/abc", spaceType: "DIRECT_MESSAGE" },
        name: "spaces/abc/messages/msg3",
        attachment: [
          {
            name: "spaces/abc/messages/msg3/attachments/att1",
            contentName: "report.pdf",
            contentType: "application/pdf",
            attachmentDataRef: { resourceName: "spaces/abc/attachments/att1" },
          },
          {
            name: "spaces/abc/messages/msg3/attachments/att2",
            contentName: "photo.jpg",
            contentType: "image/jpeg",
            attachmentDataRef: { resourceName: "spaces/abc/attachments/att2" },
          },
        ],
      },
      space: { name: "spaces/abc" },
    });

    expect(received[0].attachments.length).toBe(2);
    expect(received[0].attachments[0].type).toBe("document");
    expect(received[0].attachments[0].filename).toBe("report.pdf");
    expect(received[0].attachments[1].type).toBe("photo");
  });
});

// ---------------------------------------------------------------------------
// ChannelAdapter interface compliance
// ---------------------------------------------------------------------------

describe("ChannelAdapter interface compliance", () => {
  it("iMessage implements all required methods", async () => {
    const { IMessageChannel } = await import(
      "../../src/daemon/services/channels/imessage.js"
    );
    const adapter = new IMessageChannel({
      serverUrl: "http://localhost:1234",
      password: "test",
    });

    expect(typeof adapter.connect).toBe("function");
    expect(typeof adapter.disconnect).toBe("function");
    expect(typeof adapter.isConnected).toBe("function");
    expect(typeof adapter.send).toBe("function");
    expect(typeof adapter.onMessage).toBe("function");
    expect(typeof adapter.sendLong).toBe("function");
    expect(typeof adapter.sendTracked).toBe("function");
    expect(typeof adapter.editMessage).toBe("function");
    expect(typeof adapter.deleteMessage).toBe("function");
    expect(typeof adapter.sendPhoto).toBe("function");
    expect(typeof adapter.sendDocument).toBe("function");
    expect(typeof adapter.sendVideo).toBe("function");
    expect(typeof adapter.sendAudio).toBe("function");
    expect(typeof adapter.sendVoice).toBe("function");
    expect(typeof adapter.sendKeyboard).toBe("function");
    expect(typeof adapter.downloadFile).toBe("function");
    expect(typeof adapter.sendTyping).toBe("function");
  });

  it("Google Chat implements all required methods", async () => {
    const { GoogleChatChannel } = await import(
      "../../src/daemon/services/channels/googlechat.js"
    );
    const adapter = new GoogleChatChannel({
      serviceAccountKey: {
        client_email: "bot@test.iam.gserviceaccount.com",
        private_key: "-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----",
      },
    });

    expect(typeof adapter.connect).toBe("function");
    expect(typeof adapter.disconnect).toBe("function");
    expect(typeof adapter.isConnected).toBe("function");
    expect(typeof adapter.send).toBe("function");
    expect(typeof adapter.onMessage).toBe("function");
    expect(typeof adapter.sendLong).toBe("function");
    expect(typeof adapter.sendTracked).toBe("function");
    expect(typeof adapter.editMessage).toBe("function");
    expect(typeof adapter.deleteMessage).toBe("function");
    expect(typeof adapter.sendPhoto).toBe("function");
    expect(typeof adapter.sendDocument).toBe("function");
    expect(typeof adapter.sendVideo).toBe("function");
    expect(typeof adapter.sendAudio).toBe("function");
    expect(typeof adapter.sendVoice).toBe("function");
    expect(typeof adapter.sendKeyboard).toBe("function");
    expect(typeof adapter.downloadFile).toBe("function");
  });

  it("WhatsApp implements all required methods", async () => {
    const { WhatsAppChannel } = await import(
      "../../src/daemon/services/channels/whatsapp.js"
    );
    const adapter = new WhatsAppChannel();

    expect(typeof adapter.connect).toBe("function");
    expect(typeof adapter.disconnect).toBe("function");
    expect(typeof adapter.isConnected).toBe("function");
    expect(typeof adapter.send).toBe("function");
    expect(typeof adapter.onMessage).toBe("function");
    expect(typeof adapter.sendLong).toBe("function");
    expect(typeof adapter.sendTracked).toBe("function");
    expect(typeof adapter.editMessage).toBe("function");
    expect(typeof adapter.deleteMessage).toBe("function");
    expect(typeof adapter.sendPhoto).toBe("function");
    expect(typeof adapter.sendDocument).toBe("function");
    expect(typeof adapter.sendVideo).toBe("function");
    expect(typeof adapter.sendAudio).toBe("function");
    expect(typeof adapter.sendVoice).toBe("function");
    expect(typeof adapter.sendKeyboard).toBe("function");
    expect(typeof adapter.downloadFile).toBe("function");
    expect(typeof adapter.sendTyping).toBe("function");
  });

  it("Telegram implements all required methods", async () => {
    const { TelegramChannel } = await import(
      "../../src/daemon/services/channels/telegram.js"
    );
    const adapter = new TelegramChannel({ token: "fake:token" });

    expect(typeof adapter.connect).toBe("function");
    expect(typeof adapter.disconnect).toBe("function");
    expect(typeof adapter.isConnected).toBe("function");
    expect(typeof adapter.send).toBe("function");
    expect(typeof adapter.onMessage).toBe("function");
    expect(typeof adapter.sendLong).toBe("function");
    expect(typeof adapter.sendTracked).toBe("function");
    expect(typeof adapter.editMessage).toBe("function");
    expect(typeof adapter.deleteMessage).toBe("function");
    expect(typeof adapter.sendPhoto).toBe("function");
    expect(typeof adapter.sendDocument).toBe("function");
    expect(typeof adapter.sendVideo).toBe("function");
    expect(typeof adapter.sendAudio).toBe("function");
    expect(typeof adapter.sendVoice).toBe("function");
    expect(typeof adapter.sendKeyboard).toBe("function");
    expect(typeof adapter.downloadFile).toBe("function");
    expect(typeof adapter.sendTyping).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// ChannelRegistry integration
// ---------------------------------------------------------------------------

describe("ChannelRegistry with adapters", () => {
  it("registers iMessage adapter", async () => {
    const { ChannelRegistry } = await import(
      "../../src/daemon/services/channels/index.js"
    );
    const { IMessageChannel } = await import(
      "../../src/daemon/services/channels/imessage.js"
    );

    const registry = new ChannelRegistry();
    const imessage = new IMessageChannel({
      serverUrl: "http://localhost:1234",
      password: "test",
    });
    registry.register(imessage);

    expect(registry.list()).toContain("imessage");
    expect(registry.get("imessage")).toBe(imessage);
    expect(registry.statusOf("imessage")?.status).toBe("disconnected");
  });

  it("registers Google Chat adapter", async () => {
    const { ChannelRegistry } = await import(
      "../../src/daemon/services/channels/index.js"
    );
    const { GoogleChatChannel } = await import(
      "../../src/daemon/services/channels/googlechat.js"
    );

    const registry = new ChannelRegistry();
    const gchat = new GoogleChatChannel({
      serviceAccountKey: {
        client_email: "bot@test.iam.gserviceaccount.com",
        private_key: "-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----",
      },
    });
    registry.register(gchat);

    expect(registry.list()).toContain("googlechat");
    expect(registry.get("googlechat")).toBe(gchat);
    expect(registry.statusOf("googlechat")?.status).toBe("disconnected");
  });

  it("registers all four channels", async () => {
    const { ChannelRegistry } = await import(
      "../../src/daemon/services/channels/index.js"
    );
    const { TelegramChannel } = await import(
      "../../src/daemon/services/channels/telegram.js"
    );
    const { WhatsAppChannel } = await import(
      "../../src/daemon/services/channels/whatsapp.js"
    );
    const { IMessageChannel } = await import(
      "../../src/daemon/services/channels/imessage.js"
    );
    const { GoogleChatChannel } = await import(
      "../../src/daemon/services/channels/googlechat.js"
    );

    const registry = new ChannelRegistry();
    registry.register(new TelegramChannel({ token: "fake:token" }));
    registry.register(new WhatsAppChannel());
    registry.register(new IMessageChannel({ serverUrl: "http://localhost:1234", password: "test" }));
    registry.register(new GoogleChatChannel({
      serviceAccountKey: {
        client_email: "bot@test.iam.gserviceaccount.com",
        private_key: "-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----",
      },
    }));

    expect(registry.list().sort()).toEqual(["googlechat", "imessage", "telegram", "whatsapp"]);
    expect(registry.status().length).toBe(4);
  });

  it("prevents duplicate registration", async () => {
    const { ChannelRegistry } = await import(
      "../../src/daemon/services/channels/index.js"
    );
    const { IMessageChannel } = await import(
      "../../src/daemon/services/channels/imessage.js"
    );

    const registry = new ChannelRegistry();
    registry.register(new IMessageChannel({ serverUrl: "http://localhost:1234", password: "test" }));
    expect(() => registry.register(new IMessageChannel({ serverUrl: "http://localhost:5678", password: "test2" }))).toThrow("already registered");
  });

  it("unregisters channel", async () => {
    const { ChannelRegistry } = await import(
      "../../src/daemon/services/channels/index.js"
    );
    const { IMessageChannel } = await import(
      "../../src/daemon/services/channels/imessage.js"
    );

    const registry = new ChannelRegistry();
    registry.register(new IMessageChannel({ serverUrl: "http://localhost:1234", password: "test" }));
    expect(registry.list()).toContain("imessage");

    await registry.unregister("imessage");
    expect(registry.list()).not.toContain("imessage");
  });

  it("sendKeyboard falls back to send when adapter missing sendKeyboard", async () => {
    const { ChannelRegistry } = await import(
      "../../src/daemon/services/channels/index.js"
    );

    const registry = new ChannelRegistry();
    const messages: string[] = [];

    const minimal = {
      name: "minimal",
      connect: async () => {},
      disconnect: async () => {},
      isConnected: () => true,
      send: async (_t: string, msg: string) => { messages.push(msg); },
      onMessage: () => {},
    };

    registry.register(minimal as any);
    await registry.sendKeyboard("minimal", "chat1", "Pick one:", [
      [{ label: "A", data: "/a" }],
    ]);

    expect(messages.length).toBe(1);
    expect(messages[0]).toContain("Pick one:");
  });
});
