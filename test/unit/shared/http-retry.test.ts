// http-retry tests — pure logic, stub fetch + timers.

import { describe, it, expect, mock, afterEach } from "bun:test";
import {
  withHttpRetry,
  parseRetryAfter,
  computeBackoff,
  DEFAULT_RETRYABLE_STATUSES,
} from "../../../src/shared/http-retry.js";

const ORIGINAL_TIMEOUT = globalThis.setTimeout;

afterEach(() => {
  globalThis.setTimeout = ORIGINAL_TIMEOUT;
});

describe("parseRetryAfter", () => {
  it("parses delta-seconds numeric form", () => {
    expect(parseRetryAfter("5")).toBe(5000);
  });

  it("parses HTTP-date in the future", () => {
    const now = Date.parse("2026-04-23T12:00:00Z");
    const date = "Thu, 23 Apr 2026 12:00:10 GMT";
    expect(parseRetryAfter(date, now)).toBe(10_000);
  });

  it("clamps past dates to 0", () => {
    const now = Date.parse("2026-04-23T12:00:10Z");
    const date = "Thu, 23 Apr 2026 12:00:00 GMT";
    expect(parseRetryAfter(date, now)).toBe(0);
  });

  it("returns undefined for null / empty / garbage", () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter("")).toBeUndefined();
    expect(parseRetryAfter("not a date")).toBeUndefined();
  });
});

describe("computeBackoff", () => {
  it("is deterministic with stubbed random", () => {
    const d0 = computeBackoff(0, 1000, 60_000, () => 0.5);
    const d1 = computeBackoff(1, 1000, 60_000, () => 0.5);
    const d2 = computeBackoff(2, 1000, 60_000, () => 0.5);
    expect(d0).toBe(1000);
    expect(d1).toBe(2000);
    expect(d2).toBe(4000);
  });

  it("respects the maximum cap", () => {
    const capped = computeBackoff(20, 1000, 5000, () => 0.5);
    expect(capped).toBeLessThanOrEqual(5000);
  });

  it("applies bounded jitter", () => {
    // With random=0 (min jitter) the delay is 80% of raw; with random=1 (max) 120%.
    expect(computeBackoff(0, 1000, 60_000, () => 0)).toBe(800);
    expect(computeBackoff(0, 1000, 60_000, () => 1)).toBe(1200);
  });
});

describe("DEFAULT_RETRYABLE_STATUSES", () => {
  it("covers the classic transient HTTP error codes", () => {
    for (const s of [408, 425, 429, 500, 502, 503, 504]) {
      expect(DEFAULT_RETRYABLE_STATUSES.has(s)).toBe(true);
    }
  });

  it("does not include 400 or 401", () => {
    expect(DEFAULT_RETRYABLE_STATUSES.has(400)).toBe(false);
    expect(DEFAULT_RETRYABLE_STATUSES.has(401)).toBe(false);
  });
});

describe("withHttpRetry", () => {
  function stubSleep(): number[] {
    const delays: number[] = [];
    globalThis.setTimeout = ((fn: (...args: unknown[]) => void, delay?: number) => {
      delays.push(Number(delay ?? 0));
      fn();
      return 0 as unknown as NodeJS.Timeout;
    }) as typeof setTimeout;
    return delays;
  }

  it("returns the response on first success", async () => {
    const fn = mock(async () => new Response("ok", { status: 200 }));
    const res = await withHttpRetry(fn);
    expect(res.status).toBe(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries 503 and resolves when the second attempt succeeds", async () => {
    const delays = stubSleep();
    let call = 0;
    const fn = mock(async () => {
      call++;
      return call === 1
        ? new Response("try again", { status: 503 })
        : new Response("ok", { status: 200 });
    });
    const res = await withHttpRetry(fn);
    expect(res.status).toBe(200);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(delays.length).toBe(1);
  });

  it("honors Retry-After over computed backoff", async () => {
    const delays = stubSleep();
    let call = 0;
    const fn = mock(async () => {
      call++;
      if (call === 1) {
        return new Response("rate limit", { status: 429, headers: { "Retry-After": "2" } });
      }
      return new Response("ok", { status: 200 });
    });
    await withHttpRetry(fn);
    expect(delays[0]).toBe(2000);
  });

  it("stops retrying on non-retryable statuses", async () => {
    const fn = mock(async () => new Response("bad", { status: 400 }));
    const res = await withHttpRetry(fn);
    expect(res.status).toBe(400);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("returns the last response after exhausting retries", async () => {
    const delays = stubSleep();
    const fn = mock(async () => new Response("still bad", { status: 503 }));
    const res = await withHttpRetry(fn, { maxRetries: 2 });
    expect(res.status).toBe(503);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(delays.length).toBe(2);
  });

  it("throws after retrying a network exception", async () => {
    stubSleep();
    const fn = mock(async () => { throw new Error("network dead"); });
    await expect(withHttpRetry(fn, { maxRetries: 2 })).rejects.toThrow("network dead");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("calls onRetry with the right metadata", async () => {
    stubSleep();
    const seen: Array<{ status: number; attempt: number }> = [];
    let call = 0;
    const fn = mock(async () => {
      call++;
      return call === 1
        ? new Response("busy", { status: 503 })
        : new Response("ok", { status: 200 });
    });
    await withHttpRetry(fn, {
      onRetry: (n) => seen.push({ status: n.status, attempt: n.attempt }),
    });
    expect(seen).toEqual([{ status: 503, attempt: 0 }]);
  });
});
