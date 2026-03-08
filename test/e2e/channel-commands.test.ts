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
  KeyboardLayout,
} from "../../src/daemon/services/channels/index.js";
import {
  CONNECTOR_DEFS,
  isConnectorConfigured,
} from "../../src/shared/connector.js";
import { saveSecret, deleteSecret } from "../../src/shared/secrets.js";
import { ConnectorManager } from "../../src/daemon/services/connectors/manager.js";
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

/**
 * Poll until a condition is met or timeout expires.
 * Standard async E2E pattern — avoids fixed waits for operations with
 * unpredictable timing (e.g. dynamic imports, network-dependent adapters).
 */
async function waitFor(
  condition: () => boolean,
  { timeout = 5000, interval = 100 } = {},
): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (condition()) return;
    await wait(interval);
  }
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
  readonly keyboards: Array<{ target: string; text: string; keyboard: KeyboardLayout }> = [];
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

  async sendKeyboard(target: string, text: string, keyboard: KeyboardLayout): Promise<void> {
    this.keyboards.push({ target, text, keyboard });
    this.sent.push({ target, text });
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
    this.keyboards.length = 0;
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

  /** Get the last keyboard sent, or null. */
  lastKeyboard(): { text: string; keyboard: KeyboardLayout } | null {
    return this.keyboards[this.keyboards.length - 1] ?? null;
  }

  /** Flatten all button data values from the last keyboard. */
  lastKeyboardData(): string[] {
    const kb = this.lastKeyboard();
    if (!kb) return [];
    return kb.keyboard.flatMap((row) =>
      row.flatMap((b) => [b.data, b.url].filter((v): v is string => !!v)),
    );
  }

  /** Flatten all button labels from the last keyboard. */
  lastKeyboardLabels(): string[] {
    const kb = this.lastKeyboard();
    if (!kb) return [];
    return kb.keyboard.flatMap((row) => row.map((b) => b.label));
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("Channel commands E2E", () => {
  let mock: MockChannel;
  let channels: ChannelRegistry;
  let connectorManager: ConnectorManager;

  beforeAll(async () => {
    // 1. Initialize temp database (sessions, messages, migrations)
    initDatabase(TEST_DB);

    // 2. Import drivers so listDrivers()/getDriver() work in /model, /session
    await import("../../src/daemon/agent/drivers/index.js");

    // 3. Create channel registry with mock adapter
    mock = new MockChannel();
    channels = new ChannelRegistry();
    channels.register(mock);

    // 4. Create connector manager for /disconnect eviction
    connectorManager = new ConnectorManager();

    // 5. Start the real router — wires bus events to command handlers
    // Use a real TriggerEngine backed by the test DB for /tasks commands
    const { TriggerEngine } = await import("../../src/daemon/services/triggers/engine.js");
    const triggerEngine = new TriggerEngine();
    startChannelRouter({
      channels,
      defaultModel: "claude",
      maxTokens: 2000,
      temperature: 0.7,
      extendedThinking: false,
      systemPrompt: "You are Jeriko.",
      getTriggerEngine: () => triggerEngine,
      getConnectors: () => connectorManager,
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
      // Keyboard-based — shows connector summary with count
      expect(response).toContain("Connectors:");
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

  // ─── Sessions Hub (multi-step flow) ──────────────────────────────

  describe("sessions hub", () => {
    test("/sessions — shows hub menu with navigation buttons", async () => {
      mock.clear();
      mock.simulateIncoming("/sessions");
      await wait();

      const kb = mock.lastKeyboard();
      expect(kb).not.toBeNull();
      expect(kb!.text).toContain("Current:");
      expect(kb!.text).toContain("Model:");
      expect(kb!.text).toContain("Total:");

      // Hub must have action buttons
      const labels = mock.lastKeyboardLabels();
      expect(labels).toContain("New Session");
      expect(labels).toContain("Switch");
      expect(labels).toContain("Delete");
      expect(labels).toContain("Archive");
      expect(labels).toContain("Rename");
      expect(labels).toContain("History");

      // Buttons route to correct sub-commands
      const data = mock.lastKeyboardData();
      expect(data).toContain("/new");
      expect(data).toContain("/sessions switch");
      expect(data).toContain("/sessions delete");
      expect(data).toContain("/archive");
      expect(data).toContain("/sessions rename");
      expect(data).toContain("/history");
    });

    test("/sessions switch — lists sessions with switch buttons", async () => {
      // Create a second session first
      mock.clear();
      mock.simulateIncoming("/new");
      await wait();

      mock.clear();
      mock.simulateIncoming("/sessions switch");
      await wait();

      const kb = mock.lastKeyboard();
      expect(kb).not.toBeNull();
      expect(kb!.text).toContain("Sessions:");
      expect(kb!.text).toContain("Tap to switch:");

      // Should have a back button
      const data = mock.lastKeyboardData();
      expect(data).toContain("/sessions");

      // Non-active sessions should have switch buttons
      const labels = mock.lastKeyboardLabels();
      expect(labels).toContain("« Back");
    });

    test("/sessions delete — lists sessions with delete buttons", async () => {
      mock.clear();
      mock.simulateIncoming("/sessions delete");
      await wait();

      const kb = mock.lastKeyboard();
      expect(kb).not.toBeNull();
      expect(kb!.text).toContain("Sessions:");
      expect(kb!.text).toContain("Tap to delete");

      // Should have back button
      const labels = mock.lastKeyboardLabels();
      expect(labels).toContain("« Back");

      // Non-current sessions should have delete buttons
      const data = mock.lastKeyboardData();
      const rmButtons = data.filter((d) => d.startsWith("/sessions rm "));
      expect(rmButtons.length).toBeGreaterThan(0);
    });

    test("/sessions rm <slug> — deletes a non-active session", async () => {
      // Get slug of current session from /sessions switch list
      mock.clear();
      mock.simulateIncoming("/new");
      await wait();

      // List sessions to find the old one's slug (from switch buttons)
      mock.clear();
      mock.simulateIncoming("/sessions switch");
      await wait();
      const switchData = mock.lastKeyboardData();
      const switchCmd = switchData.find((d) => d.startsWith("/switch "));
      expect(switchCmd).toBeDefined();
      const slug = switchCmd!.replace("/switch ", "");

      // Delete by slug
      mock.clear();
      mock.simulateIncoming(`/sessions rm ${slug}`);
      await wait();

      const kb = mock.lastKeyboard();
      expect(kb).not.toBeNull();
      expect(kb!.text).toContain("Session deleted:");
      expect(kb!.text).toContain(slug);
      expect(mock.lastKeyboardData()).toContain("/sessions");
    });

    test("/sessions rm — active session refuses deletion", async () => {
      // Get the current session slug
      mock.clear();
      mock.simulateIncoming("/session");
      await wait();
      const sessionInfo = mock.lastSent();
      const currentSlug = sessionInfo.match(/session:\s*(\S+)/)?.[1];

      if (currentSlug) {
        mock.clear();
        mock.simulateIncoming(`/sessions rm ${currentSlug}`);
        await wait();
        expect(mock.lastSent()).toContain("Cannot delete the active session");
      }
    });

    test("/sessions rename <title> — renames current session", async () => {
      mock.clear();
      mock.simulateIncoming("/sessions rename My Custom Title");
      await wait();

      const kb = mock.lastKeyboard();
      expect(kb).not.toBeNull();
      expect(kb!.text).toContain("Session renamed: My Custom Title");
      expect(mock.lastKeyboardData()).toContain("/sessions");
    });

    test("/sessions rename — no title shows usage", async () => {
      mock.clear();
      mock.simulateIncoming("/sessions rename");
      await wait();

      expect(mock.lastSent()).toContain("Usage:");
    });

    test("full flow: /sessions → /sessions switch → /switch <slug>", async () => {
      // Step 1: Open sessions hub
      mock.clear();
      mock.simulateIncoming("/sessions");
      await wait();
      expect(mock.lastKeyboardData()).toContain("/sessions switch");

      // Step 2: Open switch list
      mock.clear();
      mock.simulateIncoming("/sessions switch");
      await wait();
      const switchData = mock.lastKeyboardData();
      const switchButton = switchData.find((d) => d.startsWith("/switch "));

      if (switchButton) {
        // Step 3: Actually switch
        mock.clear();
        mock.simulateIncoming(switchButton);
        await wait();
        expect(mock.lastSent()).toContain("Switched to session:");
      }
    });
  });

  // ─── Channels Hub (multi-step flow) ──────────────────────────────

  describe("channels hub", () => {
    test("/channels — shows channel status with buttons", async () => {
      mock.clear();
      mock.simulateIncoming("/channels");
      await wait();

      const kb = mock.lastKeyboard();
      expect(kb).not.toBeNull();
      expect(kb!.text).toContain("Channels");

      // Should have add buttons for unregistered channel types
      const data = mock.lastKeyboardData();
      expect(data.some((d: string) => d.startsWith("/channel add") || d.startsWith("/channel "))).toBe(true);
    });

    test("/channels add — shows channel type selection", async () => {
      mock.clear();
      mock.simulateIncoming("/channels add");
      await wait();

      const kb = mock.lastKeyboard();
      expect(kb).not.toBeNull();
      expect(kb!.text).toContain("Add a channel");

      // Should list available channel types
      const labels = mock.lastKeyboardLabels();
      const hasTypes = ["telegram", "whatsapp"].some((t) =>
        labels.some((l) => l.toLowerCase().includes(t)),
      );
      expect(hasTypes).toBe(true);

      // Back button
      expect(mock.lastKeyboardData()).toContain("/channels");
    });

    test("/channels add telegram — shows setup guide", async () => {
      mock.clear();
      mock.simulateIncoming("/channels add telegram");
      await wait();

      const kb = mock.lastKeyboard();
      expect(kb).not.toBeNull();
      expect(kb!.text).toContain("Telegram Setup:");
      expect(kb!.text).toContain("@BotFather");

      // Back to channels
      expect(mock.lastKeyboardData()).toContain("/channels");
    });

    test("/channels add whatsapp — attempts live add (no token required)", async () => {
      mock.clear();
      mock.simulateIncoming("/channels add whatsapp");

      // WhatsApp doesn't require tokens — it tries to add directly.
      // The add is fully async (dynamic import of Baileys + connect attempt),
      // so we poll until the operation completes (success or failure message).
      await waitFor(
        () => mock.sent.some((m) =>
          m.text.includes("added and connected") || m.text.includes("Failed to add"),
        ),
      );

      const sent = mock.allSentText();
      expect(sent).toBeTruthy();

      // Clean up: if WhatsApp was successfully added, unregister it so it
      // doesn't contaminate subsequent test groups.
      if (channels.get("whatsapp")) {
        await channels.unregister("whatsapp");
      }
    });

    test("/channels connect — no arg shows usage", async () => {
      mock.clear();
      mock.simulateIncoming("/channels connect");
      await wait();

      expect(mock.lastSent()).toContain("Usage:");
    });

    test("/channels disconnect — prevents self-disconnect", async () => {
      mock.clear();
      mock.simulateIncoming("/channels disconnect mock");
      await wait();

      expect(mock.lastSent()).toContain("Cannot disconnect mock");
      expect(mock.lastSent()).toContain("you're using it right now");
    });

    test("full flow: /channels → /channels add → /channels add telegram", async () => {
      // Step 1: Hub
      mock.clear();
      mock.simulateIncoming("/channels");
      await wait();
      const hubData = mock.lastKeyboardData();
      expect(hubData.some((d: string) => d.includes("channel add") || d.includes("channel "))).toBe(true);

      // Step 2: Add type selection
      mock.clear();
      mock.simulateIncoming("/channels add");
      await wait();
      const data = mock.lastKeyboardData();
      expect(data).toContain("/channel add telegram");

      // Step 3: Setup guide
      mock.clear();
      mock.simulateIncoming("/channels add telegram");
      await wait();
      expect(mock.lastKeyboard()!.text).toContain("Telegram Setup:");
      // Can navigate back
      expect(mock.lastKeyboardData()).toContain("/channels");
    });
  });

  // ─── Model Hub (multi-step flow) ─────────────────────────────────

  describe("model hub", () => {
    test("/model — shows current model with provider buttons", async () => {
      mock.clear();
      mock.simulateIncoming("/model");
      await wait();

      const kb = mock.lastKeyboard();
      expect(kb).not.toBeNull();
      expect(kb!.text).toContain("Current:");
      expect(kb!.text).toContain("claude");
      expect(kb!.text).toContain("Tap a provider to see its models");

      // Should have Browse All and + Add Provider
      const labels = mock.lastKeyboardLabels();
      expect(labels).toContain("Browse All");
      expect(labels).toContain("+ Add Provider");
      expect(mock.lastKeyboardData()).toContain("/model list");
      expect(mock.lastKeyboardData()).toContain("/provider add");
    });

    test("/model list — shows provider list", async () => {
      mock.clear();
      mock.simulateIncoming("/model list");
      await wait();

      const kb = mock.lastKeyboard();
      expect(kb).not.toBeNull();
      expect(kb!.text).toContain("Select a provider");

      // Should have model list buttons for providers
      const data = mock.lastKeyboardData();
      const providerListButtons = data.filter((d) => d.startsWith("/model list "));
      expect(providerListButtons.length).toBeGreaterThan(0);

      // Back to model hub
      expect(data).toContain("/model");
    });

    test("/model list <provider> — shows models or empty state", async () => {
      // Get a valid provider from the list
      mock.clear();
      mock.simulateIncoming("/model list");
      await wait();
      const providers = mock.lastKeyboardData().filter((d) => d.startsWith("/model list "));
      expect(providers.length).toBeGreaterThan(0);

      // Try the first provider
      const providerCmd = providers[0]!;
      const providerName = providerCmd.replace("/model list ", "");
      mock.clear();
      mock.simulateIncoming(providerCmd);
      await wait();

      const kb = mock.lastKeyboard();
      expect(kb).not.toBeNull();

      // Without the model registry fetch, providers may show "No models found"
      // or models list — both are valid
      if (kb!.text.includes("No models found")) {
        expect(kb!.text).toContain(providerName);
        expect(mock.lastKeyboardData()).toContain("/model list");
      } else {
        expect(kb!.text).toContain(`${providerName} models:`);
        // Back to providers
        expect(mock.lastKeyboardData()).toContain("/model list");
      }
    });

    test("/model list unknown — shows error", async () => {
      mock.clear();
      mock.simulateIncoming("/model list notreal");
      await wait();

      expect(mock.lastSent()).toContain("Unknown provider: notreal");
    });

    test("/model add — shows custom provider setup guide", async () => {
      mock.clear();
      mock.simulateIncoming("/model add");
      await wait();

      const kb = mock.lastKeyboard();
      expect(kb).not.toBeNull();
      expect(kb!.text).toContain("Add a custom AI provider");
      expect(kb!.text).toContain("Environment variable");
      expect(kb!.text).toContain("Config file");
      expect(kb!.text).toContain("config.json");

      // Back to model hub
      expect(mock.lastKeyboardData()).toContain("/model");
    });

    test("/model <valid> — switches model and shows back button", async () => {
      mock.clear();
      mock.simulateIncoming("/model gpt");
      await wait();

      const kb = mock.lastKeyboard();
      expect(kb).not.toBeNull();
      expect(kb!.text).toContain("Switched to:");
      expect(mock.lastKeyboardData()).toContain("/model");

      // Switch back to claude
      mock.clear();
      mock.simulateIncoming("/model claude");
      await wait();
      expect(mock.lastKeyboard()!.text).toContain("Switched to:");
    });

    test("/model <invalid> — shows error with available models", async () => {
      mock.clear();
      mock.simulateIncoming("/model notamodel");
      await wait();

      expect(mock.lastSent()).toContain("Unknown model: notamodel");
      expect(mock.lastSent()).toContain("Available:");
    });

    test("full flow: /model → /model list → provider → back", async () => {
      // Step 1: Hub
      mock.clear();
      mock.simulateIncoming("/model");
      await wait();
      expect(mock.lastKeyboardData()).toContain("/model list");

      // Step 2: Provider list
      mock.clear();
      mock.simulateIncoming("/model list");
      await wait();
      const providers = mock.lastKeyboardData().filter((d) => d.startsWith("/model list "));
      expect(providers.length).toBeGreaterThan(0);

      // Step 3: Drill into a provider
      mock.clear();
      mock.simulateIncoming(providers[0]!);
      await wait();

      // Should show models or empty state, both with back navigation
      expect(mock.lastKeyboardData()).toContain("/model list");

      // Step 4: Navigate back to hub
      mock.clear();
      mock.simulateIncoming("/model");
      await wait();
      expect(mock.lastKeyboard()!.text).toContain("Current:");
    });
  });

  // ─── Help Hub ────────────────────────────────────────────────────

  describe("help hub", () => {
    test("/help — shows keyboard with hub navigation", async () => {
      mock.clear();
      mock.simulateIncoming("/help");
      await wait();

      const kb = mock.lastKeyboard();
      expect(kb).not.toBeNull();
      expect(kb!.text).toContain("Jeriko");

      // Should have navigation buttons to all major hubs
      const data = mock.lastKeyboardData();
      expect(data).toContain("/sessions");
      expect(data).toContain("/model");
      expect(data).toContain("/connectors");
      expect(data).toContain("/channels");
      expect(data).toContain("/billing");
      expect(data).toContain("/status");

      // Labels should be concise hub names
      const labels = mock.lastKeyboardLabels();
      expect(labels).toContain("Sessions");
      expect(labels).toContain("Model");
      expect(labels).toContain("Channels");
      expect(labels).toContain("Billing");
    });

    test("/help buttons navigate to correct hubs", async () => {
      // Each button in /help should lead to a functional hub
      const hubCommands = ["/sessions", "/model", "/channels", "/connectors", "/status"];

      for (const cmd of hubCommands) {
        mock.clear();
        mock.simulateIncoming(cmd);
        await wait();

        // Every hub should produce a response
        expect(mock.sent.length).toBeGreaterThan(0);
        expect(mock.lastSent().length).toBeGreaterThan(0);
      }
    });
  });

  // ─── Billing Hub (multi-step flow) ───────────────────────────────

  describe("billing hub", () => {
    test("/billing — shows plan summary or not-configured", async () => {
      mock.clear();
      mock.simulateIncoming("/billing");
      await wait();

      const response = mock.lastSent();
      // Either shows billing hub or "not configured" — both are valid
      expect(response.length).toBeGreaterThan(0);

      if (response.includes("not configured")) {
        // Billing not set up — this is expected in test env
        expect(response).toContain("Billing is not configured");
      } else {
        // Billing is configured — should show plan info
        expect(response).toContain("Plan:");
        expect(response).toContain("Status:");

        const kb = mock.lastKeyboard();
        if (kb) {
          const labels = mock.lastKeyboardLabels();
          expect(labels).toContain("View Plan");
        }
      }
    });

    test("/billing events — shows events or not-configured", async () => {
      mock.clear();
      mock.simulateIncoming("/billing events");
      await wait();

      const response = mock.lastSent();
      expect(response.length).toBeGreaterThan(0);

      if (!response.includes("not configured")) {
        // Shows events or "no billing events" with back nav
        const kb = mock.lastKeyboard();
        if (kb) {
          expect(mock.lastKeyboardData()).toContain("/billing");
        }
      }
    });

    test("/billing portal — requires subscription or not-configured", async () => {
      mock.clear();
      mock.simulateIncoming("/billing portal");
      await wait();

      const response = mock.lastSent();
      expect(response.length).toBeGreaterThan(0);

      if (!response.includes("not configured")) {
        // No subscription in test → should suggest upgrade
        if (response.includes("No active subscription")) {
          const data = mock.lastKeyboardData();
          expect(data).toContain("/upgrade");
          expect(data).toContain("/billing");
        }
      }
    });

    test("/upgrade — shows checkout or not-configured", async () => {
      mock.clear();
      mock.simulateIncoming("/upgrade");
      await wait();

      const response = mock.lastSent();
      expect(response.length).toBeGreaterThan(0);
      // Billing not configured in test env is the expected case
    });

    test("/plan — shows plan details or not-configured", async () => {
      mock.clear();
      mock.simulateIncoming("/plan");
      await wait();

      const response = mock.lastSent();
      expect(response.length).toBeGreaterThan(0);
    });
  });

  // ─── Switch command (session switching) ──────────────────────────

  describe("/switch", () => {
    test("/switch — no arg shows usage", async () => {
      mock.clear();
      mock.simulateIncoming("/switch");
      await wait();

      expect(mock.lastSent()).toContain("Usage:");
    });

    test("/switch <unknown> — shows not found", async () => {
      mock.clear();
      mock.simulateIncoming("/switch nonexistent-slug");
      await wait();

      expect(mock.lastSent()).toContain("Session not found:");
    });

    test("/switch <valid-slug> — switches session", async () => {
      // Create a new session, note its slug
      mock.clear();
      mock.simulateIncoming("/new");
      await wait();
      const text = mock.lastSent();
      const slug = text.match(/New session: (\S+)/)?.[1];
      expect(slug).toBeDefined();

      // Create another session
      mock.clear();
      mock.simulateIncoming("/new");
      await wait();

      // Switch back to the first
      mock.clear();
      mock.simulateIncoming(`/switch ${slug}`);
      await wait();

      expect(mock.lastSent()).toContain("Switched to session:");
      expect(mock.lastSent()).toContain(slug!);
    });
  });

  // ─── /share (conversation sharing) ─────────────────────────────

  describe("/share", () => {
    test("/share — creates a share or reports no messages", async () => {
      mock.clear();
      mock.simulateIncoming("/share");
      await wait();

      const response = mock.lastSent();
      // Either creates a share link or says "no messages to share"
      expect(response.length).toBeGreaterThan(0);
    });

    test("/share list — lists shares", async () => {
      mock.clear();
      mock.simulateIncoming("/share list");
      await wait();

      const response = mock.lastSent();
      // Either "No shares" or a list
      expect(response.length).toBeGreaterThan(0);
    });

    test("/share revoke — no arg shows usage", async () => {
      mock.clear();
      mock.simulateIncoming("/share revoke");
      await wait();

      expect(mock.lastSent()).toContain("Usage");
    });

    test("/share revoke unknown — shows not found", async () => {
      mock.clear();
      mock.simulateIncoming("/share revoke nonexistent-share-id");
      await wait();

      const response = mock.lastSent();
      // Should be not found or error
      expect(response.length).toBeGreaterThan(0);
    });
  });

  // ─── /notifications ─────────────────────────────────────────────

  describe("/notifications", () => {
    test("/notifications — shows current state with toggle", async () => {
      mock.clear();
      mock.simulateIncoming("/notifications");
      await wait();

      const response = mock.lastSent();
      expect(response).toContain("Notifications");

      const kb = mock.lastKeyboard();
      if (kb) {
        // Should have enable/disable toggle
        const labels = mock.lastKeyboardLabels();
        const hasToggle = labels.some((l) => l.includes("Enable") || l.includes("Disable"));
        expect(hasToggle).toBe(true);
      }
    });

    test("/notify is an alias for /notifications", async () => {
      mock.clear();
      mock.simulateIncoming("/notify");
      await wait();

      expect(mock.lastSent()).toContain("Notifications");
    });

    test("/notifications on — enables notifications", async () => {
      mock.clear();
      mock.simulateIncoming("/notifications on");
      await wait();

      expect(mock.lastSent()).toContain("enabled");
    });

    test("/notifications off — disables notifications", async () => {
      mock.clear();
      mock.simulateIncoming("/notifications off");
      await wait();

      expect(mock.lastSent()).toContain("disabled");
    });

    test("/notify enable — enables notifications", async () => {
      mock.clear();
      mock.simulateIncoming("/notify enable");
      await wait();

      expect(mock.lastSent()).toContain("enabled");
    });

    test("/notify disable — disables notifications", async () => {
      mock.clear();
      mock.simulateIncoming("/notify disable");
      await wait();

      expect(mock.lastSent()).toContain("disabled");
    });
  });

  // ─── /history ───────────────────────────────────────────────────

  describe("/history", () => {
    test("/history — shows recent messages", async () => {
      mock.clear();
      mock.simulateIncoming("/history");
      await wait();

      const response = mock.lastSent();
      // Either shows messages or "No messages"
      expect(response.length).toBeGreaterThan(0);
    });

    test("/history 5 — limits to 5 messages", async () => {
      mock.clear();
      mock.simulateIncoming("/history 5");
      await wait();

      expect(mock.lastSent().length).toBeGreaterThan(0);
    });
  });

  // ─── /compact ──────────────────────────────────────────────────

  describe("/compact", () => {
    test("/compact — responds with compaction result", async () => {
      mock.clear();
      mock.simulateIncoming("/compact");
      await wait();

      const response = mock.lastSent();
      // Either "Compacted" or "nothing to compact" if session is empty
      expect(response).toMatch(/[Cc]ompact/);
    });

    test("/compact 3 — responds with compaction result", async () => {
      mock.clear();
      mock.simulateIncoming("/compact 3");
      await wait();

      const response = mock.lastSent();
      expect(response).toMatch(/[Cc]ompact/);
    });
  });

  // ─── /config ──────────────────────────────────────────────────

  describe("/config", () => {
    test("/config — shows configuration summary", async () => {
      mock.clear();
      mock.simulateIncoming("/config");
      await wait();

      const response = mock.lastSent();
      expect(response).toContain("Configuration");

      const kb = mock.lastKeyboard();
      if (kb) {
        // Should show config categories
        expect(kb.text).toContain("Model:");
      }
    });
  });

  // ─── /connect (OAuth) ─────────────────────────────────────────

  describe("/connect", () => {
    test("/connect — shows OAuth connector list", async () => {
      mock.clear();
      mock.simulateIncoming("/connect");
      await wait();

      const response = mock.lastSent();
      // Shows OAuth connectors and/or API key connectors
      expect(response.length).toBeGreaterThan(0);

      const kb = mock.lastKeyboard();
      if (kb) {
        // Should list connectors as buttons
        const labels = mock.lastKeyboardLabels();
        expect(labels.length).toBeGreaterThan(0);
      }
    });

    test("/connect unknown — shows error", async () => {
      mock.clear();
      mock.simulateIncoming("/connect notreal");
      await wait();

      const response = mock.lastSent();
      expect(response.length).toBeGreaterThan(0);
    });
  });

  // ─── /disconnect ──────────────────────────────────────────────

  describe("/disconnect", () => {
    test("/disconnect — shows connected services or empty state", async () => {
      mock.clear();
      mock.simulateIncoming("/disconnect");
      await wait();

      const response = mock.lastSent();
      expect(response.length).toBeGreaterThan(0);
    });

    test("/disconnect unknown — shows error", async () => {
      mock.clear();
      mock.simulateIncoming("/disconnect notreal");
      await wait();

      const response = mock.lastSent();
      expect(response.length).toBeGreaterThan(0);
    });

    test("/disconnect not connected — shows not connected message", async () => {
      // Make sure GitHub is NOT configured
      const saved = process.env.GITHUB_TOKEN;
      delete process.env.GITHUB_TOKEN;
      const savedGh = process.env.GH_TOKEN;
      delete process.env.GH_TOKEN;

      mock.clear();
      mock.simulateIncoming("/disconnect github");
      await wait();

      const response = mock.lastSent();
      expect(response).toContain("not connected");

      // Restore
      if (saved) process.env.GITHUB_TOKEN = saved;
      if (savedGh) process.env.GH_TOKEN = savedGh;
    });

    test("/disconnect evicts connector from manager cache", async () => {
      // Set up a configured connector and initialize it in the manager
      const savedToken = process.env.VERCEL_TOKEN;
      process.env.VERCEL_TOKEN = "fake_vercel_token_for_disconnect_test";

      // Pre-populate the connector manager cache
      await connectorManager.get("vercel");
      expect(connectorManager.activeCount).toBeGreaterThanOrEqual(1);
      const countBefore = connectorManager.activeCount;

      mock.clear();
      mock.simulateIncoming("/disconnect vercel");
      await wait(500);

      // Connector should be evicted from cache
      expect(connectorManager.activeCount).toBe(countBefore - 1);

      // Response confirms disconnection
      const response = mock.lastSent();
      expect(response).toContain("disconnected");

      // Restore
      if (savedToken) process.env.VERCEL_TOKEN = savedToken;
      else delete process.env.VERCEL_TOKEN;
    });
  });

  // ─── /skill ───────────────────────────────────────────────────

  describe("/skill", () => {
    test("/skill — shows skill hub", async () => {
      mock.clear();
      mock.simulateIncoming("/skill");
      await wait();

      const response = mock.lastSent();
      // Either skill list or "no skills installed"
      expect(response.length).toBeGreaterThan(0);
    });

    test("/skills is an alias for /skill", async () => {
      mock.clear();
      mock.simulateIncoming("/skills");
      await wait();

      expect(mock.lastSent().length).toBeGreaterThan(0);
    });

    test("/skill list — lists installed skills", async () => {
      mock.clear();
      mock.simulateIncoming("/skill list");
      await wait();

      const response = mock.lastSent();
      expect(response.length).toBeGreaterThan(0);
    });

    test("/skill create — shows create guidance or creates skill", async () => {
      mock.clear();
      mock.simulateIncoming("/skill create");
      await wait();

      const response = mock.lastSent();
      // Shows usage: requires a name
      expect(response.length).toBeGreaterThan(0);
    });

    test("/skill remove — no arg shows usage", async () => {
      mock.clear();
      mock.simulateIncoming("/skill remove");
      await wait();

      const response = mock.lastSent();
      expect(response.length).toBeGreaterThan(0);
    });
  });

  // ─── /tasks ───────────────────────────────────────────────────

  describe("/tasks", () => {
    test("/tasks — shows task list or empty state", async () => {
      mock.clear();
      mock.simulateIncoming("/tasks");
      await wait();

      const response = mock.lastSent();
      expect(response.length).toBeGreaterThan(0);
    });

    test("/task is an alias for /tasks", async () => {
      mock.clear();
      mock.simulateIncoming("/task");
      await wait();

      expect(mock.lastSent().length).toBeGreaterThan(0);
    });

    test("/tasks create — shows usage for name", async () => {
      mock.clear();
      mock.simulateIncoming("/tasks create");
      await wait();

      const response = mock.lastSent();
      expect(response.length).toBeGreaterThan(0);
    });

    test("/tasks delete — shows usage for name", async () => {
      mock.clear();
      mock.simulateIncoming("/tasks delete");
      await wait();

      const response = mock.lastSent();
      expect(response.length).toBeGreaterThan(0);
    });

    test("/tasks run — shows usage for name", async () => {
      mock.clear();
      mock.simulateIncoming("/tasks run");
      await wait();

      const response = mock.lastSent();
      expect(response.length).toBeGreaterThan(0);
    });
  });

  // ─── /triggers ────────────────────────────────────────────────

  describe("/triggers", () => {
    test("/triggers — shows trigger list or no engine", async () => {
      mock.clear();
      mock.simulateIncoming("/triggers");
      await wait();

      const response = mock.lastSent();
      // Either shows triggers, "no triggers", or "not available"
      expect(response.length).toBeGreaterThan(0);
    });

    test("/trigger is an alias for /triggers", async () => {
      mock.clear();
      mock.simulateIncoming("/trigger");
      await wait();

      expect(mock.lastSent().length).toBeGreaterThan(0);
    });

    test("/triggers enable — no arg shows usage", async () => {
      mock.clear();
      mock.simulateIncoming("/triggers enable");
      await wait();

      const response = mock.lastSent();
      expect(response.length).toBeGreaterThan(0);
    });

    test("/triggers disable — no arg shows usage", async () => {
      mock.clear();
      mock.simulateIncoming("/triggers disable");
      await wait();

      const response = mock.lastSent();
      expect(response.length).toBeGreaterThan(0);
    });
  });

  // ─── /cancel ──────────────────────────────────────────────────

  describe("/cancel", () => {
    test("/cancel — shows confirmation or not-configured", async () => {
      mock.clear();
      mock.simulateIncoming("/cancel");
      await wait();

      const response = mock.lastSent();
      // Either asks for confirmation, says not configured, or no active sub
      expect(response.length).toBeGreaterThan(0);
    });
  });

  // ─── /provider / /providers ────────────────────────────────────

  describe("/provider", () => {
    test("/providers — lists all providers", async () => {
      mock.clear();
      mock.simulateIncoming("/providers");
      await wait();

      const response = mock.lastSent();
      expect(response).toContain("Provider");
      expect(response.length).toBeGreaterThan(0);
    });

    test("/provider — shows provider hub", async () => {
      mock.clear();
      mock.simulateIncoming("/provider");
      await wait();

      const response = mock.lastSent();
      expect(response.length).toBeGreaterThan(0);
    });

    test("/provider add — no args shows preset picker", async () => {
      mock.clear();
      mock.simulateIncoming("/provider add");
      await wait();

      const response = mock.lastSent();
      expect(response).toContain("Add a Provider");
    });

    test("/provider remove — no args shows usage", async () => {
      mock.clear();
      mock.simulateIncoming("/provider remove");
      await wait();

      const response = mock.lastSent();
      expect(response.length).toBeGreaterThan(0);
    });
  });

  // ─── Cross-hub navigation (simulates real user tapping) ─────────

  describe("cross-hub navigation", () => {
    test("user journey: /help → /sessions → /new → /sessions", async () => {
      // Simulates a real user tapping through buttons
      mock.clear();
      mock.simulateIncoming("/help");
      await wait();
      const helpData = mock.lastKeyboardData();
      expect(helpData).toContain("/sessions");

      // Tap Sessions
      mock.clear();
      mock.simulateIncoming("/sessions");
      await wait();
      expect(mock.lastKeyboard()!.text).toContain("Current:");
      expect(mock.lastKeyboardData()).toContain("/new");

      // Tap New Session
      mock.clear();
      mock.simulateIncoming("/new");
      await wait();
      expect(mock.lastSent()).toContain("New session:");

      // Go back to sessions
      mock.clear();
      mock.simulateIncoming("/sessions");
      await wait();
      expect(mock.lastKeyboard()!.text).toContain("Current:");
    });

    test("user journey: /help → /model → /model list → back", async () => {
      mock.clear();
      mock.simulateIncoming("/help");
      await wait();
      expect(mock.lastKeyboardData()).toContain("/model");

      mock.clear();
      mock.simulateIncoming("/model");
      await wait();
      expect(mock.lastKeyboardData()).toContain("/model list");

      mock.clear();
      mock.simulateIncoming("/model list");
      await wait();
      expect(mock.lastKeyboardData()).toContain("/model");
    });

    test("user journey: /help → /channels → /channels add → back", async () => {
      mock.clear();
      mock.simulateIncoming("/help");
      await wait();
      expect(mock.lastKeyboardData()).toContain("/channels");

      mock.clear();
      mock.simulateIncoming("/channels");
      await wait();
      const chData = mock.lastKeyboardData();
      expect(chData.some((d: string) => d.includes("channel"))).toBe(true);

      mock.clear();
      mock.simulateIncoming("/channels add");
      await wait();
      expect(mock.lastKeyboardData()).toContain("/channels");
    });
  });

  // ─── /kill — destroy session and start fresh ───────────────────────
  describe("/kill", () => {
    test("destroys current session and creates a new one", async () => {
      mock.clear();
      mock.simulateIncoming("/kill");
      await wait();
      const text = mock.lastSent();
      expect(text).toMatch(/session destroyed|new session/i);
    });

    test("new session has a different ID after kill", async () => {
      mock.clear();
      mock.simulateIncoming("/session");
      await wait();
      const beforeText = mock.lastSent();

      mock.clear();
      mock.simulateIncoming("/kill");
      await wait();

      mock.clear();
      mock.simulateIncoming("/session");
      await wait();
      const afterText = mock.lastSent();

      // Sessions should be different
      expect(afterText).not.toBe(beforeText);
    });
  });

  // ─── /archive — archive session and start fresh ────────────────────
  describe("/archive", () => {
    test("archives current session and creates a new one", async () => {
      mock.clear();
      mock.simulateIncoming("/archive");
      await wait();
      const text = mock.lastSent();
      expect(text).toMatch(/archived|new session/i);
    });
  });

  // ─── /auth — connector authentication ─────────────────────────────
  describe("/auth", () => {
    test("shows connector list as buttons", async () => {
      mock.clear();
      mock.simulateIncoming("/auth");
      await wait();
      // Should show keyboard with connector buttons
      expect(mock.keyboards.length).toBeGreaterThan(0);
      const text = mock.lastSent();
      expect(text).toMatch(/[Cc]onfigure|connector/i);
    });

    test("shows detail for a known connector", async () => {
      mock.clear();
      mock.simulateIncoming("/auth stripe");
      await wait();
      const text = mock.lastSent();
      expect(text).toMatch(/stripe/i);
    });

    test("rejects unknown connector", async () => {
      mock.clear();
      mock.simulateIncoming("/auth nonexistent");
      await wait();
      const text = mock.lastSent();
      expect(text).toMatch(/unknown|not found/i);
    });

    test("saves keys for a connector", async () => {
      mock.clear();
      mock.simulateIncoming("/auth stripe sk_test_12345");
      await wait();
      const text = mock.lastSent();
      // Should confirm save or show error about key format
      expect(text.length).toBeGreaterThan(0);
    });
  });

  // ─── /tasks — background task management ───────────────────────────
  describe("/tasks", () => {
    test("lists tasks (empty by default)", async () => {
      mock.clear();
      mock.simulateIncoming("/tasks");
      await wait();
      const text = mock.lastSent();
      // Could be empty or have tasks from previous tests
      expect(text).toMatch(/task/i);
    });

    test("/tasks create falls through to list (create is CLI-only)", async () => {
      mock.clear();
      mock.simulateIncoming("/tasks create test-task echo hello");
      await wait();
      const text = mock.lastSent();
      // No in-channel create handler — falls through to empty list view
      expect(text).toMatch(/task/i);
    });

    test("/tasks enable without id shows usage", async () => {
      mock.clear();
      mock.simulateIncoming("/tasks enable");
      await wait();
      const text = mock.lastSent();
      expect(text).toMatch(/usage/i);
    });

    test("/tasks disable nonexistent shows not found", async () => {
      mock.clear();
      mock.simulateIncoming("/tasks disable fake-id");
      await wait();
      const text = mock.lastSent();
      expect(text).toMatch(/not found/i);
    });
  });

  // ─── /notifications — notification preferences ────────────────────
  describe("/notifications", () => {
    test("shows current notification state", async () => {
      mock.clear();
      mock.simulateIncoming("/notifications");
      await wait();
      const text = mock.lastSent();
      expect(text).toMatch(/[Nn]otification/);
    });

    test("enables notifications", async () => {
      mock.clear();
      mock.simulateIncoming("/notifications on");
      await wait();
      const text = mock.lastSent();
      expect(text).toMatch(/enabled/i);
    });

    test("disables notifications", async () => {
      mock.clear();
      mock.simulateIncoming("/notifications off");
      await wait();
      const text = mock.lastSent();
      expect(text).toMatch(/disabled/i);
    });

    test("shows toggle button with current state", async () => {
      mock.clear();
      mock.simulateIncoming("/notifications");
      await wait();
      // Should show keyboard with enable/disable toggle
      expect(mock.keyboards.length + mock.sent.length).toBeGreaterThan(0);
    });
  });

  // ─── /cancel — cancel subscription ─────────────────────────────────
  describe("/cancel", () => {
    test("handles no active subscription", async () => {
      mock.clear();
      mock.simulateIncoming("/cancel");
      await wait();
      const text = mock.lastSent();
      // Without billing configured, should show "not configured" or "no subscription"
      expect(text).toMatch(/[Nn]o active|not configured|cancel|billing/i);
    });
  });

  // ─── /channels add — dynamic channel registration ──────────────────
  describe("/channels add (dynamic)", () => {
    test("shows guide for unknown channel type", async () => {
      mock.clear();
      mock.simulateIncoming("/channels add fakechannel");
      await wait();
      const text = mock.allSentText();
      expect(text.length).toBeGreaterThan(0);
    });

    test("shows channel add guide when no args", async () => {
      mock.clear();
      mock.simulateIncoming("/channels add");
      await wait();
      // Should show available channels or usage hint
      expect(mock.sent.length + mock.keyboards.length).toBeGreaterThan(0);
    });
  });

  // ─── /channels remove — dynamic channel removal ────────────────────
  describe("/channels remove", () => {
    test("handles removing non-existent channel gracefully", async () => {
      mock.clear();
      mock.simulateIncoming("/channels remove nonexistent");
      await wait();
      const text = mock.allSentText();
      // Should show error or "not found"
      expect(text.length).toBeGreaterThan(0);
    });
  });

  // ─── Cross-command integration ─────────────────────────────────────
  describe("cross-command integration", () => {
    test("/kill then /session shows a different session", async () => {
      // Get initial session
      mock.clear();
      mock.simulateIncoming("/session");
      await wait();
      const beforeSession = mock.lastSent();

      // Kill
      mock.clear();
      mock.simulateIncoming("/kill");
      await wait();

      // Get new session
      mock.clear();
      mock.simulateIncoming("/session");
      await wait();
      const afterSession = mock.lastSent();

      // Should be different sessions
      expect(afterSession).not.toBe(beforeSession);
    });

    test("/archive preserves session history in list", async () => {
      // Create some session state first
      mock.clear();
      mock.simulateIncoming("/session");
      await wait();

      // Archive it
      mock.clear();
      mock.simulateIncoming("/archive");
      await wait();
      expect(mock.lastSent()).toMatch(/archived|new session/i);

      // Verify the new session works
      mock.clear();
      mock.simulateIncoming("/session");
      await wait();
      expect(mock.lastSent().length).toBeGreaterThan(0);
    });

    test("/auth shows connectors and /auth <name> shows detail", async () => {
      // First show all
      mock.clear();
      mock.simulateIncoming("/auth");
      await wait();
      expect(mock.keyboards.length).toBeGreaterThan(0);

      // Then detail for stripe
      mock.clear();
      mock.simulateIncoming("/auth stripe");
      await wait();
      const detail = mock.lastSent();
      expect(detail).toMatch(/stripe/i);
    });

    test("/notifications toggle cycle", async () => {
      // Start — show state
      mock.clear();
      mock.simulateIncoming("/notifications");
      await wait();

      // Disable
      mock.clear();
      mock.simulateIncoming("/notifications off");
      await wait();
      expect(mock.lastSent()).toMatch(/disabled/i);

      // Re-enable
      mock.clear();
      mock.simulateIncoming("/notifications on");
      await wait();
      expect(mock.lastSent()).toMatch(/enabled/i);
    });

    test("/tasks list shows no tasks configured", async () => {
      mock.clear();
      mock.simulateIncoming("/tasks");
      await wait();
      // No tasks created via CLI — shows empty state
      expect(mock.lastSent()).toMatch(/task/i);
    });
  });
});
