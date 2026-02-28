/**
 * Stripe connector — charges, subscriptions, customers, and webhook handling.
 */

import type {
  ConnectorInterface,
  ConnectorResult,
  HealthResult,
  WebhookEvent,
} from "../interface.js";
import { withRetry, withTimeout } from "../middleware.js";
import { verifyStripeSignature } from "./webhook.js";

const STRIPE_API = "https://api.stripe.com/v1";

const ALIASES: Record<string, string> = {
  "balance": "balance.retrieve",
  "charges": "charges.list",
  "customers": "customers.list",
  "subscriptions": "subscriptions.list",
  "invoices": "invoices.list",
  "products": "products.list",
  "prices": "prices.list",
  "events": "events.list",
  "webhooks": "webhooks.list",
  "payouts": "payouts.list",
  "refunds": "refunds.list",
};

export class StripeConnector implements ConnectorInterface {
  readonly name = "stripe";
  readonly version = "1.0.0";

  private apiKey = "";
  private webhookSecret = "";

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async init(): Promise<void> {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY env var is required");
    }
    this.apiKey = key;
    this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  }

  async health(): Promise<HealthResult> {
    const start = Date.now();
    try {
      const res = await withTimeout(
        () =>
          fetch(`${STRIPE_API}/balance`, {
            headers: { Authorization: `Bearer ${this.apiKey}` },
          }),
        5000,
      );
      const latency = Date.now() - start;
      if (!res.ok) {
        const body = await res.text();
        return { healthy: false, latency_ms: latency, error: `HTTP ${res.status}: ${body}` };
      }
      return { healthy: true, latency_ms: latency };
    } catch (err) {
      return {
        healthy: false,
        latency_ms: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ---------------------------------------------------------------------------
  // API calls
  // ---------------------------------------------------------------------------

  async call(method: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    const resolved = ALIASES[method] ?? method;

    const handlers: Record<string, (p: Record<string, unknown>) => Promise<ConnectorResult>> = {
      // Charges
      "charges.create": (p) => this.post("/charges", p),
      "charges.retrieve": (p) => this.get(`/charges/${p.id}`),
      "charges.list": (p) => this.get("/charges", p),

      // Customers
      "customers.create": (p) => this.post("/customers", p),
      "customers.retrieve": (p) => this.get(`/customers/${p.id}`),
      "customers.list": (p) => this.get("/customers", p),

      // Subscriptions
      "subscriptions.create": (p) => this.post("/subscriptions", p),
      "subscriptions.retrieve": (p) => this.get(`/subscriptions/${p.id}`),
      "subscriptions.cancel": (p) => this.del(`/subscriptions/${p.id}`),
      "subscriptions.list": (p) => this.get("/subscriptions", p),

      // Payment Intents
      "payment_intents.create": (p) => this.post("/payment_intents", p),
      "payment_intents.retrieve": (p) => this.get(`/payment_intents/${p.id}`),
      "payment_intents.confirm": (p) => this.post(`/payment_intents/${p.id}/confirm`, p),

      // Invoices
      "invoices.create": (p) => this.post("/invoices", p),
      "invoices.retrieve": (p) => this.get(`/invoices/${p.id}`),
      "invoices.list": (p) => this.get("/invoices", p),
      "invoices.finalize": (p) => this.post(`/invoices/${p.id}/finalize`, {}),
      "invoices.send": (p) => this.post(`/invoices/${p.id}/send`, {}),
      "invoices.void": (p) => this.post(`/invoices/${p.id}/void`, {}),

      // Refunds
      "refunds.create": (p) => this.post("/refunds", p),
      "refunds.list": (p) => this.get("/refunds", p),
      "refunds.get": (p) => this.get(`/refunds/${p.id}`),

      // Balance
      "balance.retrieve": () => this.get("/balance"),

      // Products
      "products.create": (p) => this.post("/products", p),
      "products.list": (p) => this.get("/products", p),
      "products.get": (p) => this.get(`/products/${p.id}`),
      "products.update": (p) => this.post(`/products/${p.id}`, p),
      "products.delete": (p) => this.del(`/products/${p.id}`),

      // Prices
      "prices.create": (p) => this.post("/prices", p),
      "prices.list": (p) => this.get("/prices", p),
      "prices.get": (p) => this.get(`/prices/${p.id}`),

      // Payouts
      "payouts.create": (p) => this.post("/payouts", p),
      "payouts.list": (p) => this.get("/payouts", p),
      "payouts.get": (p) => this.get(`/payouts/${p.id}`),

      // Events
      "events.list": (p) => this.get("/events", p),
      "events.get": (p) => this.get(`/events/${p.id}`),

      // Webhooks
      "webhooks.list": () => this.get("/webhook_endpoints"),
      "webhooks.create": (p) => this.post("/webhook_endpoints", p),
      "webhooks.delete": (p) => this.del(`/webhook_endpoints/${p.id}`),

      // Checkout Sessions
      "checkout.create": (p) => this.post("/checkout/sessions", p),
      "checkout.list": (p) => this.get("/checkout/sessions", p),
      "checkout.get": (p) => this.get(`/checkout/sessions/${p.id}`),

      // Payment Links
      "payment_links.create": (p) => this.post("/payment_links", p),
      "payment_links.list": (p) => this.get("/payment_links", p),
      "payment_links.get": (p) => this.get(`/payment_links/${p.id}`),
    };

    const handler = handlers[resolved];
    if (!handler) {
      return { ok: false, error: `Unknown Stripe method: ${method}` };
    }

    return withRetry(() => handler(params), 2, 500);
  }

  // ---------------------------------------------------------------------------
  // Webhooks
  // ---------------------------------------------------------------------------

  async webhook(headers: Record<string, string>, body: string): Promise<WebhookEvent> {
    const signature = headers["stripe-signature"] ?? "";
    const verified = verifyStripeSignature(body, signature, this.webhookSecret);

    let parsed: { id?: string; type?: string; data?: unknown };
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new Error("Invalid JSON in Stripe webhook body");
    }

    return {
      id: parsed.id ?? crypto.randomUUID(),
      source: this.name,
      type: parsed.type ?? "unknown",
      data: parsed.data ?? parsed,
      verified,
      received_at: new Date().toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Shutdown
  // ---------------------------------------------------------------------------

  async shutdown(): Promise<void> {
    // Stripe is stateless HTTP — nothing to tear down.
  }

  // ---------------------------------------------------------------------------
  // HTTP helpers
  // ---------------------------------------------------------------------------

  private async get(path: string, params?: Record<string, unknown>): Promise<ConnectorResult> {
    let url = `${STRIPE_API}${path}`;
    if (params && Object.keys(params).length > 0) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && k !== "id") qs.set(k, String(v));
      }
      const str = qs.toString();
      if (str) url += `?${str}`;
    }

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    return this.toResult(res);
  }

  private async post(path: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && k !== "id") body.set(k, String(v));
    }

    const res = await fetch(`${STRIPE_API}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    return this.toResult(res);
  }

  private async del(path: string): Promise<ConnectorResult> {
    const res = await fetch(`${STRIPE_API}${path}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    return this.toResult(res);
  }

  private async toResult(res: Response): Promise<ConnectorResult> {
    const data = await res.json();
    const rateLimit = this.parseRateLimit(res.headers);
    if (!res.ok) {
      const msg = (data as any)?.error?.message ?? `HTTP ${res.status}`;
      return { ok: false, error: msg, rate_limit: rateLimit };
    }
    return { ok: true, data, rate_limit: rateLimit };
  }

  private parseRateLimit(headers: Headers): { remaining: number; reset_at: string } | undefined {
    // Stripe doesn't expose standard rate-limit headers for most endpoints,
    // but when they do we capture them.
    const remaining = headers.get("x-ratelimit-remaining");
    const reset = headers.get("x-ratelimit-reset");
    if (remaining !== null && reset !== null) {
      return {
        remaining: parseInt(remaining, 10),
        reset_at: new Date(parseInt(reset, 10) * 1000).toISOString(),
      };
    }
    return undefined;
  }
}
