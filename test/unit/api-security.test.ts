import { describe, expect, it, beforeEach } from "bun:test";
import { Hono } from "hono";

import { safeCompare } from "../../src/daemon/api/middleware/auth.js";
import {
  rateLimitMiddleware,
  resetRateLimits,
} from "../../src/daemon/api/middleware/rate-limit.js";

// ---------------------------------------------------------------------------
// safeCompare (Fix 1)
// ---------------------------------------------------------------------------

describe("safeCompare", () => {
  it("returns true for matching strings", () => {
    expect(safeCompare("my-secret-token", "my-secret-token")).toBe(true);
  });

  it("returns false for non-matching strings of same length", () => {
    expect(safeCompare("my-secret-token", "xx-secret-token")).toBe(false);
  });

  it("returns false for different-length strings (exercises dummy branch)", () => {
    expect(safeCompare("short", "a-much-longer-string")).toBe(false);
    expect(safeCompare("a-much-longer-string", "short")).toBe(false);
  });

  it("returns true for empty strings", () => {
    expect(safeCompare("", "")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rate limiter — bounded buckets + proxy trust (Fixes 2 + 4)
// ---------------------------------------------------------------------------

describe("rateLimitMiddleware", () => {
  beforeEach(() => {
    resetRateLimits();
  });

  // Helper: create a Hono test app with rate limiting
  function createApp(opts: Parameters<typeof rateLimitMiddleware>[0] = {}) {
    const app = new Hono();
    app.use("*", rateLimitMiddleware(opts));
    app.get("/", (c) => c.json({ ok: true }));
    return app;
  }

  function req(app: Hono, headers: Record<string, string> = {}) {
    return app.request("/", { headers });
  }

  it("caps buckets at maxBuckets — evicts oldest", async () => {
    const app = createApp({ maxBuckets: 3, trustProxy: true, maxRequests: 100 });

    // Create 3 buckets with different IPs
    await req(app, { "x-forwarded-for": "1.1.1.1" });
    await req(app, { "x-forwarded-for": "2.2.2.2" });
    await req(app, { "x-forwarded-for": "3.3.3.3" });

    // 4th IP should evict the oldest (1.1.1.1)
    await req(app, { "x-forwarded-for": "4.4.4.4" });

    // 1.1.1.1 was evicted — request gets a fresh bucket (full tokens)
    const res = await req(app, { "x-forwarded-for": "1.1.1.1" });
    expect(res.status).toBe(200);
    // remaining should be maxRequests - 1 = 99 (fresh bucket)
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("99");
  });

  it("LRU updates position on access — active bucket not evicted", async () => {
    const app = createApp({ maxBuckets: 3, trustProxy: true, maxRequests: 100 });

    // Create 3 buckets
    await req(app, { "x-forwarded-for": "1.1.1.1" });
    await req(app, { "x-forwarded-for": "2.2.2.2" });
    await req(app, { "x-forwarded-for": "3.3.3.3" });

    // Access 1.1.1.1 again to update its LRU position
    await req(app, { "x-forwarded-for": "1.1.1.1" });

    // Now 2.2.2.2 is the oldest — adding 4.4.4.4 should evict 2.2.2.2
    await req(app, { "x-forwarded-for": "4.4.4.4" });

    // 1.1.1.1 should still have its depleted tokens (was not evicted)
    const res = await req(app, { "x-forwarded-for": "1.1.1.1" });
    expect(res.status).toBe(200);
    // 1.1.1.1 has been accessed 3 times now → remaining = 100 - 3 = 97
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("97");

    // 2.2.2.2 was evicted — gets fresh bucket
    const res2 = await req(app, { "x-forwarded-for": "2.2.2.2" });
    expect(res2.status).toBe(200);
    expect(res2.headers.get("X-RateLimit-Remaining")).toBe("99");
  });

  it("trustProxy: false → all requests use same IP key", async () => {
    const app = createApp({ trustProxy: false, maxRequests: 100 });

    // Even with X-Forwarded-For, all requests share the same bucket
    await req(app, { "x-forwarded-for": "1.1.1.1" });
    await req(app, { "x-forwarded-for": "2.2.2.2" });

    const res = await req(app, { "x-forwarded-for": "3.3.3.3" });
    expect(res.status).toBe(200);
    // All 3 requests consumed from same bucket → remaining = 100 - 3 = 97
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("97");
  });

  it("trustProxy: true → reads X-Forwarded-For header", async () => {
    const app = createApp({ trustProxy: true, maxRequests: 100 });

    // Each IP gets its own bucket
    const res1 = await req(app, { "x-forwarded-for": "1.1.1.1" });
    const res2 = await req(app, { "x-forwarded-for": "2.2.2.2" });

    expect(res1.headers.get("X-RateLimit-Remaining")).toBe("99");
    expect(res2.headers.get("X-RateLimit-Remaining")).toBe("99");
  });

  it("resetRateLimits clears all buckets", async () => {
    const app = createApp({ maxRequests: 100 });

    // Consume a token
    await req(app);
    const res1 = await req(app);
    expect(res1.headers.get("X-RateLimit-Remaining")).toBe("98");

    // Reset
    resetRateLimits();

    // Fresh bucket
    const res2 = await req(app);
    expect(res2.headers.get("X-RateLimit-Remaining")).toBe("99");
  });
});

// ---------------------------------------------------------------------------
// Health endpoint (Fix 3)
// ---------------------------------------------------------------------------

describe("health endpoint", () => {
  it("does not include pid in response", async () => {
    // Import the health routes and create a test app
    const { healthRoutes } = await import(
      "../../src/daemon/api/routes/health.js"
    );
    const app = new Hono();
    app.route("/health", healthRoutes());

    const res = await app.request("/health");
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.data.pid).toBeUndefined();
    expect(body.data.status).toBe("healthy");
    expect(body.data.version).toBeDefined();
    expect(body.data.uptime_seconds).toBeDefined();
    expect(body.data.memory).toBeDefined();
    expect(body.data.timestamp).toBeDefined();
  });
});
