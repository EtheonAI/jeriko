/**
 * GitHub connector — repos, issues, PRs, actions, and webhook handling.
 */

import { createHmac, timingSafeEqual } from "crypto";
import type {
  ConnectorInterface,
  ConnectorResult,
  HealthResult,
  WebhookEvent,
} from "../interface.js";
import { withRetry, withTimeout } from "../middleware.js";

const GITHUB_API = "https://api.github.com";

export class GitHubConnector implements ConnectorInterface {
  readonly name = "github";
  readonly version = "1.0.0";

  private token = "";
  private webhookSecret = "";

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async init(): Promise<void> {
    const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
    if (!token) {
      throw new Error("GITHUB_TOKEN or GH_TOKEN env var is required");
    }
    this.token = token;
    this.webhookSecret = process.env.GITHUB_WEBHOOK_SECRET ?? "";
  }

  async health(): Promise<HealthResult> {
    const start = Date.now();
    try {
      const res = await withTimeout(
        () =>
          fetch(`${GITHUB_API}/rate_limit`, {
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
      repos: "repos.list",
      issues: "issues.list",
      pulls: "pulls.list",
      actions: "actions.list_runs",
      releases: "releases.list",
      gists: "gists.list",
    };
    method = aliases[method] ?? method;

    const p = { ...params };

    // Allow repo in "owner/repo" format
    if (typeof p.repo === "string" && p.repo.includes("/") && !p.owner) {
      const [owner, repo] = (p.repo as string).split("/", 2);
      p.owner = owner;
      p.repo = repo;
    }

    const handlers: Record<string, (p: Record<string, unknown>) => Promise<ConnectorResult>> = {
      "repos.get": (p) => this.get(`/repos/${p.owner}/${p.repo}`),
      "repos.list": () => this.get("/user/repos"),
      "repos.create": (p) =>
        this.post("/user/repos", {
          name: p.name,
          description: p.description,
          private: p.private ?? true,
        }),
      "issues.list": (p) => this.get(`/repos/${p.owner}/${p.repo}/issues`),
      "issues.create": (p) =>
        this.post(`/repos/${p.owner}/${p.repo}/issues`, {
          title: p.title,
          body: p.body,
          labels: p.labels,
          assignees: p.assignees,
        }),
      "issues.get": (p) => this.get(`/repos/${p.owner}/${p.repo}/issues/${p.number}`),
      "issues.update": (p) =>
        this.patch(`/repos/${p.owner}/${p.repo}/issues/${p.number}`, {
          title: p.title,
          body: p.body,
          state: p.state,
        }),
      "pulls.list": (p) => this.get(`/repos/${p.owner}/${p.repo}/pulls`),
      "pulls.create": (p) =>
        this.post(`/repos/${p.owner}/${p.repo}/pulls`, {
          title: p.title,
          body: p.body,
          head: p.head,
          base: p.base,
        }),
      "pulls.get": (p) => this.get(`/repos/${p.owner}/${p.repo}/pulls/${p.number}`),
      "pulls.merge": (p) =>
        this.put(`/repos/${p.owner}/${p.repo}/pulls/${p.number}/merge`, {
          merge_method: p.merge_method ?? "squash",
        }),
      "actions.list_runs": (p) =>
        this.get(`/repos/${p.owner}/${p.repo}/actions/runs`),
      "actions.trigger": (p) =>
        this.post(`/repos/${p.owner}/${p.repo}/actions/workflows/${p.workflow_id}/dispatches`, {
          ref: p.ref ?? "main",
          inputs: p.inputs,
        }),
      "releases.list": (p) => this.get(`/repos/${p.owner}/${p.repo}/releases`),
      "releases.create": (p) =>
        this.post(`/repos/${p.owner}/${p.repo}/releases`, {
          tag_name: p.tag_name,
          name: p.name,
          body: p.body,
          draft: p.draft,
          prerelease: p.prerelease,
        }),
      "search.repos": (p) =>
        this.get(`/search/repositories?q=${encodeURIComponent(String(p.query))}&per_page=${p.per_page ?? 10}`),
      "search.issues": (p) =>
        this.get(`/search/issues?q=${encodeURIComponent(String(p.query))}&per_page=${p.per_page ?? 10}`),
      "search.code": (p) =>
        this.get(`/search/code?q=${encodeURIComponent(String(p.query))}&per_page=${p.per_page ?? 10}`),
      "gists.list": () => this.get("/gists"),
      "gists.create": (p) =>
        this.post("/gists", {
          description: p.description,
          public: p.public ?? false,
          files: p.files,
        }),
      "gists.get": (p) => this.get(`/gists/${p.id}`),
    };

    const handler = handlers[method];
    if (!handler) {
      return { ok: false, error: `Unknown GitHub method: ${method}` };
    }

    return withRetry(() => handler(p), 2, 500);
  }

  // ---------------------------------------------------------------------------
  // Webhooks — HMAC-SHA256 verification
  // ---------------------------------------------------------------------------

  async webhook(headers: Record<string, string>, body: string): Promise<WebhookEvent> {
    const signature = headers["x-hub-signature-256"] ?? "";
    const verified = this.verifySignature(body, signature);

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new Error("Invalid JSON in GitHub webhook body");
    }

    const eventType = headers["x-github-event"] ?? "unknown";
    const action = parsed.action ? `.${parsed.action}` : "";

    return {
      id: (headers["x-github-delivery"] as string) ?? crypto.randomUUID(),
      source: this.name,
      type: `${eventType}${action}`,
      data: parsed,
      verified,
      received_at: new Date().toISOString(),
    };
  }

  private verifySignature(body: string, signature: string): boolean {
    if (!this.webhookSecret || !signature) return false;
    const expected = "sha256=" + createHmac("sha256", this.webhookSecret).update(body).digest("hex");
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
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  private async get(path: string): Promise<ConnectorResult> {
    const res = await fetch(`${GITHUB_API}${path}`, { headers: this.headers() });
    return this.toResult(res);
  }

  private async post(path: string, body: Record<string, unknown>): Promise<ConnectorResult> {
    const res = await fetch(`${GITHUB_API}${path}`, {
      method: "POST",
      headers: { ...this.headers(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return this.toResult(res);
  }

  private async patch(path: string, body: Record<string, unknown>): Promise<ConnectorResult> {
    const res = await fetch(`${GITHUB_API}${path}`, {
      method: "PATCH",
      headers: { ...this.headers(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return this.toResult(res);
  }

  private async put(path: string, body: Record<string, unknown>): Promise<ConnectorResult> {
    const res = await fetch(`${GITHUB_API}${path}`, {
      method: "PUT",
      headers: { ...this.headers(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return this.toResult(res);
  }

  private async toResult(res: Response): Promise<ConnectorResult> {
    const data = await res.json();
    const rateLimit = this.parseRateLimit(res.headers);
    if (!res.ok) {
      const msg = (data as any)?.message ?? `HTTP ${res.status}`;
      return { ok: false, error: msg, rate_limit: rateLimit };
    }
    return { ok: true, data, rate_limit: rateLimit };
  }

  private parseRateLimit(headers: Headers): { remaining: number; reset_at: string } | undefined {
    const remaining = headers.get("x-ratelimit-remaining");
    const reset = headers.get("x-ratelimit-reset");
    if (remaining !== null && reset !== null) {
      return {
        remaining: parseInt(remaining, 10),
        reset_at: new Date(parseInt(reset, 10) * 1000).toISOString(),
      };
    }
    return undefined;
  }
}
