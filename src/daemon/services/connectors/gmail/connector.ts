/**
 * Gmail connector — messages, labels, drafts, threads, and push notifications.
 *
 * Extends BearerConnector for unified auth, HTTP, health, and dispatch.
 * Only implements handlers() + custom webhook/sync.
 */

import { BearerConnector } from "../base.js";
import type { ConnectorResult, WebhookEvent } from "../interface.js";

export class GmailConnector extends BearerConnector {
  readonly name = "gmail";
  readonly version = "1.0.0";

  protected readonly auth = {
    baseUrl: "https://gmail.googleapis.com/gmail/v1",
    tokenVar: "GMAIL_ACCESS_TOKEN",
    refreshTokenVar: "GMAIL_REFRESH_TOKEN",
    clientIdVar: "GMAIL_OAUTH_CLIENT_ID",
    clientSecretVar: "GMAIL_OAUTH_CLIENT_SECRET",
    tokenUrl: "https://oauth2.googleapis.com/token",
    healthPath: "/users/me/profile",
    label: "Gmail",
  };

  // ---------------------------------------------------------------------------
  // Aliases — single-word shortcuts
  // ---------------------------------------------------------------------------

  protected override aliases(): Record<string, string> {
    return {
      messages: "messages.list",
      labels: "labels.list",
      drafts: "drafts.list",
      threads: "threads.list",
      history: "history.list",
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
        if (p.q) qs.push(`q=${encodeURIComponent(String(p.q))}`);
        if (p.query) qs.push(`q=${encodeURIComponent(String(p.query))}`);
        qs.push(`maxResults=${p.max_results ?? 20}`);
        if (p.label_ids) qs.push(`labelIds=${encodeURIComponent(String(p.label_ids))}`);
        if (p.page_token) qs.push(`pageToken=${encodeURIComponent(String(p.page_token))}`);
        return this.get(`/users/me/messages?${qs.join("&")}`);
      },
      "messages.get": (p: Record<string, unknown>) => {
        const format = p.format ?? "full";
        return this.get(`/users/me/messages/${p.message_id ?? p.id}?format=${format}`);
      },
      "messages.send": (p: Record<string, unknown>) =>
        this.post("/users/me/messages/send", { raw: p.raw }),
      "messages.delete": (p: Record<string, unknown>) =>
        this.del(`/users/me/messages/${p.message_id ?? p.id}`),
      "messages.trash": (p: Record<string, unknown>) =>
        this.post(`/users/me/messages/${p.message_id ?? p.id}/trash`, {}),
      "messages.untrash": (p: Record<string, unknown>) =>
        this.post(`/users/me/messages/${p.message_id ?? p.id}/untrash`, {}),
      "messages.modify": (p: Record<string, unknown>) =>
        this.post(`/users/me/messages/${p.message_id ?? p.id}/modify`, {
          addLabelIds: p.add_label_ids ?? [],
          removeLabelIds: p.remove_label_ids ?? [],
        }),

      // Labels
      "labels.list": () => this.get("/users/me/labels"),
      "labels.get": (p: Record<string, unknown>) =>
        this.get(`/users/me/labels/${p.label_id ?? p.id}`),
      "labels.create": (p: Record<string, unknown>) =>
        this.post("/users/me/labels", {
          name: p.name,
          labelListVisibility: p.visibility ?? "labelShow",
          messageListVisibility: p.message_visibility ?? "show",
        }),
      "labels.delete": (p: Record<string, unknown>) =>
        this.del(`/users/me/labels/${p.label_id ?? p.id}`),

      // Drafts
      "drafts.list": (p: Record<string, unknown>) =>
        this.get(`/users/me/drafts?maxResults=${p.max_results ?? 20}`),
      "drafts.get": (p: Record<string, unknown>) =>
        this.get(`/users/me/drafts/${p.draft_id ?? p.id}`),
      "drafts.create": (p: Record<string, unknown>) =>
        this.post("/users/me/drafts", { message: { raw: p.raw } }),
      "drafts.send": (p: Record<string, unknown>) =>
        this.post("/users/me/drafts/send", { id: p.draft_id ?? p.id }),
      "drafts.delete": (p: Record<string, unknown>) =>
        this.del(`/users/me/drafts/${p.draft_id ?? p.id}`),

      // Threads
      "threads.list": (p: Record<string, unknown>) => {
        const qs: string[] = [];
        if (p.q) qs.push(`q=${encodeURIComponent(String(p.q))}`);
        if (p.query) qs.push(`q=${encodeURIComponent(String(p.query))}`);
        qs.push(`maxResults=${p.max_results ?? 20}`);
        return this.get(`/users/me/threads?${qs.join("&")}`);
      },
      "threads.get": (p: Record<string, unknown>) =>
        this.get(`/users/me/threads/${p.thread_id ?? p.id}`),
      "threads.trash": (p: Record<string, unknown>) =>
        this.post(`/users/me/threads/${p.thread_id ?? p.id}/trash`, {}),

      // Profile
      "profile": () => this.get("/users/me/profile"),

      // History (for sync)
      "history.list": (p: Record<string, unknown>) => {
        const qs: string[] = [];
        if (p.start_history_id) qs.push(`startHistoryId=${p.start_history_id}`);
        qs.push(`maxResults=${p.max_results ?? 100}`);
        return this.get(`/users/me/history?${qs.join("&")}`);
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Sync — incremental via history.list
  // ---------------------------------------------------------------------------

  async sync(resource: string): Promise<unknown> {
    if (resource === "history" || resource === "changes") {
      const result = await this.call("history.list", {});
      return result.data;
    }
    const result = await this.call("messages.get", { message_id: resource });
    return result.data;
  }

  // ---------------------------------------------------------------------------
  // Webhooks — Gmail push via Cloud Pub/Sub
  // ---------------------------------------------------------------------------

  override async webhook(headers: Record<string, string>, body: string): Promise<WebhookEvent> {
    let parsed: { message?: { data?: string; messageId?: string; publishTime?: string }; subscription?: string };
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new Error("Invalid JSON in Gmail webhook body");
    }

    const message = parsed.message;
    let decodedData: unknown = {};
    if (message?.data) {
      try {
        const decoded = Buffer.from(message.data, "base64").toString("utf-8");
        decodedData = JSON.parse(decoded);
      } catch {
        decodedData = message.data;
      }
    }

    const verified = !!headers["authorization"];

    return {
      id: message?.messageId ?? crypto.randomUUID(),
      source: this.name,
      type: "gmail.push",
      data: decodedData,
      verified,
      received_at: new Date().toISOString(),
    };
  }
}
