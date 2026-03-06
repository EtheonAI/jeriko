/**
 * Salesforce connector — records, SOQL queries, objects, and users.
 *
 * Extends BearerConnector for OAuth2 Bearer token auth with refresh.
 * Salesforce uses instance-specific URLs — the base URL is resolved from
 * the SALESFORCE_INSTANCE_URL env var (e.g. https://yourorg.my.salesforce.com).
 */

import { BearerConnector } from "../base.js";
import type { ConnectorResult } from "../interface.js";

export class SalesforceConnector extends BearerConnector {
  readonly name = "salesforce";
  readonly version = "1.0.0";

  private instanceUrl = "";

  protected readonly auth = {
    baseUrl: "https://login.salesforce.com",
    tokenVar: "SALESFORCE_ACCESS_TOKEN",
    refreshTokenVar: "SALESFORCE_REFRESH_TOKEN",
    clientIdVar: "SALESFORCE_OAUTH_CLIENT_ID",
    clientSecretVar: "SALESFORCE_OAUTH_CLIENT_SECRET",
    tokenUrl: "https://login.salesforce.com/services/oauth2/token",
    healthPath: "/services/data",
    label: "Salesforce",
  };

  // ---------------------------------------------------------------------------
  // Lifecycle — resolve instance URL
  // ---------------------------------------------------------------------------

  override async init(): Promise<void> {
    await super.init();
    const url = process.env.SALESFORCE_INSTANCE_URL;
    if (!url) throw new Error("SALESFORCE_INSTANCE_URL env var is required");
    this.instanceUrl = url.replace(/\/+$/, "");
  }

  protected override buildUrl(path: string): string {
    return `${this.instanceUrl}${path}`;
  }

  // ---------------------------------------------------------------------------
  // Aliases
  // ---------------------------------------------------------------------------

  protected override aliases(): Record<string, string> {
    return {
      query: "soql.query",
      records: "records.list",
      objects: "objects.list",
    };
  }

  // ---------------------------------------------------------------------------
  // API method dispatch — Salesforce REST API v59.0
  // ---------------------------------------------------------------------------

  private readonly apiVersion = "v59.0";

  private apiPath(path: string): string {
    return `/services/data/${this.apiVersion}${path}`;
  }

  protected handlers() {
    return {
      // SOQL Query
      "soql.query": (p: Record<string, unknown>) =>
        this.get(this.apiPath(`/query?q=${encodeURIComponent(String(p.query ?? p.q))}`)),
      "soql.query_more": (p: Record<string, unknown>) =>
        this.get(String(p.next_url ?? p.url)),

      // Records (SObject)
      "records.get": (p: Record<string, unknown>) =>
        this.get(this.apiPath(`/sobjects/${p.object ?? p.type}/${p.id}`)),
      "records.create": (p: Record<string, unknown>) =>
        this.post(this.apiPath(`/sobjects/${p.object ?? p.type}`), p.fields as Record<string, unknown> ?? {}),
      "records.update": (p: Record<string, unknown>) =>
        this.patch(this.apiPath(`/sobjects/${p.object ?? p.type}/${p.id}`), p.fields as Record<string, unknown> ?? {}),
      "records.delete": (p: Record<string, unknown>) =>
        this.del(this.apiPath(`/sobjects/${p.object ?? p.type}/${p.id}`)),
      "records.list": (p: Record<string, unknown>) => {
        const obj = p.object ?? p.type ?? "Account";
        const limit = p.limit ?? 25;
        return this.get(this.apiPath(`/query?q=${encodeURIComponent(`SELECT Id, Name FROM ${obj} ORDER BY Name LIMIT ${limit}`)}`));
      },

      // Describe (metadata)
      "objects.list": () =>
        this.get(this.apiPath("/sobjects")),
      "objects.describe": (p: Record<string, unknown>) =>
        this.get(this.apiPath(`/sobjects/${p.object ?? p.type}/describe`)),

      // Search
      "search": (p: Record<string, unknown>) =>
        this.get(this.apiPath(`/search?q=${encodeURIComponent(String(p.query ?? p.q))}`)),

      // Users
      "users.me": () =>
        this.get(this.apiPath("/chatter/users/me")),
      "users.list": (p: Record<string, unknown>) => {
        const limit = p.limit ?? 25;
        return this.get(this.apiPath(`/query?q=${encodeURIComponent(`SELECT Id, Name, Email FROM User ORDER BY Name LIMIT ${limit}`)}`));
      },

      // Limits
      "limits": () =>
        this.get(this.apiPath("/limits")),

      // Versions
      "versions": () =>
        this.get("/services/data"),
    };
  }
}
