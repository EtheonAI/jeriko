/**
 * Cloudflare connector — zones, DNS, Workers, KV, and analytics.
 *
 * Extends ConnectorBase with API token auth (Bearer token).
 * Cloudflare does not support OAuth — API token only.
 */

import { ConnectorBase } from "../base.js";

export class CloudflareConnector extends ConnectorBase {
  readonly name = "cloudflare";
  readonly version = "1.0.0";

  protected readonly baseUrl = "https://api.cloudflare.com/client/v4";
  protected readonly healthPath = "/user/tokens/verify";
  protected readonly label = "Cloudflare";

  private apiToken = "";

  override async init(): Promise<void> {
    const token = process.env.CLOUDFLARE_API_TOKEN;
    if (!token) throw new Error("CLOUDFLARE_API_TOKEN env var is required");
    this.apiToken = token;
  }

  protected async buildAuthHeader(): Promise<string> {
    return `Bearer ${this.apiToken}`;
  }

  // ---------------------------------------------------------------------------
  // Aliases
  // ---------------------------------------------------------------------------

  protected override aliases(): Record<string, string> {
    return {
      zones: "zones.list",
      dns: "dns.list",
      workers: "workers.list",
    };
  }

  // ---------------------------------------------------------------------------
  // API method dispatch — Cloudflare API v4
  // ---------------------------------------------------------------------------

  protected handlers() {
    return {
      // Zones
      "zones.list": (p: Record<string, unknown>) =>
        this.get("/zones", { name: p.name, status: p.status, per_page: p.limit ?? 20, page: p.page }),
      "zones.get": (p: Record<string, unknown>) =>
        this.get(`/zones/${p.id}`),
      "zones.create": (p: Record<string, unknown>) =>
        this.post("/zones", { name: p.name, account: { id: p.account_id }, jump_start: p.jump_start }),
      "zones.delete": (p: Record<string, unknown>) =>
        this.del(`/zones/${p.id}`),
      "zones.purge_cache": (p: Record<string, unknown>) =>
        this.post(`/zones/${p.zone_id}/purge_cache`, { purge_everything: p.purge_everything ?? true }),

      // DNS Records
      "dns.list": (p: Record<string, unknown>) =>
        this.get(`/zones/${p.zone_id}/dns_records`, { type: p.type, name: p.name, per_page: p.limit ?? 50, page: p.page }),
      "dns.get": (p: Record<string, unknown>) =>
        this.get(`/zones/${p.zone_id}/dns_records/${p.id}`),
      "dns.create": (p: Record<string, unknown>) =>
        this.post(`/zones/${p.zone_id}/dns_records`, { type: p.type, name: p.name, content: p.content, ttl: p.ttl ?? 1, proxied: p.proxied }),
      "dns.update": (p: Record<string, unknown>) =>
        this.put(`/zones/${p.zone_id}/dns_records/${p.id}`, { type: p.type, name: p.name, content: p.content, ttl: p.ttl, proxied: p.proxied }),
      "dns.delete": (p: Record<string, unknown>) =>
        this.del(`/zones/${p.zone_id}/dns_records/${p.id}`),

      // Workers
      "workers.list": (p: Record<string, unknown>) =>
        this.get(`/accounts/${p.account_id}/workers/scripts`),
      "workers.get": (p: Record<string, unknown>) =>
        this.get(`/accounts/${p.account_id}/workers/scripts/${p.name}`),
      "workers.delete": (p: Record<string, unknown>) =>
        this.del(`/accounts/${p.account_id}/workers/scripts/${p.name}`),
      "workers.routes": (p: Record<string, unknown>) =>
        this.get(`/zones/${p.zone_id}/workers/routes`),

      // KV Namespaces
      "kv.namespaces": (p: Record<string, unknown>) =>
        this.get(`/accounts/${p.account_id}/storage/kv/namespaces`, { per_page: p.limit ?? 20 }),
      "kv.keys": (p: Record<string, unknown>) =>
        this.get(`/accounts/${p.account_id}/storage/kv/namespaces/${p.namespace_id}/keys`, { limit: p.limit ?? 100 }),
      "kv.get": (p: Record<string, unknown>) =>
        this.get(`/accounts/${p.account_id}/storage/kv/namespaces/${p.namespace_id}/values/${p.key}`),
      "kv.put": (p: Record<string, unknown>) =>
        this.put(`/accounts/${p.account_id}/storage/kv/namespaces/${p.namespace_id}/values/${p.key}`, { value: p.value }),
      "kv.delete": (p: Record<string, unknown>) =>
        this.del(`/accounts/${p.account_id}/storage/kv/namespaces/${p.namespace_id}/values/${p.key}`),

      // Analytics
      "analytics.dashboard": (p: Record<string, unknown>) =>
        this.get(`/zones/${p.zone_id}/analytics/dashboard`, { since: p.since, until: p.until }),

      // User
      "user.me": () => this.get("/user"),
      "user.tokens": () => this.get("/user/tokens"),
    };
  }
}
