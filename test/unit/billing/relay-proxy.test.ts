// Relay proxy tests — checkout and portal session creation via relay server.
//
// Tests the relay-proxy.ts module which proxies Stripe API calls through
// the relay server for distributed users who don't have Stripe keys locally.

import { describe, expect, it, beforeEach, afterEach, mock, spyOn } from "bun:test";

// ---------------------------------------------------------------------------
// Env setup — save and restore between tests
// ---------------------------------------------------------------------------

const ENV_KEYS = [
  "JERIKO_USER_ID",
  "JERIKO_PUBLIC_URL",
  "RELAY_AUTH_SECRET",
  "NODE_AUTH_SECRET",
  "JERIKO_RELAY_URL",
] as const;

type SavedEnv = Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;

describe("billing/relay-proxy", () => {
  let savedEnv: SavedEnv;

  beforeEach(() => {
    savedEnv = {};
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
    }
    // Set up default relay context for most tests
    process.env.JERIKO_USER_ID = "abcdef0123456789abcdef0123456789";
    process.env.RELAY_AUTH_SECRET = "test-relay-secret";
    delete process.env.JERIKO_PUBLIC_URL;
    delete process.env.JERIKO_RELAY_URL;
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key]!;
      } else {
        delete process.env[key];
      }
    }
    mock.restore();
  });

  // ── Context resolution ─────────────────────────────────────────

  describe("createCheckoutViaRelay", () => {
    it("returns null when no userId is set", async () => {
      delete process.env.JERIKO_USER_ID;

      const { createCheckoutViaRelay } = await import(
        "../../../src/daemon/billing/relay-proxy.js"
      );
      const result = await createCheckoutViaRelay("test@example.com", true);
      expect(result).toBeNull();
    });

    it("returns null when self-hosted (JERIKO_PUBLIC_URL set)", async () => {
      process.env.JERIKO_PUBLIC_URL = "https://my-tunnel.example.com";

      const { createCheckoutViaRelay } = await import(
        "../../../src/daemon/billing/relay-proxy.js"
      );
      const result = await createCheckoutViaRelay("test@example.com", true);
      expect(result).toBeNull();
    });

    it("returns null when no auth token available", async () => {
      delete process.env.RELAY_AUTH_SECRET;
      delete process.env.NODE_AUTH_SECRET;

      const { createCheckoutViaRelay } = await import(
        "../../../src/daemon/billing/relay-proxy.js"
      );
      const result = await createCheckoutViaRelay("test@example.com", true);
      expect(result).toBeNull();
    });

    it("uses RELAY_AUTH_SECRET env var for authentication", async () => {
      process.env.RELAY_AUTH_SECRET = "test-explicit-secret";

      let capturedHeaders: Record<string, string> = {};
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
        const headers = init?.headers as Record<string, string> | undefined;
        capturedHeaders = headers ?? {};
        return new Response(
          JSON.stringify({ ok: true, data: { url: "https://checkout.stripe.com/test", sessionId: "cs_test" } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      };

      try {
        const { createCheckoutViaRelay } = await import(
          "../../../src/daemon/billing/relay-proxy.js"
        );
        await createCheckoutViaRelay("test@example.com", true);
        expect(capturedHeaders["Authorization"]).toBe("Bearer test-explicit-secret");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("returns checkout result on success", async () => {
      const mockResponse = {
        ok: true,
        data: { url: "https://checkout.stripe.com/c/pay_test", sessionId: "cs_test_123" },
      };

      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => {
        return new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      };

      try {
        const { createCheckoutViaRelay } = await import(
          "../../../src/daemon/billing/relay-proxy.js"
        );
        const result = await createCheckoutViaRelay("test@example.com", true);
        expect(result).not.toBeNull();
        expect(result!.url).toBe("https://checkout.stripe.com/c/pay_test");
        expect(result!.sessionId).toBe("cs_test_123");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("returns null on HTTP error", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => {
        return new Response(
          JSON.stringify({ ok: false, error: "Stripe billing not configured on relay" }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        );
      };

      try {
        const { createCheckoutViaRelay } = await import(
          "../../../src/daemon/billing/relay-proxy.js"
        );
        const result = await createCheckoutViaRelay("test@example.com", false);
        expect(result).toBeNull();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("returns null on network error", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => {
        throw new Error("Network unreachable");
      };

      try {
        const { createCheckoutViaRelay } = await import(
          "../../../src/daemon/billing/relay-proxy.js"
        );
        const result = await createCheckoutViaRelay("test@example.com", false);
        expect(result).toBeNull();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("sends correct request body", async () => {
      let capturedBody: Record<string, unknown> = {};
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string);
        return new Response(
          JSON.stringify({ ok: true, data: { url: "https://checkout.stripe.com/test", sessionId: "cs_test" } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      };

      try {
        const { createCheckoutViaRelay } = await import(
          "../../../src/daemon/billing/relay-proxy.js"
        );
        await createCheckoutViaRelay("user@example.com", {
          clientIp: "203.0.113.42",
          userAgent: "Jeriko/2.0",
        });

        expect(capturedBody.userId).toBe("abcdef0123456789abcdef0123456789");
        expect(capturedBody.email).toBe("user@example.com");
        expect(capturedBody.clientIp).toBe("203.0.113.42");
        expect(capturedBody.userAgent).toBe("Jeriko/2.0");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("uses custom relay URL when JERIKO_RELAY_URL is set", async () => {
      process.env.JERIKO_RELAY_URL = "ws://localhost:8080/relay";

      let capturedUrl = "";
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (input: RequestInfo | URL, _init?: RequestInit) => {
        capturedUrl = input.toString();
        return new Response(
          JSON.stringify({ ok: true, data: { url: "https://checkout.stripe.com/test", sessionId: "cs_test" } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      };

      try {
        const { createCheckoutViaRelay } = await import(
          "../../../src/daemon/billing/relay-proxy.js"
        );
        await createCheckoutViaRelay("test@example.com", false);

        // ws://localhost:8080/relay → http://localhost:8080 + /billing/checkout
        expect(capturedUrl).toContain("http://localhost:8080/billing/checkout");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  // ── Portal ─────────────────────────────────────────────────────

  describe("createPortalViaRelay", () => {
    it("returns null when no userId is set", async () => {
      delete process.env.JERIKO_USER_ID;

      const { createPortalViaRelay } = await import(
        "../../../src/daemon/billing/relay-proxy.js"
      );
      const result = await createPortalViaRelay("cus_test_123");
      expect(result).toBeNull();
    });

    it("returns portal result on success", async () => {
      const mockResponse = {
        ok: true,
        data: { url: "https://billing.stripe.com/p/session/portal_test" },
      };

      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => {
        return new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      };

      try {
        const { createPortalViaRelay } = await import(
          "../../../src/daemon/billing/relay-proxy.js"
        );
        const result = await createPortalViaRelay("cus_test_123");
        expect(result).not.toBeNull();
        expect(result!.url).toBe("https://billing.stripe.com/p/session/portal_test");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("returns null on HTTP error", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => {
        return new Response(
          JSON.stringify({ ok: false, error: "Customer not found" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      };

      try {
        const { createPortalViaRelay } = await import(
          "../../../src/daemon/billing/relay-proxy.js"
        );
        const result = await createPortalViaRelay("cus_invalid");
        expect(result).toBeNull();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("sends correct request body with customerId", async () => {
      let capturedBody: Record<string, unknown> = {};
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string);
        return new Response(
          JSON.stringify({ ok: true, data: { url: "https://billing.stripe.com/test" } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      };

      try {
        const { createPortalViaRelay } = await import(
          "../../../src/daemon/billing/relay-proxy.js"
        );
        await createPortalViaRelay("cus_test_456");

        expect(capturedBody.customerId).toBe("cus_test_456");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("returns null on network error", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => {
        throw new Error("Connection refused");
      };

      try {
        const { createPortalViaRelay } = await import(
          "../../../src/daemon/billing/relay-proxy.js"
        );
        const result = await createPortalViaRelay("cus_test_789");
        expect(result).toBeNull();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
