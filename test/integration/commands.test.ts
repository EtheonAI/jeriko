// Integration test — boots the real daemon kernel and tests every command
// through both HTTP API and channel bus simulation.
//
// This is a live test: it uses the real config, DB, and secrets.
// Telegram bot is NOT connected (we don't want to poll during tests).

import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import type { ChannelRegistry, MessageMetadata } from "../../src/daemon/services/channels/index.js";
import { loadConfig, type JerikoConfig } from "../../src/shared/config.js";
import { loadSecrets } from "../../src/shared/secrets.js";
import {
  CONNECTOR_DEFS,
  getConnectorDef,
  isConnectorConfigured,
} from "../../src/shared/connector.js";
import {
  OAUTH_PROVIDERS,
  getOAuthProvider,
  isOAuthCapable,
} from "../../src/daemon/services/oauth/providers.js";
import {
  generateState,
  consumeState,
} from "../../src/daemon/services/oauth/state.js";

// ---------------------------------------------------------------------------
// Hono app setup — uses the real createApp with a mocked context
// ---------------------------------------------------------------------------

let app: import("hono").Hono;
let channels: ChannelRegistry;
let config: JerikoConfig;

// Capture messages sent by the router
const sentMessages: Array<{ channel: string; target: string; message: string }> = [];
const editedMessages: Array<{ channel: string; target: string; messageId: string | number; text: string }> = [];
const deletedMessages: Array<{ channel: string; target: string; messageId: string | number }> = [];

function lastSent(): string {
  return sentMessages[sentMessages.length - 1]?.message ?? "";
}

function resetCapture(): void {
  sentMessages.length = 0;
  editedMessages.length = 0;
  deletedMessages.length = 0;
}

async function settle(ms = 150): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function emitCommand(command: string, chatId = "test-chat-001"): void {
  const metadata: MessageMetadata = {
    channel: "telegram",
    chat_id: chatId,
    is_group: false,
    sender_name: "IntegrationTestUser",
    message_id: Date.now(),
  };
  channels.bus.emit("channel:message", {
    from: "test-user",
    message: command,
    metadata,
  });
}

// ---------------------------------------------------------------------------
// Setup — boot a minimal daemon context
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // Load secrets so process.env has OAuth credentials
  loadSecrets();
  config = loadConfig();

  // Disable billing enforcement — integration tests use in-memory DB with no
  // license, which defaults to free tier (2 connectors). Real env may have more
  // configured, causing false "limit reached" errors in /connect tests.
  delete process.env.STRIPE_BILLING_SECRET_KEY;

  // Initialize DB (needed by session commands)
  const { initDatabase } = await import("../../src/daemon/storage/db.js");
  initDatabase(":memory:"); // In-memory DB for tests

  // Load drivers (needed by /model command)
  const { loadModelRegistry } = await import("../../src/daemon/agent/drivers/models.js");
  await loadModelRegistry().catch(() => {}); // Non-fatal if models.dev unreachable

  // Import drivers so they self-register
  await import("../../src/daemon/agent/drivers/index.js").catch(() => {});

  // Create channel registry — no real adapters, just the bus
  const { ChannelRegistry } = await import("../../src/daemon/services/channels/index.js");
  channels = new ChannelRegistry();

  // Override send/edit/delete to capture messages
  const origSend = channels.send.bind(channels);
  channels.send = async (channelName: string, target: string, message: string) => {
    sentMessages.push({ channel: channelName, target, message });
  };
  channels.sendTracked = async (channelName: string, target: string, text: string) => {
    sentMessages.push({ channel: channelName, target, message: text });
    return { messageId: sentMessages.length };
  };
  channels.editMessage = async (channelName: string, target: string, messageId: string | number, text: string) => {
    editedMessages.push({ channel: channelName, target, messageId, text });
  };
  channels.deleteMessage = async (channelName: string, target: string, messageId: string | number) => {
    deletedMessages.push({ channel: channelName, target, messageId });
  };
  channels.sendTyping = async () => {};

  // Start channel router
  const { startChannelRouter } = await import("../../src/daemon/services/channels/router.js");
  startChannelRouter({
    channels,
    defaultModel: config.agent.model,
    maxTokens: config.agent.maxTokens,
    temperature: config.agent.temperature,
    extendedThinking: config.agent.extendedThinking,
    systemPrompt: "Test system prompt",
  });

  // Create Hono app with real routes
  const { createApp } = await import("../../src/daemon/api/app.js");
  const { TriggerEngine } = await import("../../src/daemon/services/triggers/engine.js");
  const { ConnectorManager } = await import("../../src/daemon/services/connectors/manager.js");
  const triggers = new TriggerEngine();
  const connectors = new ConnectorManager();

  app = createApp({ channels, triggers, connectors });
});

afterAll(async () => {
  const { closeDatabase } = await import("../../src/daemon/storage/db.js");
  closeDatabase();
});

// ---------------------------------------------------------------------------
// HTTP API — Health
// ---------------------------------------------------------------------------

describe("HTTP: /health", () => {
  it("returns 200 OK", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// HTTP API — Channels
// ---------------------------------------------------------------------------

describe("HTTP: /channel", () => {
  // Channel routes require NODE_AUTH_SECRET — set a test secret and use it
  const TEST_SECRET = "integration-test-secret-" + Date.now();

  it("GET /channel without auth returns 401 or 503", async () => {
    const res = await app.request("/channel");
    // 401 if secret is configured but no header, 503 if secret not set
    expect([401, 503]).toContain(res.status);
  });

  it("GET /channel with auth lists channels", async () => {
    const orig = process.env.NODE_AUTH_SECRET;
    process.env.NODE_AUTH_SECRET = TEST_SECRET;
    try {
      const res = await app.request("/channel", {
        headers: { Authorization: `Bearer ${TEST_SECRET}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.ok).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    } finally {
      if (orig) { process.env.NODE_AUTH_SECRET = orig; } else { delete process.env.NODE_AUTH_SECRET; }
    }
  });

  it("POST /channel/nonexistent/connect with auth returns 404", async () => {
    const orig = process.env.NODE_AUTH_SECRET;
    process.env.NODE_AUTH_SECRET = TEST_SECRET;
    try {
      const res = await app.request("/channel/nonexistent/connect", {
        method: "POST",
        headers: { Authorization: `Bearer ${TEST_SECRET}` },
      });
      expect(res.status).toBe(404);
    } finally {
      if (orig) { process.env.NODE_AUTH_SECRET = orig; } else { delete process.env.NODE_AUTH_SECRET; }
    }
  });
});

// ---------------------------------------------------------------------------
// HTTP API — OAuth routes
// ---------------------------------------------------------------------------

describe("HTTP: /oauth", () => {
  it("GET /oauth/unknown/start returns 404", async () => {
    const res = await app.request("/oauth/unknown/start?state=abc");
    expect(res.status).toBe(404);
  });

  it("GET /oauth/github/start without state returns 400", async () => {
    const res = await app.request("/oauth/github/start");
    expect(res.status).toBe(400);
  });

  it("GET /oauth/github/start with configured client ID redirects", async () => {
    if (!process.env.GITHUB_OAUTH_CLIENT_ID) {
      console.log("  [skip] GITHUB_OAUTH_CLIENT_ID not set");
      return;
    }

    const state = generateState("github", "test-chat", "telegram");
    const res = await app.request(`/oauth/github/start?state=${state}`, { redirect: "manual" });

    expect(res.status).toBe(302);
    const location = res.headers.get("Location")!;
    expect(location).toContain("github.com/login/oauth/authorize");
    expect(location).toContain(`client_id=${process.env.GITHUB_OAUTH_CLIENT_ID}`);
    expect(location).toContain(`state=${state}`);
    expect(location).toContain("scope=repo");
  });

  it("GET /oauth/x/start includes PKCE challenge", async () => {
    if (!process.env.X_OAUTH_CLIENT_ID) {
      console.log("  [skip] X_OAUTH_CLIENT_ID not set");
      return;
    }

    const state = generateState("x", "test-chat", "telegram");
    const res = await app.request(`/oauth/x/start?state=${state}`, { redirect: "manual" });

    expect(res.status).toBe(302);
    const location = res.headers.get("Location")!;
    expect(location).toContain("twitter.com/i/oauth2/authorize");
    expect(location).toContain("code_challenge=");
    expect(location).toContain("code_challenge_method=S256");
  });

  it("GET /oauth/gdrive/start includes offline access", async () => {
    if (!process.env.GDRIVE_OAUTH_CLIENT_ID) {
      console.log("  [skip] GDRIVE_OAUTH_CLIENT_ID not set");
      return;
    }

    const state = generateState("gdrive", "test-chat", "telegram");
    const res = await app.request(`/oauth/gdrive/start?state=${state}`, { redirect: "manual" });

    expect(res.status).toBe(302);
    const location = res.headers.get("Location")!;
    expect(location).toContain("accounts.google.com");
    expect(location).toContain("access_type=offline");
    expect(location).toContain("prompt=consent");
  });

  it("GET /oauth/gmail/start redirects to Google", async () => {
    if (!process.env.GMAIL_OAUTH_CLIENT_ID) {
      console.log("  [skip] GMAIL_OAUTH_CLIENT_ID not set");
      return;
    }

    const state = generateState("gmail", "test-chat", "telegram");
    const res = await app.request(`/oauth/gmail/start?state=${state}`, { redirect: "manual" });

    expect(res.status).toBe(302);
    const location = res.headers.get("Location")!;
    expect(location).toContain("accounts.google.com");
    expect(location).toContain("scope=");
    expect(location).toContain("gmail");
  });

  it("GET /oauth/vercel/start uses PKCE but no scopes", async () => {
    if (!process.env.VERCEL_OAUTH_CLIENT_ID) {
      console.log("  [skip] VERCEL_OAUTH_CLIENT_ID not set");
      return;
    }

    const state = generateState("vercel", "test-chat", "telegram");
    const res = await app.request(`/oauth/vercel/start?state=${state}`, { redirect: "manual" });

    expect(res.status).toBe(302);
    const location = res.headers.get("Location")!;
    expect(location).toContain("vercel.com/oauth/authorize");
    expect(location).toContain("code_challenge=");
    expect(location).not.toContain("scope=");
  });

  it("callback with invalid state returns 400", async () => {
    const res = await app.request("/oauth/github/callback?code=abc&state=invalid");
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain("Invalid or expired state");
  });

  it("callback with error param returns 400", async () => {
    const res = await app.request("/oauth/github/callback?error=access_denied&error_description=User+denied");
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain("User denied");
  });

  it("callback with provider mismatch returns 400", async () => {
    const state = generateState("x", "test-chat", "telegram");
    const res = await app.request(`/oauth/github/callback?code=abc&state=${state}`);
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain("mismatch");
  });
});

// ---------------------------------------------------------------------------
// Channel commands — /help, /start, /commands
// ---------------------------------------------------------------------------

describe("Command: /help, /start, /commands", () => {
  it("/help shows help header", async () => {
    resetCapture();
    emitCommand("/help");
    await settle();

    // Router sends keyboard with command buttons — mock falls back to header text
    const text = lastSent();
    expect(text).toContain("Jeriko");
    expect(text.length).toBeGreaterThan(0);
  });

  it("/start is alias for /help", async () => {
    resetCapture();
    emitCommand("/start");
    await settle();
    expect(lastSent()).toContain("Jeriko");
  });

  it("/commands is alias for /help", async () => {
    resetCapture();
    emitCommand("/commands");
    await settle();
    expect(lastSent()).toContain("Jeriko");
  });
});

// ---------------------------------------------------------------------------
// Channel commands — Session management
// ---------------------------------------------------------------------------

describe("Command: /new", () => {
  it("creates a new session and returns its ID", async () => {
    resetCapture();
    emitCommand("/new");
    await settle();

    const text = lastSent();
    expect(text).toContain("New session:");
    // Session ID should be a UUID-like string
    expect(text.length).toBeGreaterThan(15);
  });
});

describe("Command: /stop", () => {
  it("says nothing running when idle", async () => {
    resetCapture();
    emitCommand("/stop");
    await settle();
    expect(lastSent()).toContain("Nothing running");
  });
});

describe("Command: /clear", () => {
  it("clears session history", async () => {
    resetCapture();
    emitCommand("/clear");
    await settle();
    expect(lastSent()).toContain("cleared");
  });
});

describe("Command: /kill", () => {
  it("destroys session and creates a new one", async () => {
    resetCapture();
    emitCommand("/kill");
    await settle();

    const text = lastSent();
    expect(text).toContain("Session destroyed");
    expect(text).toContain("New session:");
  });
});

describe("Command: /session", () => {
  it("shows current session info", async () => {
    resetCapture();
    emitCommand("/session");
    await settle();

    const text = lastSent();
    expect(text).toContain("session:");
  });
});

describe("Command: /sessions", () => {
  it("lists recent sessions", async () => {
    resetCapture();
    // Create a few sessions first
    emitCommand("/new", "sessions-test");
    await settle();
    emitCommand("/new", "sessions-test");
    await settle();

    resetCapture();
    emitCommand("/sessions", "sessions-test");
    await settle();

    const text = lastSent();
    // Should list sessions or say "No sessions" (both valid)
    expect(text.length).toBeGreaterThan(0);
  });
});

describe("Command: /switch", () => {
  it("without argument shows usage", async () => {
    resetCapture();
    emitCommand("/switch");
    await settle();
    expect(lastSent()).toContain("Usage");
  });

  it("with invalid ID says not found", async () => {
    resetCapture();
    emitCommand("/switch nonexistent-id-xyz");
    await settle();
    expect(lastSent()).toContain("not found");
  });
});

describe("Command: /archive", () => {
  it("archives current session and starts new one", async () => {
    resetCapture();
    emitCommand("/archive");
    await settle();

    const text = lastSent();
    expect(text).toContain("Archived");
    expect(text).toContain("New session:");
  });
});

// ---------------------------------------------------------------------------
// Channel commands — Model
// ---------------------------------------------------------------------------

describe("Command: /model", () => {
  it("without args shows current model", async () => {
    resetCapture();
    emitCommand("/model");
    await settle();

    // Keyboard-based — fallback text shows current model info
    const text = lastSent();
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain("Current:");
  });

  it("with invalid model shows error", async () => {
    resetCapture();
    emitCommand("/model nonexistent-model-xyz");
    await settle();

    const text = lastSent();
    expect(text).toContain("Unknown model");
  });
});

// ---------------------------------------------------------------------------
// Channel commands — System
// ---------------------------------------------------------------------------

describe("Command: /status", () => {
  it("shows daemon metrics", async () => {
    resetCapture();
    emitCommand("/status");
    await settle();

    const text = lastSent();
    expect(text).toContain("uptime:");
    expect(text).toContain("memory:");
    expect(text).toContain("model:");
    expect(text).toContain("session:");
    expect(text).toContain("active:");
  });
});

describe("Command: /sys", () => {
  it("shows system info", async () => {
    resetCapture();
    emitCommand("/sys");
    await settle();

    const text = lastSent();
    expect(text).toContain("platform:");
    expect(text).toContain("runtime:");
    expect(text).toContain("uptime:");
    expect(text).toContain("memory:");
    expect(text).toContain("pid:");
  });
});

// ---------------------------------------------------------------------------
// Channel commands — Connectors
// ---------------------------------------------------------------------------

describe("Command: /connectors", () => {
  it("lists connectors with count", async () => {
    resetCapture();
    emitCommand("/connectors");
    await settle();

    // Keyboard-based — fallback text shows summary
    const text = lastSent();
    expect(text).toContain("Connectors:");
    expect(text).toMatch(/\d+\/\d+ connected/);
  });
});

describe("Command: /connect", () => {
  it("without args lists connectors with connect/disconnect guidance", async () => {
    resetCapture();
    emitCommand("/connect");
    await settle();

    // Keyboard-based — fallback text shows summary
    const text = lastSent();
    expect(text).toContain("Connectors");
    expect(text).toMatch(/\d+\/\d+ connected/);
  });

  it("with non-OAuth connector explains to use /auth", async () => {
    resetCapture();
    emitCommand("/connect twilio");
    await settle();

    const text = lastSent();
    expect(text).toContain("doesn't support OAuth");
    expect(text).toContain("/auth twilio");
  });

  it("with non-OAuth connector: paypal", async () => {
    resetCapture();
    emitCommand("/connect paypal");
    await settle();

    const text = lastSent();
    expect(text).toContain("doesn't support OAuth");
    expect(text).toContain("/auth paypal");
  });

  it("with unknown connector shows oauth list", async () => {
    resetCapture();
    emitCommand("/connect fakeservice");
    await settle();

    const text = lastSent();
    expect(text).toContain("doesn't support OAuth");
  });

  // Test each OAuth provider's /connect flow
  for (const provider of OAUTH_PROVIDERS) {
    it(`/connect ${provider.name} generates login URL when configured`, async () => {
      const hasClientId = !!process.env[provider.clientIdVar];
      const hasToken = !!process.env[provider.tokenEnvVar];

      resetCapture();
      emitCommand(`/connect ${provider.name}`);
      await settle();

      const text = lastSent();

      if (!hasClientId) {
        // Missing OAuth credentials
        expect(text).toContain("not configured");
        expect(text).toContain(provider.clientIdVar);
      } else if (hasToken) {
        // Already connected
        expect(text).toContain("already connected");
      } else {
        // Should generate login URL
        expect(text).toContain(`Connect ${provider.label}`);
        expect(text).toContain(`/${provider.name}/start`);
        expect(text).toContain("state=");
        expect(text).toContain("10 minutes");
      }
    });
  }
});

describe("Command: /disconnect", () => {
  it("without args shows disconnect guidance", async () => {
    resetCapture();
    emitCommand("/disconnect");
    await settle();

    // Keyboard-based — shows connected connectors as buttons or "No connectors are connected"
    const text = lastSent();
    expect(text.length).toBeGreaterThan(0);
    // Either "Tap a connector to disconnect:" or "No connectors are connected."
    expect(text).toMatch(/disconnect|No connectors/i);
  });

  it("with unknown connector says unknown", async () => {
    resetCapture();
    emitCommand("/disconnect fakeservice");
    await settle();
    expect(lastSent()).toContain("Unknown connector");
  });

  it("with unconfigured connector says not connected", async () => {
    // Find a connector that's definitely not configured
    const unconfigured = CONNECTOR_DEFS.find((d) => !isConnectorConfigured(d.name));
    if (!unconfigured) {
      console.log("  [skip] all connectors are configured");
      return;
    }

    resetCapture();
    emitCommand(`/disconnect ${unconfigured.name}`);
    await settle();
    expect(lastSent()).toContain("not connected");
  });
});

describe("Command: /auth", () => {
  it("without args shows connector list", async () => {
    resetCapture();
    emitCommand("/auth");
    await settle();

    // Keyboard-based — fallback text shows summary
    const text = lastSent();
    expect(text).toContain("Configure a connector");
  });

  it("with unknown connector shows error", async () => {
    resetCapture();
    emitCommand("/auth fakeservice");
    await settle();

    const text = lastSent();
    expect(text).toContain("Unknown connector");
  });

  // Test each connector's /auth info display
  for (const def of CONNECTOR_DEFS) {
    it(`/auth ${def.name} shows required keys`, async () => {
      resetCapture();
      emitCommand(`/auth ${def.name}`);
      await settle();

      const text = lastSent();
      expect(text).toContain(def.label);
      expect(text).toContain("Required:");
    });
  }

  it("/auth twilio with wrong number of keys shows error", async () => {
    resetCapture();
    emitCommand("/auth twilio only-one-key");
    await settle();

    const text = lastSent();
    // Twilio requires 2 keys (SID + token)
    expect(text).toContain("2 key(s)");
  });
});

describe("Command: /health", () => {
  it("with unknown connector shows error", async () => {
    resetCapture();
    emitCommand("/health fakeservice");
    await settle();
    expect(lastSent()).toContain("Unknown connector");
  });

  it("with unconfigured connector says not configured", async () => {
    const unconfigured = CONNECTOR_DEFS.find((d) => !isConnectorConfigured(d.name));
    if (!unconfigured) {
      console.log("  [skip] all connectors are configured");
      return;
    }

    resetCapture();
    emitCommand(`/health ${unconfigured.name}`);
    await settle(300);
    expect(lastSent()).toContain("not configured");
  });

  // Test health check for each configured connector
  for (const def of CONNECTOR_DEFS) {
    it(`/health ${def.name} ${isConnectorConfigured(def.name) ? "runs check" : "says not configured"}`, async () => {
      resetCapture();
      emitCommand(`/health ${def.name}`);
      await settle(2000); // Health checks may do real HTTP

      const text = lastSent();
      if (isConnectorConfigured(def.name)) {
        // Should show "Checking..." or a health result
        expect(sentMessages.length).toBeGreaterThan(0);
      } else {
        expect(text).toContain("not configured");
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Channel commands — Unknown
// ---------------------------------------------------------------------------

describe("Command: unknown", () => {
  it("shows error with /help hint", async () => {
    resetCapture();
    emitCommand("/nonexistent");
    await settle();

    const text = lastSent();
    expect(text).toContain("Unknown");
    expect(text).toContain("/help");
  });
});

// ---------------------------------------------------------------------------
// Per-chat isolation
// ---------------------------------------------------------------------------

describe("Per-chat isolation", () => {
  it("different chats get different sessions", async () => {
    resetCapture();
    emitCommand("/new", "isolation-A");
    await settle();
    const sessionA = lastSent();

    resetCapture();
    emitCommand("/new", "isolation-B");
    await settle();
    const sessionB = lastSent();

    expect(sessionA).not.toBe(sessionB);
  });

  it("killing one chat doesn't affect another", async () => {
    emitCommand("/new", "iso-X");
    await settle();
    emitCommand("/new", "iso-Y");
    await settle();

    // Kill chat X
    resetCapture();
    emitCommand("/kill", "iso-X");
    await settle();
    expect(lastSent()).toContain("Session destroyed");

    // Chat Y still works
    resetCapture();
    emitCommand("/session", "iso-Y");
    await settle();
    expect(lastSent()).toContain("session:");
  });
});

// ---------------------------------------------------------------------------
// Connector registry validation
// ---------------------------------------------------------------------------

describe("Connector registry", () => {
  it("defines exactly 27 connectors", () => {
    expect(CONNECTOR_DEFS.length).toBe(27);
  });

  it("all connectors have required fields", () => {
    for (const def of CONNECTOR_DEFS) {
      expect(def.name).toBeTruthy();
      expect(def.label).toBeTruthy();
      expect(def.description).toBeTruthy();
      expect(Array.isArray(def.required)).toBe(true);
      expect(def.required.length).toBeGreaterThan(0);
    }
  });

  it("OAuth providers match connector definitions", () => {
    for (const provider of OAUTH_PROVIDERS) {
      const def = getConnectorDef(provider.name);
      expect(def).toBeDefined();
      expect(def!.oauth).toBeDefined();
      expect(def!.oauth!.clientIdVar).toBe(provider.clientIdVar);
      expect(def!.oauth!.clientSecretVar).toBe(provider.clientSecretVar);
    }
  });

  it("configured connectors from env are detected", () => {
    // PayPal should be configured (both client ID and secret are in .env)
    if (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET) {
      expect(isConnectorConfigured("paypal")).toBe(true);
    }

    // Vercel should be configured (token in .env)
    if (process.env.VERCEL_TOKEN) {
      expect(isConnectorConfigured("vercel")).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// OAuth state management
// ---------------------------------------------------------------------------

describe("OAuth state (live)", () => {
  it("generates state tokens with correct metadata", () => {
    const token = generateState("github", "chat-123", "telegram");
    expect(token).toMatch(/^[0-9a-f]{64}$/);

    const entry = consumeState(token);
    expect(entry).not.toBeNull();
    expect(entry!.provider).toBe("github");
    expect(entry!.chatId).toBe("chat-123");
    expect(entry!.channelName).toBe("telegram");
  });

  it("state tokens work for all channels", () => {
    for (const channelName of ["telegram", "whatsapp"]) {
      const token = generateState("github", "chat-1", channelName);
      const entry = consumeState(token);
      expect(entry!.channelName).toBe(channelName);
    }
  });

  it("state tokens are single-use", () => {
    const token = generateState("github", "chat-1", "telegram");
    expect(consumeState(token)).not.toBeNull();
    expect(consumeState(token)).toBeNull();
  });

  it("generates composite state when userId is provided", () => {
    const state = generateState("github", "chat-1", "telegram", "user-abc-123");
    expect(state).toContain("user-abc-123.");
    expect(state).toMatch(/^user-abc-123\.[0-9a-f]{64}$/);

    // consumeState handles composite state
    const entry = consumeState(state);
    expect(entry).not.toBeNull();
    expect(entry!.provider).toBe("github");
    expect(entry!.chatId).toBe("chat-1");
  });

  it("generates plain token when userId is not provided", () => {
    const token = generateState("github", "chat-1", "telegram");
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(token).not.toContain(".");
  });

  it("PKCE verifier works with composite state", () => {
    const { setCodeVerifier, generateCodeVerifier } = require("../../src/daemon/services/oauth/state.js");

    const state = generateState("x", "chat-1", "telegram", "user-pkce-123");
    expect(state).toContain("user-pkce-123.");

    const verifier = generateCodeVerifier();
    setCodeVerifier(state, verifier);

    const entry = consumeState(state);
    expect(entry).not.toBeNull();
    expect(entry!.provider).toBe("x");
    expect(entry!.codeVerifier).toBe(verifier);
  });
});

// ---------------------------------------------------------------------------
// Provider commands (channel parity)
// ---------------------------------------------------------------------------

describe("Channel: /provider", () => {
  it("/providers lists built-in and custom providers", async () => {
    resetCapture();
    emitCommand("/providers", "provider-test");
    await settle();
    const text = lastSent();
    expect(text).toContain("Built-in");
    expect(text).toContain("Providers");
  });

  it("/provider without args lists providers", async () => {
    resetCapture();
    emitCommand("/provider", "provider-test");
    await settle();
    const text = lastSent();
    expect(text).toContain("Built-in");
  });

  it("/provider add without args shows preset picker", async () => {
    resetCapture();
    emitCommand("/provider add", "provider-test");
    await settle();
    const text = lastSent();
    expect(text).toContain("Add a Provider");
  });

  it("/provider add with unknown id shows usage", async () => {
    resetCapture();
    emitCommand("/provider add myai", "provider-test");
    await settle();
    const text = lastSent();
    expect(text).toContain("Usage");
  });

  it("/provider add with known preset id shows key prompt", async () => {
    resetCapture();
    emitCommand("/provider add groq", "provider-test");
    await settle();
    const text = lastSent();
    // Groq is a known preset — if env var not set, asks for key
    // If env var is set, it auto-adds
    expect(text.length).toBeGreaterThan(0);
  });

  it("/provider remove without id shows usage", async () => {
    resetCapture();
    emitCommand("/provider remove", "provider-test");
    await settle();
    const text = lastSent();
    expect(text).toContain("Usage");
  });

  it("/provider remove nonexistent shows not found", async () => {
    resetCapture();
    emitCommand("/provider remove nonexistent-xyz", "provider-test");
    await settle();
    const text = lastSent();
    expect(text).toContain("not found");
  });
});

// ---------------------------------------------------------------------------
// Config command (channel parity)
// ---------------------------------------------------------------------------

describe("Channel: /config", () => {
  it("/config shows configuration", async () => {
    resetCapture();
    emitCommand("/config", "config-test");
    await settle();
    const text = lastSent();
    expect(text).toContain("Configuration");
    expect(text).toContain("Model");
  });
});

// ---------------------------------------------------------------------------
// Share commands (channel)
// ---------------------------------------------------------------------------

describe("Channel: /share", () => {
  it("/share on empty session says no messages", async () => {
    resetCapture();
    emitCommand("/new", "share-test");
    await settle();

    resetCapture();
    emitCommand("/share", "share-test");
    await settle();
    const text = lastSent();
    expect(text).toContain("No messages");
  });

  it("/share list shows shares", async () => {
    resetCapture();
    emitCommand("/share list", "share-test");
    await settle();
    const text = lastSent();
    // Either "No active shares" or a list
    expect(text.length).toBeGreaterThan(0);
  });

  it("/share revoke without id shows usage", async () => {
    resetCapture();
    emitCommand("/share revoke", "share-test");
    await settle();
    const text = lastSent();
    expect(text).toContain("Usage");
  });
});
