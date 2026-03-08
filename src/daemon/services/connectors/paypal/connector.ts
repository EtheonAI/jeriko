/**
 * PayPal connector — orders, payments, subscriptions, and webhook handling.
 *
 * Extends BearerConnector for unified OAuth2 Bearer token lifecycle.
 * Token obtained via relay OAuth flow (PAYPAL_ACCESS_TOKEN).
 * Sandbox mode controlled by PAYPAL_SANDBOX or PAYPAL_MODE env vars.
 */

import type { ConnectorResult, WebhookEvent } from "../interface.js";
import { BearerConnector, type BearerAuthConfig } from "../base.js";

export class PayPalConnector extends BearerConnector {
  readonly name = "paypal";
  readonly version = "1.0.0";

  protected readonly auth: BearerAuthConfig = {
    baseUrl: "https://api-m.paypal.com",
    tokenVar: "PAYPAL_ACCESS_TOKEN",
    refreshTokenVar: "PAYPAL_REFRESH_TOKEN",
    clientIdVar: "PAYPAL_OAUTH_CLIENT_ID",
    clientSecretVar: "PAYPAL_OAUTH_CLIENT_SECRET",
    tokenUrl: "https://api-m.paypal.com/v1/oauth2/token",
    healthPath: "/v1/notifications/webhooks-event-types",
    label: "PayPal",
  };

  private webhookId = "";
  private _sandboxBaseUrl = "";

  // ---------------------------------------------------------------------------
  // Lifecycle — sandbox override + webhook config
  // ---------------------------------------------------------------------------

  override async init(): Promise<void> {
    await super.init();
    this.webhookId = process.env.PAYPAL_WEBHOOK_ID ?? "";

    if (process.env.PAYPAL_SANDBOX === "true" || process.env.PAYPAL_MODE === "sandbox") {
      this._sandboxBaseUrl = "https://api-m.sandbox.paypal.com";
    }
  }

  /** Override base URL when sandbox mode is active. */
  protected override get baseUrl(): string {
    return this._sandboxBaseUrl || this.auth.baseUrl;
  }

  // ---------------------------------------------------------------------------
  // Aliases
  // ---------------------------------------------------------------------------

  protected override aliases(): Record<string, string> {
    return {
      orders: "orders.list",
      subscriptions: "subscriptions.list",
      plans: "plans.list",
      products: "products.list",
      invoices: "invoices.list",
      disputes: "disputes.list",
      webhooks: "webhooks.list",
    };
  }

  // ---------------------------------------------------------------------------
  // API method dispatch
  // ---------------------------------------------------------------------------

  protected handlers() {
    return {
      // Orders
      "orders.list": () =>
        Promise.resolve({
          ok: false,
          error:
            "PayPal does not support listing orders. Use orders.get with a specific --id.",
        } as ConnectorResult),
      "orders.create": (p: Record<string, unknown>) =>
        this.post("/v2/checkout/orders", {
          intent: p.intent ?? "CAPTURE",
          purchase_units: p.purchase_units,
        }),
      "orders.get": (p: Record<string, unknown>) =>
        this.get(`/v2/checkout/orders/${p.id}`),
      "orders.capture": (p: Record<string, unknown>) =>
        this.post(`/v2/checkout/orders/${p.id}/capture`, {}),

      // Payments
      "payments.get": (p: Record<string, unknown>) =>
        this.get(`/v2/payments/captures/${p.id}`),
      "payments.refund": (p: Record<string, unknown>) =>
        this.post(`/v2/payments/captures/${p.id}/refund`, {
          amount: p.amount,
          note_to_payer: p.note,
        }),

      // Subscriptions
      "subscriptions.create": (p: Record<string, unknown>) =>
        this.post("/v1/billing/subscriptions", {
          plan_id: p.plan_id,
          subscriber: p.subscriber,
        }),
      "subscriptions.list": (p: Record<string, unknown>) =>
        this.get(
          `/v1/billing/subscriptions?plan_id=${p.plan_id ?? ""}&status=${p.status ?? "ACTIVE"}`,
        ),
      "subscriptions.get": (p: Record<string, unknown>) =>
        this.get(`/v1/billing/subscriptions/${p.id}`),
      "subscriptions.cancel": (p: Record<string, unknown>) =>
        this.post(`/v1/billing/subscriptions/${p.id}/cancel`, {
          reason: p.reason ?? "Cancelled by user",
        }),
      "subscriptions.suspend": (p: Record<string, unknown>) =>
        this.post(`/v1/billing/subscriptions/${p.id}/suspend`, {
          reason: p.reason ?? "Suspended",
        }),
      "subscriptions.activate": (p: Record<string, unknown>) =>
        this.post(`/v1/billing/subscriptions/${p.id}/activate`, {
          reason: p.reason ?? "Reactivated",
        }),

      // Plans
      "plans.create": (p: Record<string, unknown>) =>
        this.post("/v1/billing/plans", p),
      "plans.list": (p: Record<string, unknown>) =>
        this.get(`/v1/billing/plans?page_size=${p.limit ?? 10}`),
      "plans.get": (p: Record<string, unknown>) =>
        this.get(`/v1/billing/plans/${p.id}`),

      // Products
      "products.create": (p: Record<string, unknown>) =>
        this.post("/v1/catalogs/products", p),
      "products.list": (p: Record<string, unknown>) =>
        this.get(`/v1/catalogs/products?page_size=${p.limit ?? 10}`),
      "products.get": (p: Record<string, unknown>) =>
        this.get(`/v1/catalogs/products/${p.id}`),

      // Invoices
      "invoices.create": (p: Record<string, unknown>) =>
        this.post("/v2/invoicing/invoices", p),
      "invoices.list": (p: Record<string, unknown>) =>
        this.get(`/v2/invoicing/invoices?page_size=${p.limit ?? 10}`),
      "invoices.get": (p: Record<string, unknown>) =>
        this.get(`/v2/invoicing/invoices/${p.id}`),
      "invoices.send": (p: Record<string, unknown>) =>
        this.post(`/v2/invoicing/invoices/${p.id}/send`, {}),
      "invoices.cancel": (p: Record<string, unknown>) =>
        this.post(`/v2/invoicing/invoices/${p.id}/cancel`, {}),
      "invoices.remind": (p: Record<string, unknown>) =>
        this.post(`/v2/invoicing/invoices/${p.id}/remind`, {}),

      // Payouts
      "payouts.create": (p: Record<string, unknown>) =>
        this.post("/v1/payments/payouts", {
          sender_batch_header: p.sender_batch_header,
          items: p.items,
        }),
      "payouts.get": (p: Record<string, unknown>) =>
        this.get(`/v1/payments/payouts/${p.id}`),

      // Disputes
      "disputes.list": (p: Record<string, unknown>) =>
        this.get(`/v1/customer/disputes?status=${p.status ?? ""}`),
      "disputes.get": (p: Record<string, unknown>) =>
        this.get(`/v1/customer/disputes/${p.id}`),

      // Webhooks
      "webhooks.list": () => this.get("/v1/notifications/webhooks"),
      "webhooks.create": (p: Record<string, unknown>) =>
        this.post("/v1/notifications/webhooks", p),
      "webhooks.delete": (p: Record<string, unknown>) =>
        this.del(`/v1/notifications/webhooks/${p.id}`),
    };
  }

  // ---------------------------------------------------------------------------
  // Webhooks — PayPal uses webhook ID verification via API call
  // ---------------------------------------------------------------------------

  override async webhook(
    headers: Record<string, string>,
    body: string,
  ): Promise<WebhookEvent> {
    let parsed: { id?: string; event_type?: string; resource?: unknown };
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new Error("Invalid JSON in PayPal webhook body");
    }

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
      const res = await fetch(
        `${this.baseUrl}/v1/notifications/verify-webhook-signature`,
        {
          method: "POST",
          headers: {
            Authorization: await this.buildAuthHeader(),
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
        },
      );

      if (!res.ok) return false;
      const data = (await res.json()) as { verification_status?: string };
      return data.verification_status === "SUCCESS";
    } catch {
      return false;
    }
  }
}
