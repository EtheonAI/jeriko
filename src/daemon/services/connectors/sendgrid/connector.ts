/**
 * SendGrid connector — email sending, contacts, templates, and stats.
 *
 * Extends ConnectorBase with API key auth (Bearer token).
 * No OAuth — API key only.
 */

import { ConnectorBase } from "../base.js";

export class SendGridConnector extends ConnectorBase {
  readonly name = "sendgrid";
  readonly version = "1.0.0";

  protected readonly baseUrl = "https://api.sendgrid.com/v3";
  protected readonly healthPath = "/scopes";
  protected readonly label = "SendGrid";

  private apiKey = "";

  override async init(): Promise<void> {
    const key = process.env.SENDGRID_API_KEY;
    if (!key) throw new Error("SENDGRID_API_KEY env var is required");
    this.apiKey = key;
  }

  protected async buildAuthHeader(): Promise<string> {
    return `Bearer ${this.apiKey}`;
  }

  protected override aliases(): Record<string, string> {
    return {
      send: "mail.send",
      contacts: "contacts.list",
      templates: "templates.list",
    };
  }

  protected handlers() {
    return {
      // Mail
      "mail.send": (p: Record<string, unknown>) =>
        this.post("/mail/send", {
          personalizations: p.personalizations ?? [{ to: [{ email: p.to }] }],
          from: p.from ? { email: p.from } : undefined,
          subject: p.subject,
          content: p.content ?? [{ type: "text/plain", value: p.body ?? p.text }],
        }),

      // Contacts
      "contacts.list": (p: Record<string, unknown>) =>
        this.get("/marketing/contacts", p),
      "contacts.get": (p: Record<string, unknown>) =>
        this.get(`/marketing/contacts/${p.id}`),
      "contacts.search": (p: Record<string, unknown>) =>
        this.post("/marketing/contacts/search", { query: p.query }),
      "contacts.add": (p: Record<string, unknown>) =>
        this.put("/marketing/contacts", { contacts: p.contacts ?? [{ email: p.email, first_name: p.first_name, last_name: p.last_name }] }),
      "contacts.delete": (p: Record<string, unknown>) =>
        this.del(`/marketing/contacts?ids=${p.id}`),
      "contacts.count": () => this.get("/marketing/contacts/count"),

      // Lists
      "lists.list": () => this.get("/marketing/lists"),
      "lists.get": (p: Record<string, unknown>) =>
        this.get(`/marketing/lists/${p.id}`),
      "lists.create": (p: Record<string, unknown>) =>
        this.post("/marketing/lists", { name: p.name }),
      "lists.delete": (p: Record<string, unknown>) =>
        this.del(`/marketing/lists/${p.id}`),

      // Templates
      "templates.list": (p: Record<string, unknown>) =>
        this.get("/templates", { generations: p.generations ?? "dynamic", page_size: p.limit ?? 10 }),
      "templates.get": (p: Record<string, unknown>) =>
        this.get(`/templates/${p.id}`),

      // Stats
      "stats.global": (p: Record<string, unknown>) =>
        this.get("/stats", p),

      // Sender verification
      "senders.list": () => this.get("/verified_senders"),
    };
  }
}
