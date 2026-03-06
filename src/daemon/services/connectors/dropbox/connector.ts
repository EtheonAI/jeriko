/**
 * Dropbox connector — files, folders, sharing, and users.
 *
 * Extends BearerConnector for OAuth2 Bearer token auth with refresh.
 * Dropbox uses standard OAuth 2.0 with refresh tokens.
 * Most endpoints use RPC-style POST with JSON bodies.
 */

import { BearerConnector } from "../base.js";
import type { ConnectorResult } from "../interface.js";

export class DropboxConnector extends BearerConnector {
  readonly name = "dropbox";
  readonly version = "1.0.0";

  protected readonly auth = {
    baseUrl: "https://api.dropboxapi.com/2",
    tokenVar: "DROPBOX_ACCESS_TOKEN",
    refreshTokenVar: "DROPBOX_REFRESH_TOKEN",
    clientIdVar: "DROPBOX_OAUTH_CLIENT_ID",
    clientSecretVar: "DROPBOX_OAUTH_CLIENT_SECRET",
    tokenUrl: "https://api.dropboxapi.com/oauth2/token",
    healthPath: "/check/user",
    label: "Dropbox",
  };

  // ---------------------------------------------------------------------------
  // Health — Dropbox /check/user is POST with a query param
  // ---------------------------------------------------------------------------

  override async health(): Promise<import("../interface.js").HealthResult> {
    const start = Date.now();
    try {
      const result = await this.post("/check/user", { query: "jeriko" });
      const latency = Date.now() - start;
      return result.ok
        ? { healthy: true, latency_ms: latency }
        : { healthy: false, latency_ms: latency, error: result.error };
    } catch (err) {
      return { healthy: false, latency_ms: Date.now() - start, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // ---------------------------------------------------------------------------
  // Aliases
  // ---------------------------------------------------------------------------

  protected override aliases(): Record<string, string> {
    return {
      files: "files.list",
      folders: "files.list",
      sharing: "sharing.list",
    };
  }

  // ---------------------------------------------------------------------------
  // API method dispatch — Dropbox API v2
  // ---------------------------------------------------------------------------

  protected handlers() {
    return {
      // Files
      "files.list": (p: Record<string, unknown>) =>
        this.post("/files/list_folder", { path: p.path ?? "", limit: p.limit ?? 100, recursive: p.recursive }),
      "files.list_continue": (p: Record<string, unknown>) =>
        this.post("/files/list_folder/continue", { cursor: p.cursor }),
      "files.get_metadata": (p: Record<string, unknown>) =>
        this.post("/files/get_metadata", { path: String(p.path ?? p.id) }),
      "files.search": (p: Record<string, unknown>) =>
        this.post("/files/search_v2", { query: p.query, options: { max_results: p.limit ?? 20, path: p.path } }),
      "files.copy": (p: Record<string, unknown>) =>
        this.post("/files/copy_v2", { from_path: p.from_path, to_path: p.to_path }),
      "files.move": (p: Record<string, unknown>) =>
        this.post("/files/move_v2", { from_path: p.from_path, to_path: p.to_path }),
      "files.delete": (p: Record<string, unknown>) =>
        this.post("/files/delete_v2", { path: String(p.path ?? p.id) }),
      "files.create_folder": (p: Record<string, unknown>) =>
        this.post("/files/create_folder_v2", { path: String(p.path) }),

      // Sharing
      "sharing.list": (p: Record<string, unknown>) =>
        this.post("/sharing/list_shared_links", { path: p.path }),
      "sharing.create_link": (p: Record<string, unknown>) =>
        this.post("/sharing/create_shared_link_with_settings", { path: String(p.path), settings: p.settings }),
      "sharing.list_folders": () =>
        this.post("/sharing/list_folders", {}),
      "sharing.list_members": (p: Record<string, unknown>) =>
        this.post("/sharing/list_folder_members", { shared_folder_id: String(p.id) }),

      // Users
      "users.me": () =>
        this.post("/users/get_current_account", {}),
      "users.space": () =>
        this.post("/users/get_space_usage", {}),
    };
  }
}
