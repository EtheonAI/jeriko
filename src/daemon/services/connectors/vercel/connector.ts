/**
 * Vercel connector — deployments, projects, domains, and webhook handling.
 */

import { createHmac, timingSafeEqual } from "crypto";
import type {
  ConnectorInterface,
  ConnectorResult,
  HealthResult,
  WebhookEvent,
} from "../interface.js";
import { withRetry, withTimeout } from "../middleware.js";

const VERCEL_API = "https://api.vercel.com";

export class VercelConnector implements ConnectorInterface {
  readonly name = "vercel";
  readonly version = "1.0.0";

  private token = "";
  private teamId = "";
  private webhookSecret = "";

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async init(): Promise<void> {
    const token = process.env.VERCEL_TOKEN;
    if (!token) {
      throw new Error("VERCEL_TOKEN env var is required");
    }
    this.token = token;
    this.teamId = process.env.VERCEL_TEAM_ID ?? "";
    this.webhookSecret = process.env.VERCEL_WEBHOOK_SECRET ?? "";
  }

  async health(): Promise<HealthResult> {
    const start = Date.now();
    try {
      const res = await withTimeout(
        () =>
          fetch(`${VERCEL_API}/v2/user`, {
            headers: this.headers(),
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
    // Aliases — resolve before handler lookup
    const aliases: Record<string, string> = {
      deployments: "deployments.list",
      projects: "projects.list",
      domains: "domains.list",
      env: "env.list",
    };
    method = aliases[method] ?? method;

    const handlers: Record<string, (p: Record<string, unknown>) => Promise<ConnectorResult>> = {
      "deployments.list": (p) => this.get(`/v6/deployments`, p),
      "deployments.get": (p) => this.get(`/v13/deployments/${p.id}`),
      "deployments.create": (p) =>
        this.post("/v13/deployments", {
          name: p.name,
          target: p.target,
          gitSource: p.gitSource,
        }),
      "deployments.cancel": (p) =>
        this.patch(`/v12/deployments/${p.id}/cancel`, {}),
      "deployments.delete": (p) => this.del(`/v13/deployments/${p.id}`),
      "projects.list": () => this.get("/v9/projects"),
      "projects.get": (p) => this.get(`/v9/projects/${p.id}`),
      "projects.create": (p) =>
        this.post("/v9/projects", {
          name: p.name,
          framework: p.framework,
          gitRepository: p.gitRepository,
        }),
      "projects.delete": (p) => this.del(`/v9/projects/${p.id}`),
      "domains.list": (p) => this.get(`/v9/projects/${p.project_id}/domains`),
      "domains.add": (p) =>
        this.post(`/v9/projects/${p.project_id}/domains`, { name: p.domain }),
      "domains.remove": (p) =>
        this.del(`/v9/projects/${p.project_id}/domains/${p.domain}`),
      "env.list": (p) => this.get(`/v9/projects/${p.project_id}/env`),
      "env.create": (p) =>
        this.post(`/v10/projects/${p.project_id}/env`, {
          key: p.key,
          value: p.value,
          target: p.target ?? ["production", "preview", "development"],
          type: p.type ?? "encrypted",
        }),
      "env.delete": (p) => this.del(`/v9/projects/${p.project_id}/env/${p.id}`),
      "team.get": () => this.get("/v2/teams"),
      "logs.list": (p) => this.get(`/v2/deployments/${p.id}/events`),
    };

    const handler = handlers[method];
    if (!handler) {
      return { ok: false, error: `Unknown Vercel method: ${method}` };
    }

    return withRetry(() => handler(params), 2, 500);
  }

  // ---------------------------------------------------------------------------
  // Webhooks — HMAC-SHA1 verification
  // ---------------------------------------------------------------------------

  async webhook(headers: Record<string, string>, body: string): Promise<WebhookEvent> {
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
    const expected = createHmac("sha1", this.webhookSecret).update(body).digest("hex");
    if (expected.length !== signature.length) return false;
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }

  // ---------------------------------------------------------------------------
  // Shutdown
  // ---------------------------------------------------------------------------

  async shutdown(): Promise<void> {
    // Stateless HTTP — nothing to tear down.
  }

  // ---------------------------------------------------------------------------
  // HTTP helpers
  // ---------------------------------------------------------------------------

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.token}` };
  }

  private teamParam(): string {
    return this.teamId ? `teamId=${this.teamId}` : "";
  }

  private buildUrl(path: string, params?: Record<string, unknown>): string {
    const url = new URL(`${VERCEL_API}${path}`);
    if (this.teamId) url.searchParams.set("teamId", this.teamId);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && k !== "id" && k !== "project_id" && k !== "domain") {
          url.searchParams.set(k, String(v));
        }
      }
    }
    return url.toString();
  }

  private async get(path: string, params?: Record<string, unknown>): Promise<ConnectorResult> {
    const res = await fetch(this.buildUrl(path, params), { headers: this.headers() });
    return this.toResult(res);
  }

  private async post(path: string, body: Record<string, unknown>): Promise<ConnectorResult> {
    const res = await fetch(this.buildUrl(path), {
      method: "POST",
      headers: { ...this.headers(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return this.toResult(res);
  }

  private async patch(path: string, body: Record<string, unknown>): Promise<ConnectorResult> {
    const res = await fetch(this.buildUrl(path), {
      method: "PATCH",
      headers: { ...this.headers(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return this.toResult(res);
  }

  private async del(path: string): Promise<ConnectorResult> {
    const res = await fetch(this.buildUrl(path), {
      method: "DELETE",
      headers: this.headers(),
    });
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
      const msg = (data as any)?.error?.message ?? `HTTP ${res.status}`;
      return { ok: false, error: msg };
    }
    return { ok: true, data };
  }
}
