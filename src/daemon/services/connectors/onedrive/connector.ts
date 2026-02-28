/**
 * OneDrive connector — files, folders, sharing, and change notifications.
 *
 * Uses Microsoft Graph API v1.0. Authenticates via OAuth2 access token.
 */

import type {
  ConnectorInterface,
  ConnectorResult,
  HealthResult,
  WebhookEvent,
} from "../interface.js";
import { withRetry, withTimeout, refreshToken } from "../middleware.js";

const GRAPH_API = "https://graph.microsoft.com/v1.0";
const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

export class OneDriveConnector implements ConnectorInterface {
  readonly name = "onedrive";
  readonly version = "1.0.0";

  private accessToken = "";
  private refreshTokenValue = "";
  private clientId = "";
  private clientSecret = "";
  private subscriptionSecret = "";

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async init(): Promise<void> {
    const token = process.env.ONEDRIVE_ACCESS_TOKEN;
    if (!token) {
      throw new Error("ONEDRIVE_ACCESS_TOKEN env var is required");
    }
    this.accessToken = token;
    this.refreshTokenValue = process.env.ONEDRIVE_REFRESH_TOKEN ?? "";
    this.clientId = process.env.ONEDRIVE_CLIENT_ID ?? "";
    this.clientSecret = process.env.ONEDRIVE_CLIENT_SECRET ?? "";
    this.subscriptionSecret = process.env.ONEDRIVE_SUBSCRIPTION_SECRET ?? "";
  }

  async health(): Promise<HealthResult> {
    const start = Date.now();
    try {
      const token = await this.getToken();
      const res = await withTimeout(
        () =>
          fetch(`${GRAPH_API}/me/drive`, {
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
        const path = p.folder_path ? `:${p.folder_path}:/children` : "/root/children";
        const select = p.select ?? "id,name,size,lastModifiedDateTime,file,folder";
        return this.get(`/me/drive${path}?$select=${select}&$top=${p.top ?? 20}`);
      },
      "files.get": (p) => this.get(`/me/drive/items/${p.item_id}`),
      "files.get_by_path": (p) =>
        this.get(`/me/drive/root:${p.path}`),
      "files.create_folder": (p) =>
        this.post(`/me/drive/items/${p.parent_id ?? "root"}/children`, {
          name: p.name,
          folder: {},
          "@microsoft.graph.conflictBehavior": p.conflict ?? "rename",
        }),
      "files.copy": (p) =>
        this.post(`/me/drive/items/${p.item_id}/copy`, {
          name: p.name,
          parentReference: { id: p.destination_id },
        }),
      "files.move": (p) =>
        this.patch(`/me/drive/items/${p.item_id}`, {
          parentReference: { id: p.destination_id },
          name: p.name,
        }),
      "files.delete": (p) => this.del(`/me/drive/items/${p.item_id}`),
      "files.search": (p) =>
        this.get(`/me/drive/root/search(q='${encodeURIComponent(String(p.query))}')?$top=${p.top ?? 20}`),
      "sharing.create_link": (p) =>
        this.post(`/me/drive/items/${p.item_id}/createLink`, {
          type: p.type ?? "view",
          scope: p.scope ?? "anonymous",
        }),
      "sharing.list": (p) =>
        this.get(`/me/drive/items/${p.item_id}/permissions`),
      "subscriptions.create": (p) =>
        this.post("/subscriptions", {
          changeType: p.change_type ?? "updated",
          notificationUrl: p.webhook_url,
          resource: p.resource ?? "/me/drive/root",
          expirationDateTime: p.expiration,
          clientState: this.subscriptionSecret || undefined,
        }),
      "subscriptions.list": () => this.get("/subscriptions"),
      "subscriptions.delete": (p) => this.del(`/subscriptions/${p.subscription_id}`),
      "delta": (p) => {
        const deltaToken = p.delta_token ? `?token=${p.delta_token}` : "";
        return this.get(`/me/drive/root/delta${deltaToken}`);
      },
    };

    const handler = handlers[method];
    if (!handler) {
      return { ok: false, error: `Unknown OneDrive method: ${method}` };
    }

    return withRetry(() => handler(params), 2, 500);
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

  async webhook(headers: Record<string, string>, body: string): Promise<WebhookEvent> {
    let parsed: { value?: Array<{ clientState?: string; resource?: string; changeType?: string; subscriptionId?: string }> };
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new Error("Invalid JSON in OneDrive webhook body");
    }

    // Microsoft sends a validation request with ?validationToken=<token>.
    // That must be handled at the HTTP layer (return the token as text/plain).
    // Here we handle actual change notifications.

    const notifications = parsed.value ?? [];
    const first = notifications[0];

    // Verify clientState if configured.
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
        scope: "Files.ReadWrite.All offline_access",
      }).toString(),
    });

    if (!res.ok) {
      throw new Error(`Microsoft token refresh failed: HTTP ${res.status}`);
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
    const res = await fetch(`${GRAPH_API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return this.toResult(res);
  }

  private async post(path: string, body: Record<string, unknown>): Promise<ConnectorResult> {
    const token = await this.getToken();
    const res = await fetch(`${GRAPH_API}${path}`, {
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
    const res = await fetch(`${GRAPH_API}${path}`, {
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
    const res = await fetch(`${GRAPH_API}${path}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
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
