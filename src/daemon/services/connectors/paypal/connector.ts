/**
 * PayPal connector — orders, payments, subscriptions, and webhook handling.
 *
 * Uses PayPal REST API v2. Authenticates via OAuth2 client credentials.
 */

import type {
  ConnectorInterface,
  ConnectorResult,
  HealthResult,
  WebhookEvent,
} from "../interface.js";
import { withRetry, withTimeout, refreshToken } from "../middleware.js";

export class PayPalConnector implements ConnectorInterface {
  readonly name = "paypal";
  readonly version = "1.0.0";

  private clientId = "";
  private clientSecret = "";
  private webhookId = "";
  private baseUrl = "https://api-m.paypal.com";
  private accessToken = "";

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async init(): Promise<void> {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET env vars are required");
    }
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.webhookId = process.env.PAYPAL_WEBHOOK_ID ?? "";

    // Use sandbox if PAYPAL_SANDBOX=true
    if (process.env.PAYPAL_SANDBOX === "true") {
      this.baseUrl = "https://api-m.sandbox.paypal.com";
    }

    // Obtain initial access token.
    await this.authenticate();
  }

  async health(): Promise<HealthResult> {
    const start = Date.now();
    try {
      const token = await this.getToken();
      const res = await withTimeout(
        () =>
          fetch(`${this.baseUrl}/v1/notifications/webhooks-event-types`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        5000,
      );
      const latency = Date.now() - start;
      if (!res.ok) {
        return { healthy: false, latency_ms: latency, error: `HTTP ${res.status}` };
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
    // Resolve bare-resource aliases to their .list variant
    const aliases: Record<string, string> = {
      orders: "orders.list",
      subscriptions: "subscriptions.list",
      plans: "plans.list",
      products: "products.list",
      invoices: "invoices.list",
      disputes: "disputes.list",
      webhooks: "webhooks.list",
    };
    const resolved = aliases[method] ?? method;

    const handlers: Record<string, (p: Record<string, unknown>) => Promise<ConnectorResult>> = {
      // Orders
      "orders.list": () =>
        Promise.resolve({ ok: false, error: "PayPal does not support listing orders. Use orders.get with a specific --id." }),
      "orders.create": (p) =>
        this.post("/v2/checkout/orders", {
          intent: p.intent ?? "CAPTURE",
          purchase_units: p.purchase_units,
        }),
      "orders.get": (p) => this.get(`/v2/checkout/orders/${p.id}`),
      "orders.capture": (p) => this.post(`/v2/checkout/orders/${p.id}/capture`, {}),

      // Payments
      "payments.get": (p) => this.get(`/v2/payments/captures/${p.id}`),
      "payments.refund": (p) =>
        this.post(`/v2/payments/captures/${p.id}/refund`, {
          amount: p.amount,
          note_to_payer: p.note,
        }),

      // Subscriptions
      "subscriptions.create": (p) =>
        this.post("/v1/billing/subscriptions", {
          plan_id: p.plan_id,
          subscriber: p.subscriber,
        }),
      "subscriptions.list": (p) =>
        this.get(`/v1/billing/subscriptions?plan_id=${p.plan_id ?? ""}&status=${p.status ?? "ACTIVE"}`),
      "subscriptions.get": (p) => this.get(`/v1/billing/subscriptions/${p.id}`),
      "subscriptions.cancel": (p) =>
        this.post(`/v1/billing/subscriptions/${p.id}/cancel`, {
          reason: p.reason ?? "Cancelled by user",
        }),
      "subscriptions.suspend": (p) =>
        this.post(`/v1/billing/subscriptions/${p.id}/suspend`, {
          reason: p.reason ?? "Suspended",
        }),
      "subscriptions.activate": (p) =>
        this.post(`/v1/billing/subscriptions/${p.id}/activate`, {
          reason: p.reason ?? "Reactivated",
        }),

      // Plans
      "plans.create": (p) => this.post("/v1/billing/plans", p),
      "plans.list": (p) => this.get(`/v1/billing/plans?page_size=${p.limit ?? 10}`),
      "plans.get": (p) => this.get(`/v1/billing/plans/${p.id}`),

      // Products
      "products.create": (p) => this.post("/v1/catalogs/products", p),
      "products.list": (p) => this.get(`/v1/catalogs/products?page_size=${p.limit ?? 10}`),
      "products.get": (p) => this.get(`/v1/catalogs/products/${p.id}`),

      // Invoices
      "invoices.create": (p) => this.post("/v2/invoicing/invoices", p),
      "invoices.list": (p) => this.get(`/v2/invoicing/invoices?page_size=${p.limit ?? 10}`),
      "invoices.get": (p) => this.get(`/v2/invoicing/invoices/${p.id}`),
      "invoices.send": (p) => this.post(`/v2/invoicing/invoices/${p.id}/send`, {}),
      "invoices.cancel": (p) => this.post(`/v2/invoicing/invoices/${p.id}/cancel`, {}),
      "invoices.remind": (p) => this.post(`/v2/invoicing/invoices/${p.id}/remind`, {}),

      // Payouts
      "payouts.create": (p) =>
        this.post("/v1/payments/payouts", {
          sender_batch_header: p.sender_batch_header,
          items: p.items,
        }),
      "payouts.get": (p) => this.get(`/v1/payments/payouts/${p.id}`),

      // Disputes
      "disputes.list": (p) => this.get(`/v1/customer/disputes?status=${p.status ?? ""}`),
      "disputes.get": (p) => this.get(`/v1/customer/disputes/${p.id}`),

      // Webhooks
      "webhooks.list": () => this.get("/v1/notifications/webhooks"),
      "webhooks.create": (p) => this.post("/v1/notifications/webhooks", p),
      "webhooks.delete": (p) => this.del(`/v1/notifications/webhooks/${p.id}`),
    };

    const handler = handlers[resolved];
    if (!handler) {
      return { ok: false, error: `Unknown PayPal method: ${method}` };
    }

    return withRetry(() => handler(params), 2, 500);
  }

  // ---------------------------------------------------------------------------
  // Webhooks — PayPal uses webhook ID verification via API call
  // ---------------------------------------------------------------------------

  async webhook(headers: Record<string, string>, body: string): Promise<WebhookEvent> {
    let parsed: { id?: string; event_type?: string; resource?: unknown };
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new Error("Invalid JSON in PayPal webhook body");
    }

    // PayPal webhook verification requires calling their verify endpoint.
    let verified = false;
    if (this.webhookId) {
      verified = await this.verifyWebhook(headers, body);
    }

    return {
      id: parsed.id ?? crypto.randomUUID(),
      source: this.name,
      type: parsed.event_type ?? "unknown",
      data: parsed.resource ?? parsed,
      verified,
      received_at: new Date().toISOString(),
    };
  }

  private async verifyWebhook(
    headers: Record<string, string>,
    body: string,
  ): Promise<boolean> {
    try {
      const token = await this.getToken();
      const res = await fetch(`${this.baseUrl}/v1/notifications/verify-webhook-signature`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          auth_algo: headers["paypal-auth-algo"] ?? "",
          cert_url: headers["paypal-cert-url"] ?? "",
          transmission_id: headers["paypal-transmission-id"] ?? "",
          transmission_sig: headers["paypal-transmission-sig"] ?? "",
          transmission_time: headers["paypal-transmission-time"] ?? "",
          webhook_id: this.webhookId,
          webhook_event: JSON.parse(body),
        }),
      });

      if (!res.ok) return false;
      const data = (await res.json()) as { verification_status?: string };
      return data.verification_status === "SUCCESS";
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Shutdown
  // ---------------------------------------------------------------------------

  async shutdown(): Promise<void> {
    this.accessToken = "";
  }

  // ---------------------------------------------------------------------------
  // OAuth2 helpers
  // ---------------------------------------------------------------------------

  private async authenticate(): Promise<string> {
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const res = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    if (!res.ok) {
      throw new Error(`PayPal OAuth2 failed: HTTP ${res.status}`);
    }

    const data = (await res.json()) as { access_token: string };
    this.accessToken = data.access_token;
    return this.accessToken;
  }

  private async getToken(): Promise<string> {
    if (this.accessToken) return this.accessToken;
    return refreshToken(this.name, () => this.authenticate());
  }

  // ---------------------------------------------------------------------------
  // HTTP helpers
  // ---------------------------------------------------------------------------

  private async get(path: string): Promise<ConnectorResult> {
    const token = await this.getToken();
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    return this.toResult(res);
  }

  private async post(path: string, body: Record<string, unknown>): Promise<ConnectorResult> {
    const token = await this.getToken();
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return this.toResult(res);
  }

  private async del(path: string): Promise<ConnectorResult> {
    const token = await this.getToken();
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 204) return { ok: true };
    return this.toResult(res);
  }

  private async toResult(res: Response): Promise<ConnectorResult> {
    let data: unknown;
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    if (!res.ok) {
      const msg = (data as any)?.message ?? (data as any)?.error_description ?? `HTTP ${res.status}`;
      return { ok: false, error: msg };
    }
    return { ok: true, data };
  }
}
