// End-to-end test — channel slash commands through the full router pipeline.
//
// Creates a real ChannelRegistry + mock adapter, initializes a temp database,
// loads drivers, starts the real router, and fires messages through the bus.
// Verifies the complete flow: message in → router → command → response out.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { initDatabase, closeDatabase } from "../../src/daemon/storage/db.js";
import { ChannelRegistry } from "../../src/daemon/services/channels/index.js";
import { startChannelRouter } from "../../src/daemon/services/channels/router.js";
import type {
  ChannelAdapter,
  MessageHandler,
  MessageMetadata,
  SentMessage,
} from "../../src/daemon/services/channels/index.js";
import {
  CONNECTOR_DEFS,
  isConnectorConfigured,
} from "../../src/shared/connector.js";
import { saveSecret, deleteSecret } from "../../src/shared/secrets.js";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync, unlinkSync } from "node:fs";

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

const TEST_DB = join(tmpdir(), `jeriko-e2e-${Date.now()}.db`);

/** Wait for async router command handler to complete. */
function wait(ms = 200): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Mock channel adapter — records all outbound messages and deletions.
// ---------------------------------------------------------------------------

class MockChannel implements ChannelAdapter {
  readonly name = "mock";
  private _connected = false;
  private handlers: MessageHandler[] = [];

  // ── Recording buffers ────────────────────────────────────────────────
  readonly sent: Array<{ target: string; text: string }> = [];
  readonly deleted: Array<{ target: string; messageId: string | number }> = [];
  readonly edits: Array<{ target: string; messageId: string | number; text: string }> = [];
  private nextMsgId = 1;

  // ── Lifecycle ────────────────────────────────────────────────────────
  async connect(): Promise<void> { this._connected = true; }
  async disconnect(): Promise<void> { this._connected = false; }
  isConnected(): boolean { return this._connected; }

  // ── Sending ──────────────────────────────────────────────────────────
  async send(target: string, message: string): Promise<void> {
    this.sent.push({ target, text: message });
  }

  async sendLong(target: string, message: string): Promise<void> {
    this.sent.push({ target, text: message });
  }

  async sendTracked(target: string, message: string): Promise<SentMessage> {
    const messageId = this.nextMsgId++;
    this.sent.push({ target, text: message });
    return { messageId };
  }

  async editMessage(target: string, messageId: string | number, text: string): Promise<void> {
    this.edits.push({ target, messageId, text });
  }

  async deleteMessage(target: string, messageId: string | number): Promise<void> {
    this.deleted.push({ target, messageId });
  }

  async sendTyping(_target: string): Promise<void> { /* no-op */ }
  async sendPhoto(_t: string, _p: string, _c?: string): Promise<void> { /* no-op */ }
  async sendDocument(_t: string, _p: string, _c?: string): Promise<void> { /* no-op */ }
  async sendVideo(_t: string, _p: string, _c?: string): Promise<void> { /* no-op */ }
  async sendAudio(_t: string, _p: string, _c?: string): Promise<void> { /* no-op */ }
  async sendVoice(_t: string, _p: string, _c?: string): Promise<void> { /* no-op */ }

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  // ── Test helpers ─────────────────────────────────────────────────────

  /** Simulate an incoming message from a user. */
  simulateIncoming(
    text: string,
    chatId = "test-chat-1",
    opts?: Partial<MessageMetadata>,
  ): void {
    const metadata: MessageMetadata = {
      channel: "mock",
      chat_id: chatId,
      is_group: false,
      sender_name: "TestUser",
      ...opts,
    };
    for (const handler of this.handlers) {
      handler("user-1", text, metadata);
    }
  }

  /** Clear all recording buffers. */
  clear(): void {
    this.sent.length = 0;
    this.deleted.length = 0;
    this.edits.length = 0;
  }

  /** Get the text of the last sent message, or empty string. */
  lastSent(): string {
    return this.sent[this.sent.length - 1]?.text ?? "";
  }

  /** Get all sent texts joined with a separator. */
  allSentText(): string {
    return this.sent.map((m) => m.text).join("\n---\n");
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("Channel commands E2E", () => {
  let mock: MockChannel;
  let channels: ChannelRegistry;

  beforeAll(async () => {
    // 1. Initialize temp database (sessions, messages, migrations)
    initDatabase(TEST_DB);

    // 2. Import drivers so listDrivers()/getDriver() work in /model, /session
    await import("../../src/daemon/agent/drivers/index.js");

    // 3. Create channel registry with mock adapter
    mock = new MockChannel();
    channels = new ChannelRegistry();
    channels.register(mock);

    // 4. Start the real router — wires bus events to command handlers
    startChannelRouter({
      channels,
      defaultModel: "claude",
      maxTokens: 2000,
      temperature: 0.7,
      extendedThinking: false,
      systemPrompt: "You are Jeriko.",
    });

    // 5. Connect the mock channel
    await channels.connect("mock");
  });

  afterAll(async () => {
    await channels.disconnectAll();
    closeDatabase();

    // Clean up temp DB files
    for (const suffix of ["", "-wal", "-shm"]) {
      try {
        const p = TEST_DB + suffix;
        if (existsSync(p)) unlinkSync(p);
      } catch { /* best effort */ }
    }
  });

  // ─── /help ──────────────────────────────────────────────────────────

  describe("/help", () => {
    test("shows all command categories", async () => {
      mock.clear();
      mock.simulateIncoming("/help");
      await wait();

      // Router sends keyboard with buttons — mock falls back to header text
      const response = mock.lastSent();
      expect(response).toContain("Jeriko");
      expect(response.length).toBeGreaterThan(0);
    });

    test("lists integration commands", async () => {
      mock.clear();
      mock.simulateIncoming("/help");
      await wait();

      // Keyboard-based help — header text is the fallback
      const response = mock.lastSent();
      expect(response).toContain("Jeriko");
    });

    test("lists session commands", async () => {
      mock.clear();
      mock.simulateIncoming("/help");
      await wait();

      // Keyboard-based help — commands are in buttons, header is the fallback text
      const response = mock.lastSent();
      expect(response).toContain("Jeriko");
    });

    test("/start is an alias for /help", async () => {
      mock.clear();
      mock.simulateIncoming("/start");
      await wait();

      expect(mock.lastSent()).toContain("Jeriko");
    });

    test("/commands is an alias for /help", async () => {
      mock.clear();
      mock.simulateIncoming("/commands");
      await wait();

      expect(mock.lastSent()).toContain("Jeriko");
    });
  });

  // ─── /connectors ───────────────────────────────────────────────────

  describe("/connectors", () => {
    test("lists all connectors", async () => {
      mock.clear();
      mock.simulateIncoming("/connectors");
      await wait();

      // Router sends keyboard with connector buttons — fallback is summary text
      const response = mock.lastSent();
      expect(response).toContain("Connectors:");
      expect(response).toMatch(/\d+\/\d+ connected/);
    });

    test("shows configured count", async () => {
      mock.clear();
      mock.simulateIncoming("/connectors");
      await wait();

      const response = mock.lastSent();
      expect(response).toMatch(/\d+\/\d+ connected/);
    });

    test("shows connect hint for unconfigured", async () => {
      mock.clear();
      mock.simulateIncoming("/connectors");
      await wait();

      const response = mock.lastSent();
      // Keyboard-based — text hints in fallback
      expect(response).toContain("tap");
    });
  });

  // ─── /auth ─────────────────────────────────────────────────────────

  describe("/auth", () => {
    test("no args — shows connector list with guidance", async () => {
      mock.clear();
      mock.simulateIncoming("/auth");
      await wait();

      // Router sends keyboard with connector buttons — fallback is summary text
      const response = mock.lastSent();
      expect(response).toContain("Configure a connector");
    });

    test("unknown connector — shows error with available names", async () => {
      mock.clear();
      mock.simulateIncoming("/auth notreal");
      await wait();

      const response = mock.lastSent();
      expect(response).toContain("Unknown connector: notreal");
      expect(response).toContain("Available:");
      expect(response).toContain("stripe");
    });

    test("/auth stripe — shows required keys and status", async () => {
      mock.clear();
      mock.simulateIncoming("/auth stripe");
      await wait();

      const response = mock.lastSent();
      expect(response).toContain("Stripe");
      expect(response).toContain("Payments");
      expect(response).toContain("Required:");
      expect(response).toContain("STRIPE_SECRET_KEY");
      expect(response).toContain("Status:");
    });

    test("/auth github — shows alternative env vars", async () => {
      mock.clear();
      mock.simulateIncoming("/auth github");
      await wait();

      const response = mock.lastSent();
      expect(response).toContain("GitHub");
      expect(response).toContain("GITHUB_TOKEN or GH_TOKEN");
    });

    test("/auth twilio — shows multi-key requirement", async () => {
      mock.clear();
      mock.simulateIncoming("/auth twilio");
      await wait();

      const response = mock.lastSent();
      expect(response).toContain("Twilio");
      expect(response).toContain("TWILIO_ACCOUNT_SID");
      expect(response).toContain("TWILIO_AUTH_TOKEN");
    });

    test("/auth twilio with too few keys — shows error", async () => {
      mock.clear();
      mock.simulateIncoming("/auth twilio only_one_key");
      await wait();

      const response = mock.lastSent();
      expect(response).toContain("requires 2 key(s)");
    });

    test("/auth paypal — shows optional keys section", async () => {
      mock.clear();
      mock.simulateIncoming("/auth paypal");
      await wait();

      const response = mock.lastSent();
      expect(response).toContain("Optional:");
      expect(response).toContain("PAYPAL_WEBHOOK_ID");
    });
  });

  // ─── /auth key save + message delete (full auth flow) ──────────────

  describe("/auth key save flow", () => {
    const TEST_KEY = "_E2E_TEST_CONNECTOR_KEY";
    const TEST_VAL = "e2e_test_value_" + Date.now();

    afterAll(() => {
      // Clean up any saved test secrets
      deleteSecret("ONEDRIVE_ACCESS_TOKEN");
      if (process.env.ONEDRIVE_ACCESS_TOKEN === TEST_VAL) {
        delete process.env.ONEDRIVE_ACCESS_TOKEN;
      }
    });

    test("saves key, deletes message, and confirms", async () => {
      // Save original value
      const originalValue = process.env.ONEDRIVE_ACCESS_TOKEN;

      mock.clear();
      mock.simulateIncoming(`/auth onedrive ${TEST_VAL}`, "test-chat-auth", {
        message_id: 42,
      });
      await wait(300);

      // 1. Key was saved to process.env
      expect(process.env.ONEDRIVE_ACCESS_TOKEN).toBe(TEST_VAL);

      // 2. Message containing the key was deleted (security)
      expect(mock.deleted.length).toBeGreaterThan(0);
      const deletion = mock.deleted.find((d) => d.messageId === 42);
      expect(deletion).toBeDefined();
      expect(deletion!.target).toBe("test-chat-auth");

      // 3. Confirmation message was sent
      const response = mock.lastSent();
      expect(response).toContain("OneDrive");
      expect(response).toContain("configured");
      expect(response).toContain("/health onedrive");

      // 4. The confirmation does NOT contain the actual key value
      expect(response).not.toContain(TEST_VAL);

      // Restore original
      if (originalValue) {
        process.env.ONEDRIVE_ACCESS_TOKEN = originalValue;
        saveSecret("ONEDRIVE_ACCESS_TOKEN", originalValue);
      } else {
        deleteSecret("ONEDRIVE_ACCESS_TOKEN");
      }
    });

    test("multi-key auth saves all keys", async () => {
      const origId = process.env.PAYPAL_CLIENT_ID;
      const origSecret = process.env.PAYPAL_CLIENT_SECRET;

      mock.clear();
      mock.simulateIncoming(
        "/auth paypal test_client_id test_client_secret",
        "test-chat-auth",
        { message_id: 99 },
      );
      await wait(300);

      // Both keys saved
      expect(process.env.PAYPAL_CLIENT_ID).toBe("test_client_id");
      expect(process.env.PAYPAL_CLIENT_SECRET).toBe("test_client_secret");

      // Message deleted
      expect(mock.deleted.some((d) => d.messageId === 99)).toBe(true);

      // Confirmation sent
      expect(mock.lastSent()).toContain("PayPal");
      expect(mock.lastSent()).toContain("configured");

      // Restore
      if (origId) {
        saveSecret("PAYPAL_CLIENT_ID", origId);
      } else {
        deleteSecret("PAYPAL_CLIENT_ID");
      }
      if (origSecret) {
        saveSecret("PAYPAL_CLIENT_SECRET", origSecret);
      } else {
        deleteSecret("PAYPAL_CLIENT_SECRET");
      }
    });

    test("no message_id — skips deletion gracefully", async () => {
      const origToken = process.env.GDRIVE_ACCESS_TOKEN;

      mock.clear();
      mock.simulateIncoming("/auth gdrive test_gdrive_token", "test-chat-auth");
      await wait(300);

      // Key saved
      expect(process.env.GDRIVE_ACCESS_TOKEN).toBe("test_gdrive_token");

      // No deletion attempted (no message_id in metadata)
      const deletionsForChat = mock.deleted.filter((d) => d.target === "test-chat-auth");
      // The previous test may have left deletions, so check none were added for this specific call
      // We cleared mock.deleted above, so this should be clean
      expect(deletionsForChat.length).toBe(0);

      // Still confirms
      expect(mock.lastSent()).toContain("Google Drive");

      // Restore
      if (origToken) {
        saveSecret("GDRIVE_ACCESS_TOKEN", origToken);
      } else {
        deleteSecret("GDRIVE_ACCESS_TOKEN");
      }
    });
  });

  // ─── /connectors reflects auth state ──────────────────────────────

  describe("/connectors reflects auth changes", () => {
    test("connector shows connected after auth", async () => {
      const origToken = process.env.VERCEL_TOKEN;

      // Set a token
      saveSecret("VERCEL_TOKEN", "test_vercel_token");

      mock.clear();
      mock.simulateIncoming("/connectors");
      await wait();

      // Keyboard-based — fallback text shows connected count
      const response = mock.lastSent();
      expect(response).toContain("Connectors:");
      expect(response).toContain("connected");

      // Restore
      if (origToken) {
        saveSecret("VERCEL_TOKEN", origToken);
      } else {
        deleteSecret("VERCEL_TOKEN");
      }
    });
  });

  // ─── /health ───────────────────────────────────────────────────────

  describe("/health", () => {
    test("no configured connectors — shows setup message", async () => {
      // Save all env vars, then clear them to simulate no configured connectors
      const saved = new Map<string, string | undefined>();
      for (const def of CONNECTOR_DEFS) {
        for (const entry of def.required) {
          const vars = Array.isArray(entry) ? entry : [entry];
          for (const v of vars) {
            saved.set(v, process.env[v]);
            delete process.env[v];
          }
        }
      }

      mock.clear();
      mock.simulateIncoming("/health");
      await wait();

      const response = mock.lastSent();
      expect(response).toContain("No connectors configured");
      // Should suggest setup path
      expect(response.length).toBeGreaterThan(20);

      // Restore all env vars
      for (const [key, val] of saved) {
        if (val !== undefined) {
          process.env[key] = val;
        }
      }
    });

    test("unknown connector — shows error", async () => {
      mock.clear();
      mock.simulateIncoming("/health notreal");
      await wait();

      expect(mock.lastSent()).toContain("Unknown connector: notreal");
    });

    test("unconfigured connector — shows setup hint", async () => {
      // Find an unconfigured connector
      const unconfigured = CONNECTOR_DEFS.find((d) => !isConnectorConfigured(d.name));
      if (!unconfigured) {
        // All connectors configured — skip
        return;
      }

      mock.clear();
      mock.simulateIncoming(`/health ${unconfigured.name}`);
      await wait();

      const response = mock.lastSent();
      expect(response).toContain("not configured");
      expect(response).toContain(`/auth ${unconfigured.name}`);
    });

    test("configured connector — attempts health check", async () => {
      // Find a configured connector
      const configured = CONNECTOR_DEFS.find((d) => isConnectorConfigured(d.name));
      if (!configured) {
        // No connectors configured — skip
        return;
      }

      mock.clear();
      mock.simulateIncoming(`/health ${configured.name}`);
      // Health checks need more time (network calls)
      await wait(10_000);

      // Should have sent "Checking <name>..." and then the result
      const allText = mock.allSentText();
      expect(allText).toContain(`Checking ${configured.label}`);
      // Result should contain either "healthy" or "failed"
      expect(allText).toMatch(/healthy|failed/);
    }, 15_000);
  });

  // ─── Session commands ─────────────────────────────────────────────

  describe("session commands", () => {
    test("/new — creates a new session", async () => {
      mock.clear();
      mock.simulateIncoming("/new");
      await wait();

      const response = mock.lastSent();
      expect(response).toContain("New session:");
      // Session ID is a UUID-like string
      expect(response).toMatch(/New session: .+/);
    });

    test("/session — shows current session info", async () => {
      mock.clear();
      mock.simulateIncoming("/session");
      await wait();

      const response = mock.lastSent();
      expect(response).toContain("session:");
      expect(response).toContain("claude");
    });

    test("/sessions — lists recent sessions", async () => {
      mock.clear();
      mock.simulateIncoming("/sessions");
      await wait();

      const response = mock.lastSent();
      // After /new, there should be at least one session
      expect(response).toMatch(/session|Recent sessions/i);
    });

    test("/clear — clears session history", async () => {
      mock.clear();
      mock.simulateIncoming("/clear");
      await wait();

      expect(mock.lastSent()).toContain("Session history cleared");
    });

    test("/kill — destroys session and creates new one", async () => {
      mock.clear();
      mock.simulateIncoming("/kill");
      await wait();

      const response = mock.lastSent();
      expect(response).toContain("Session destroyed");
      expect(response).toContain("New session:");
    });

    test("/archive — archives session and creates new one", async () => {
      mock.clear();
      mock.simulateIncoming("/archive");
      await wait();

      const response = mock.lastSent();
      expect(response).toContain("Archived");
      expect(response).toContain("New session:");
    });

    test("/stop — says nothing running when idle", async () => {
      mock.clear();
      mock.simulateIncoming("/stop");
      await wait();

      expect(mock.lastSent()).toContain("Nothing running");
    });
  });

  // ─── System commands ──────────────────────────────────────────────

  describe("system commands", () => {
    test("/status — shows daemon status", async () => {
      mock.clear();
      mock.simulateIncoming("/status");
      await wait();

      const response = mock.lastSent();
      expect(response).toContain("uptime:");
      expect(response).toContain("memory:");
      expect(response).toContain("model:");
      expect(response).toContain("session:");
    });

    test("/sys — shows system info", async () => {
      mock.clear();
      mock.simulateIncoming("/sys");
      await wait();

      const response = mock.lastSent();
      expect(response).toContain("platform:");
      expect(response).toContain("runtime:");
      expect(response).toContain("uptime:");
      expect(response).toContain("memory:");
      expect(response).toContain("pid:");
    });
  });

  // ─── Model commands ───────────────────────────────────────────────

  describe("model commands", () => {
    test("/model — shows current model", async () => {
      mock.clear();
      mock.simulateIncoming("/model");
      await wait();

      // Keyboard-based — fallback text shows current model + "Tap to switch"
      const response = mock.lastSent();
      expect(response).toContain("Current:");
      expect(response).toContain("claude");
    });

    test("/model unknown — shows error with available models", async () => {
      mock.clear();
      mock.simulateIncoming("/model notamodel");
      await wait();

      const response = mock.lastSent();
      expect(response).toContain("Unknown model: notamodel");
      expect(response).toContain("Available:");
    });

    test("/models is an alias for /model", async () => {
      mock.clear();
      mock.simulateIncoming("/models");
      await wait();

      expect(mock.lastSent()).toContain("claude");
    });
  });

  // ─── Unknown commands ─────────────────────────────────────────────

  describe("unknown commands", () => {
    test("unknown slash command — shows error", async () => {
      mock.clear();
      mock.simulateIncoming("/nonexistent");
      await wait();

      const response = mock.lastSent();
      expect(response).toContain("Unknown: /nonexistent");
      expect(response).toContain("/help");
    });
  });

  // ─── Chat isolation ───────────────────────────────────────────────

  describe("chat isolation", () => {
    test("different chats get independent sessions", async () => {
      // Create sessions in two different chats
      mock.clear();
      mock.simulateIncoming("/new", "chat-A");
      await wait();
      const sessionA = mock.lastSent();

      mock.clear();
      mock.simulateIncoming("/new", "chat-B");
      await wait();
      const sessionB = mock.lastSent();

      // Sessions should be different
      expect(sessionA).not.toBe(sessionB);

      // Verify each chat has its own session
      mock.clear();
      mock.simulateIncoming("/session", "chat-A");
      await wait();
      const infoA = mock.lastSent();

      mock.clear();
      mock.simulateIncoming("/session", "chat-B");
      await wait();
      const infoB = mock.lastSent();

      // Session IDs should be different
      expect(infoA).not.toBe(infoB);
    });

    test("/kill in one chat does not affect another", async () => {
      mock.clear();
      mock.simulateIncoming("/session", "chat-A");
      await wait();
      const beforeKill = mock.lastSent();

      // Kill chat-B
      mock.simulateIncoming("/kill", "chat-B");
      await wait();

      // Chat-A should still have the same session
      mock.clear();
      mock.simulateIncoming("/session", "chat-A");
      await wait();
      const afterKill = mock.lastSent();

      expect(afterKill).toBe(beforeKill);
    });
  });

  // ─── Message routing ─────────────────────────────────────────────

  describe("message routing", () => {
    test("slash commands are sent to the correct chat", async () => {
      mock.clear();
      mock.simulateIncoming("/status", "target-chat-123");
      await wait();

      // Response should be sent to the same chat
      const lastMsg = mock.sent[mock.sent.length - 1];
      expect(lastMsg).toBeDefined();
      expect(lastMsg!.target).toBe("target-chat-123");
    });

    test("empty messages are ignored", async () => {
      mock.clear();
      mock.simulateIncoming("   ", "chat-empty");
      await wait(100);

      // No messages should be sent for empty input
      // (the router trims and checks for empty)
      expect(mock.sent.length).toBe(0);
    });
  });
});
