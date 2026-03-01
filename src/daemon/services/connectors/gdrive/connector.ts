/**
 * Google Drive connector — files, folders, permissions, and change notifications.
 *
 * Extends BearerConnector for unified auth, HTTP, health, and dispatch.
 * Only implements handlers() + custom webhook/sync.
 */

import { BearerConnector } from "../base.js";
import type { ConnectorResult, WebhookEvent } from "../interface.js";

export class GDriveConnector extends BearerConnector {
  readonly name = "gdrive";
  readonly version = "1.0.0";

  protected readonly auth = {
    baseUrl: "https://www.googleapis.com/drive/v3",
    tokenVar: "GDRIVE_ACCESS_TOKEN",
    refreshTokenVar: "GDRIVE_REFRESH_TOKEN",
    clientIdVar: "GDRIVE_OAUTH_CLIENT_ID",
    clientSecretVar: "GDRIVE_OAUTH_CLIENT_SECRET",
    tokenUrl: "https://oauth2.googleapis.com/token",
    healthPath: "/about?fields=user",
    label: "Google Drive",
  };

  private channelSecret = "";

  override async init(): Promise<void> {
    await super.init();
    this.channelSecret = process.env.GDRIVE_CHANNEL_SECRET ?? "";
  }

  // ---------------------------------------------------------------------------
  // Aliases — single-word shortcuts
  // ---------------------------------------------------------------------------

  protected override aliases(): Record<string, string> {
    return {
      files: "files.list",
      permissions: "permissions.list",
    };
  }

  // ---------------------------------------------------------------------------
  // API method dispatch
  // ---------------------------------------------------------------------------

  protected handlers() {
    return {
      "files.list": (p: Record<string, unknown>) => {
        const q = p.query ? `q=${encodeURIComponent(String(p.query))}&` : "";
        const fields = p.fields ?? "files(id,name,mimeType,modifiedTime,size)";
        return this.get(
          `/files?${q}fields=${encodeURIComponent(String(fields))}&pageSize=${p.page_size ?? 20}`,
        );
      },
      "files.get": (p: Record<string, unknown>) => {
        const fields = p.fields ?? "id,name,mimeType,modifiedTime,size,webViewLink";
        return this.get(`/files/${p.file_id ?? p.id}?fields=${encodeURIComponent(String(fields))}`);
      },
      "files.create": (p: Record<string, unknown>) =>
        this.post("/files", {
          name: p.name,
          mimeType: p.mimeType,
          parents: p.parents,
        }),
      "files.update": (p: Record<string, unknown>) =>
        this.patch(`/files/${p.file_id ?? p.id}`, {
          name: p.name,
          mimeType: p.mimeType,
          addParents: p.addParents,
          removeParents: p.removeParents,
        }),
      "files.delete": (p: Record<string, unknown>) => this.del(`/files/${p.file_id ?? p.id}`),
      "files.copy": (p: Record<string, unknown>) =>
        this.post(`/files/${p.file_id ?? p.id}/copy`, { name: p.name, parents: p.parents }),
      "files.export": (p: Record<string, unknown>) =>
        this.get(`/files/${p.file_id ?? p.id}/export?mimeType=${encodeURIComponent(String(p.mimeType))}`),
      "permissions.list": (p: Record<string, unknown>) =>
        this.get(`/files/${p.file_id ?? p.id}/permissions`),
      "permissions.create": (p: Record<string, unknown>) =>
        this.post(`/files/${p.file_id ?? p.id}/permissions`, {
          role: p.role ?? "reader",
          type: p.type ?? "user",
          emailAddress: p.email,
        }),
      "permissions.delete": (p: Record<string, unknown>) =>
        this.del(`/files/${p.file_id ?? p.id}/permissions/${p.permission_id}`),
      "changes.watch": (p: Record<string, unknown>) =>
        this.post("/changes/watch", {
          id: p.channel_id ?? crypto.randomUUID(),
          type: "web_hook",
          address: p.webhook_url,
          token: this.channelSecret,
          expiration: p.expiration,
        }),
    };
  }

  // ---------------------------------------------------------------------------
  // Sync — pull latest changes
  // ---------------------------------------------------------------------------

  async sync(resource: string): Promise<unknown> {
    if (resource === "changes") {
      const result = await this.get("/changes?pageToken=1&fields=changes(fileId,file(name,mimeType,modifiedTime))");
      return result.data;
    }
    return this.call("files.get", { file_id: resource }).then((r) => r.data);
  }

  // ---------------------------------------------------------------------------
  // Webhooks — Google push notification channels
  // ---------------------------------------------------------------------------

  override async webhook(headers: Record<string, string>, body: string): Promise<WebhookEvent> {
    const channelToken = headers["x-goog-channel-token"] ?? "";
    const verified = this.channelSecret
      ? channelToken === this.channelSecret
      : false;

    const resourceState = headers["x-goog-resource-state"] ?? "unknown";
    const resourceId = headers["x-goog-resource-id"] ?? "";

    let parsed: unknown;
    try {
      parsed = body ? JSON.parse(body) : {};
    } catch {
      parsed = {};
    }

    return {
      id: headers["x-goog-channel-id"] ?? crypto.randomUUID(),
      source: this.name,
      type: `drive.${resourceState}`,
      data: { resource_id: resourceId, body: parsed },
      verified,
      received_at: new Date().toISOString(),
    };
  }
}
