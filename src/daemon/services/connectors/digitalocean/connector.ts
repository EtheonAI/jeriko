/**
 * DigitalOcean connector — droplets, domains, databases, apps, and volumes.
 *
 * Extends BearerConnector for OAuth2 Bearer token auth with refresh.
 * DigitalOcean supports both personal access tokens and OAuth 2.0.
 */

import { BearerConnector } from "../base.js";

export class DigitalOceanConnector extends BearerConnector {
  readonly name = "digitalocean";
  readonly version = "1.0.0";

  protected readonly auth = {
    baseUrl: "https://api.digitalocean.com/v2",
    tokenVar: "DIGITALOCEAN_ACCESS_TOKEN",
    refreshTokenVar: "DIGITALOCEAN_REFRESH_TOKEN",
    clientIdVar: "DIGITALOCEAN_OAUTH_CLIENT_ID",
    clientSecretVar: "DIGITALOCEAN_OAUTH_CLIENT_SECRET",
    tokenUrl: "https://cloud.digitalocean.com/v1/oauth/token",
    healthPath: "/account",
    label: "DigitalOcean",
  };

  // ---------------------------------------------------------------------------
  // Aliases
  // ---------------------------------------------------------------------------

  protected override aliases(): Record<string, string> {
    return {
      droplets: "droplets.list",
      domains: "domains.list",
      databases: "databases.list",
      apps: "apps.list",
    };
  }

  // ---------------------------------------------------------------------------
  // API method dispatch — DigitalOcean API v2
  // ---------------------------------------------------------------------------

  protected handlers() {
    return {
      // Droplets
      "droplets.list": (p: Record<string, unknown>) =>
        this.get("/droplets", { per_page: p.limit ?? 20, page: p.page }),
      "droplets.get": (p: Record<string, unknown>) =>
        this.get(`/droplets/${p.id}`),
      "droplets.create": (p: Record<string, unknown>) =>
        this.post("/droplets", { name: p.name, region: p.region, size: p.size, image: p.image, ssh_keys: p.ssh_keys, tags: p.tags }),
      "droplets.delete": (p: Record<string, unknown>) =>
        this.del(`/droplets/${p.id}`),
      "droplets.actions": (p: Record<string, unknown>) =>
        this.get(`/droplets/${p.id}/actions`, { per_page: p.limit ?? 20 }),
      "droplets.action": (p: Record<string, unknown>) =>
        this.post(`/droplets/${p.id}/actions`, { type: p.type }),

      // Domains
      "domains.list": (p: Record<string, unknown>) =>
        this.get("/domains", { per_page: p.limit ?? 20 }),
      "domains.get": (p: Record<string, unknown>) =>
        this.get(`/domains/${p.name ?? p.id}`),
      "domains.create": (p: Record<string, unknown>) =>
        this.post("/domains", { name: p.name, ip_address: p.ip_address }),
      "domains.delete": (p: Record<string, unknown>) =>
        this.del(`/domains/${p.name ?? p.id}`),
      "domains.records": (p: Record<string, unknown>) =>
        this.get(`/domains/${p.name ?? p.domain}/records`, { per_page: p.limit ?? 20 }),
      "domains.records.create": (p: Record<string, unknown>) =>
        this.post(`/domains/${p.name ?? p.domain}/records`, { type: p.type, name: p.record_name, data: p.data, ttl: p.ttl }),

      // Databases
      "databases.list": (p: Record<string, unknown>) =>
        this.get("/databases", { per_page: p.limit ?? 20 }),
      "databases.get": (p: Record<string, unknown>) =>
        this.get(`/databases/${p.id}`),
      "databases.create": (p: Record<string, unknown>) =>
        this.post("/databases", { name: p.name, engine: p.engine, size: p.size, region: p.region, num_nodes: p.num_nodes ?? 1 }),

      // Apps
      "apps.list": (p: Record<string, unknown>) =>
        this.get("/apps", { per_page: p.limit ?? 20 }),
      "apps.get": (p: Record<string, unknown>) =>
        this.get(`/apps/${p.id}`),
      "apps.delete": (p: Record<string, unknown>) =>
        this.del(`/apps/${p.id}`),
      "apps.deployments": (p: Record<string, unknown>) =>
        this.get(`/apps/${p.id}/deployments`, { per_page: p.limit ?? 10 }),

      // Volumes
      "volumes.list": (p: Record<string, unknown>) =>
        this.get("/volumes", { per_page: p.limit ?? 20 }),
      "volumes.get": (p: Record<string, unknown>) =>
        this.get(`/volumes/${p.id}`),
      "volumes.create": (p: Record<string, unknown>) =>
        this.post("/volumes", { name: p.name, size_gigabytes: p.size, region: p.region }),
      "volumes.delete": (p: Record<string, unknown>) =>
        this.del(`/volumes/${p.id}`),

      // SSH Keys
      "ssh_keys.list": () => this.get("/account/keys"),
      "ssh_keys.get": (p: Record<string, unknown>) =>
        this.get(`/account/keys/${p.id}`),

      // Account
      "account": () => this.get("/account"),
      "regions": () => this.get("/regions"),
      "sizes": () => this.get("/sizes"),
      "images.list": (p: Record<string, unknown>) =>
        this.get("/images", { type: p.type ?? "distribution", per_page: p.limit ?? 20 }),
    };
  }
}
