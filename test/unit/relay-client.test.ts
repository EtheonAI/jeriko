// Relay client tests — connection lifecycle, trigger registration, message handling.

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { RelayClient } from "../../src/daemon/services/relay/client.js";

describe("RelayClient", () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = {
      JERIKO_RELAY_URL: process.env.JERIKO_RELAY_URL,
    };
    // Point relay to a non-existent URL to prevent actual connections
    process.env.JERIKO_RELAY_URL = "ws://127.0.0.1:1/relay";
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

  describe("construction", () => {
    it("creates a client with userId and token", () => {
      const client = new RelayClient({
        userId: "test-user",
        token: "test-token",
      });
      expect(client).toBeDefined();
      expect(client.isConnected()).toBe(false);
    });

    it("accepts optional version", () => {
      const client = new RelayClient({
        userId: "test-user",
        token: "test-token",
        version: "2.0.0",
      });
      expect(client).toBeDefined();
    });
  });

  describe("isConnected", () => {
    it("returns false before connect()", () => {
      const client = new RelayClient({
        userId: "test-user",
        token: "test-token",
      });
      expect(client.isConnected()).toBe(false);
    });

    it("returns false after disconnect()", () => {
      const client = new RelayClient({
        userId: "test-user",
        token: "test-token",
      });
      client.disconnect();
      expect(client.isConnected()).toBe(false);
    });
  });

  describe("trigger registration", () => {
    it("tracks registered triggers", () => {
      const client = new RelayClient({
        userId: "test-user",
        token: "test-token",
      });

      // No error when registering triggers while disconnected
      client.registerTrigger("trigger-1");
      client.registerTrigger("trigger-2");

      // No error when unregistering
      client.unregisterTrigger("trigger-1");
    });
  });

  describe("handlers", () => {
    it("accepts webhook handler without error", () => {
      const client = new RelayClient({
        userId: "test-user",
        token: "test-token",
      });

      client.onWebhook(async () => {});
    });

    it("accepts OAuth handler without error", () => {
      const client = new RelayClient({
        userId: "test-user",
        token: "test-token",
      });

      client.onOAuthCallback(async () => ({ statusCode: 200, html: "<html></html>" }));
    });
  });

  describe("disconnect", () => {
    it("can be called multiple times safely", () => {
      const client = new RelayClient({
        userId: "test-user",
        token: "test-token",
      });

      // Should not throw
      client.disconnect();
      client.disconnect();
      client.disconnect();
      expect(client.isConnected()).toBe(false);
    });
  });
});
