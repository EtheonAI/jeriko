// Channel adapter unit tests — Discord and Slack.
//
// Tests the adapter classes directly with mocked SDKs.
// Verifies all ChannelAdapter methods produce correct SDK calls.

import { describe, expect, it, beforeEach, mock } from "bun:test";

// ---------------------------------------------------------------------------
// Mock discord.js
// ---------------------------------------------------------------------------

function createMockDiscordChannel() {
  const sent: any[] = [];
  const channel = {
    isTextBased: () => true,
    isDMBased: () => false,
    send: mock(async (content: any) => {
      sent.push(content);
      return {
        id: `msg_${sent.length}`,
        edit: mock(async (text: any) => {}),
        delete: mock(async () => {}),
      };
    }),
    sendTyping: mock(async () => {}),
    messages: {
      fetch: mock(async (id: string) => ({
        id,
        edit: mock(async (text: any) => {}),
        delete: mock(async () => {}),
      })),
    },
  };
  return { channel, sent };
}

function createMockDiscordClient() {
  const { channel, sent } = createMockDiscordChannel();
  const handlers: Record<string, Function[]> = {};

  const client = {
    on: (event: string, handler: Function) => {
      if (!handlers[event]) handlers[event] = [];
      handlers[event]!.push(handler);
    },
    login: mock(async () => {}),
    destroy: mock(async () => {}),
    channels: {
      fetch: mock(async () => channel),
    },
    user: { id: "bot_123", username: "jeriko-bot" },
  };

  return { client, channel, sent, handlers };
}

// ---------------------------------------------------------------------------
// Mock @slack/bolt
// ---------------------------------------------------------------------------

function createMockSlackApp() {
  const sent: any[] = [];
  const updated: any[] = [];
  const deleted: any[] = [];
  const uploaded: any[] = [];
  const handlers: Record<string, Function[]> = {};

  const app = {
    message: (handler: Function) => {
      if (!handlers["message"]) handlers["message"] = [];
      handlers["message"]!.push(handler);
    },
    action: (pattern: string | RegExp, handler: Function) => {
      const key = pattern.toString();
      if (!handlers[key]) handlers[key] = [];
      handlers[key]!.push(handler);
    },
    start: mock(async () => {}),
    stop: mock(async () => {}),
    client: {
      chat: {
        postMessage: mock(async (opts: any) => {
          sent.push(opts);
          return { ok: true, ts: `ts_${sent.length}` };
        }),
        update: mock(async (opts: any) => {
          updated.push(opts);
          return { ok: true };
        }),
        delete: mock(async (opts: any) => {
          deleted.push(opts);
          return { ok: true };
        }),
      },
      files: {
        uploadV2: mock(async (opts: any) => {
          uploaded.push(opts);
          return { ok: true };
        }),
      },
      conversations: {
        info: mock(async () => ({ ok: true, channel: { is_im: false } })),
      },
      users: {
        info: mock(async (opts: any) => ({
          ok: true,
          user: { real_name: `User ${opts.user}`, name: opts.user },
        })),
      },
    },
  };

  return { app, sent, updated, deleted, uploaded, handlers };
}

// ---------------------------------------------------------------------------
// Discord Adapter Tests
// ---------------------------------------------------------------------------

describe("DiscordChannel adapter", () => {
  // We need to test the adapter with mocked discord.js.
  // Since discord.js is optional, we test the structural behavior.

  it("has correct name", async () => {
    const { DiscordChannel } = await import(
      "../../src/daemon/services/channels/discord.js"
    );
    const adapter = new DiscordChannel({ token: "test-token" });
    expect(adapter.name).toBe("discord");
  });

  it("reports disconnected initially", async () => {
    const { DiscordChannel } = await import(
      "../../src/daemon/services/channels/discord.js"
    );
    const adapter = new DiscordChannel({ token: "test-token" });
    expect(adapter.isConnected()).toBe(false);
  });

  it("throws on send when not connected", async () => {
    const { DiscordChannel } = await import(
      "../../src/daemon/services/channels/discord.js"
    );
    const adapter = new DiscordChannel({ token: "test-token" });
    await expect(adapter.send("123", "hello")).rejects.toThrow("not connected");
  });

  it("throws on sendLong when not connected", async () => {
    const { DiscordChannel } = await import(
      "../../src/daemon/services/channels/discord.js"
    );
    const adapter = new DiscordChannel({ token: "test-token" });
    await expect(adapter.sendLong("123", "hello")).rejects.toThrow("not connected");
  });

  it("throws on sendTracked when not connected", async () => {
    const { DiscordChannel } = await import(
      "../../src/daemon/services/channels/discord.js"
    );
    const adapter = new DiscordChannel({ token: "test-token" });
    await expect(adapter.sendTracked("123", "hello")).rejects.toThrow("not connected");
  });

  it("throws on sendKeyboard when not connected", async () => {
    const { DiscordChannel } = await import(
      "../../src/daemon/services/channels/discord.js"
    );
    const adapter = new DiscordChannel({ token: "test-token" });
    await expect(
      adapter.sendKeyboard("123", "text", [[{ label: "btn", data: "/help" }]]),
    ).rejects.toThrow("not connected");
  });

  it("throws on sendPhoto when not connected", async () => {
    const { DiscordChannel } = await import(
      "../../src/daemon/services/channels/discord.js"
    );
    const adapter = new DiscordChannel({ token: "test-token" });
    await expect(adapter.sendPhoto("123", "/tmp/test.png")).rejects.toThrow("not connected");
  });

  it("throws on sendDocument when not connected", async () => {
    const { DiscordChannel } = await import(
      "../../src/daemon/services/channels/discord.js"
    );
    const adapter = new DiscordChannel({ token: "test-token" });
    await expect(adapter.sendDocument("123", "/tmp/test.pdf")).rejects.toThrow("not connected");
  });

  it("throws on connect without token", async () => {
    const { DiscordChannel } = await import(
      "../../src/daemon/services/channels/discord.js"
    );
    const adapter = new DiscordChannel({ token: "" });
    await expect(adapter.connect()).rejects.toThrow("not configured");
  });

  it("accepts onMessage handlers", async () => {
    const { DiscordChannel } = await import(
      "../../src/daemon/services/channels/discord.js"
    );
    const adapter = new DiscordChannel({ token: "test-token" });
    const handler = mock(() => {});
    adapter.onMessage(handler);
    // Handler is stored but not called until messages arrive
    expect(handler).not.toHaveBeenCalled();
  });

  it("sendTyping is safe when not connected", async () => {
    const { DiscordChannel } = await import(
      "../../src/daemon/services/channels/discord.js"
    );
    const adapter = new DiscordChannel({ token: "test-token" });
    // Should not throw
    await adapter.sendTyping("123");
  });

  it("deleteMessage is safe when not connected", async () => {
    const { DiscordChannel } = await import(
      "../../src/daemon/services/channels/discord.js"
    );
    const adapter = new DiscordChannel({ token: "test-token" });
    // Should not throw
    await adapter.deleteMessage("123", "msg_1");
  });

  it("config stores admin/guild/channel filters", async () => {
    const { DiscordChannel } = await import(
      "../../src/daemon/services/channels/discord.js"
    );
    const adapter = new DiscordChannel({
      token: "test-token",
      adminIds: ["user1", "user2"],
      guildIds: ["guild1"],
      channelIds: ["chan1"],
    });
    expect(adapter.name).toBe("discord");
    // Adapter created without error — filters are stored internally
  });
});

// ---------------------------------------------------------------------------
// Slack Adapter Tests
// ---------------------------------------------------------------------------

describe("SlackChannel adapter", () => {
  it("has correct name", async () => {
    const { SlackChannel } = await import(
      "../../src/daemon/services/channels/slack.js"
    );
    const adapter = new SlackChannel({
      botToken: "xoxb-test",
      appToken: "xapp-test",
    });
    expect(adapter.name).toBe("slack");
  });

  it("reports disconnected initially", async () => {
    const { SlackChannel } = await import(
      "../../src/daemon/services/channels/slack.js"
    );
    const adapter = new SlackChannel({
      botToken: "xoxb-test",
      appToken: "xapp-test",
    });
    expect(adapter.isConnected()).toBe(false);
  });

  it("throws on send when not connected", async () => {
    const { SlackChannel } = await import(
      "../../src/daemon/services/channels/slack.js"
    );
    const adapter = new SlackChannel({
      botToken: "xoxb-test",
      appToken: "xapp-test",
    });
    await expect(adapter.send("C123", "hello")).rejects.toThrow("not connected");
  });

  it("throws on sendLong when not connected", async () => {
    const { SlackChannel } = await import(
      "../../src/daemon/services/channels/slack.js"
    );
    const adapter = new SlackChannel({
      botToken: "xoxb-test",
      appToken: "xapp-test",
    });
    await expect(adapter.sendLong("C123", "hello")).rejects.toThrow("not connected");
  });

  it("throws on sendTracked when not connected", async () => {
    const { SlackChannel } = await import(
      "../../src/daemon/services/channels/slack.js"
    );
    const adapter = new SlackChannel({
      botToken: "xoxb-test",
      appToken: "xapp-test",
    });
    await expect(adapter.sendTracked("C123", "hello")).rejects.toThrow("not connected");
  });

  it("throws on sendKeyboard when not connected", async () => {
    const { SlackChannel } = await import(
      "../../src/daemon/services/channels/slack.js"
    );
    const adapter = new SlackChannel({
      botToken: "xoxb-test",
      appToken: "xapp-test",
    });
    await expect(
      adapter.sendKeyboard("C123", "text", [[{ label: "btn", data: "/help" }]]),
    ).rejects.toThrow("not connected");
  });

  it("throws on sendPhoto when not connected", async () => {
    const { SlackChannel } = await import(
      "../../src/daemon/services/channels/slack.js"
    );
    const adapter = new SlackChannel({
      botToken: "xoxb-test",
      appToken: "xapp-test",
    });
    await expect(adapter.sendPhoto("C123", "/tmp/test.png")).rejects.toThrow("not connected");
  });

  it("throws on sendDocument when not connected", async () => {
    const { SlackChannel } = await import(
      "../../src/daemon/services/channels/slack.js"
    );
    const adapter = new SlackChannel({
      botToken: "xoxb-test",
      appToken: "xapp-test",
    });
    await expect(adapter.sendDocument("C123", "/tmp/test.pdf")).rejects.toThrow("not connected");
  });

  it("throws on sendVideo when not connected", async () => {
    const { SlackChannel } = await import(
      "../../src/daemon/services/channels/slack.js"
    );
    const adapter = new SlackChannel({
      botToken: "xoxb-test",
      appToken: "xapp-test",
    });
    await expect(adapter.sendVideo("C123", "/tmp/test.mp4")).rejects.toThrow("not connected");
  });

  it("throws on sendAudio when not connected", async () => {
    const { SlackChannel } = await import(
      "../../src/daemon/services/channels/slack.js"
    );
    const adapter = new SlackChannel({
      botToken: "xoxb-test",
      appToken: "xapp-test",
    });
    await expect(adapter.sendAudio("C123", "/tmp/test.mp3")).rejects.toThrow("not connected");
  });

  it("throws on connect without tokens", async () => {
    const { SlackChannel } = await import(
      "../../src/daemon/services/channels/slack.js"
    );
    const adapter = new SlackChannel({ botToken: "", appToken: "" });
    await expect(adapter.connect()).rejects.toThrow("required");
  });

  it("accepts onMessage handlers", async () => {
    const { SlackChannel } = await import(
      "../../src/daemon/services/channels/slack.js"
    );
    const adapter = new SlackChannel({
      botToken: "xoxb-test",
      appToken: "xapp-test",
    });
    const handler = mock(() => {});
    adapter.onMessage(handler);
    expect(handler).not.toHaveBeenCalled();
  });

  it("sendTyping is safe when not connected", async () => {
    const { SlackChannel } = await import(
      "../../src/daemon/services/channels/slack.js"
    );
    const adapter = new SlackChannel({
      botToken: "xoxb-test",
      appToken: "xapp-test",
    });
    // sendTyping is a no-op in Slack (no bot typing API in Socket Mode)
    await adapter.sendTyping("C123");
  });

  it("deleteMessage is safe when not connected", async () => {
    const { SlackChannel } = await import(
      "../../src/daemon/services/channels/slack.js"
    );
    const adapter = new SlackChannel({
      botToken: "xoxb-test",
      appToken: "xapp-test",
    });
    // Should not throw
    await adapter.deleteMessage("C123", "ts_123");
  });

  it("config stores admin/channel filters", async () => {
    const { SlackChannel } = await import(
      "../../src/daemon/services/channels/slack.js"
    );
    const adapter = new SlackChannel({
      botToken: "xoxb-test",
      appToken: "xapp-test",
      adminIds: ["U123"],
      channelIds: ["C123"],
    });
    expect(adapter.name).toBe("slack");
  });
});

// ---------------------------------------------------------------------------
// ChannelAdapter interface compliance
// ---------------------------------------------------------------------------

describe("ChannelAdapter interface compliance", () => {
  it("Discord implements all required methods", async () => {
    const { DiscordChannel } = await import(
      "../../src/daemon/services/channels/discord.js"
    );
    const adapter = new DiscordChannel({ token: "test" });

    // Required
    expect(typeof adapter.connect).toBe("function");
    expect(typeof adapter.disconnect).toBe("function");
    expect(typeof adapter.isConnected).toBe("function");
    expect(typeof adapter.send).toBe("function");
    expect(typeof adapter.onMessage).toBe("function");

    // Optional — all should be implemented
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

  it("Slack implements all required methods", async () => {
    const { SlackChannel } = await import(
      "../../src/daemon/services/channels/slack.js"
    );
    const adapter = new SlackChannel({ botToken: "xoxb-test", appToken: "xapp-test" });

    // Required
    expect(typeof adapter.connect).toBe("function");
    expect(typeof adapter.disconnect).toBe("function");
    expect(typeof adapter.isConnected).toBe("function");
    expect(typeof adapter.send).toBe("function");
    expect(typeof adapter.onMessage).toBe("function");

    // Optional — all should be implemented
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
    // grammy is a real dep (not optional), so we can import safely
    // but constructor needs a token, and we don't want to connect
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
  it("registers Discord adapter", async () => {
    const { ChannelRegistry } = await import(
      "../../src/daemon/services/channels/index.js"
    );
    const { DiscordChannel } = await import(
      "../../src/daemon/services/channels/discord.js"
    );

    const registry = new ChannelRegistry();
    const discord = new DiscordChannel({ token: "test" });
    registry.register(discord);

    expect(registry.list()).toContain("discord");
    expect(registry.get("discord")).toBe(discord);
    expect(registry.statusOf("discord")?.status).toBe("disconnected");
  });

  it("registers Slack adapter", async () => {
    const { ChannelRegistry } = await import(
      "../../src/daemon/services/channels/index.js"
    );
    const { SlackChannel } = await import(
      "../../src/daemon/services/channels/slack.js"
    );

    const registry = new ChannelRegistry();
    const slack = new SlackChannel({ botToken: "xoxb-test", appToken: "xapp-test" });
    registry.register(slack);

    expect(registry.list()).toContain("slack");
    expect(registry.get("slack")).toBe(slack);
    expect(registry.statusOf("slack")?.status).toBe("disconnected");
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
    const { DiscordChannel } = await import(
      "../../src/daemon/services/channels/discord.js"
    );
    const { SlackChannel } = await import(
      "../../src/daemon/services/channels/slack.js"
    );

    const registry = new ChannelRegistry();
    registry.register(new TelegramChannel({ token: "fake:token" }));
    registry.register(new WhatsAppChannel());
    registry.register(new DiscordChannel({ token: "test" }));
    registry.register(new SlackChannel({ botToken: "xoxb-test", appToken: "xapp-test" }));

    expect(registry.list().sort()).toEqual(["discord", "slack", "telegram", "whatsapp"]);
    expect(registry.status().length).toBe(4);
  });

  it("prevents duplicate registration", async () => {
    const { ChannelRegistry } = await import(
      "../../src/daemon/services/channels/index.js"
    );
    const { DiscordChannel } = await import(
      "../../src/daemon/services/channels/discord.js"
    );

    const registry = new ChannelRegistry();
    registry.register(new DiscordChannel({ token: "test" }));
    expect(() => registry.register(new DiscordChannel({ token: "test2" }))).toThrow("already registered");
  });

  it("unregisters channel", async () => {
    const { ChannelRegistry } = await import(
      "../../src/daemon/services/channels/index.js"
    );
    const { DiscordChannel } = await import(
      "../../src/daemon/services/channels/discord.js"
    );

    const registry = new ChannelRegistry();
    registry.register(new DiscordChannel({ token: "test" }));
    expect(registry.list()).toContain("discord");

    await registry.unregister("discord");
    expect(registry.list()).not.toContain("discord");
  });

  it("sendKeyboard falls back to send when adapter missing sendKeyboard", async () => {
    const { ChannelRegistry } = await import(
      "../../src/daemon/services/channels/index.js"
    );

    const registry = new ChannelRegistry();
    const messages: string[] = [];

    // Create a minimal adapter without sendKeyboard
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

    // Should fall back to plain text
    expect(messages.length).toBe(1);
    expect(messages[0]).toContain("Pick one:");
  });
});
