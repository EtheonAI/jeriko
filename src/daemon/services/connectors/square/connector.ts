/**
 * Square connector — payments, orders, customers, inventory, and catalog.
 *
 * Extends BearerConnector for OAuth2 Bearer token auth with refresh.
 */

import { createHmac, timingSafeEqual } from "crypto";
import { BearerConnector } from "../base.js";
import type { WebhookEvent } from "../interface.js";

export class SquareConnector extends BearerConnector {
  readonly name = "square";
  readonly version = "1.0.0";

  private webhookSignatureKey = "";

  private get isSandbox(): boolean {
    return !!process.env.SQUARE_SANDBOX || process.env.SQUARE_ENVIRONMENT === "sandbox";
  }

  private get baseHost(): string {
    return this.isSandbox ? "connect.squareupsandbox.com" : "connect.squareup.com";
  }

  protected readonly auth = {
    baseUrl: "https://connect.squareup.com/v2",
    tokenVar: "SQUARE_ACCESS_TOKEN",
    refreshTokenVar: "SQUARE_REFRESH_TOKEN",
    clientIdVar: "SQUARE_OAUTH_CLIENT_ID",
    clientSecretVar: "SQUARE_OAUTH_CLIENT_SECRET",
    tokenUrl: "https://connect.squareup.com/oauth2/token",
    healthPath: "/merchants/me",
    label: "Square",
  };

  override async init(): Promise<void> {
    await super.init();
    this.webhookSignatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY ?? "";
  }

  protected override buildUrl(path: string): string {
    return `https://${this.baseHost}/v2${path}`;
  }

  // ---------------------------------------------------------------------------
  // Webhook — Square HMAC-SHA256 signature verification
  // ---------------------------------------------------------------------------

  override async webhook(headers: Record<string, string>, body: string): Promise<WebhookEvent> {
    const signature = headers["x-square-hmacsha256-signature"] ?? "";
    const verified = this.verifyWebhookSignature(body, signature, headers["x-square-notification-url"] ?? "");

    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(body); } catch { parsed = {}; }

    return {
      id: (parsed.event_id as string) ?? crypto.randomUUID(),
      source: this.name,
      type: (parsed.type as string) ?? "square.webhook",
      data: parsed,
      verified,
      received_at: new Date().toISOString(),
    };
  }

  private verifyWebhookSignature(body: string, signature: string, notificationUrl: string): boolean {
    if (!this.webhookSignatureKey || !signature) return false;
    const payload = notificationUrl + body;
    const expected = createHmac("sha256", this.webhookSignatureKey).update(payload).digest("base64");
    if (expected.length !== signature.length) return false;
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }

  protected override aliases(): Record<string, string> {
    return {
      payments: "payments.list",
      orders: "orders.search",
      customers: "customers.list",
      catalog: "catalog.list",
      locations: "locations.list",
    };
  }

  protected handlers() {
    return {
      // Payments
      "payments.list": (p: Record<string, unknown>) =>
        this.get("/payments", p),
      "payments.get": (p: Record<string, unknown>) =>
        this.get(`/payments/${p.id}`),
      "payments.create": (p: Record<string, unknown>) =>
        this.post("/payments", {
          source_id: p.source_id, idempotency_key: p.idempotency_key ?? crypto.randomUUID(),
          amount_money: { amount: p.amount, currency: p.currency ?? "USD" },
          location_id: p.location_id,
        }),
      "payments.cancel": (p: Record<string, unknown>) =>
        this.post(`/payments/${p.id}/cancel`, {}),
      "payments.refund": (p: Record<string, unknown>) =>
        this.post("/refunds", {
          payment_id: p.payment_id ?? p.id, idempotency_key: p.idempotency_key ?? crypto.randomUUID(),
          amount_money: { amount: p.amount, currency: p.currency ?? "USD" },
        }),

      // Orders
      "orders.search": (p: Record<string, unknown>) =>
        this.post("/orders/search", {
          location_ids: p.location_ids ? [p.location_ids] : undefined,
          query: p.query, limit: p.limit ?? 25,
        }),
      "orders.get": (p: Record<string, unknown>) =>
        this.get(`/orders/${p.id}`),
      "orders.create": (p: Record<string, unknown>) =>
        this.post("/orders", { order: p.order, idempotency_key: p.idempotency_key ?? crypto.randomUUID() }),

      // Customers
      "customers.list": (p: Record<string, unknown>) =>
        this.get("/customers", p),
      "customers.get": (p: Record<string, unknown>) =>
        this.get(`/customers/${p.id}`),
      "customers.create": (p: Record<string, unknown>) =>
        this.post("/customers", {
          given_name: p.given_name ?? p.first_name, family_name: p.family_name ?? p.last_name,
          email_address: p.email, phone_number: p.phone,
        }),
      "customers.update": (p: Record<string, unknown>) =>
        this.put(`/customers/${p.id}`, p),
      "customers.delete": (p: Record<string, unknown>) =>
        this.del(`/customers/${p.id}`),
      "customers.search": (p: Record<string, unknown>) =>
        this.post("/customers/search", { query: p.query, limit: p.limit ?? 25 }),

      // Catalog
      "catalog.list": (p: Record<string, unknown>) =>
        this.get("/catalog/list", { types: p.types ?? "ITEM", cursor: p.cursor }),
      "catalog.get": (p: Record<string, unknown>) =>
        this.get(`/catalog/object/${p.id}`),
      "catalog.search": (p: Record<string, unknown>) =>
        this.post("/catalog/search", { object_types: p.types ? [p.types] : ["ITEM"], query: p.query, limit: p.limit ?? 25 }),

      // Inventory
      "inventory.count": (p: Record<string, unknown>) =>
        this.post("/inventory/counts/batch-retrieve", { catalog_object_ids: [p.id], location_ids: p.location_ids ? [p.location_ids] : undefined }),
      "inventory.adjust": (p: Record<string, unknown>) =>
        this.post("/inventory/changes/batch-create", {
          idempotency_key: crypto.randomUUID(),
          changes: [{ type: "ADJUSTMENT", adjustment: { catalog_object_id: p.id, location_id: p.location_id, quantity: String(p.quantity), from_state: p.from_state ?? "NONE", to_state: p.to_state ?? "IN_STOCK" } }],
        }),

      // Locations
      "locations.list": () => this.get("/locations"),
      "locations.get": (p: Record<string, unknown>) =>
        this.get(`/locations/${p.id}`),

      // Merchants
      "merchants.me": () => this.get("/merchants/me"),
    };
  }
}
