/**
 * HubSpot connector — contacts, companies, deals, tickets, and webhook handling.
 *
 * Extends BearerConnector for OAuth2 Bearer token auth with automatic refresh.
 * HubSpot API v3 uses standard Bearer auth and JSON request/response bodies.
 */

import { createHmac, timingSafeEqual } from "crypto";
import { BearerConnector } from "../base.js";
import type { ConnectorResult, WebhookEvent } from "../interface.js";

export class HubSpotConnector extends BearerConnector {
  readonly name = "hubspot";
  readonly version = "1.0.0";

  protected readonly auth = {
    baseUrl: "https://api.hubapi.com",
    tokenVar: "HUBSPOT_ACCESS_TOKEN",
    refreshTokenVar: "HUBSPOT_REFRESH_TOKEN",
    clientIdVar: "HUBSPOT_OAUTH_CLIENT_ID",
    clientSecretVar: "HUBSPOT_OAUTH_CLIENT_SECRET",
    tokenUrl: "https://api.hubapi.com/oauth/v1/token",
    healthPath: "/crm/v3/objects/contacts?limit=1",
    label: "HubSpot",
  };

  private webhookSecret = "";

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  override async init(): Promise<void> {
    await super.init();
    this.webhookSecret = process.env.HUBSPOT_WEBHOOK_SECRET ?? "";
  }

  // ---------------------------------------------------------------------------
  // Aliases
  // ---------------------------------------------------------------------------

  protected override aliases(): Record<string, string> {
    return {
      contacts: "contacts.list",
      companies: "companies.list",
      deals: "deals.list",
      tickets: "tickets.list",
      owners: "owners.list",
      pipelines: "pipelines.list",
    };
  }

  // ---------------------------------------------------------------------------
  // API method dispatch — HubSpot CRM v3
  // ---------------------------------------------------------------------------

  protected handlers() {
    return {
      // Contacts
      "contacts.list": (p: Record<string, unknown>) =>
        this.get("/crm/v3/objects/contacts", p),
      "contacts.get": (p: Record<string, unknown>) =>
        this.get(`/crm/v3/objects/contacts/${p.id}`),
      "contacts.create": (p: Record<string, unknown>) =>
        this.post("/crm/v3/objects/contacts", { properties: p.properties ?? p }),
      "contacts.update": (p: Record<string, unknown>) =>
        this.patch(`/crm/v3/objects/contacts/${p.id}`, { properties: p.properties ?? p }),
      "contacts.delete": (p: Record<string, unknown>) =>
        this.del(`/crm/v3/objects/contacts/${p.id}`),
      "contacts.search": (p: Record<string, unknown>) =>
        this.post("/crm/v3/objects/contacts/search", {
          filterGroups: p.filter_groups ?? p.filterGroups,
          query: p.query,
          limit: p.limit ?? 10,
        }),

      // Companies
      "companies.list": (p: Record<string, unknown>) =>
        this.get("/crm/v3/objects/companies", p),
      "companies.get": (p: Record<string, unknown>) =>
        this.get(`/crm/v3/objects/companies/${p.id}`),
      "companies.create": (p: Record<string, unknown>) =>
        this.post("/crm/v3/objects/companies", { properties: p.properties ?? p }),
      "companies.update": (p: Record<string, unknown>) =>
        this.patch(`/crm/v3/objects/companies/${p.id}`, { properties: p.properties ?? p }),
      "companies.delete": (p: Record<string, unknown>) =>
        this.del(`/crm/v3/objects/companies/${p.id}`),
      "companies.search": (p: Record<string, unknown>) =>
        this.post("/crm/v3/objects/companies/search", {
          filterGroups: p.filter_groups ?? p.filterGroups,
          query: p.query,
          limit: p.limit ?? 10,
        }),

      // Deals
      "deals.list": (p: Record<string, unknown>) =>
        this.get("/crm/v3/objects/deals", p),
      "deals.get": (p: Record<string, unknown>) =>
        this.get(`/crm/v3/objects/deals/${p.id}`),
      "deals.create": (p: Record<string, unknown>) =>
        this.post("/crm/v3/objects/deals", { properties: p.properties ?? p }),
      "deals.update": (p: Record<string, unknown>) =>
        this.patch(`/crm/v3/objects/deals/${p.id}`, { properties: p.properties ?? p }),
      "deals.delete": (p: Record<string, unknown>) =>
        this.del(`/crm/v3/objects/deals/${p.id}`),
      "deals.search": (p: Record<string, unknown>) =>
        this.post("/crm/v3/objects/deals/search", {
          filterGroups: p.filter_groups ?? p.filterGroups,
          query: p.query,
          limit: p.limit ?? 10,
        }),

      // Tickets
      "tickets.list": (p: Record<string, unknown>) =>
        this.get("/crm/v3/objects/tickets", p),
      "tickets.get": (p: Record<string, unknown>) =>
        this.get(`/crm/v3/objects/tickets/${p.id}`),
      "tickets.create": (p: Record<string, unknown>) =>
        this.post("/crm/v3/objects/tickets", { properties: p.properties ?? p }),
      "tickets.update": (p: Record<string, unknown>) =>
        this.patch(`/crm/v3/objects/tickets/${p.id}`, { properties: p.properties ?? p }),
      "tickets.delete": (p: Record<string, unknown>) =>
        this.del(`/crm/v3/objects/tickets/${p.id}`),

      // Owners
      "owners.list": (p: Record<string, unknown>) =>
        this.get("/crm/v3/owners", p),
      "owners.get": (p: Record<string, unknown>) =>
        this.get(`/crm/v3/owners/${p.id}`),

      // Pipelines
      "pipelines.list": (p: Record<string, unknown>) => {
        const objectType = p.object_type ?? "deals";
        return this.get(`/crm/v3/pipelines/${objectType}`);
      },
      "pipelines.get": (p: Record<string, unknown>) => {
        const objectType = p.object_type ?? "deals";
        return this.get(`/crm/v3/pipelines/${objectType}/${p.id}`);
      },

      // Associations
      "associations.list": (p: Record<string, unknown>) =>
        this.get(`/crm/v4/objects/${p.from_type}/${p.id}/associations/${p.to_type}`),
      "associations.create": (p: Record<string, unknown>) =>
        this.put(`/crm/v4/objects/${p.from_type}/${p.from_id}/associations/${p.to_type}/${p.to_id}`, {
          associationCategory: p.category ?? "HUBSPOT_DEFINED",
          associationTypeId: p.type_id,
        }),

      // Engagement (notes, tasks, emails, calls, meetings)
      "notes.create": (p: Record<string, unknown>) =>
        this.post("/crm/v3/objects/notes", { properties: p.properties ?? p }),
      "tasks.create": (p: Record<string, unknown>) =>
        this.post("/crm/v3/objects/tasks", { properties: p.properties ?? p }),

      // Search (unified)
      "search": (p: Record<string, unknown>) => {
        const objectType = p.object_type ?? "contacts";
        return this.post(`/crm/v3/objects/${objectType}/search`, {
          filterGroups: p.filter_groups ?? p.filterGroups,
          query: p.query,
          limit: p.limit ?? 10,
        });
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Rate limiting — HubSpot returns rate limit headers
  // ---------------------------------------------------------------------------

  protected override parseRateLimit(
    headers: Headers,
  ): { remaining: number; reset_at: string } | undefined {
    const remaining = headers.get("x-hubspot-ratelimit-daily-remaining");
    const reset = headers.get("x-hubspot-ratelimit-daily-reset");
    if (remaining !== null) {
      return {
        remaining: parseInt(remaining, 10),
        reset_at: reset ? new Date(parseInt(reset, 10)).toISOString() : "",
      };
    }
    return undefined;
  }

  // ---------------------------------------------------------------------------
  // Webhooks — HubSpot v3 signature verification (HMAC-SHA256)
  // ---------------------------------------------------------------------------

  override async webhook(
    headers: Record<string, string>,
    body: string,
  ): Promise<WebhookEvent> {
    const signature = headers["x-hubspot-signature-v3"] ?? headers["x-hubspot-signature"] ?? "";
    const timestamp = headers["x-hubspot-request-timestamp"] ?? "";
    const verified = this.verifySignature(body, signature, timestamp);

    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new Error("Invalid JSON in HubSpot webhook body");
    }

    // HubSpot sends an array of events
    const events = Array.isArray(parsed) ? parsed : [parsed];
    const first = events[0] as Record<string, unknown> | undefined;

    return {
      id: (first?.eventId as string) ?? crypto.randomUUID(),
      source: this.name,
      type: (first?.subscriptionType as string) ?? "hubspot.webhook",
      data: parsed,
      verified,
      received_at: new Date().toISOString(),
    };
  }

  /**
   * HubSpot v3 signature verification:
   * HMAC-SHA256(clientSecret, method + url + body + timestamp)
   *
   * For webhook subscriptions, the secret is the app's client secret.
   * We use HUBSPOT_WEBHOOK_SECRET (which should be the client secret or
   * a dedicated webhook secret).
   */
  private verifySignature(body: string, signature: string, timestamp: string): boolean {
    if (!this.webhookSecret || !signature) return false;

    // v3 signature includes timestamp for replay protection
    const payload = timestamp ? `POST${body}${timestamp}` : body;
    const expected = createHmac("sha256", this.webhookSecret)
      .update(payload)
      .digest("base64");

    if (expected.length !== signature.length) return false;
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }
}
