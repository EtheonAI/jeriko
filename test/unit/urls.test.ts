// URL routing tests — relay-aware webhook URLs, OAuth callbacks, share links.

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import {
  getPublicUrl,
  getRelayApiUrl,
  isSelfHosted,
  buildWebhookUrl,
  buildOAuthCallbackUrl,
  buildOAuthStartUrl,
  getShareUrl,
  buildShareLink,
} from "../../src/shared/urls.js";

describe("urls", () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = {
      JERIKO_PUBLIC_URL: process.env.JERIKO_PUBLIC_URL,
      JERIKO_USER_ID: process.env.JERIKO_USER_ID,
      JERIKO_SHARE_URL: process.env.JERIKO_SHARE_URL,
      JERIKO_PORT: process.env.JERIKO_PORT,
      JERIKO_RELAY_URL: process.env.JERIKO_RELAY_URL,
    };
    // Clear all for clean state
    delete process.env.JERIKO_PUBLIC_URL;
    delete process.env.JERIKO_USER_ID;
    delete process.env.JERIKO_SHARE_URL;
    delete process.env.JERIKO_PORT;
    delete process.env.JERIKO_RELAY_URL;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value !== undefined) {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
  });

  // ── getPublicUrl ────────────────────────────────────────────

  describe("getPublicUrl", () => {
    it("returns default when JERIKO_PUBLIC_URL is not set", () => {
      expect(getPublicUrl()).toBe("https://bot.jeriko.ai");
    });

    it("returns JERIKO_PUBLIC_URL when set", () => {
      process.env.JERIKO_PUBLIC_URL = "https://my-tunnel.example.com";
      expect(getPublicUrl()).toBe("https://my-tunnel.example.com");
    });
  });

  // ── isSelfHosted ────────────────────────────────────────────

  describe("isSelfHosted", () => {
    it("returns false when JERIKO_PUBLIC_URL is not set", () => {
      expect(isSelfHosted()).toBe(false);
    });

    it("returns true when JERIKO_PUBLIC_URL is set", () => {
      process.env.JERIKO_PUBLIC_URL = "https://my-tunnel.example.com";
      expect(isSelfHosted()).toBe(true);
    });
  });

  // ── buildWebhookUrl ─────────────────────────────────────────

  describe("buildWebhookUrl", () => {
    it("includes userId when using relay (no JERIKO_PUBLIC_URL)", () => {
      process.env.JERIKO_USER_ID = "abcdef0123456789abcdef0123456789";
      const url = buildWebhookUrl("trigger-xyz");
      expect(url).toBe("https://bot.jeriko.ai/hooks/abcdef0123456789abcdef0123456789/trigger-xyz");
    });

    it("omits userId when self-hosted (JERIKO_PUBLIC_URL set)", () => {
      process.env.JERIKO_PUBLIC_URL = "https://my-tunnel.example.com";
      process.env.JERIKO_USER_ID = "abcdef0123456789abcdef0123456789";
      const url = buildWebhookUrl("trigger-xyz");
      expect(url).toBe("https://my-tunnel.example.com/hooks/trigger-xyz");
    });

    it("falls back to local URL when no userId and no public URL", () => {
      const url = buildWebhookUrl("trigger-xyz");
      expect(url).toBe("http://127.0.0.1:7741/hooks/trigger-xyz");
    });

    it("uses localBaseUrl when provided and no userId", () => {
      const url = buildWebhookUrl("trigger-xyz", "http://localhost:4000");
      expect(url).toBe("http://localhost:4000/hooks/trigger-xyz");
    });

    it("respects JERIKO_PORT in local fallback", () => {
      process.env.JERIKO_PORT = "5000";
      const url = buildWebhookUrl("trigger-xyz");
      expect(url).toBe("http://127.0.0.1:5000/hooks/trigger-xyz");
    });
  });

  // ── buildOAuthCallbackUrl ───────────────────────────────────

  describe("buildOAuthCallbackUrl", () => {
    it("never includes userId in the URL path (relay mode)", () => {
      process.env.JERIKO_USER_ID = "abcdef0123456789abcdef0123456789";
      const url = buildOAuthCallbackUrl("github");
      expect(url).toBe("https://bot.jeriko.ai/oauth/github/callback");
      expect(url).not.toContain("abcdef0123456789abcdef0123456789");
    });

    it("uses public URL when self-hosted", () => {
      process.env.JERIKO_PUBLIC_URL = "https://my-tunnel.example.com";
      process.env.JERIKO_USER_ID = "abcdef0123456789abcdef0123456789";
      const url = buildOAuthCallbackUrl("github");
      expect(url).toBe("https://my-tunnel.example.com/oauth/github/callback");
    });

    it("uses default URL when no userId available", () => {
      const url = buildOAuthCallbackUrl("github");
      expect(url).toBe("https://bot.jeriko.ai/oauth/github/callback");
    });
  });

  // ── buildOAuthStartUrl ──────────────────────────────────────

  describe("buildOAuthStartUrl", () => {
    it("never includes userId in the URL path (relay mode)", () => {
      process.env.JERIKO_USER_ID = "abcdef0123456789abcdef0123456789";
      const url = buildOAuthStartUrl("github", "state-token-xyz");
      expect(url).toBe("https://bot.jeriko.ai/oauth/github/start?state=state-token-xyz");
      expect(url).not.toContain("abcdef0123456789abcdef0123456789");
    });

    it("uses public URL when self-hosted", () => {
      process.env.JERIKO_PUBLIC_URL = "https://my-tunnel.example.com";
      const url = buildOAuthStartUrl("github", "state-token-xyz");
      expect(url).toBe("https://my-tunnel.example.com/oauth/github/start?state=state-token-xyz");
    });
  });

  // ── Trailing slash normalization ────────────────────────────

  describe("trailing slash normalization", () => {
    it("strips trailing slashes from JERIKO_PUBLIC_URL", () => {
      process.env.JERIKO_PUBLIC_URL = "https://example.com/";
      expect(getPublicUrl()).toBe("https://example.com");
    });

    it("strips multiple trailing slashes", () => {
      process.env.JERIKO_PUBLIC_URL = "https://example.com///";
      expect(getPublicUrl()).toBe("https://example.com");
    });

    it("does not create double-slash in generated URLs", () => {
      process.env.JERIKO_PUBLIC_URL = "https://example.com/";
      process.env.JERIKO_USER_ID = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
      const url = buildWebhookUrl("t-1");
      expect(url).not.toContain("//hooks");
      expect(url).toBe("https://example.com/hooks/t-1");
    });
  });

  // ── encodeURIComponent on state tokens ─────────────────────

  describe("state token encoding", () => {
    it("encodes special characters in state token", () => {
      process.env.JERIKO_USER_ID = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
      const url = buildOAuthStartUrl("github", "token=foo&bar");
      expect(url).toContain("state=token%3Dfoo%26bar");
      expect(url).not.toContain("state=token=foo&bar");
    });

    it("passes clean tokens through unchanged", () => {
      process.env.JERIKO_USER_ID = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
      const url = buildOAuthStartUrl("github", "abc123");
      expect(url).toContain("state=abc123");
    });
  });

  // ── getRelayApiUrl ─────────────────────────────────────────

  describe("getRelayApiUrl", () => {
    it("returns default HTTPS URL from default WSS relay URL", () => {
      expect(getRelayApiUrl()).toBe("https://bot.jeriko.ai");
    });

    it("converts ws:// to http:// and strips /relay path", () => {
      process.env.JERIKO_RELAY_URL = "ws://localhost:8080/relay";
      expect(getRelayApiUrl()).toBe("http://localhost:8080");
    });

    it("converts wss:// to https:// and strips /relay path", () => {
      process.env.JERIKO_RELAY_URL = "wss://custom-relay.example.com/relay";
      expect(getRelayApiUrl()).toBe("https://custom-relay.example.com");
    });

    it("handles URL without /relay path", () => {
      process.env.JERIKO_RELAY_URL = "ws://localhost:9090";
      expect(getRelayApiUrl()).toBe("http://localhost:9090");
    });

    it("strips trailing slashes", () => {
      process.env.JERIKO_RELAY_URL = "ws://localhost:8080/relay/";
      expect(getRelayApiUrl()).toBe("http://localhost:8080");
    });
  });

  // ── Share URLs (unchanged behavior) ─────────────────────────

  describe("buildShareLink", () => {
    it("uses default public URL", () => {
      const url = buildShareLink("share-abc");
      expect(url).toBe("https://bot.jeriko.ai/s/share-abc");
    });

    it("uses JERIKO_SHARE_URL when set", () => {
      process.env.JERIKO_SHARE_URL = "https://share.jeriko.ai";
      const url = buildShareLink("share-abc");
      expect(url).toBe("https://share.jeriko.ai/s/share-abc");
    });

    it("uses JERIKO_PUBLIC_URL as fallback", () => {
      process.env.JERIKO_PUBLIC_URL = "https://my-tunnel.example.com";
      const url = buildShareLink("share-abc");
      expect(url).toBe("https://my-tunnel.example.com/s/share-abc");
    });
  });
});
