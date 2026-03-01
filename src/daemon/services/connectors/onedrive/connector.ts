/**
 * OneDrive connector — files, folders, sharing, and change notifications.
 *
 * Extends BearerConnector for unified auth, HTTP, health, and dispatch.
 * Only implements handlers() + custom webhook/sync.
 */

import { BearerConnector } from "../base.js";
import type { ConnectorResult, WebhookEvent } from "../interface.js";

export class OneDriveConnector extends BearerConnector {
  readonly name = "onedrive";
  readonly version = "1.0.0";

  protected readonly auth = {
    baseUrl: "https://graph.microsoft.com/v1.0",
    tokenVar: "ONEDRIVE_ACCESS_TOKEN",
    refreshTokenVar: "ONEDRIVE_REFRESH_TOKEN",
    clientIdVar: "ONEDRIVE_OAUTH_CLIENT_ID",
    clientSecretVar: "ONEDRIVE_OAUTH_CLIENT_SECRET",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    refreshScope: "Files.ReadWrite.All offline_access",
    healthPath: "/me/drive",
    label: "OneDrive",
  };

  private subscriptionSecret = "";

  override async init(): Promise<void> {
    await super.init();
    this.subscriptionSecret = process.env.ONEDRIVE_SUBSCRIPTION_SECRET ?? "";
  }

  // ---------------------------------------------------------------------------
  // Aliases — single-word shortcuts
  // ---------------------------------------------------------------------------

  protected override aliases(): Record<string, string> {
    return {
      files: "files.list",
      sharing: "sharing.list",
      subscriptions: "subscriptions.list",
    };
  }

  // ---------------------------------------------------------------------------
  // API method dispatch
  // ---------------------------------------------------------------------------

  protected handlers() {
    return {
      "files.list": (p: Record<string, unknown>) => {
        const path = p.folder_path ? `:${p.folder_path}:/children` : "/root/children";
        const select = p.select ?? "id,name,size,lastModifiedDateTime,file,folder";
        return this.get(`/me/drive${path}?$select=${select}&$top=${p.top ?? 20}`);
      },
      "files.get": (p: Record<string, unknown>) =>
        this.get(`/me/drive/items/${p.item_id ?? p.id}`),
      "files.get_by_path": (p: Record<string, unknown>) =>
        this.get(`/me/drive/root:${p.path}`),
      "files.create_folder": (p: Record<string, unknown>) =>
        this.post(`/me/drive/items/${p.parent_id ?? "root"}/children`, {
          name: p.name,
          folder: {},
          "@microsoft.graph.conflictBehavior": p.conflict ?? "rename",
        }),
      "files.copy": (p: Record<string, unknown>) =>
        this.post(`/me/drive/items/${p.item_id ?? p.id}/copy`, {
          name: p.name,
          parentReference: { id: p.destination_id },
        }),
      "files.move": (p: Record<string, unknown>) =>
        this.patch(`/me/drive/items/${p.item_id ?? p.id}`, {
          parentReference: { id: p.destination_id },
          name: p.name,
        }),
      "files.delete": (p: Record<string, unknown>) =>
        this.del(`/me/drive/items/${p.item_id ?? p.id}`),
      "files.search": (p: Record<string, unknown>) =>
        this.get(`/me/drive/root/search(q='${encodeURIComponent(String(p.query))}')?$top=${p.top ?? 20}`),
      "sharing.create_link": (p: Record<string, unknown>) =>
        this.post(`/me/drive/items/${p.item_id ?? p.id}/createLink`, {
          type: p.type ?? "view",
          scope: p.scope ?? "anonymous",
        }),
      "sharing.list": (p: Record<string, unknown>) =>
        this.get(`/me/drive/items/${p.item_id ?? p.id}/permissions`),
      "subscriptions.create": (p: Record<string, unknown>) =>
        this.post("/subscriptions", {
          changeType: p.change_type ?? "updated",
          notificationUrl: p.webhook_url,
          resource: p.resource ?? "/me/drive/root",
          expirationDateTime: p.expiration,
          clientState: this.subscriptionSecret || undefined,
        }),
      "subscriptions.list": () => this.get("/subscriptions"),
      "subscriptions.delete": (p: Record<string, unknown>) =>
        this.del(`/subscriptions/${p.subscription_id}`),
      "delta": (p: Record<string, unknown>) => {
        const deltaToken = p.delta_token ? `?token=${p.delta_token}` : "";
        return this.get(`/me/drive/root/delta${deltaToken}`);
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Sync — pull latest changes via delta
  // ---------------------------------------------------------------------------

  async sync(resource: string): Promise<unknown> {
    if (resource === "delta" || resource === "changes") {
      const result = await this.get("/me/drive/root/delta");
      return result.data;
    }
    const result = await this.call("files.get", { item_id: resource });
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
      throw new Error("Invalid JSON in OneDrive webhook body");
    }

    const notifications = parsed.value ?? [];
    const first = notifications[0];

    const verified = this.subscriptionSecret
      ? first?.clientState === this.subscriptionSecret
      : false;

    return {
      id: first?.subscriptionId ?? crypto.randomUUID(),
      source: this.name,
      type: `drive.${first?.changeType ?? "unknown"}`,
      data: notifications,
      verified,
      received_at: new Date().toISOString(),
    };
  }
}
