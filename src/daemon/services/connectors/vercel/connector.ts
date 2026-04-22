/**
 * Vercel connector — deployments, projects, domains, and webhook handling.
 *
 * Extends ConnectorBase for unified lifecycle, dispatch, and HTTP helpers.
 * Vercel uses Bearer auth with a static token and appends teamId to all URLs.
 */

import { createHmac, timingSafeEqual } from "crypto";
import type { ConnectorResult, WebhookEvent } from "../interface.js";
import { ConnectorBase } from "../base.js";

export class VercelConnector extends ConnectorBase {
  readonly name = "vercel";
  readonly version = "1.0.0";

  protected readonly baseUrl = "https://api.vercel.com";
  protected readonly healthPath = "/v2/user";
  protected readonly label = "Vercel";

  private token = "";
  private teamId = "";
  private webhookSecret = "";

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  override async init(): Promise<void> {
    const token = process.env.VERCEL_TOKEN;
    if (!token) {
      throw new Error("VERCEL_TOKEN env var is required");
    }
    this.token = token;
    this.teamId = process.env.VERCEL_TEAM_ID ?? "";
    this.webhookSecret = process.env.VERCEL_WEBHOOK_SECRET ?? "";
  }

  // ---------------------------------------------------------------------------
  // Auth — static Bearer token
  // ---------------------------------------------------------------------------

  protected async buildAuthHeader(): Promise<string> {
    return `Bearer ${this.token}`;
  }

  // ---------------------------------------------------------------------------
  // URL building — append teamId to all requests
  // ---------------------------------------------------------------------------

  protected override buildUrl(path: string): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (this.teamId) url.searchParams.set("teamId", this.teamId);
    return url.toString();
  }

  // ---------------------------------------------------------------------------
  // Call — handle --team flag as per-request teamId override
  // ---------------------------------------------------------------------------

  override async call(
    method: string,
    params: Record<string, unknown>,
  ): Promise<ConnectorResult> {
    const team = (params.team ?? params.teamId) as string | undefined;
    if (team) {
      this.teamId = team;
      delete params.team;
      delete params.teamId;
    }
    return super.call(method, params);
  }

  // ---------------------------------------------------------------------------
  // Aliases
  // ---------------------------------------------------------------------------

  protected override aliases(): Record<string, string> {
    return {
      deployments: "deployments.list",
      projects: "projects.list",
      domains: "domains.list",
      env: "env.list",
    };
  }

  // ---------------------------------------------------------------------------
  // API method dispatch
  // ---------------------------------------------------------------------------

  protected handlers() {
    return {
      "deployments.list": (p: Record<string, unknown>) => this.get("/v6/deployments", p),
      "deployments.get": (p: Record<string, unknown>) =>
        this.get(`/v13/deployments/${p.id}`),
      "deployments.create": (p: Record<string, unknown>) =>
        this.post("/v13/deployments", {
          name: p.name,
          target: p.target,
          gitSource: p.gitSource,
        }),
      "deployments.promote": (p: Record<string, unknown>) =>
        this.post(`/v13/deployments/${p.id}/promote`, {
          target: p.target ?? "production",
        }),
      "deployments.cancel": (p: Record<string, unknown>) =>
        this.patch(`/v12/deployments/${p.id}/cancel`, {}),
      "deployments.delete": (p: Record<string, unknown>) =>
        this.del(`/v13/deployments/${p.id}`),
      "projects.list": () => this.get("/v9/projects"),
      "projects.get": (p: Record<string, unknown>) =>
        this.get(`/v9/projects/${p.id}`),
      "projects.create": (p: Record<string, unknown>) =>
        this.post("/v9/projects", {
          name: p.name,
          framework: p.framework,
          gitRepository: p.gitRepository,
        }),
      "projects.delete": (p: Record<string, unknown>) =>
        this.del(`/v9/projects/${p.id}`),
      "domains.list": (p: Record<string, unknown>) =>
        this.get(`/v9/projects/${p.project_id}/domains`),
      "domains.add": (p: Record<string, unknown>) =>
        this.post(`/v9/projects/${p.project_id}/domains`, { name: p.domain }),
      "domains.remove": (p: Record<string, unknown>) =>
        this.del(`/v9/projects/${p.project_id}/domains/${p.domain}`),
      "env.list": (p: Record<string, unknown>) =>
        this.get(`/v9/projects/${p.project_id}/env`),
      "env.create": (p: Record<string, unknown>) =>
        this.post(`/v10/projects/${p.project_id}/env`, {
          key: p.key,
          value: p.value,
          target: p.target ?? ["production", "preview", "development"],
          type: p.type ?? "encrypted",
        }),
      "env.delete": (p: Record<string, unknown>) =>
        this.del(`/v9/projects/${p.project_id}/env/${p.id}`),
      "team.get": () => this.get("/v2/teams"),
      "logs.list": (p: Record<string, unknown>) =>
        this.get(`/v2/deployments/${p.id}/events`),
    };
  }

  // ---------------------------------------------------------------------------
  // Webhooks — HMAC-SHA1 verification
  // ---------------------------------------------------------------------------

  override async webhook(
    headers: Record<string, string>,
    body: string,
  ): Promise<WebhookEvent> {
    const signature = headers["x-vercel-signature"] ?? "";
    const verified = this.verifySignature(body, signature);

    let parsed: { id?: string; type?: string; payload?: unknown };
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new Error("Invalid JSON in Vercel webhook body");
    }

    return {
      id: parsed.id ?? crypto.randomUUID(),
      source: this.name,
      type: parsed.type ?? "unknown",
      data: parsed.payload ?? parsed,
      verified,
      received_at: new Date().toISOString(),
    };
  }

  private verifySignature(body: string, signature: string): boolean {
    if (!this.webhookSecret || !signature) return false;
    const expected = createHmac("sha1", this.webhookSecret)
      .update(body)
      .digest("hex");
    if (expected.length !== signature.length) return false;
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }
}
