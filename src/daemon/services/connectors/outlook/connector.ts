/**
 * Outlook connector — messages, folders, send, reply, forward, and subscriptions.
 *
 * Extends BearerConnector for unified auth, HTTP, health, and dispatch.
 * Only implements handlers() + custom webhook/sync.
 */

import { BearerConnector } from "../base.js";
import type { ConnectorResult, WebhookEvent } from "../interface.js";

export class OutlookConnector extends BearerConnector {
  readonly name = "outlook";
  readonly version = "1.0.0";

  protected readonly auth = {
    baseUrl: "https://graph.microsoft.com/v1.0",
    tokenVar: "OUTLOOK_ACCESS_TOKEN",
    refreshTokenVar: "OUTLOOK_REFRESH_TOKEN",
    clientIdVar: "OUTLOOK_OAUTH_CLIENT_ID",
    clientSecretVar: "OUTLOOK_OAUTH_CLIENT_SECRET",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    refreshScope: "Mail.ReadWrite Mail.Send offline_access",
    healthPath: "/me",
    label: "Outlook",
  };

  private subscriptionSecret = "";

  override async init(): Promise<void> {
    await super.init();
    this.subscriptionSecret = process.env.OUTLOOK_SUBSCRIPTION_SECRET ?? "";
  }

  // ---------------------------------------------------------------------------
  // Aliases — single-word shortcuts
  // ---------------------------------------------------------------------------

  protected override aliases(): Record<string, string> {
    return {
      messages: "messages.list",
      folders: "folders.list",
    };
  }

  // ---------------------------------------------------------------------------
  // API method dispatch
  // ---------------------------------------------------------------------------

  protected handlers() {
    return {
      // Messages
      "messages.list": (p: Record<string, unknown>) => {
        const qs: string[] = [];
        if (p.filter) qs.push(`$filter=${encodeURIComponent(String(p.filter))}`);
        if (p.select) qs.push(`$select=${encodeURIComponent(String(p.select))}`);
        qs.push(`$top=${p.top ?? 20}`);
        if (p.skip) qs.push(`$skip=${p.skip}`);
        if (p.orderby) qs.push(`$orderby=${encodeURIComponent(String(p.orderby))}`);
        return this.get(`/me/messages?${qs.join("&")}`);
      },
      "messages.get": (p: Record<string, unknown>) =>
        this.get(`/me/messages/${p.message_id ?? p.id}`),
      "messages.send": (p: Record<string, unknown>) =>
        this.post("/me/sendMail", {
          message: {
            subject: p.subject,
            body: {
              contentType: p.content_type ?? "Text",
              content: p.body ?? p.content,
            },
            toRecipients: Array.isArray(p.to)
              ? (p.to as string[]).map((email) => ({ emailAddress: { address: email } }))
              : [{ emailAddress: { address: p.to } }],
            ccRecipients: p.cc
              ? (Array.isArray(p.cc)
                ? (p.cc as string[]).map((email) => ({ emailAddress: { address: email } }))
                : [{ emailAddress: { address: p.cc } }])
              : undefined,
          },
          saveToSentItems: p.save_to_sent !== false,
        }),
      "messages.reply": (p: Record<string, unknown>) =>
        this.post(`/me/messages/${p.message_id ?? p.id}/reply`, {
          comment: p.comment ?? p.message ?? p.body,
        }),
      "messages.forward": (p: Record<string, unknown>) =>
        this.post(`/me/messages/${p.message_id ?? p.id}/forward`, {
          comment: p.comment ?? p.message,
          toRecipients: Array.isArray(p.to)
            ? (p.to as string[]).map((email) => ({ emailAddress: { address: email } }))
            : [{ emailAddress: { address: p.to } }],
        }),
      "messages.delete": (p: Record<string, unknown>) =>
        this.del(`/me/messages/${p.message_id ?? p.id}`),
      "messages.move": (p: Record<string, unknown>) =>
        this.post(`/me/messages/${p.message_id ?? p.id}/move`, {
          destinationId: p.destination_id ?? p.folder_id,
        }),
      "messages.update": (p: Record<string, unknown>) => {
        const body: Record<string, unknown> = {};
        if (p.is_read !== undefined) body.isRead = p.is_read;
        if (p.flag !== undefined) body.flag = { flagStatus: p.flag };
        if (p.categories) body.categories = p.categories;
        if (p.importance) body.importance = p.importance;
        return this.patch(`/me/messages/${p.message_id ?? p.id}`, body);
      },

      // Folders
      "folders.list": () => this.get("/me/mailFolders"),
      "folders.get": (p: Record<string, unknown>) =>
        this.get(`/me/mailFolders/${p.folder_id ?? p.id}`),
      "folders.create": (p: Record<string, unknown>) =>
        this.post("/me/mailFolders", {
          displayName: p.name ?? p.display_name,
          isHidden: p.is_hidden ?? false,
        }),
      "folders.delete": (p: Record<string, unknown>) =>
        this.del(`/me/mailFolders/${p.folder_id ?? p.id}`),
      "folders.messages": (p: Record<string, unknown>) => {
        const qs: string[] = [];
        qs.push(`$top=${p.top ?? 20}`);
        if (p.filter) qs.push(`$filter=${encodeURIComponent(String(p.filter))}`);
        return this.get(`/me/mailFolders/${p.folder_id ?? p.id}/messages?${qs.join("&")}`);
      },

      // Search
      "search": (p: Record<string, unknown>) => {
        const q = encodeURIComponent(String(p.query ?? p.q));
        const top = p.top ?? 20;
        return this.get(`/me/messages?$search="${q}"&$top=${top}`);
      },

      // Profile
      "profile": () => this.get("/me"),
    };
  }

  // ---------------------------------------------------------------------------
  // Sync — pull latest messages
  // ---------------------------------------------------------------------------

  async sync(resource: string): Promise<unknown> {
    if (resource === "inbox" || resource === "changes") {
      const result = await this.get("/me/messages?$top=20&$orderby=receivedDateTime desc");
      return result.data;
    }
    const result = await this.call("messages.get", { message_id: resource });
    return result.data;
  }

  // ---------------------------------------------------------------------------
  // Webhooks — Microsoft Graph subscriptions with clientState verification
  // ---------------------------------------------------------------------------

  override async webhook(headers: Record<string, string>, body: string): Promise<WebhookEvent> {
    let parsed: { value?: Array<{ clientState?: string; resource?: string; changeType?: string; subscriptionId?: string }> };
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new Error("Invalid JSON in Outlook webhook body");
    }

    const notifications = parsed.value ?? [];
    const first = notifications[0];

    const verified = this.subscriptionSecret
      ? first?.clientState === this.subscriptionSecret
      : false;

    return {
      id: first?.subscriptionId ?? crypto.randomUUID(),
      source: this.name,
      type: `mail.${first?.changeType ?? "unknown"}`,
      data: notifications,
      verified,
      received_at: new Date().toISOString(),
    };
  }
}
