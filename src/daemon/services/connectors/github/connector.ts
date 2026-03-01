/**
 * GitHub connector — repos, issues, PRs, actions, and webhook handling.
 *
 * Extends ConnectorBase for unified lifecycle, dispatch, and HTTP helpers.
 * GitHub uses Bearer auth with a static PAT and custom Accept/API-Version headers.
 */

import { createHmac, timingSafeEqual } from "crypto";
import type { ConnectorResult, WebhookEvent } from "../interface.js";
import { ConnectorBase } from "../base.js";

export class GitHubConnector extends ConnectorBase {
  readonly name = "github";
  readonly version = "1.0.0";

  protected readonly baseUrl = "https://api.github.com";
  protected readonly healthPath = "/rate_limit";
  protected readonly label = "GitHub";

  private token = "";
  private webhookSecret = "";

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  override async init(): Promise<void> {
    const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
    if (!token) {
      throw new Error("GITHUB_TOKEN or GH_TOKEN env var is required");
    }
    this.token = token;
    this.webhookSecret = process.env.GITHUB_WEBHOOK_SECRET ?? "";
  }

  // ---------------------------------------------------------------------------
  // Auth — static Bearer token (PAT)
  // ---------------------------------------------------------------------------

  protected async buildAuthHeader(): Promise<string> {
    return `Bearer ${this.token}`;
  }

  // ---------------------------------------------------------------------------
  // Extra headers — GitHub requires Accept + API version
  // ---------------------------------------------------------------------------

  protected override extraHeaders(): Record<string, string> {
    return {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  // ---------------------------------------------------------------------------
  // Rate limiting
  // ---------------------------------------------------------------------------

  protected override parseRateLimit(
    headers: Headers,
  ): { remaining: number; reset_at: string } | undefined {
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

  // ---------------------------------------------------------------------------
  // Aliases
  // ---------------------------------------------------------------------------

  protected override aliases(): Record<string, string> {
    return {
      repos: "repos.list",
      issues: "issues.list",
      pulls: "pulls.list",
      actions: "actions.list_runs",
      releases: "releases.list",
      gists: "gists.list",
    };
  }

  // ---------------------------------------------------------------------------
  // Call — override to handle owner/repo splitting before dispatch
  // ---------------------------------------------------------------------------

  override async call(
    method: string,
    params: Record<string, unknown>,
  ): Promise<ConnectorResult> {
    const p = { ...params };

    // Allow repo in "owner/repo" format from --repo flag or positional (p.id)
    const repoStr = (p.repo ?? p.id) as string | undefined;
    if (typeof repoStr === "string" && repoStr.includes("/") && !p.owner) {
      const [owner, repo] = repoStr.split("/", 2);
      p.owner = owner;
      p.repo = repo;
    }

    return super.call(method, p);
  }

  // ---------------------------------------------------------------------------
  // API method dispatch
  // ---------------------------------------------------------------------------

  protected handlers() {
    return {
      "repos.get": (p: Record<string, unknown>) => this.get(`/repos/${p.owner}/${p.repo}`),
      "repos.list": () => this.get("/user/repos"),
      "repos.create": (p: Record<string, unknown>) =>
        this.post("/user/repos", {
          name: p.name,
          description: p.description,
          private: p.private ?? true,
        }),
      "issues.list": (p: Record<string, unknown>) =>
        this.get(`/repos/${p.owner}/${p.repo}/issues`),
      "issues.create": (p: Record<string, unknown>) =>
        this.post(`/repos/${p.owner}/${p.repo}/issues`, {
          title: p.title,
          body: p.body,
          labels: p.labels,
          assignees: p.assignees,
        }),
      "issues.get": (p: Record<string, unknown>) =>
        this.get(`/repos/${p.owner}/${p.repo}/issues/${p.number}`),
      "issues.update": (p: Record<string, unknown>) =>
        this.patch(`/repos/${p.owner}/${p.repo}/issues/${p.number}`, {
          title: p.title,
          body: p.body,
          state: p.state,
        }),
      "pulls.list": (p: Record<string, unknown>) =>
        this.get(`/repos/${p.owner}/${p.repo}/pulls`),
      "pulls.create": (p: Record<string, unknown>) =>
        this.post(`/repos/${p.owner}/${p.repo}/pulls`, {
          title: p.title,
          body: p.body,
          head: p.head,
          base: p.base,
        }),
      "pulls.get": (p: Record<string, unknown>) =>
        this.get(`/repos/${p.owner}/${p.repo}/pulls/${p.number}`),
      "pulls.merge": (p: Record<string, unknown>) =>
        this.put(`/repos/${p.owner}/${p.repo}/pulls/${p.number}/merge`, {
          merge_method: p.merge_method ?? "squash",
        }),
      "actions.list_runs": (p: Record<string, unknown>) =>
        this.get(`/repos/${p.owner}/${p.repo}/actions/runs`),
      "actions.trigger": (p: Record<string, unknown>) =>
        this.post(
          `/repos/${p.owner}/${p.repo}/actions/workflows/${p.workflow_id}/dispatches`,
          { ref: p.ref ?? "main", inputs: p.inputs },
        ),
      "releases.list": (p: Record<string, unknown>) =>
        this.get(`/repos/${p.owner}/${p.repo}/releases`),
      "releases.create": (p: Record<string, unknown>) =>
        this.post(`/repos/${p.owner}/${p.repo}/releases`, {
          tag_name: p.tag_name,
          name: p.name,
          body: p.body,
          draft: p.draft,
          prerelease: p.prerelease,
        }),
      "search.repos": (p: Record<string, unknown>) =>
        this.get(
          `/search/repositories?q=${encodeURIComponent(String(p.query))}&per_page=${p.per_page ?? 10}`,
        ),
      "search.issues": (p: Record<string, unknown>) =>
        this.get(
          `/search/issues?q=${encodeURIComponent(String(p.query))}&per_page=${p.per_page ?? 10}`,
        ),
      "search.code": (p: Record<string, unknown>) =>
        this.get(
          `/search/code?q=${encodeURIComponent(String(p.query))}&per_page=${p.per_page ?? 10}`,
        ),
      "gists.list": () => this.get("/gists"),
      "gists.create": (p: Record<string, unknown>) =>
        this.post("/gists", {
          description: p.description,
          public: p.public ?? false,
          files: p.files,
        }),
      "gists.get": (p: Record<string, unknown>) => this.get(`/gists/${p.id}`),
    };
  }

  // ---------------------------------------------------------------------------
  // Webhooks — HMAC-SHA256 verification
  // ---------------------------------------------------------------------------

  override async webhook(
    headers: Record<string, string>,
    body: string,
  ): Promise<WebhookEvent> {
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
    const expected =
      "sha256=" +
      createHmac("sha256", this.webhookSecret).update(body).digest("hex");
    if (expected.length !== signature.length) return false;
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }
}
