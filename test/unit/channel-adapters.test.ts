// Channel adapter unit tests — Telegram and WhatsApp.
//
// Tests the adapter classes directly. Verifies all ChannelAdapter methods
// produce correct behavior without requiring live external services.

import { describe, expect, it, mock } from "bun:test";

// ---------------------------------------------------------------------------
// ChannelAdapter interface compliance
// ---------------------------------------------------------------------------

describe("ChannelAdapter interface compliance", () => {
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
  it("registers both channels", async () => {
    const { ChannelRegistry } = await import(
      "../../src/daemon/services/channels/index.js"
    );
    const { TelegramChannel } = await import(
      "../../src/daemon/services/channels/telegram.js"
    );
    const { WhatsAppChannel } = await import(
      "../../src/daemon/services/channels/whatsapp.js"
    );

    const registry = new ChannelRegistry();
    registry.register(new TelegramChannel({ token: "fake:token" }));
    registry.register(new WhatsAppChannel());

    expect(registry.list().sort()).toEqual(["telegram", "whatsapp"]);
    expect(registry.status().length).toBe(2);
  });

  it("prevents duplicate registration", async () => {
    const { ChannelRegistry } = await import(
      "../../src/daemon/services/channels/index.js"
    );
    const { TelegramChannel } = await import(
      "../../src/daemon/services/channels/telegram.js"
    );

    const registry = new ChannelRegistry();
    registry.register(new TelegramChannel({ token: "fake:token" }));
    expect(() => registry.register(new TelegramChannel({ token: "fake:token2" }))).toThrow("already registered");
  });

  it("unregisters channel", async () => {
    const { ChannelRegistry } = await import(
      "../../src/daemon/services/channels/index.js"
    );
    const { TelegramChannel } = await import(
      "../../src/daemon/services/channels/telegram.js"
    );

    const registry = new ChannelRegistry();
    registry.register(new TelegramChannel({ token: "fake:token" }));
    expect(registry.list()).toContain("telegram");

    await registry.unregister("telegram");
    expect(registry.list()).not.toContain("telegram");
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
