/**
 * Mailchimp connector — lists, members, campaigns, templates, and automations.
 *
 * Extends BearerConnector for OAuth2 Bearer token auth.
 * Mailchimp tokens are permanent (no refresh). Base URL is datacenter-specific,
 * resolved from the metadata endpoint on init.
 */

import { BearerConnector } from "../base.js";

export class MailchimpConnector extends BearerConnector {
  readonly name = "mailchimp";
  readonly version = "1.0.0";

  private dc = "";

  protected readonly auth = {
    baseUrl: "https://server.api.mailchimp.com/3.0",
    tokenVar: "MAILCHIMP_ACCESS_TOKEN",
    refreshTokenVar: "MAILCHIMP_REFRESH_TOKEN",
    clientIdVar: "MAILCHIMP_OAUTH_CLIENT_ID",
    clientSecretVar: "MAILCHIMP_OAUTH_CLIENT_SECRET",
    tokenUrl: "https://login.mailchimp.com/oauth2/token",
    healthPath: "/ping",
    label: "Mailchimp",
  };

  // ---------------------------------------------------------------------------
  // Lifecycle — resolve datacenter from token metadata
  // ---------------------------------------------------------------------------

  override async init(): Promise<void> {
    await super.init();
    this.dc = process.env.MAILCHIMP_DC ?? "";
    if (!this.dc) {
      await this.resolveDatacenter();
    }
  }

  private async resolveDatacenter(): Promise<void> {
    try {
      const authHeader = await this.buildAuthHeader();
      const res = await fetch("https://login.mailchimp.com/oauth2/metadata", {
        headers: { Authorization: authHeader },
      });
      if (res.ok) {
        const data = (await res.json()) as { dc?: string };
        if (data.dc) this.dc = data.dc;
      }
    } catch {
      // Fall through — dc stays empty, will fail on first call
    }
  }

  protected override buildUrl(path: string): string {
    return `https://${this.dc}.api.mailchimp.com/3.0${path}`;
  }

  // ---------------------------------------------------------------------------
  // Aliases
  // ---------------------------------------------------------------------------

  protected override aliases(): Record<string, string> {
    return {
      lists: "lists.list",
      members: "members.list",
      campaigns: "campaigns.list",
      templates: "templates.list",
    };
  }

  // ---------------------------------------------------------------------------
  // API method dispatch — Mailchimp Marketing API v3.0
  // ---------------------------------------------------------------------------

  protected handlers() {
    return {
      // Lists (Audiences)
      "lists.list": (p: Record<string, unknown>) =>
        this.get("/lists", { count: p.limit ?? 10, offset: p.offset }),
      "lists.get": (p: Record<string, unknown>) =>
        this.get(`/lists/${p.id}`),
      "lists.create": (p: Record<string, unknown>) =>
        this.post("/lists", { name: p.name, contact: p.contact, permission_reminder: p.permission_reminder, campaign_defaults: p.campaign_defaults, email_type_option: p.email_type_option ?? true }),

      // Members (Subscribers)
      "members.list": (p: Record<string, unknown>) =>
        this.get(`/lists/${p.list_id}/members`, { count: p.limit ?? 10, offset: p.offset, status: p.status }),
      "members.get": (p: Record<string, unknown>) =>
        this.get(`/lists/${p.list_id}/members/${p.id}`),
      "members.add": (p: Record<string, unknown>) =>
        this.post(`/lists/${p.list_id}/members`, { email_address: p.email, status: p.status ?? "subscribed", merge_fields: p.merge_fields }),
      "members.update": (p: Record<string, unknown>) =>
        this.patch(`/lists/${p.list_id}/members/${p.id}`, { status: p.status, merge_fields: p.merge_fields }),
      "members.delete": (p: Record<string, unknown>) =>
        this.del(`/lists/${p.list_id}/members/${p.id}`),
      "members.tags": (p: Record<string, unknown>) =>
        this.get(`/lists/${p.list_id}/members/${p.id}/tags`),

      // Campaigns
      "campaigns.list": (p: Record<string, unknown>) =>
        this.get("/campaigns", { count: p.limit ?? 10, offset: p.offset, status: p.status }),
      "campaigns.get": (p: Record<string, unknown>) =>
        this.get(`/campaigns/${p.id}`),
      "campaigns.create": (p: Record<string, unknown>) =>
        this.post("/campaigns", { type: p.type ?? "regular", recipients: p.recipients, settings: p.settings }),
      "campaigns.send": (p: Record<string, unknown>) =>
        this.post(`/campaigns/${p.id}/actions/send`, {}),
      "campaigns.delete": (p: Record<string, unknown>) =>
        this.del(`/campaigns/${p.id}`),
      "campaigns.content": (p: Record<string, unknown>) =>
        this.get(`/campaigns/${p.id}/content`),

      // Templates
      "templates.list": (p: Record<string, unknown>) =>
        this.get("/templates", { count: p.limit ?? 10, type: p.type }),
      "templates.get": (p: Record<string, unknown>) =>
        this.get(`/templates/${p.id}`),

      // Automations
      "automations.list": (p: Record<string, unknown>) =>
        this.get("/automations", { count: p.limit ?? 10 }),
      "automations.get": (p: Record<string, unknown>) =>
        this.get(`/automations/${p.id}`),

      // Account
      "account": () => this.get("/"),
      "ping": () => this.get("/ping"),
    };
  }
}
