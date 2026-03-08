// Relay infrastructure audit tests.
//
// Tests protocol message formats, URL builders, composite state,
// backoff calculation, and relay constants. No real WebSocket connections.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  // Protocol types
  type RelayAuthMessage,
  type RelayRegisterTriggersMessage,
  type RelayUnregisterTriggersMessage,
  type RelayWebhookAckMessage,
  type RelayOAuthResultMessage,
  type RelayShareResponseMessage,
  type RelayPingMessage,
  type RelayOutboundMessage,
  type RelayAuthOkMessage,
  type RelayAuthFailMessage,
  type RelayWebhookMessage,
  type RelayOAuthCallbackMessage,
  type RelayOAuthStartMessage,
  type RelayOAuthTokensMessage,
  type RelayShareRequestMessage,
  type RelayPongMessage,
  type RelayErrorMessage,
  type RelayInboundMessage,
  type RelayConnection,
  // Constants
  DEFAULT_RELAY_URL,
  RELAY_URL_ENV,
  RELAY_HEARTBEAT_INTERVAL_MS,
  RELAY_HEARTBEAT_TIMEOUT_MS,
  RELAY_MAX_BACKOFF_MS,
  RELAY_INITIAL_BACKOFF_MS,
  RELAY_BACKOFF_MULTIPLIER,
  RELAY_AUTH_TIMEOUT_MS,
  RELAY_MAX_PENDING_OAUTH,
  RELAY_MAX_TRIGGERS_PER_CONNECTION,
  // Composite state
  buildCompositeState,
  parseCompositeState,
} from "../../src/shared/relay-protocol.js";

import {
  getPublicUrl,
  getRelayApiUrl,
  isSelfHosted,
  buildWebhookUrl,
  buildOAuthCallbackUrl,
  buildOAuthStartUrl,
  buildShareLink,
} from "../../src/shared/urls.js";

// ---------------------------------------------------------------------------
// Helper: save and restore env vars
// ---------------------------------------------------------------------------

const ENV_KEYS = [
  "JERIKO_PUBLIC_URL",
  "JERIKO_RELAY_URL",
  "JERIKO_USER_ID",
  "JERIKO_PORT",
  "JERIKO_SHARE_URL",
] as const;

type EnvSnapshot = Record<string, string | undefined>;

function snapshotEnv(): EnvSnapshot {
  const snap: EnvSnapshot = {};
  for (const key of ENV_KEYS) {
    snap[key] = process.env[key];
  }
  return snap;
}

function restoreEnv(snap: EnvSnapshot): void {
  for (const [key, value] of Object.entries(snap)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function clearRelayEnv(): void {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

// ===========================================================================
// 1. Protocol message serialization
// ===========================================================================

describe("relay protocol — message serialization", () => {
  test("auth message serializes with all fields", () => {
    const msg: RelayAuthMessage = {
      type: "auth",
      userId: "abcdef0123456789abcdef0123456789",
      token: "secret-token",
      version: "1.0.0",
    };
    const json = JSON.stringify(msg);
    const parsed = JSON.parse(json);
    expect(parsed.type).toBe("auth");
    expect(parsed.userId).toBe("abcdef0123456789abcdef0123456789");
    expect(parsed.token).toBe("secret-token");
    expect(parsed.version).toBe("1.0.0");
  });

  test("auth message without version omits it", () => {
    const msg: RelayAuthMessage = {
      type: "auth",
      userId: "abcdef0123456789abcdef0123456789",
      token: "secret-token",
    };
    const json = JSON.stringify(msg);
    const parsed = JSON.parse(json);
    expect(parsed.version).toBeUndefined();
  });

  test("register_triggers message serializes trigger array", () => {
    const msg: RelayRegisterTriggersMessage = {
      type: "register_triggers",
      triggerIds: ["trig-1", "trig-2", "trig-3"],
    };
    const json = JSON.stringify(msg);
    const parsed = JSON.parse(json);
    expect(parsed.type).toBe("register_triggers");
    expect(parsed.triggerIds).toEqual(["trig-1", "trig-2", "trig-3"]);
  });

  test("unregister_triggers message serializes trigger array", () => {
    const msg: RelayUnregisterTriggersMessage = {
      type: "unregister_triggers",
      triggerIds: ["trig-1"],
    };
    const parsed = JSON.parse(JSON.stringify(msg));
    expect(parsed.type).toBe("unregister_triggers");
    expect(parsed.triggerIds).toEqual(["trig-1"]);
  });

  test("webhook_ack message includes requestId and status", () => {
    const msg: RelayWebhookAckMessage = {
      type: "webhook_ack",
      requestId: "req-abc",
      status: 200,
    };
    const parsed = JSON.parse(JSON.stringify(msg));
    expect(parsed.type).toBe("webhook_ack");
    expect(parsed.requestId).toBe("req-abc");
    expect(parsed.status).toBe(200);
  });

  test("oauth_result message with all optional fields", () => {
    const msg: RelayOAuthResultMessage = {
      type: "oauth_result",
      requestId: "req-xyz",
      statusCode: 200,
      html: "<h1>OK</h1>",
      redirectUrl: "https://provider.com/auth",
      codeVerifier: "pkce-verifier-123",
    };
    const parsed = JSON.parse(JSON.stringify(msg));
    expect(parsed.type).toBe("oauth_result");
    expect(parsed.redirectUrl).toBe("https://provider.com/auth");
    expect(parsed.codeVerifier).toBe("pkce-verifier-123");
  });

  test("oauth_result message without optional fields", () => {
    const msg: RelayOAuthResultMessage = {
      type: "oauth_result",
      requestId: "req-xyz",
      statusCode: 500,
      html: "Error",
    };
    const parsed = JSON.parse(JSON.stringify(msg));
    expect(parsed.redirectUrl).toBeUndefined();
    expect(parsed.codeVerifier).toBeUndefined();
  });

  test("share_response message serializes correctly", () => {
    const msg: RelayShareResponseMessage = {
      type: "share_response",
      requestId: "req-share",
      statusCode: 200,
      html: "<html>share page</html>",
    };
    const parsed = JSON.parse(JSON.stringify(msg));
    expect(parsed.type).toBe("share_response");
    expect(parsed.statusCode).toBe(200);
  });

  test("ping message is minimal", () => {
    const msg: RelayPingMessage = { type: "ping" };
    const parsed = JSON.parse(JSON.stringify(msg));
    expect(parsed.type).toBe("ping");
    expect(Object.keys(parsed)).toEqual(["type"]);
  });

  test("auth_ok message is minimal", () => {
    const msg: RelayAuthOkMessage = { type: "auth_ok" };
    const parsed = JSON.parse(JSON.stringify(msg));
    expect(parsed.type).toBe("auth_ok");
    expect(Object.keys(parsed)).toEqual(["type"]);
  });

  test("auth_fail message includes error", () => {
    const msg: RelayAuthFailMessage = { type: "auth_fail", error: "bad token" };
    const parsed = JSON.parse(JSON.stringify(msg));
    expect(parsed.type).toBe("auth_fail");
    expect(parsed.error).toBe("bad token");
  });

  test("webhook message includes all forwarding fields", () => {
    const msg: RelayWebhookMessage = {
      type: "webhook",
      requestId: "req-wh",
      triggerId: "trig-abc",
      headers: { "content-type": "application/json", "stripe-signature": "t=123,v1=abc" },
      body: '{"event":"test"}',
    };
    const parsed = JSON.parse(JSON.stringify(msg));
    expect(parsed.type).toBe("webhook");
    expect(parsed.triggerId).toBe("trig-abc");
    expect(parsed.headers["stripe-signature"]).toBe("t=123,v1=abc");
    expect(parsed.body).toBe('{"event":"test"}');
  });

  test("oauth_callback message includes provider and params", () => {
    const msg: RelayOAuthCallbackMessage = {
      type: "oauth_callback",
      requestId: "req-oa",
      provider: "github",
      params: { code: "auth-code", state: "user.token" },
    };
    const parsed = JSON.parse(JSON.stringify(msg));
    expect(parsed.provider).toBe("github");
    expect(parsed.params.code).toBe("auth-code");
  });

  test("oauth_start message includes provider and params", () => {
    const msg: RelayOAuthStartMessage = {
      type: "oauth_start",
      requestId: "req-start",
      provider: "x",
      params: { state: "user.token" },
    };
    const parsed = JSON.parse(JSON.stringify(msg));
    expect(parsed.type).toBe("oauth_start");
    expect(parsed.provider).toBe("x");
  });

  test("oauth_tokens message includes all token fields", () => {
    const msg: RelayOAuthTokensMessage = {
      type: "oauth_tokens",
      requestId: "req-tok",
      provider: "github",
      accessToken: "gho_abc123",
      refreshToken: "ghr_xyz789",
      expiresIn: 3600,
      scope: "repo,user",
      tokenType: "bearer",
    };
    const parsed = JSON.parse(JSON.stringify(msg));
    expect(parsed.accessToken).toBe("gho_abc123");
    expect(parsed.refreshToken).toBe("ghr_xyz789");
    expect(parsed.expiresIn).toBe(3600);
    expect(parsed.scope).toBe("repo,user");
    expect(parsed.tokenType).toBe("bearer");
  });

  test("oauth_tokens message with only required fields", () => {
    const msg: RelayOAuthTokensMessage = {
      type: "oauth_tokens",
      requestId: "req-tok2",
      provider: "stripe",
      accessToken: "sk_test_abc",
    };
    const parsed = JSON.parse(JSON.stringify(msg));
    expect(parsed.refreshToken).toBeUndefined();
    expect(parsed.expiresIn).toBeUndefined();
  });

  test("share_request message includes shareId", () => {
    const msg: RelayShareRequestMessage = {
      type: "share_request",
      requestId: "req-share",
      shareId: "abc-123",
    };
    const parsed = JSON.parse(JSON.stringify(msg));
    expect(parsed.type).toBe("share_request");
    expect(parsed.shareId).toBe("abc-123");
  });

  test("pong message is minimal", () => {
    const msg: RelayPongMessage = { type: "pong" };
    expect(Object.keys(JSON.parse(JSON.stringify(msg)))).toEqual(["type"]);
  });

  test("error message includes message field", () => {
    const msg: RelayErrorMessage = { type: "error", message: "Something went wrong" };
    const parsed = JSON.parse(JSON.stringify(msg));
    expect(parsed.message).toBe("Something went wrong");
  });

  test("outbound message union covers all types", () => {
    const types: RelayOutboundMessage["type"][] = [
      "auth",
      "register_triggers",
      "unregister_triggers",
      "webhook_ack",
      "oauth_result",
      "share_response",
      "ping",
    ];
    expect(types).toHaveLength(7);
  });

  test("inbound message union covers all types", () => {
    const types: RelayInboundMessage["type"][] = [
      "auth_ok",
      "auth_fail",
      "webhook",
      "oauth_callback",
      "oauth_start",
      "oauth_tokens",
      "share_request",
      "pong",
      "error",
    ];
    expect(types).toHaveLength(9);
  });
});

// ===========================================================================
// 2. Protocol constants
// ===========================================================================

describe("relay protocol — constants", () => {
  test("DEFAULT_RELAY_URL is wss://bot.jeriko.ai/relay", () => {
    expect(DEFAULT_RELAY_URL).toBe("wss://bot.jeriko.ai/relay");
  });

  test("RELAY_URL_ENV is JERIKO_RELAY_URL", () => {
    expect(RELAY_URL_ENV).toBe("JERIKO_RELAY_URL");
  });

  test("heartbeat interval is 30 seconds", () => {
    expect(RELAY_HEARTBEAT_INTERVAL_MS).toBe(30_000);
  });

  test("heartbeat timeout is 10 seconds", () => {
    expect(RELAY_HEARTBEAT_TIMEOUT_MS).toBe(10_000);
  });

  test("max backoff is 60 seconds", () => {
    expect(RELAY_MAX_BACKOFF_MS).toBe(60_000);
  });

  test("initial backoff is 1 second", () => {
    expect(RELAY_INITIAL_BACKOFF_MS).toBe(1_000);
  });

  test("backoff multiplier is 2", () => {
    expect(RELAY_BACKOFF_MULTIPLIER).toBe(2);
  });

  test("auth timeout is 15 seconds", () => {
    expect(RELAY_AUTH_TIMEOUT_MS).toBe(15_000);
  });

  test("max pending OAuth is 10", () => {
    expect(RELAY_MAX_PENDING_OAUTH).toBe(10);
  });

  test("max triggers per connection is 10000", () => {
    expect(RELAY_MAX_TRIGGERS_PER_CONNECTION).toBe(10_000);
  });
});

// ===========================================================================
// 3. Composite state (OAuth state parameter encoding)
// ===========================================================================

describe("relay protocol — composite state", () => {
  test("buildCompositeState creates userId.token format", () => {
    const state = buildCompositeState("abcdef0123456789abcdef0123456789", "random-token-456");
    expect(state).toBe("abcdef0123456789abcdef0123456789.random-token-456");
  });

  test("parseCompositeState extracts userId and token", () => {
    const result = parseCompositeState("abcdef0123456789abcdef0123456789.random-token-456");
    expect(result).not.toBeNull();
    expect(result!.userId).toBe("abcdef0123456789abcdef0123456789");
    expect(result!.token).toBe("random-token-456");
  });

  test("parseCompositeState handles dots in token", () => {
    const result = parseCompositeState("abcdef0123456789abcdef0123456780.token.with.dots");
    expect(result).not.toBeNull();
    expect(result!.userId).toBe("abcdef0123456789abcdef0123456780");
    expect(result!.token).toBe("token.with.dots");
  });

  test("parseCompositeState returns null for no dot", () => {
    expect(parseCompositeState("nodothere")).toBeNull();
  });

  test("parseCompositeState returns null for empty userId", () => {
    expect(parseCompositeState(".token-only")).toBeNull();
  });

  test("parseCompositeState returns null for empty token", () => {
    expect(parseCompositeState("userid-only.")).toBeNull();
  });

  test("roundtrip buildCompositeState -> parseCompositeState", () => {
    const userId = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
    const token = "a1b2c3d4e5f6";
    const state = buildCompositeState(userId, token);
    const parsed = parseCompositeState(state);
    expect(parsed).not.toBeNull();
    expect(parsed!.userId).toBe(userId);
    expect(parsed!.token).toBe(token);
  });

  test("parseCompositeState with UUID userId", () => {
    const result = parseCompositeState("f47ac10b-58cc-4372-a567-0e02b2c3d479.abc123def456");
    expect(result!.userId).toBe("f47ac10b-58cc-4372-a567-0e02b2c3d479");
    expect(result!.token).toBe("abc123def456");
  });
});

// ===========================================================================
// 4. URL builders
// ===========================================================================

describe("URL builders — relay mode (default)", () => {
  let envSnap: EnvSnapshot;

  beforeEach(() => {
    envSnap = snapshotEnv();
    clearRelayEnv();
    // Relay mode: no JERIKO_PUBLIC_URL, set userId
    process.env.JERIKO_USER_ID = "abcdef0123456789abcdef0123456789";
  });

  afterEach(() => {
    restoreEnv(envSnap);
  });

  test("getPublicUrl returns default relay URL", () => {
    expect(getPublicUrl()).toBe("https://bot.jeriko.ai");
  });

  test("isSelfHosted returns false", () => {
    expect(isSelfHosted()).toBe(false);
  });

  test("buildWebhookUrl includes userId and triggerId", () => {
    const url = buildWebhookUrl("trig-456");
    expect(url).toBe("https://bot.jeriko.ai/hooks/abcdef0123456789abcdef0123456789/trig-456");
  });

  test("buildOAuthCallbackUrl uses relay base", () => {
    const url = buildOAuthCallbackUrl("github");
    expect(url).toBe("https://bot.jeriko.ai/oauth/github/callback");
  });

  test("buildOAuthStartUrl includes state parameter", () => {
    const url = buildOAuthStartUrl("github", "abcdef0123456789abcdef0123456789.token-xyz");
    expect(url).toBe("https://bot.jeriko.ai/oauth/github/start?state=abcdef0123456789abcdef0123456789.token-xyz");
  });

  test("buildOAuthStartUrl URL-encodes state", () => {
    const url = buildOAuthStartUrl("github", "user.token with spaces");
    expect(url).toContain("state=user.token%20with%20spaces");
  });

  test("getRelayApiUrl derives HTTP from default WS URL", () => {
    const url = getRelayApiUrl();
    expect(url).toBe("https://bot.jeriko.ai");
  });

  test("buildShareLink includes userId in relay mode", () => {
    const url = buildShareLink("share-abc");
    expect(url).toBe("https://bot.jeriko.ai/s/abcdef0123456789abcdef0123456789/share-abc");
  });
});

describe("URL builders — self-hosted mode", () => {
  let envSnap: EnvSnapshot;

  beforeEach(() => {
    envSnap = snapshotEnv();
    clearRelayEnv();
    process.env.JERIKO_PUBLIC_URL = "https://my-tunnel.example.com";
    process.env.JERIKO_USER_ID = "abcdef0123456789abcdef0123456789";
  });

  afterEach(() => {
    restoreEnv(envSnap);
  });

  test("getPublicUrl returns self-hosted URL", () => {
    expect(getPublicUrl()).toBe("https://my-tunnel.example.com");
  });

  test("isSelfHosted returns true", () => {
    expect(isSelfHosted()).toBe(true);
  });

  test("buildWebhookUrl omits userId", () => {
    const url = buildWebhookUrl("trig-456");
    expect(url).toBe("https://my-tunnel.example.com/hooks/trig-456");
  });

  test("buildOAuthCallbackUrl uses self-hosted base", () => {
    const url = buildOAuthCallbackUrl("stripe");
    expect(url).toBe("https://my-tunnel.example.com/oauth/stripe/callback");
  });

  test("buildShareLink omits userId in self-hosted mode", () => {
    const url = buildShareLink("share-abc");
    expect(url).toBe("https://my-tunnel.example.com/s/share-abc");
  });

  test("trailing slashes are stripped from JERIKO_PUBLIC_URL", () => {
    process.env.JERIKO_PUBLIC_URL = "https://my-tunnel.example.com///";
    expect(getPublicUrl()).toBe("https://my-tunnel.example.com");
    expect(buildWebhookUrl("trig")).toBe("https://my-tunnel.example.com/hooks/trig");
  });
});

describe("URL builders — local dev mode", () => {
  let envSnap: EnvSnapshot;

  beforeEach(() => {
    envSnap = snapshotEnv();
    clearRelayEnv();
    // No JERIKO_PUBLIC_URL, no JERIKO_USER_ID
  });

  afterEach(() => {
    restoreEnv(envSnap);
  });

  test("buildWebhookUrl falls back to localhost", () => {
    const url = buildWebhookUrl("trig-local");
    expect(url).toBe("http://127.0.0.1:7741/hooks/trig-local");
  });

  test("buildWebhookUrl respects JERIKO_PORT", () => {
    process.env.JERIKO_PORT = "4567";
    const url = buildWebhookUrl("trig-local");
    expect(url).toBe("http://127.0.0.1:4567/hooks/trig-local");
  });

  test("buildWebhookUrl uses localBaseUrl parameter", () => {
    const url = buildWebhookUrl("trig-local", "http://localhost:9999");
    expect(url).toBe("http://localhost:9999/hooks/trig-local");
  });

  test("buildShareLink omits userId when none available", () => {
    const url = buildShareLink("share-abc");
    expect(url).toBe("https://bot.jeriko.ai/s/share-abc");
  });
});

describe("URL builders — relay API URL derivation", () => {
  let envSnap: EnvSnapshot;

  beforeEach(() => {
    envSnap = snapshotEnv();
    clearRelayEnv();
  });

  afterEach(() => {
    restoreEnv(envSnap);
  });

  test("default: wss://bot.jeriko.ai/relay -> https://bot.jeriko.ai", () => {
    expect(getRelayApiUrl()).toBe("https://bot.jeriko.ai");
  });

  test("ws:// converts to http://", () => {
    process.env.JERIKO_RELAY_URL = "ws://localhost:8080/relay";
    expect(getRelayApiUrl()).toBe("http://localhost:8080");
  });

  test("wss:// converts to https://", () => {
    process.env.JERIKO_RELAY_URL = "wss://custom-relay.example.com/relay";
    expect(getRelayApiUrl()).toBe("https://custom-relay.example.com");
  });

  test("strips /relay path suffix", () => {
    process.env.JERIKO_RELAY_URL = "wss://custom.example.com/relay";
    const url = getRelayApiUrl();
    expect(url).toBe("https://custom.example.com");
    expect(url.endsWith("/relay")).toBe(false);
  });

  test("strips trailing slashes", () => {
    process.env.JERIKO_RELAY_URL = "ws://localhost:8080/relay/";
    expect(getRelayApiUrl()).toBe("http://localhost:8080");
  });
});

// ===========================================================================
// 5. Client reconnection backoff calculation
// ===========================================================================

describe("relay client — backoff calculation", () => {
  test("initial backoff is 1 second", () => {
    expect(RELAY_INITIAL_BACKOFF_MS).toBe(1000);
  });

  test("backoff doubles each iteration", () => {
    let backoff = RELAY_INITIAL_BACKOFF_MS;
    const sequence: number[] = [backoff];

    for (let i = 0; i < 6; i++) {
      backoff = Math.min(backoff * RELAY_BACKOFF_MULTIPLIER, RELAY_MAX_BACKOFF_MS);
      sequence.push(backoff);
    }

    expect(sequence).toEqual([1000, 2000, 4000, 8000, 16000, 32000, 60000]);
  });

  test("backoff caps at 60 seconds", () => {
    let backoff = RELAY_INITIAL_BACKOFF_MS;
    for (let i = 0; i < 20; i++) {
      backoff = Math.min(backoff * RELAY_BACKOFF_MULTIPLIER, RELAY_MAX_BACKOFF_MS);
    }
    expect(backoff).toBe(60000);
  });

  test("backoff never exceeds RELAY_MAX_BACKOFF_MS", () => {
    let backoff = RELAY_INITIAL_BACKOFF_MS;
    for (let i = 0; i < 100; i++) {
      backoff = Math.min(backoff * RELAY_BACKOFF_MULTIPLIER, RELAY_MAX_BACKOFF_MS);
      expect(backoff).toBeLessThanOrEqual(RELAY_MAX_BACKOFF_MS);
    }
  });

  test("auth timeout is shorter than max backoff", () => {
    expect(RELAY_AUTH_TIMEOUT_MS).toBeLessThan(RELAY_MAX_BACKOFF_MS);
  });

  test("heartbeat timeout is shorter than heartbeat interval", () => {
    expect(RELAY_HEARTBEAT_TIMEOUT_MS).toBeLessThan(RELAY_HEARTBEAT_INTERVAL_MS);
  });
});

// ===========================================================================
// 6. Auth message format validation
// ===========================================================================

describe("relay protocol — auth message format", () => {
  test("auth message has exactly the required fields", () => {
    const msg: RelayAuthMessage = {
      type: "auth",
      userId: "abcdef0123456789abcdef0123456789",
      token: "test-token",
    };
    const keys = Object.keys(msg).sort();
    expect(keys).toEqual(["token", "type", "userId"]);
  });

  test("auth message with version has 4 fields", () => {
    const msg: RelayAuthMessage = {
      type: "auth",
      userId: "abcdef0123456789abcdef0123456789",
      token: "test-token",
      version: "2.0.0",
    };
    const keys = Object.keys(msg).sort();
    expect(keys).toEqual(["token", "type", "userId", "version"]);
  });

  test("auth_ok response is type-only", () => {
    const msg: RelayAuthOkMessage = { type: "auth_ok" };
    expect(JSON.stringify(msg)).toBe('{"type":"auth_ok"}');
  });

  test("auth_fail includes error description", () => {
    const msg: RelayAuthFailMessage = { type: "auth_fail", error: "Invalid credentials" };
    const parsed = JSON.parse(JSON.stringify(msg));
    expect(parsed.error).toBe("Invalid credentials");
  });
});

// ===========================================================================
// 7. Trigger registration/unregistration messages
// ===========================================================================

describe("relay protocol — trigger registration", () => {
  test("register_triggers with empty array", () => {
    const msg: RelayRegisterTriggersMessage = {
      type: "register_triggers",
      triggerIds: [],
    };
    const parsed = JSON.parse(JSON.stringify(msg));
    expect(parsed.triggerIds).toEqual([]);
  });

  test("register_triggers with multiple IDs", () => {
    const ids = Array.from({ length: 100 }, (_, i) => `trig-${i}`);
    const msg: RelayRegisterTriggersMessage = {
      type: "register_triggers",
      triggerIds: ids,
    };
    const parsed = JSON.parse(JSON.stringify(msg));
    expect(parsed.triggerIds).toHaveLength(100);
    expect(parsed.triggerIds[0]).toBe("trig-0");
    expect(parsed.triggerIds[99]).toBe("trig-99");
  });

  test("unregister_triggers with single ID", () => {
    const msg: RelayUnregisterTriggersMessage = {
      type: "unregister_triggers",
      triggerIds: ["trig-to-remove"],
    };
    const parsed = JSON.parse(JSON.stringify(msg));
    expect(parsed.triggerIds).toEqual(["trig-to-remove"]);
  });

  test("trigger IDs preserve UUID format", () => {
    const triggerId = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
    const msg: RelayRegisterTriggersMessage = {
      type: "register_triggers",
      triggerIds: [triggerId],
    };
    const parsed = JSON.parse(JSON.stringify(msg));
    expect(parsed.triggerIds[0]).toBe(triggerId);
  });

  test("RELAY_MAX_TRIGGERS_PER_CONNECTION is a reasonable limit", () => {
    expect(RELAY_MAX_TRIGGERS_PER_CONNECTION).toBeGreaterThan(0);
    expect(RELAY_MAX_TRIGGERS_PER_CONNECTION).toBeLessThanOrEqual(100_000);
  });
});

// ===========================================================================
// 8. Webhook routing message format
// ===========================================================================

describe("relay protocol — webhook routing", () => {
  test("webhook message preserves headers as lowercase key-value pairs", () => {
    const msg: RelayWebhookMessage = {
      type: "webhook",
      requestId: "req-1",
      triggerId: "trig-1",
      headers: {
        "content-type": "application/json",
        "x-github-event": "push",
        "x-hub-signature-256": "sha256=abc123",
      },
      body: '{"action":"push"}',
    };
    const parsed = JSON.parse(JSON.stringify(msg));
    expect(parsed.headers["content-type"]).toBe("application/json");
    expect(parsed.headers["x-github-event"]).toBe("push");
    expect(parsed.body).toBe('{"action":"push"}');
  });

  test("webhook message body can be empty string", () => {
    const msg: RelayWebhookMessage = {
      type: "webhook",
      requestId: "req-2",
      triggerId: "trig-2",
      headers: {},
      body: "",
    };
    const parsed = JSON.parse(JSON.stringify(msg));
    expect(parsed.body).toBe("");
  });

  test("webhook message body can contain non-JSON content", () => {
    const msg: RelayWebhookMessage = {
      type: "webhook",
      requestId: "req-3",
      triggerId: "trig-3",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "event=charge.succeeded&id=ch_123",
    };
    const parsed = JSON.parse(JSON.stringify(msg));
    expect(parsed.body).toBe("event=charge.succeeded&id=ch_123");
  });

  test("webhook ack includes status code", () => {
    const msg: RelayWebhookAckMessage = {
      type: "webhook_ack",
      requestId: "req-1",
      status: 500,
    };
    const parsed = JSON.parse(JSON.stringify(msg));
    expect(parsed.status).toBe(500);
  });
});

// ===========================================================================
// 9. OAuth callback message format
// ===========================================================================

describe("relay protocol — OAuth callback format", () => {
  test("oauth_callback includes all query params", () => {
    const msg: RelayOAuthCallbackMessage = {
      type: "oauth_callback",
      requestId: "req-oa1",
      provider: "github",
      params: {
        code: "abc123",
        state: "abcdef0123456789abcdef0123456780.random-token",
      },
    };
    const parsed = JSON.parse(JSON.stringify(msg));
    expect(parsed.params.code).toBe("abc123");
    expect(parsed.params.state).toBe("abcdef0123456789abcdef0123456780.random-token");
  });

  test("oauth_start message preserves provider name", () => {
    const providers = ["github", "x", "gdrive", "gmail", "vercel", "stripe"];
    for (const provider of providers) {
      const msg: RelayOAuthStartMessage = {
        type: "oauth_start",
        requestId: `req-${provider}`,
        provider,
        params: { state: `user.token-${provider}` },
      };
      const parsed = JSON.parse(JSON.stringify(msg));
      expect(parsed.provider).toBe(provider);
    }
  });

  test("oauth_tokens message carries full token response", () => {
    const msg: RelayOAuthTokensMessage = {
      type: "oauth_tokens",
      requestId: "req-tok",
      provider: "github",
      accessToken: "gho_xxxx",
      refreshToken: "ghr_yyyy",
      expiresIn: 28800,
      scope: "repo,user:email",
      tokenType: "bearer",
    };
    const parsed = JSON.parse(JSON.stringify(msg));
    expect(parsed.type).toBe("oauth_tokens");
    expect(parsed.accessToken).toBe("gho_xxxx");
    expect(parsed.expiresIn).toBe(28800);
  });

  test("oauth_result with redirectUrl signals 302 to relay", () => {
    const msg: RelayOAuthResultMessage = {
      type: "oauth_result",
      requestId: "req-start",
      statusCode: 200,
      html: "",
      redirectUrl: "https://github.com/login/oauth/authorize?client_id=abc&state=user.token",
    };
    const parsed = JSON.parse(JSON.stringify(msg));
    expect(parsed.redirectUrl).toContain("github.com/login/oauth/authorize");
  });

  test("oauth_result with codeVerifier for PKCE flow", () => {
    const msg: RelayOAuthResultMessage = {
      type: "oauth_result",
      requestId: "req-start",
      statusCode: 200,
      html: "",
      redirectUrl: "https://twitter.com/i/oauth2/authorize?...",
      codeVerifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
    };
    const parsed = JSON.parse(JSON.stringify(msg));
    expect(parsed.codeVerifier).toBe("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk");
  });
});

// ===========================================================================
// 10. Connection state shape
// ===========================================================================

describe("relay protocol — RelayConnection shape", () => {
  test("RelayConnection has all required fields", () => {
    const conn: RelayConnection = {
      userId: "abcdef0123456789abcdef0123456789",
      connectedAt: new Date().toISOString(),
      lastPing: new Date().toISOString(),
      authenticated: true,
      triggerIds: new Set(["trig-1", "trig-2"]),
    };
    expect(conn.userId).toBe("abcdef0123456789abcdef0123456789");
    expect(conn.authenticated).toBe(true);
    expect(conn.triggerIds.size).toBe(2);
    expect(conn.triggerIds.has("trig-1")).toBe(true);
  });

  test("RelayConnection triggerIds is a Set (not array)", () => {
    const conn: RelayConnection = {
      userId: "abcdef0123456789abcdef0123456789",
      connectedAt: new Date().toISOString(),
      lastPing: new Date().toISOString(),
      authenticated: true,
      triggerIds: new Set(),
    };
    conn.triggerIds.add("new-trigger");
    expect(conn.triggerIds.has("new-trigger")).toBe(true);
    expect(conn.triggerIds.size).toBe(1);
  });

  test("RelayConnection version is optional", () => {
    const conn: RelayConnection = {
      userId: "abcdef0123456789abcdef0123456789",
      connectedAt: new Date().toISOString(),
      lastPing: new Date().toISOString(),
      authenticated: true,
      triggerIds: new Set(),
    };
    expect(conn.version).toBeUndefined();
  });

  test("connectedAt and lastPing are ISO 8601 timestamps", () => {
    const now = new Date().toISOString();
    const conn: RelayConnection = {
      userId: "abcdef0123456789abcdef0123456789",
      connectedAt: now,
      lastPing: now,
      authenticated: true,
      triggerIds: new Set(),
    };
    // ISO 8601 format: YYYY-MM-DDTHH:MM:SS.sssZ
    expect(conn.connectedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(conn.lastPing).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
