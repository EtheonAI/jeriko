// Channel router command tests — validates all slash commands handled by router.ts.
//
// Tests the command parsing, response content, and session state management.
// Uses a mock ChannelRegistry + Bus to capture outgoing messages without
// connecting to real platforms.

import { describe, expect, it, beforeEach, afterEach, mock } from "bun:test";
import { Bus } from "../../src/shared/bus.js";
import type {
  ChannelEvents,
  MessageMetadata,
  SentMessage,
  KeyboardLayout,
} from "../../src/daemon/services/channels/index.js";

// ---------------------------------------------------------------------------
// Mock channel registry — captures sent messages + keyboard sends for assertion
// ---------------------------------------------------------------------------

interface SentRecord {
  channel: string;
  target: string;
  message: string;
}

interface KeyboardRecord {
  channel: string;
  target: string;
  text: string;
  keyboard: KeyboardLayout;
}

function createMockRegistry() {
  const sent: SentRecord[] = [];
  const keyboards: KeyboardRecord[] = [];
  const edited: Array<{ channel: string; target: string; messageId: string | number; text: string }> = [];
  const deleted: Array<{ channel: string; target: string; messageId: string | number }> = [];
  const bus = new Bus<ChannelEvents>();

  return {
    sent,
    keyboards,
    edited,
    deleted,
    bus,
    async send(channel: string, target: string, message: string) {
      sent.push({ channel, target, message });
    },
    async sendKeyboard(channel: string, target: string, text: string, keyboard: KeyboardLayout) {
      keyboards.push({ channel, target, text, keyboard });
    },
    async sendTracked(channel: string, target: string, text: string): Promise<SentMessage | null> {
      sent.push({ channel, target, message: text });
      return { messageId: sent.length };
    },
    async editMessage(channel: string, target: string, messageId: string | number, text: string) {
      edited.push({ channel, target, messageId, text });
    },
    async downloadFile(_channel: string, _fileId: string, _filename?: string): Promise<string> {
      return "/tmp/test-file.jpg";
    },
    async deleteMessage(channel: string, target: string, messageId: string | number) {
      deleted.push({ channel, target, messageId });
    },
    async sendTyping() {},
    async sendPhoto() {},
    async sendDocument() {},
    async sendVideo() {},
    async sendAudio() {},
    async sendVoice() {},
    lastMessage(): string {
      return sent[sent.length - 1]?.message ?? "";
    },
    lastKeyboard(): KeyboardRecord | undefined {
      return keyboards[keyboards.length - 1];
    },
    /** All button labels flattened from the last keyboard. */
    lastKeyboardLabels(): string[] {
      const kb = keyboards[keyboards.length - 1];
      if (!kb) return [];
      return kb.keyboard.flatMap((row) => row.map((b) => b.label));
    },
    /** All button data values flattened from the last keyboard. */
    lastKeyboardData(): string[] {
      const kb = keyboards[keyboards.length - 1];
      if (!kb) return [];
      return kb.keyboard.flatMap((row) => row.map((b) => b.data));
    },
    allMessages(): string[] {
      return sent.map((s) => s.message);
    },
  };
}

type MockRegistry = ReturnType<typeof createMockRegistry>;

// ---------------------------------------------------------------------------
// Helper: emit a command as if a user sent it from Telegram
// ---------------------------------------------------------------------------

function emitCommand(registry: MockRegistry, command: string, chatId = "123456") {
  const metadata: MessageMetadata = {
    channel: "telegram",
    chat_id: chatId,
    is_group: false,
    sender_name: "TestUser",
    message_id: 42,
  };
  registry.bus.emit("channel:message", {
    from: "user1",
    message: command,
    metadata,
  });
}

// Wait for async command processing
async function settle(ms = 50): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Channel router — command parsing", () => {
  it("all supported commands are listed in /help via keyboard buttons", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");

    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/help");
    await settle();

    // /help sends a keyboard with quick-access buttons
    const kb = registry.lastKeyboard();
    expect(kb).toBeDefined();
    expect(kb!.text).toContain("Jeriko");

    // Verify the keyboard buttons map to key commands
    const data = registry.lastKeyboardData();
    expect(data).toContain("/new");
    expect(data).toContain("/sessions");
    expect(data).toContain("/model");
    expect(data).toContain("/connect");
    expect(data).toContain("/connectors");
    expect(data).toContain("/health");
    expect(data).toContain("/skill");
    expect(data).toContain("/triggers");
    expect(data).toContain("/tasks");
    expect(data).toContain("/channels");
    expect(data).toContain("/notifications");
    expect(data).toContain("/share");
    expect(data).toContain("/history");
    expect(data).toContain("/status");
    expect(data).toContain("/sys");
  });

  it("/start is an alias for /help", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");

    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/start");
    await settle();

    const kb = registry.lastKeyboard();
    expect(kb).toBeDefined();
    expect(kb!.text).toContain("Jeriko");
    expect(registry.lastKeyboardData()).toContain("/new");
  });

  it("/commands is an alias for /help", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");

    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/commands");
    await settle();

    const kb = registry.lastKeyboard();
    expect(kb).toBeDefined();
    expect(kb!.text).toContain("Jeriko");
    expect(registry.lastKeyboardData()).toContain("/new");
  });

  it("unknown command shows error with /help hint", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");

    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/nonexistent");
    await settle();

    const text = registry.lastMessage();
    expect(text).toContain("Unknown");
    expect(text).toContain("/help");
  });
});

describe("Channel router — session commands", () => {
  it("/clear confirms session history cleared", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");

    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    // Send a text message first to create a session
    emitCommand(registry, "/new");
    await settle();

    emitCommand(registry, "/clear");
    await settle();

    const text = registry.lastMessage();
    expect(text).toContain("cleared");
  });

  it("/stop with nothing running says so", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");

    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/stop");
    await settle();

    const text = registry.lastMessage();
    expect(text).toContain("Nothing running");
  });

  it("/new creates a new session", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");

    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/new");
    await settle();

    const text = registry.lastMessage();
    expect(text).toContain("New session:");
  });

  it("/kill destroys session and creates new one", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");

    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/kill");
    await settle();

    const text = registry.lastMessage();
    expect(text).toContain("Session destroyed");
    expect(text).toContain("New session:");
  });

  it("/session shows session info", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");

    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/session");
    await settle();

    const text = registry.lastMessage();
    expect(text).toContain("session:");
  });

  it("/sessions lists recent sessions", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");

    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    // Create a session first
    emitCommand(registry, "/new");
    await settle();

    emitCommand(registry, "/sessions");
    await settle();

    const text = registry.lastMessage();
    // Should list at least one session or say "No sessions"
    expect(text.length).toBeGreaterThan(0);
  });

  it("/switch without argument shows usage", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");

    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/switch");
    await settle();

    const text = registry.lastMessage();
    expect(text).toContain("Usage");
  });

  it("/switch with invalid id says not found", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");

    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/switch nonexistent-id-12345");
    await settle();

    const text = registry.lastMessage();
    expect(text).toContain("not found");
  });

  it("/archive archives and starts new session", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");

    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/archive");
    await settle();

    const text = registry.lastMessage();
    expect(text).toContain("Archived");
    expect(text).toContain("New session:");
  });
});

describe("Channel router — system commands", () => {
  it("/status shows daemon metrics", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");

    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/status");
    await settle();

    const text = registry.lastMessage();
    expect(text).toContain("uptime:");
    expect(text).toContain("memory:");
    expect(text).toContain("model:");
    expect(text).toContain("session:");
  });

  it("/sys shows system info", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");

    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/sys");
    await settle();

    const text = registry.lastMessage();
    expect(text).toContain("platform:");
    expect(text).toContain("runtime:");
    expect(text).toContain("uptime:");
    expect(text).toContain("memory:");
    expect(text).toContain("pid:");
  });
});

describe("Channel router — integration commands", () => {
  it("/connectors lists all connectors as keyboard buttons", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");

    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/connectors");
    await settle();

    const kb = registry.lastKeyboard();
    expect(kb).toBeDefined();
    expect(kb!.text).toContain("Connectors:");
    expect(kb!.text).toContain("connected");
    // Should have buttons for connectors
    expect(kb!.keyboard.length).toBeGreaterThan(0);
  });

  it("/connect without args shows connector keyboard", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");

    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/connect");
    await settle();

    const kb = registry.lastKeyboard();
    expect(kb).toBeDefined();
    expect(kb!.text).toContain("connected");
    expect(kb!.text).toContain("Connectors");
  });

  it("/connect with non-oauth connector shows API key instructions", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");

    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/connect twilio");
    await settle();

    const text = registry.lastMessage();
    expect(text).toContain("doesn't support OAuth");
    expect(text).toContain("/auth");
  });

  it("/connect github with configured client ID generates login URL", async () => {
    const origId = process.env.GITHUB_OAUTH_CLIENT_ID;
    const origToken = process.env.GITHUB_TOKEN;
    process.env.GITHUB_OAUTH_CLIENT_ID = "test-client-id";
    delete process.env.GITHUB_TOKEN; // Make sure it's not "already connected"

    try {
      const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");

      const registry = createMockRegistry();
      startChannelRouter({
        channels: registry as any,
        defaultModel: "claude",
        maxTokens: 4096,
        temperature: 0.3,
        extendedThinking: false,
      });

      emitCommand(registry, "/connect github");
      await settle();

      const text = registry.lastMessage();
      expect(text).toContain("Connect GitHub");
      expect(text).toContain("/oauth/github/start");
      expect(text).toContain("state=");
      expect(text).toContain("10 minutes");
    } finally {
      if (origId) {
        process.env.GITHUB_OAUTH_CLIENT_ID = origId;
      } else {
        delete process.env.GITHUB_OAUTH_CLIENT_ID;
      }
      if (origToken) {
        process.env.GITHUB_TOKEN = origToken;
      }
    }
  });

  it("/connect github without client ID shows configuration error", async () => {
    const origId = process.env.GITHUB_OAUTH_CLIENT_ID;
    delete process.env.GITHUB_OAUTH_CLIENT_ID;

    try {
      const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");

      const registry = createMockRegistry();
      startChannelRouter({
        channels: registry as any,
        defaultModel: "claude",
        maxTokens: 4096,
        temperature: 0.3,
        extendedThinking: false,
      });

      emitCommand(registry, "/connect github");
      await settle();

      const text = registry.lastMessage();
      expect(text).toContain("not configured");
      expect(text).toContain("GITHUB_OAUTH_CLIENT_ID");
    } finally {
      if (origId) {
        process.env.GITHUB_OAUTH_CLIENT_ID = origId;
      }
    }
  });

  it("/disconnect without args shows connected connectors or empty message", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");

    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/disconnect");
    await settle();

    // Either shows "No connectors are connected." or a keyboard with connected ones
    const kb = registry.lastKeyboard();
    const text = registry.lastMessage();
    const hasKeyboard = kb !== undefined;
    const hasTextFallback = text.includes("No connectors") || text.includes("disconnect");
    expect(hasKeyboard || hasTextFallback).toBe(true);
  });

  it("/disconnect with unknown connector says unknown", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");

    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/disconnect fakeservice");
    await settle();

    const text = registry.lastMessage();
    expect(text).toContain("Unknown connector");
  });

  it("/auth without args shows all connectors as keyboard buttons", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");

    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/auth");
    await settle();

    const kb = registry.lastKeyboard();
    expect(kb).toBeDefined();
    expect(kb!.text).toContain("Configure a connector");
    // Each button should trigger /auth <name>
    const data = registry.lastKeyboardData();
    expect(data.length).toBeGreaterThan(0);
    expect(data.every((d) => d.startsWith("/auth "))).toBe(true);
  });

  it("/auth with unknown connector shows error", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");

    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/auth fakeservice");
    await settle();

    const text = registry.lastMessage();
    expect(text).toContain("Unknown connector");
  });

  it("/auth with connector name shows required keys", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");

    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/auth twilio");
    await settle();

    const text = registry.lastMessage();
    expect(text).toContain("Twilio");
    expect(text).toContain("Required:");
    expect(text).toContain("TWILIO_ACCOUNT_SID");
  });

  it("/health with unconfigured connector says not configured", async () => {
    const origToken = process.env.ONEDRIVE_ACCESS_TOKEN;
    delete process.env.ONEDRIVE_ACCESS_TOKEN;

    try {
      const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");

      const registry = createMockRegistry();
      startChannelRouter({
        channels: registry as any,
        defaultModel: "claude",
        maxTokens: 4096,
        temperature: 0.3,
        extendedThinking: false,
      });

      emitCommand(registry, "/health onedrive");
      await settle(200);

      const text = registry.lastMessage();
      expect(text).toContain("not configured");
    } finally {
      if (origToken) process.env.ONEDRIVE_ACCESS_TOKEN = origToken;
    }
  });

  it("/health with unknown connector shows error", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");

    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/health fakeservice");
    await settle();

    const text = registry.lastMessage();
    expect(text).toContain("Unknown connector");
  });
});

describe("Channel router — per-chat isolation", () => {
  it("different chats get independent sessions", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");

    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    // Chat 1 creates a session
    emitCommand(registry, "/new", "chat-A");
    await settle();
    const chat1Session = registry.lastMessage();

    // Chat 2 creates a session
    emitCommand(registry, "/new", "chat-B");
    await settle();
    const chat2Session = registry.lastMessage();

    // Sessions should be different
    expect(chat1Session).not.toBe(chat2Session);
  });

  it("clearing one chat does not affect another", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");

    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    // Create sessions for both chats
    emitCommand(registry, "/new", "chat-A");
    await settle();
    emitCommand(registry, "/new", "chat-B");
    await settle();

    // Clear chat A
    emitCommand(registry, "/clear", "chat-A");
    await settle();
    const clearMsg = registry.lastMessage();
    expect(clearMsg).toContain("cleared");

    // Chat B session should still exist
    emitCommand(registry, "/session", "chat-B");
    await settle();
    const sessionMsg = registry.lastMessage();
    expect(sessionMsg).toContain("session:");
  });
});

describe("Channel router — message routing", () => {
  it("slash commands are processed immediately, not queued through agent", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");

    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    // Fire a slash command
    emitCommand(registry, "/status");
    await settle();

    // Should get a response (not queue through agent loop)
    const text = registry.lastMessage();
    expect(text).toContain("uptime:");
  });

  it("empty text is ignored", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");

    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    const metadata: MessageMetadata = {
      channel: "telegram",
      chat_id: "123",
      is_group: false,
    };
    registry.bus.emit("channel:message", { from: "user1", message: "", metadata });
    registry.bus.emit("channel:message", { from: "user1", message: "   ", metadata });
    await settle();

    // No messages should have been sent
    expect(registry.sent.length).toBe(0);
  });
});
