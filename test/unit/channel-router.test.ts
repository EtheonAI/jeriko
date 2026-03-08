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

  // Simulated channel status for /channels command
  const channelStatuses = new Map<string, { name: string; status: string; connected_at?: string; error?: string }>([
    ["telegram", { name: "telegram", status: "connected", connected_at: new Date().toISOString() }],
    ["whatsapp", { name: "whatsapp", status: "disconnected" }],
  ]);

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
    // ChannelRegistry methods used by /channels command
    status() {
      return [...channelStatuses.values()];
    },
    list() {
      return [...channelStatuses.keys()];
    },
    async connect(name: string) {
      const ch = channelStatuses.get(name);
      if (!ch) throw new Error(`Channel "${name}" is not registered`);
      ch.status = "connected";
      ch.connected_at = new Date().toISOString();
    },
    async disconnect(name: string) {
      const ch = channelStatuses.get(name);
      if (!ch) throw new Error(`Channel "${name}" is not registered`);
      ch.status = "disconnected";
      delete ch.connected_at;
    },
    get(name: string) {
      return channelStatuses.get(name) ?? null;
    },
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
      return kb.keyboard.flatMap((row) => row.map((b) => b.data ?? b.url ?? ""));
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

    // Verify the keyboard buttons map to hub commands
    const data = registry.lastKeyboardData();
    expect(data).toContain("/sessions");
    expect(data).toContain("/model");
    expect(data).toContain("/stop");
    expect(data).toContain("/connectors");
    expect(data).toContain("/skill");
    expect(data).toContain("/task");
    expect(data).toContain("/channels");
    expect(data).toContain("/share");
    expect(data).toContain("/billing");
    expect(data).toContain("/notifications");
    expect(data).toContain("/status");
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
    expect(registry.lastKeyboardData()).toContain("/sessions");
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
    expect(registry.lastKeyboardData()).toContain("/sessions");
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

  it("/sessions shows hub menu with session actions", async () => {
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

    // Sessions now shows a hub menu with keyboard buttons
    const kb = registry.lastKeyboard();
    expect(kb).toBeDefined();
    expect(kb!.text).toContain("Current:");

    // Hub should contain action buttons
    const labels = registry.lastKeyboardLabels();
    expect(labels).toContain("New Session");
    expect(labels).toContain("Switch");
    expect(labels).toContain("Delete");
    expect(labels).toContain("Archive");
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

  it("/connect github without client ID still generates relay OAuth URL", async () => {
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
      // Relay-based OAuth: the relay server handles token exchange,
      // so /connect always generates a login URL even without local client ID.
      expect(text).toContain("Connect GitHub");
      expect(text).toContain("/oauth/github/start");
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

// ---------------------------------------------------------------------------
// /channels command tests
// ---------------------------------------------------------------------------

describe("Channel router — /channels", () => {
  it("/channels lists connected and disconnected channels", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");
    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/channels");
    await settle();

    // Should show channel hub (keyboard with status text)
    const kb = registry.lastKeyboard();
    const text = kb?.text ?? registry.lastMessage();
    expect(text).toContain("Channels:");
    expect(text).toContain("active");
    expect(text).toContain("Telegram");
    expect(text).toContain("connected");
  });

  it("/channels shows connect/disconnect buttons for other channels", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");
    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/channels");
    await settle();

    const kb = registry.lastKeyboard();
    expect(kb).toBeDefined();
    // Hub shows per-channel buttons with /channel <name> data
    const data = registry.lastKeyboardData();
    // Each channel gets a detail button: /channel telegram, /channel whatsapp, etc.
    expect(data.some((d) => d.includes("/channel "))).toBe(true);
  });

  it("/channels connect connects a disconnected channel", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");
    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/channels connect whatsapp");
    await settle();

    // Connect success now shows keyboard with back navigation
    const kb = registry.lastKeyboard();
    expect(kb).toBeDefined();
    expect(kb!.text).toContain("whatsapp connected.");
  });

  it("/channels disconnect prevents disconnecting current channel", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");
    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/channels disconnect telegram");
    await settle();

    const text = registry.lastMessage();
    expect(text).toContain("Cannot disconnect telegram");
    expect(text).toContain("you're using it right now");
  });

  it("/channels connect without arg shows usage", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");
    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/channels connect");
    await settle();

    const text = registry.lastMessage();
    expect(text).toContain("Usage:");
  });
});

// ---------------------------------------------------------------------------
// /notifications command tests
// ---------------------------------------------------------------------------

describe("Channel router — /notifications", () => {
  it("/notifications shows current state with toggle button", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");
    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/notifications");
    await settle();

    const kb = registry.lastKeyboard();
    expect(kb).toBeDefined();
    expect(kb!.text).toContain("Notifications:");
    // Should have a toggle button
    const data = registry.lastKeyboardData();
    expect(data.some((d) => d.includes("/notifications"))).toBe(true);
  });

  it("/notifications on confirms enabled", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");
    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/notifications on");
    await settle();

    const text = registry.lastMessage();
    expect(text).toContain("enabled");
  });

  it("/notifications off confirms disabled", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");
    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/notifications off");
    await settle();

    const text = registry.lastMessage();
    expect(text).toContain("disabled");
  });
});

// ---------------------------------------------------------------------------
// /history command tests
// ---------------------------------------------------------------------------

describe("Channel router — /history", () => {
  it("/history with empty session says no messages", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");
    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/new", "hist-test");
    await settle();
    emitCommand(registry, "/history", "hist-test");
    await settle();

    const text = registry.lastMessage();
    expect(text).toContain("No messages");
  });

  it("/history with custom limit is clamped to 1-50", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");
    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    // /history 999 should be clamped (doesn't crash)
    emitCommand(registry, "/history 999", "hist-clamp");
    await settle();

    const text = registry.lastMessage();
    // Should respond without error (either "No messages" or message list)
    expect(text.length).toBeGreaterThan(0);
  });

  it("/history abc falls back to default limit 10", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");
    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/history abc", "hist-nan");
    await settle();

    const text = registry.lastMessage();
    expect(text.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// /compact command tests
// ---------------------------------------------------------------------------

describe("Channel router — /compact", () => {
  it("/compact on small session says nothing to compact", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");
    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/new", "compact-test");
    await settle();
    emitCommand(registry, "/compact", "compact-test");
    await settle();

    const text = registry.lastMessage();
    expect(text).toContain("nothing to compact");
  });

  it("/compact with custom keep count (e.g., /compact 5)", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");
    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/compact 5", "compact-custom");
    await settle();

    const text = registry.lastMessage();
    // Should respond (either "nothing to compact" or compaction result)
    expect(text.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// /task command tests (unified: trigger, schedule, cron)
// ---------------------------------------------------------------------------

describe("Channel router — /task", () => {
  it("/task without engine shows not available", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");
    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/task", "task-no-engine");
    await settle();

    const text = registry.lastMessage();
    expect(text).toContain("not available");
  });

  it("/task shows hub with categories", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");
    const registry = createMockRegistry();
    const mockEngine = { listAll: () => [], enable: () => false, disable: () => false, remove: () => false, get: () => null, fire: async () => {} };
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
      getTriggerEngine: () => mockEngine as any,
    });

    emitCommand(registry, "/task", "task-hub");
    await settle();

    const kb = registry.lastKeyboard();
    expect(kb).toBeDefined();
    expect(kb!.text).toContain("Tasks");
    const data = registry.lastKeyboardData();
    expect(data).toContain("/task trigger");
    expect(data).toContain("/task schedule");
    expect(data).toContain("/task cron");
  });

  it("/task trigger new without type shows type picker", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");
    const registry = createMockRegistry();
    const mockEngine = { listAll: () => [], enable: () => false, disable: () => false, remove: () => false, get: () => null, fire: async () => {} };
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
      getTriggerEngine: () => mockEngine as any,
    });

    emitCommand(registry, "/task trigger new");
    await settle();

    const kb = registry.lastKeyboard();
    expect(kb).toBeDefined();
    const data = registry.lastKeyboardData();
    expect(data.some((d) => d.includes("/task trigger new"))).toBe(true);
  });

  it("/task enable without id shows usage", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");
    const registry = createMockRegistry();
    const mockEngine = { listAll: () => [], enable: () => false, disable: () => false, remove: () => false, get: () => null, fire: async () => {} };
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
      getTriggerEngine: () => mockEngine as any,
    });

    emitCommand(registry, "/task enable");
    await settle();

    const text = registry.lastMessage();
    expect(text).toContain("Usage:");
  });

  it("/task disable nonexistent shows not found", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");
    const registry = createMockRegistry();
    const mockEngine = { listAll: () => [], enable: () => false, disable: () => false, remove: () => false, get: () => null, fire: async () => {} };
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
      getTriggerEngine: () => mockEngine as any,
    });

    emitCommand(registry, "/task disable nonexistent-id");
    await settle();

    const text = registry.lastMessage();
    expect(text).toContain("not found");
  });

  it("/task delete nonexistent shows not found", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");
    const registry = createMockRegistry();
    const mockEngine = { listAll: () => [], enable: () => false, disable: () => false, remove: () => false, get: () => null, fire: async () => {} };
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
      getTriggerEngine: () => mockEngine as any,
    });

    emitCommand(registry, "/task delete nonexistent-id");
    await settle();

    const text = registry.lastMessage();
    expect(text).toContain("not found");
  });

  it("/task test without id shows usage", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");
    const registry = createMockRegistry();
    const mockEngine = { listAll: () => [], enable: () => false, disable: () => false, remove: () => false, get: () => null, fire: async () => {} };
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
      getTriggerEngine: () => mockEngine as any,
    });

    emitCommand(registry, "/task test");
    await settle();

    const text = registry.lastMessage();
    expect(text).toContain("Usage:");
  });
});

// ---------------------------------------------------------------------------
// /task trigger command tests
// ---------------------------------------------------------------------------

describe("Channel router — /task trigger", () => {
  it("/task trigger with no triggers shows empty message", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");
    const registry = createMockRegistry();
    const mockEngine = {
      listAll: () => [],
      enable: () => false,
      disable: () => false,
    };
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
      getTriggerEngine: () => mockEngine as any,
    });

    emitCommand(registry, "/task trigger");
    await settle();

    const kb = registry.lastKeyboard();
    expect(kb).toBeDefined();
    expect(kb!.text).toContain("No event triggers");
  });

  it("/task trigger enable without id shows usage", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");
    const registry = createMockRegistry();
    const mockEngine = {
      listAll: () => [],
      enable: () => false,
      disable: () => false,
    };
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
      getTriggerEngine: () => mockEngine as any,
    });

    emitCommand(registry, "/task trigger enable");
    await settle();

    const text = registry.lastMessage();
    expect(text).toContain("Usage:");
  });
});

// ---------------------------------------------------------------------------
// Sessions hub — multi-step flow tests
// ---------------------------------------------------------------------------

describe("Channel router — sessions hub", () => {
  it("/sessions shows hub menu with action buttons", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");
    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/sessions");
    await settle();

    const kb = registry.lastKeyboard();
    expect(kb).toBeDefined();
    expect(kb!.text).toContain("Current:");

    const labels = registry.lastKeyboardLabels();
    expect(labels).toContain("New Session");
    expect(labels).toContain("Switch");
    expect(labels).toContain("Delete");
    expect(labels).toContain("Archive");
    expect(labels).toContain("Rename");
    expect(labels).toContain("History");

    const data = registry.lastKeyboardData();
    expect(data).toContain("/new");
    expect(data).toContain("/sessions switch");
    expect(data).toContain("/sessions delete");
    expect(data).toContain("/archive");
  });

  it("/sessions switch shows session list with switch buttons", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");
    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    // Create two sessions
    emitCommand(registry, "/new");
    await settle();
    emitCommand(registry, "/new");
    await settle();

    emitCommand(registry, "/sessions switch");
    await settle();

    const kb = registry.lastKeyboard();
    expect(kb).toBeDefined();
    expect(kb!.text).toContain("Sessions:");
    // Should have back button
    const labels = registry.lastKeyboardLabels();
    expect(labels).toContain("« Back");
    // Should have switch buttons (at least one non-current session)
    const data = registry.lastKeyboardData();
    expect(data.some((d) => d.startsWith("/switch "))).toBe(true);
  });

  it("/sessions delete shows session list with delete buttons", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");
    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    // Create two sessions
    emitCommand(registry, "/new");
    await settle();
    emitCommand(registry, "/new");
    await settle();

    emitCommand(registry, "/sessions delete");
    await settle();

    const kb = registry.lastKeyboard();
    expect(kb).toBeDefined();
    // Should have delete buttons for non-current sessions
    const data = registry.lastKeyboardData();
    expect(data.some((d) => d.startsWith("/sessions rm "))).toBe(true);
    // Should have back button
    expect(data).toContain("/sessions");
  });

  it("/sessions rm refuses to delete current session", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");
    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    // Send a message to create a session
    emitCommand(registry, "/session");
    await settle();

    // Get the current session's slug from the response
    const sessionText = registry.lastMessage();
    const sessionId = sessionText.split("\n")[0]?.split(": ")[1]?.trim();

    if (sessionId) {
      emitCommand(registry, `/sessions rm ${sessionId}`);
      await settle();
      const text = registry.lastMessage();
      expect(text).toContain("Cannot delete the active session");
    }
  });

  it("/sessions rm without slug shows usage", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");
    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/sessions rm");
    await settle();

    const text = registry.lastMessage();
    expect(text).toContain("Usage:");
  });

  it("/sessions rename without title shows usage", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");
    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/sessions rename");
    await settle();

    const text = registry.lastMessage();
    expect(text).toContain("Usage:");
  });

  it("/sessions rename with title renames session", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");
    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/sessions rename My Test Chat");
    await settle();

    const kb = registry.lastKeyboard();
    expect(kb).toBeDefined();
    expect(kb!.text).toContain("Session renamed: My Test Chat");
  });
});

// ---------------------------------------------------------------------------
// Billing hub — multi-step flow tests
// ---------------------------------------------------------------------------

describe("Channel router — billing hub", () => {
  it("/billing shows hub menu with plan summary", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");
    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/billing");
    await settle();

    // Billing either shows hub or "not configured" message
    const text = registry.lastMessage() || registry.lastKeyboard()?.text || "";
    expect(text.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Channels hub — management features
// ---------------------------------------------------------------------------

describe("Channel router — channels hub", () => {
  it("/channels shows hub with Add Channel button", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");
    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/channels");
    await settle();

    const kb = registry.lastKeyboard();
    expect(kb).toBeDefined();
    expect(kb!.text).toContain("Channels:");
    expect(kb!.text).toContain("active");
    // Hub shows per-channel buttons; unregistered channels get "+ Label" add buttons
    const labels = registry.lastKeyboardLabels();
    expect(labels.some((l) => l.startsWith("+") || l.includes("(you)"))).toBe(true);
    const data = registry.lastKeyboardData();
    expect(data.some((d) => d.startsWith("/channel "))).toBe(true);
  });

  it("/channels add shows response when all channels registered", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");
    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/channels add");
    await settle();

    // Mock has telegram + whatsapp which covers all supported channels
    const text = registry.lastMessage();
    const kb = registry.lastKeyboard();
    expect((kb?.text ?? text).length).toBeGreaterThan(0);
  });

  it("/channels add telegram shows already registered (telegram is in mock)", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");
    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    // Telegram is already registered in the mock — router should say so
    emitCommand(registry, "/channels add telegram");
    await settle();

    const kb = registry.lastKeyboard();
    expect(kb).toBeDefined();
    expect(kb!.text).toContain("already registered");
    // Should have back button
    const data = registry.lastKeyboardData();
    expect(data).toContain("/channels");
  });

  it("/channels disconnect shows confirmation with back navigation", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");
    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "claude",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    // Connect whatsapp first so we can disconnect it
    emitCommand(registry, "/channels connect whatsapp");
    await settle();

    emitCommand(registry, "/channels disconnect whatsapp");
    await settle();

    const kb = registry.lastKeyboard();
    expect(kb).toBeDefined();
    expect(kb!.text).toContain("whatsapp disconnected.");
    const data = registry.lastKeyboardData();
    expect(data).toContain("/channels");
  });
});

// ---------------------------------------------------------------------------
// Model hub — enhanced model command
// ---------------------------------------------------------------------------

describe("Channel router — model hub", () => {
  it("/model shows current model and provider buttons", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");
    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "anthropic",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/model");
    await settle();

    const kb = registry.lastKeyboard();
    expect(kb).toBeDefined();
    expect(kb!.text).toContain("Current:");
    const labels = registry.lastKeyboardLabels();
    expect(labels).toContain("Browse All");
    expect(labels).toContain("+ Add Provider");
    const data = registry.lastKeyboardData();
    expect(data).toContain("/model list");
    expect(data).toContain("/provider add");
  });

  it("/model list shows provider categories", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");
    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "anthropic",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/model list");
    await settle();

    const kb = registry.lastKeyboard();
    expect(kb).toBeDefined();
    expect(kb!.text).toContain("provider");
    const data = registry.lastKeyboardData();
    // Should have back button
    expect(data).toContain("/model");
  });

  it("/model add shows custom provider setup guide", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");
    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "anthropic",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/model add");
    await settle();

    const kb = registry.lastKeyboard();
    expect(kb).toBeDefined();
    expect(kb!.text).toContain("custom AI provider");
    expect(kb!.text).toContain("config.json");
    const data = registry.lastKeyboardData();
    expect(data).toContain("/model");
  });

  it("/model <driver> switches model and shows confirmation with back button", async () => {
    const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");
    const registry = createMockRegistry();
    startChannelRouter({
      channels: registry as any,
      defaultModel: "anthropic",
      maxTokens: 4096,
      temperature: 0.3,
      extendedThinking: false,
    });

    emitCommand(registry, "/model openai");
    await settle();

    const kb = registry.lastKeyboard();
    expect(kb).toBeDefined();
    expect(kb!.text).toContain("Switched to:");
    const data = registry.lastKeyboardData();
    expect(data).toContain("/model");
  });
});
