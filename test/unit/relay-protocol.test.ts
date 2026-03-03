// Relay protocol tests — type and constant validation.

import { describe, expect, it } from "bun:test";
import {
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
} from "../../src/shared/relay-protocol.js";

describe("relay-protocol", () => {
  describe("constants", () => {
    it("has a valid default relay URL", () => {
      expect(DEFAULT_RELAY_URL).toBe("wss://bot.jeriko.ai/relay");
      expect(DEFAULT_RELAY_URL).toStartWith("wss://");
    });

    it("has the correct env var name for relay URL override", () => {
      expect(RELAY_URL_ENV).toBe("JERIKO_RELAY_URL");
    });

    it("heartbeat interval is 30 seconds", () => {
      expect(RELAY_HEARTBEAT_INTERVAL_MS).toBe(30_000);
    });

    it("heartbeat timeout is shorter than interval", () => {
      expect(RELAY_HEARTBEAT_TIMEOUT_MS).toBeLessThan(RELAY_HEARTBEAT_INTERVAL_MS);
      expect(RELAY_HEARTBEAT_TIMEOUT_MS).toBe(10_000);
    });

    it("max backoff is 60 seconds", () => {
      expect(RELAY_MAX_BACKOFF_MS).toBe(60_000);
    });

    it("initial backoff is 1 second", () => {
      expect(RELAY_INITIAL_BACKOFF_MS).toBe(1_000);
    });

    it("backoff multiplier is 2 (exponential doubling)", () => {
      expect(RELAY_BACKOFF_MULTIPLIER).toBe(2);
    });

    it("exponential backoff converges to max", () => {
      let backoff = RELAY_INITIAL_BACKOFF_MS;
      const steps: number[] = [backoff];

      while (backoff < RELAY_MAX_BACKOFF_MS) {
        backoff = Math.min(backoff * RELAY_BACKOFF_MULTIPLIER, RELAY_MAX_BACKOFF_MS);
        steps.push(backoff);
      }

      // 1s → 2s → 4s → 8s → 16s → 32s → 60s
      expect(steps).toEqual([1000, 2000, 4000, 8000, 16000, 32000, 60000]);
    });

    it("auth timeout is 15 seconds", () => {
      expect(RELAY_AUTH_TIMEOUT_MS).toBe(15_000);
      // Auth timeout should be shorter than heartbeat interval
      expect(RELAY_AUTH_TIMEOUT_MS).toBeLessThan(RELAY_HEARTBEAT_INTERVAL_MS);
    });

    it("max pending OAuth callbacks is reasonable", () => {
      expect(RELAY_MAX_PENDING_OAUTH).toBe(10);
      expect(RELAY_MAX_PENDING_OAUTH).toBeGreaterThan(0);
    });

    it("max triggers per connection is bounded", () => {
      expect(RELAY_MAX_TRIGGERS_PER_CONNECTION).toBe(10_000);
      expect(RELAY_MAX_TRIGGERS_PER_CONNECTION).toBeGreaterThan(100);
    });
  });
});
