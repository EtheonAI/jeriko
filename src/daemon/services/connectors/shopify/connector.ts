/**
 * Shopify connector — products, orders, customers, inventory, and webhook handling.
 *
 * Extends BearerConnector for OAuth2 Bearer token auth.
 * Shopify access tokens are permanent (no refresh), but the BearerConnector
 * base handles this gracefully — refresh is simply not configured.
 *
 * Shopify's API is per-store: all URLs include the shop domain.
 * Requires SHOPIFY_SHOP env var (e.g. "my-store" or "my-store.myshopify.com").
 */

import { createHmac, timingSafeEqual } from "crypto";
import { BearerConnector } from "../base.js";
import type { ConnectorResult, WebhookEvent } from "../interface.js";

/** Current Shopify Admin API version. */
const API_VERSION = "2025-01";

export class ShopifyConnector extends BearerConnector {
  readonly name = "shopify";
  readonly version = "1.0.0";

  private shopDomain = "";
  private webhookSecret = "";

  protected readonly auth = {
    baseUrl: "", // Set dynamically in init() based on shop domain
    tokenVar: "SHOPIFY_ACCESS_TOKEN",
    // Shopify tokens are permanent — no refresh needed
    healthPath: "/shop.json",
    label: "Shopify",
  };

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  override async init(): Promise<void> {
    const shop = process.env.SHOPIFY_SHOP;
    if (!shop) {
      throw new Error("SHOPIFY_SHOP env var is required (e.g. 'my-store' or 'my-store.myshopify.com')");
    }

    // Normalize shop domain: "my-store" → "my-store.myshopify.com"
    this.shopDomain = shop.includes(".") ? shop : `${shop}.myshopify.com`;

    // Set the dynamic base URL before super.init() reads the token
    (this.auth as { baseUrl: string }).baseUrl =
      `https://${this.shopDomain}/admin/api/${API_VERSION}`;

    await super.init();
    this.webhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET ?? "";
  }

  // ---------------------------------------------------------------------------
  // Aliases
  // ---------------------------------------------------------------------------

  protected override aliases(): Record<string, string> {
    return {
      products: "products.list",
      orders: "orders.list",
      customers: "customers.list",
      inventory: "inventory.list",
      collections: "collections.list",
      shop: "shop.get",
    };
  }

  // ---------------------------------------------------------------------------
  // API method dispatch — Shopify Admin REST API
  // ---------------------------------------------------------------------------

  protected handlers() {
    return {
      // Shop
      "shop.get": () => this.get("/shop.json"),

      // Products
      "products.list": (p: Record<string, unknown>) =>
        this.get("/products.json", p),
      "products.get": (p: Record<string, unknown>) =>
        this.get(`/products/${p.id}.json`),
      "products.create": (p: Record<string, unknown>) =>
        this.post("/products.json", { product: p.product ?? p }),
      "products.update": (p: Record<string, unknown>) =>
        this.put(`/products/${p.id}.json`, { product: p.product ?? p }),
      "products.delete": (p: Record<string, unknown>) =>
        this.del(`/products/${p.id}.json`),
      "products.count": () => this.get("/products/count.json"),

      // Variants
      "variants.list": (p: Record<string, unknown>) =>
        this.get(`/products/${p.product_id}/variants.json`),
      "variants.get": (p: Record<string, unknown>) =>
        this.get(`/variants/${p.id}.json`),
      "variants.update": (p: Record<string, unknown>) =>
        this.put(`/variants/${p.id}.json`, { variant: p.variant ?? p }),

      // Orders
      "orders.list": (p: Record<string, unknown>) =>
        this.get("/orders.json", p),
      "orders.get": (p: Record<string, unknown>) =>
        this.get(`/orders/${p.id}.json`),
      "orders.create": (p: Record<string, unknown>) =>
        this.post("/orders.json", { order: p.order ?? p }),
      "orders.update": (p: Record<string, unknown>) =>
        this.put(`/orders/${p.id}.json`, { order: p.order ?? p }),
      "orders.close": (p: Record<string, unknown>) =>
        this.post(`/orders/${p.id}/close.json`, {}),
      "orders.cancel": (p: Record<string, unknown>) =>
        this.post(`/orders/${p.id}/cancel.json`, {}),
      "orders.count": (p: Record<string, unknown>) =>
        this.get("/orders/count.json", p),

      // Customers
      "customers.list": (p: Record<string, unknown>) =>
        this.get("/customers.json", p),
      "customers.get": (p: Record<string, unknown>) =>
        this.get(`/customers/${p.id}.json`),
      "customers.create": (p: Record<string, unknown>) =>
        this.post("/customers.json", { customer: p.customer ?? p }),
      "customers.update": (p: Record<string, unknown>) =>
        this.put(`/customers/${p.id}.json`, { customer: p.customer ?? p }),
      "customers.search": (p: Record<string, unknown>) =>
        this.get(`/customers/search.json?query=${encodeURIComponent(String(p.query))}`),
      "customers.count": () => this.get("/customers/count.json"),

      // Inventory
      "inventory.list": (p: Record<string, unknown>) =>
        this.get("/inventory_levels.json", p),
      "inventory.set": (p: Record<string, unknown>) =>
        this.post("/inventory_levels/set.json", {
          location_id: p.location_id,
          inventory_item_id: p.inventory_item_id,
          available: p.available,
        }),
      "inventory.adjust": (p: Record<string, unknown>) =>
        this.post("/inventory_levels/adjust.json", {
          location_id: p.location_id,
          inventory_item_id: p.inventory_item_id,
          available_adjustment: p.adjustment ?? p.available_adjustment,
        }),

      // Collections
      "collections.list": () => this.get("/custom_collections.json"),
      "collections.get": (p: Record<string, unknown>) =>
        this.get(`/custom_collections/${p.id}.json`),
      "collections.create": (p: Record<string, unknown>) =>
        this.post("/custom_collections.json", { custom_collection: p }),
      "smart_collections.list": () => this.get("/smart_collections.json"),

      // Fulfillments
      "fulfillments.list": (p: Record<string, unknown>) =>
        this.get(`/orders/${p.order_id}/fulfillments.json`),
      "fulfillments.create": (p: Record<string, unknown>) =>
        this.post(`/orders/${p.order_id}/fulfillments.json`, {
          fulfillment: p.fulfillment ?? p,
        }),

      // Locations
      "locations.list": () => this.get("/locations.json"),
      "locations.get": (p: Record<string, unknown>) =>
        this.get(`/locations/${p.id}.json`),

      // Webhooks (Shopify-managed)
      "webhooks.list": () => this.get("/webhooks.json"),
      "webhooks.create": (p: Record<string, unknown>) =>
        this.post("/webhooks.json", {
          webhook: { topic: p.topic, address: p.address, format: "json" },
        }),
      "webhooks.delete": (p: Record<string, unknown>) =>
        this.del(`/webhooks/${p.id}.json`),
    };
  }

  // ---------------------------------------------------------------------------
  // Rate limiting — Shopify uses Leaky Bucket with X-Shopify-Shop-Api-Call-Limit
  // ---------------------------------------------------------------------------

  protected override parseRateLimit(
    headers: Headers,
  ): { remaining: number; reset_at: string } | undefined {
    const callLimit = headers.get("x-shopify-shop-api-call-limit");
    if (callLimit) {
      // Format: "32/40" — current/max
      const [current, max] = callLimit.split("/").map(Number);
      if (!isNaN(current!) && !isNaN(max!)) {
        return {
          remaining: max! - current!,
          reset_at: "", // Shopify uses leaky bucket, no fixed reset time
        };
      }
    }
    return undefined;
  }

  // ---------------------------------------------------------------------------
  // Webhooks — Shopify HMAC-SHA256 verification
  // ---------------------------------------------------------------------------

  override async webhook(
    headers: Record<string, string>,
    body: string,
  ): Promise<WebhookEvent> {
    const hmacHeader = headers["x-shopify-hmac-sha256"] ?? "";
    const verified = this.verifySignature(body, hmacHeader);

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new Error("Invalid JSON in Shopify webhook body");
    }

    const topic = headers["x-shopify-topic"] ?? "unknown";

    return {
      id: (headers["x-shopify-webhook-id"] as string) ?? crypto.randomUUID(),
      source: this.name,
      type: topic.replace("/", "."),
      data: parsed,
      verified,
      received_at: new Date().toISOString(),
    };
  }

  /**
   * Shopify HMAC-SHA256 verification:
   * HMAC-SHA256(webhookSecret, rawBody) → base64 compare with X-Shopify-Hmac-SHA256.
   */
  private verifySignature(body: string, hmacHeader: string): boolean {
    if (!this.webhookSecret || !hmacHeader) return false;
    const expected = createHmac("sha256", this.webhookSecret)
      .update(body, "utf8")
      .digest("base64");
    if (expected.length !== hmacHeader.length) return false;
    return timingSafeEqual(Buffer.from(expected), Buffer.from(hmacHeader));
  }
}
