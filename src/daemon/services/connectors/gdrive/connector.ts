/**
 * Google Drive connector — files, folders, permissions, and change notifications.
 *
 * Uses Google Drive API v3. Authenticates via OAuth2 access token.
 * Expects GDRIVE_ACCESS_TOKEN (short-lived) and optionally
 * GDRIVE_REFRESH_TOKEN + GDRIVE_CLIENT_ID + GDRIVE_CLIENT_SECRET for refresh.
 */

import type {
  ConnectorInterface,
  ConnectorResult,
  HealthResult,
  WebhookEvent,
} from "../interface.js";
import { withRetry, withTimeout, refreshToken } from "../middleware.js";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export class GDriveConnector implements ConnectorInterface {
  readonly name = "gdrive";
  readonly version = "1.0.0";

  private accessToken = "";
  private refreshTokenValue = "";
  private clientId = "";
  private clientSecret = "";
  private channelSecret = "";

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async init(): Promise<void> {
    const token = process.env.GDRIVE_ACCESS_TOKEN;
    if (!token) {
      throw new Error("GDRIVE_ACCESS_TOKEN env var is required");
    }
    this.accessToken = token;
    this.refreshTokenValue = process.env.GDRIVE_REFRESH_TOKEN ?? "";
    this.clientId = process.env.GDRIVE_CLIENT_ID ?? "";
    this.clientSecret = process.env.GDRIVE_CLIENT_SECRET ?? "";
    this.channelSecret = process.env.GDRIVE_CHANNEL_SECRET ?? "";
  }

  async health(): Promise<HealthResult> {
    const start = Date.now();
    try {
      const token = await this.getToken();
      const res = await withTimeout(
        () =>
          fetch(`${DRIVE_API}/about?fields=user`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        5000,
      );
      const latency = Date.now() - start;
      if (!res.ok) {
        return { healthy: false, latency_ms: latency, error: `HTTP ${res.status}` };
      }
      return { healthy: true, latency_ms: latency };
    } catch (err) {
      return {
        healthy: false,
        latency_ms: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ---------------------------------------------------------------------------
  // API calls
  // ---------------------------------------------------------------------------

  async call(method: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    const handlers: Record<string, (p: Record<string, unknown>) => Promise<ConnectorResult>> = {
      "files.list": (p) => {
        const q = p.query ? `q=${encodeURIComponent(String(p.query))}&` : "";
        const fields = p.fields ?? "files(id,name,mimeType,modifiedTime,size)";
        return this.get(
          `/files?${q}fields=${encodeURIComponent(String(fields))}&pageSize=${p.page_size ?? 20}`,
        );
      },
      "files.get": (p) => {
        const fields = p.fields ?? "id,name,mimeType,modifiedTime,size,webViewLink";
        return this.get(`/files/${p.file_id}?fields=${encodeURIComponent(String(fields))}`);
      },
      "files.create": (p) =>
        this.post("/files", {
          name: p.name,
          mimeType: p.mimeType,
          parents: p.parents,
        }),
      "files.update": (p) =>
        this.patch(`/files/${p.file_id}`, {
          name: p.name,
          mimeType: p.mimeType,
          addParents: p.addParents,
          removeParents: p.removeParents,
        }),
      "files.delete": (p) => this.del(`/files/${p.file_id}`),
      "files.copy": (p) =>
        this.post(`/files/${p.file_id}/copy`, { name: p.name, parents: p.parents }),
      "files.export": (p) =>
        this.get(`/files/${p.file_id}/export?mimeType=${encodeURIComponent(String(p.mimeType))}`),
      "permissions.list": (p) => this.get(`/files/${p.file_id}/permissions`),
      "permissions.create": (p) =>
        this.post(`/files/${p.file_id}/permissions`, {
          role: p.role ?? "reader",
          type: p.type ?? "user",
          emailAddress: p.email,
        }),
      "permissions.delete": (p) =>
        this.del(`/files/${p.file_id}/permissions/${p.permission_id}`),
      "changes.watch": (p) =>
        this.post("/changes/watch", {
          id: p.channel_id ?? crypto.randomUUID(),
          type: "web_hook",
          address: p.webhook_url,
          token: this.channelSecret,
          expiration: p.expiration,
        }),
    };

    const handler = handlers[method];
    if (!handler) {
      return { ok: false, error: `Unknown Google Drive method: ${method}` };
    }

    return withRetry(() => handler(params), 2, 500);
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

  async webhook(headers: Record<string, string>, body: string): Promise<WebhookEvent> {
    // Google Drive push notifications send minimal headers:
    //   X-Goog-Channel-ID, X-Goog-Resource-ID, X-Goog-Resource-State
    //   X-Goog-Channel-Token (our secret for verification)
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

  // ---------------------------------------------------------------------------
  // Shutdown
  // ---------------------------------------------------------------------------

  async shutdown(): Promise<void> {
    this.accessToken = "";
  }

  // ---------------------------------------------------------------------------
  // Token management
  // ---------------------------------------------------------------------------

  private async getToken(): Promise<string> {
    if (this.accessToken) return this.accessToken;
    if (!this.refreshTokenValue || !this.clientId || !this.clientSecret) {
      throw new Error("No access token and no refresh credentials configured");
    }
    return refreshToken(this.name, () => this.doRefresh());
  }

  private async doRefresh(): Promise<string> {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: this.refreshTokenValue,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }).toString(),
    });

    if (!res.ok) {
      throw new Error(`Google token refresh failed: HTTP ${res.status}`);
    }
    const data = (await res.json()) as { access_token: string };
    this.accessToken = data.access_token;
    return this.accessToken;
  }

  // ---------------------------------------------------------------------------
  // HTTP helpers
  // ---------------------------------------------------------------------------

  private async get(path: string): Promise<ConnectorResult> {
    const token = await this.getToken();
    const res = await fetch(`${DRIVE_API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return this.toResult(res);
  }

  private async post(path: string, body: Record<string, unknown>): Promise<ConnectorResult> {
    const token = await this.getToken();
    const res = await fetch(`${DRIVE_API}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return this.toResult(res);
  }

  private async patch(path: string, body: Record<string, unknown>): Promise<ConnectorResult> {
    const token = await this.getToken();
    const res = await fetch(`${DRIVE_API}${path}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return this.toResult(res);
  }

  private async del(path: string): Promise<ConnectorResult> {
    const token = await this.getToken();
    const res = await fetch(`${DRIVE_API}${path}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    // Drive DELETE returns 204 No Content on success.
    if (res.status === 204) return { ok: true };
    return this.toResult(res);
  }

  private async toResult(res: Response): Promise<ConnectorResult> {
    let data: unknown;
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    if (!res.ok) {
      const msg =
        (data as any)?.error?.message ?? (data as any)?.error ?? `HTTP ${res.status}`;
      return { ok: false, error: msg };
    }
    return { ok: true, data };
  }
}
