/**
 * Stripe connector — charges, subscriptions, customers, and webhook handling.
 *
 * Extends ConnectorBase for unified lifecycle, dispatch, and HTTP helpers.
 *
 * Supports two auth modes:
 *   1. OAuth (STRIPE_ACCESS_TOKEN) — obtained via relay OAuth flow.
 *      Refreshed automatically using STRIPE_REFRESH_TOKEN + STRIPE_SECRET_KEY.
 *   2. API key (STRIPE_SECRET_KEY) — permanent, for your own Stripe account.
 *
 * Either one is sufficient. OAuth token takes priority when both are present.
 * If the OAuth token expires (401) and refresh credentials are available,
 * the connector refreshes it transparently and retries.
 */

import type { ConnectorResult, WebhookEvent } from "../interface.js";
import { ConnectorBase } from "../base.js";
import { refreshToken } from "../middleware.js";
import { saveSecret } from "../../../../shared/secrets.js";
import { verifyStripeSignature } from "./webhook.js";

export class StripeConnector extends ConnectorBase {
  readonly name = "stripe";
  readonly version = "1.0.0";

  protected readonly baseUrl = "https://api.stripe.com/v1";
  protected readonly healthPath = "/balance";
  protected readonly label = "Stripe";

  /** API secret key (sk_test_... / sk_live_...) — for direct API access or OAuth refresh. */
  private secretKey = "";
  /** OAuth access token — takes priority over secretKey for API calls. */
  private accessToken = "";
  /** OAuth refresh token — used to refresh accessToken when it expires. */
  private refreshTokenValue = "";
  private webhookSecret = "";

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  override async init(): Promise<void> {
    this.secretKey = process.env.STRIPE_SECRET_KEY ?? "";
    this.accessToken = process.env.STRIPE_ACCESS_TOKEN ?? "";
    this.refreshTokenValue = process.env.STRIPE_REFRESH_TOKEN ?? "";
    this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";

    if (!this.secretKey && !this.accessToken) {
      throw new Error("Stripe requires STRIPE_ACCESS_TOKEN (via OAuth) or STRIPE_SECRET_KEY (direct API key)");
    }
  }

  // ---------------------------------------------------------------------------
  // Auth — OAuth token (preferred) or API key (fallback)
  // ---------------------------------------------------------------------------

  protected async buildAuthHeader(): Promise<string> {
    const token = await this.getToken();
    return `Bearer ${token}`;
  }

  private async getToken(): Promise<string> {
    // OAuth token takes priority when available
    if (this.accessToken) return this.accessToken;
    // Fall back to the permanent API secret key
    return this.secretKey;
  }

  /** Whether OAuth refresh credentials are available. */
  private canRefresh(): boolean {
    return !!(this.refreshTokenValue && this.secretKey);
  }

  // ---------------------------------------------------------------------------
  // 401-aware call — detect expired OAuth tokens and refresh
  // ---------------------------------------------------------------------------

  override async call(
    method: string,
    params: Record<string, unknown>,
  ): Promise<ConnectorResult> {
    const result = await super.call(method, params);

    // Only attempt refresh if we're using an OAuth token (not API key)
    if (!result.ok && result.status === 401 && this.accessToken && this.canRefresh()) {
      this.accessToken = "";
      await refreshToken(this.name, () => this.doRefresh());
      return super.call(method, params);
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Token refresh — Stripe uses Basic auth with the secret key
  // ---------------------------------------------------------------------------

  private async doRefresh(): Promise<string> {
    const res = await fetch("https://connect.stripe.com/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(this.secretKey + ":").toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: this.refreshTokenValue,
      }).toString(),
    });

    if (!res.ok) {
      throw new Error(`Stripe token refresh failed: HTTP ${res.status}`);
    }

    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
    };

    this.accessToken = data.access_token;
    saveSecret("STRIPE_ACCESS_TOKEN", data.access_token);

    // Stripe rotates refresh tokens on every exchange
    if (data.refresh_token) {
      this.refreshTokenValue = data.refresh_token;
      saveSecret("STRIPE_REFRESH_TOKEN", data.refresh_token);
    }

    return this.accessToken;
  }

  // ---------------------------------------------------------------------------
  // Rate limiting
  // ---------------------------------------------------------------------------

  protected override parseRateLimit(
    headers: Headers,
  ): { remaining: number; reset_at: string } | undefined {
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

  // ---------------------------------------------------------------------------
  // Aliases — bare resource names resolve to .list
  // ---------------------------------------------------------------------------

  protected override aliases(): Record<string, string> {
    return {
      balance: "balance.retrieve",
      charges: "charges.list",
      customers: "customers.list",
      subscriptions: "subscriptions.list",
      invoices: "invoices.list",
      products: "products.list",
      prices: "prices.list",
      events: "events.list",
      webhooks: "webhooks.list",
      payouts: "payouts.list",
      refunds: "refunds.list",
    };
  }

  // ---------------------------------------------------------------------------
  // API method dispatch
  // ---------------------------------------------------------------------------

  protected handlers() {
    return {
      // Charges
      "charges.create": (p: Record<string, unknown>) => this.postForm("/charges", p),
      "charges.retrieve": (p: Record<string, unknown>) => this.get(`/charges/${p.id}`),
      "charges.list": (p: Record<string, unknown>) => this.get("/charges", p),

      // Customers
      "customers.create": (p: Record<string, unknown>) => this.postForm("/customers", p),
      "customers.retrieve": (p: Record<string, unknown>) => this.get(`/customers/${p.id}`),
      "customers.list": (p: Record<string, unknown>) => this.get("/customers", p),

      // Subscriptions
      "subscriptions.create": (p: Record<string, unknown>) => this.postForm("/subscriptions", p),
      "subscriptions.retrieve": (p: Record<string, unknown>) => this.get(`/subscriptions/${p.id}`),
      "subscriptions.cancel": (p: Record<string, unknown>) => this.del(`/subscriptions/${p.id}`),
      "subscriptions.list": (p: Record<string, unknown>) => this.get("/subscriptions", p),

      // Payment Intents
      "payment_intents.create": (p: Record<string, unknown>) => this.postForm("/payment_intents", p),
      "payment_intents.retrieve": (p: Record<string, unknown>) => this.get(`/payment_intents/${p.id}`),
      "payment_intents.confirm": (p: Record<string, unknown>) =>
        this.postForm(`/payment_intents/${p.id}/confirm`, p),

      // Invoices
      "invoices.create": (p: Record<string, unknown>) => this.postForm("/invoices", p),
      "invoices.retrieve": (p: Record<string, unknown>) => this.get(`/invoices/${p.id}`),
      "invoices.list": (p: Record<string, unknown>) => this.get("/invoices", p),
      "invoices.finalize": (p: Record<string, unknown>) =>
        this.postForm(`/invoices/${p.id}/finalize`, {}),
      "invoices.send": (p: Record<string, unknown>) =>
        this.postForm(`/invoices/${p.id}/send`, {}),
      "invoices.void": (p: Record<string, unknown>) =>
        this.postForm(`/invoices/${p.id}/void`, {}),

      // Refunds
      "refunds.create": (p: Record<string, unknown>) => this.postForm("/refunds", p),
      "refunds.list": (p: Record<string, unknown>) => this.get("/refunds", p),
      "refunds.get": (p: Record<string, unknown>) => this.get(`/refunds/${p.id}`),

      // Balance
      "balance.retrieve": () => this.get("/balance"),

      // Products
      "products.create": (p: Record<string, unknown>) => this.postForm("/products", p),
      "products.list": (p: Record<string, unknown>) => this.get("/products", p),
      "products.get": (p: Record<string, unknown>) => this.get(`/products/${p.id}`),
      "products.update": (p: Record<string, unknown>) => this.postForm(`/products/${p.id}`, p),
      "products.delete": (p: Record<string, unknown>) => this.del(`/products/${p.id}`),

      // Prices
      "prices.create": (p: Record<string, unknown>) => this.postForm("/prices", p),
      "prices.list": (p: Record<string, unknown>) => this.get("/prices", p),
      "prices.get": (p: Record<string, unknown>) => this.get(`/prices/${p.id}`),

      // Payouts
      "payouts.create": (p: Record<string, unknown>) => this.postForm("/payouts", p),
      "payouts.list": (p: Record<string, unknown>) => this.get("/payouts", p),
      "payouts.get": (p: Record<string, unknown>) => this.get(`/payouts/${p.id}`),

      // Events
      "events.list": (p: Record<string, unknown>) => this.get("/events", p),
      "events.get": (p: Record<string, unknown>) => this.get(`/events/${p.id}`),

      // Webhooks
      "webhooks.list": () => this.get("/webhook_endpoints"),
      "webhooks.create": (p: Record<string, unknown>) => this.postForm("/webhook_endpoints", p),
      "webhooks.delete": (p: Record<string, unknown>) => this.del(`/webhook_endpoints/${p.id}`),

      // Checkout Sessions
      "checkout.create": (p: Record<string, unknown>) => this.postForm("/checkout/sessions", p),
      "checkout.list": (p: Record<string, unknown>) => this.get("/checkout/sessions", p),
      "checkout.get": (p: Record<string, unknown>) => this.get(`/checkout/sessions/${p.id}`),

      // Payment Links
      "payment_links.create": (p: Record<string, unknown>) => this.postForm("/payment_links", p),
      "payment_links.list": (p: Record<string, unknown>) => this.get("/payment_links", p),
      "payment_links.get": (p: Record<string, unknown>) => this.get(`/payment_links/${p.id}`),
    };
  }

  // ---------------------------------------------------------------------------
  // Webhooks — Stripe-Signature HMAC-SHA256 verification
  // ---------------------------------------------------------------------------

  override async webhook(headers: Record<string, string>, body: string): Promise<WebhookEvent> {
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
}
