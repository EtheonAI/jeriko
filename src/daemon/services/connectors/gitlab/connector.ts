/**
 * GitLab connector — projects, issues, merge requests, pipelines, and users.
 *
 * Extends BearerConnector for OAuth2 Bearer token auth with refresh.
 * GitLab supports both personal access tokens and OAuth 2.0.
 */

import { BearerConnector } from "../base.js";

export class GitLabConnector extends BearerConnector {
  readonly name = "gitlab";
  readonly version = "1.0.0";

  protected readonly auth = {
    baseUrl: "https://gitlab.com/api/v4",
    tokenVar: "GITLAB_ACCESS_TOKEN",
    refreshTokenVar: "GITLAB_REFRESH_TOKEN",
    clientIdVar: "GITLAB_OAUTH_CLIENT_ID",
    clientSecretVar: "GITLAB_OAUTH_CLIENT_SECRET",
    tokenUrl: "https://gitlab.com/oauth/token",
    healthPath: "/user",
    label: "GitLab",
  };

  // ---------------------------------------------------------------------------
  // Aliases
  // ---------------------------------------------------------------------------

  protected override aliases(): Record<string, string> {
    return {
      projects: "projects.list",
      issues: "issues.list",
      mrs: "merge_requests.list",
      pipelines: "pipelines.list",
    };
  }

  // ---------------------------------------------------------------------------
  // API method dispatch — GitLab REST API v4
  // ---------------------------------------------------------------------------

  protected handlers() {
    return {
      // Projects
      "projects.list": (p: Record<string, unknown>) =>
        this.get("/projects", { membership: p.membership ?? true, per_page: p.limit ?? 20, order_by: p.order_by ?? "updated_at", sort: p.sort ?? "desc" }),
      "projects.get": (p: Record<string, unknown>) =>
        this.get(`/projects/${encodeURIComponent(String(p.id))}`),
      "projects.create": (p: Record<string, unknown>) =>
        this.post("/projects", { name: p.name, description: p.description, visibility: p.visibility ?? "private", namespace_id: p.namespace_id }),
      "projects.delete": (p: Record<string, unknown>) =>
        this.del(`/projects/${encodeURIComponent(String(p.id))}`),
      "projects.search": (p: Record<string, unknown>) =>
        this.get("/projects", { search: p.query, per_page: p.limit ?? 20 }),

      // Issues
      "issues.list": (p: Record<string, unknown>) =>
        this.get(p.project_id ? `/projects/${encodeURIComponent(String(p.project_id))}/issues` : "/issues", { per_page: p.limit ?? 20, state: p.state, labels: p.labels }),
      "issues.get": (p: Record<string, unknown>) =>
        this.get(`/projects/${encodeURIComponent(String(p.project_id))}/issues/${p.iid ?? p.id}`),
      "issues.create": (p: Record<string, unknown>) =>
        this.post(`/projects/${encodeURIComponent(String(p.project_id))}/issues`, { title: p.title, description: p.description, assignee_ids: p.assignee_ids, labels: p.labels }),
      "issues.update": (p: Record<string, unknown>) =>
        this.put(`/projects/${encodeURIComponent(String(p.project_id))}/issues/${p.iid ?? p.id}`, { title: p.title, description: p.description, state_event: p.state_event, labels: p.labels }),
      "issues.delete": (p: Record<string, unknown>) =>
        this.del(`/projects/${encodeURIComponent(String(p.project_id))}/issues/${p.iid ?? p.id}`),

      // Merge Requests
      "merge_requests.list": (p: Record<string, unknown>) =>
        this.get(p.project_id ? `/projects/${encodeURIComponent(String(p.project_id))}/merge_requests` : "/merge_requests", { per_page: p.limit ?? 20, state: p.state }),
      "merge_requests.get": (p: Record<string, unknown>) =>
        this.get(`/projects/${encodeURIComponent(String(p.project_id))}/merge_requests/${p.iid ?? p.id}`),
      "merge_requests.create": (p: Record<string, unknown>) =>
        this.post(`/projects/${encodeURIComponent(String(p.project_id))}/merge_requests`, { title: p.title, source_branch: p.source_branch, target_branch: p.target_branch ?? "main", description: p.description }),
      "merge_requests.merge": (p: Record<string, unknown>) =>
        this.put(`/projects/${encodeURIComponent(String(p.project_id))}/merge_requests/${p.iid ?? p.id}/merge`, {}),

      // Pipelines
      "pipelines.list": (p: Record<string, unknown>) =>
        this.get(`/projects/${encodeURIComponent(String(p.project_id))}/pipelines`, { per_page: p.limit ?? 20 }),
      "pipelines.get": (p: Record<string, unknown>) =>
        this.get(`/projects/${encodeURIComponent(String(p.project_id))}/pipelines/${p.id}`),
      "pipelines.jobs": (p: Record<string, unknown>) =>
        this.get(`/projects/${encodeURIComponent(String(p.project_id))}/pipelines/${p.id}/jobs`),

      // Users
      "users.me": () => this.get("/user"),
      "users.list": (p: Record<string, unknown>) =>
        this.get("/users", { search: p.query, per_page: p.limit ?? 20 }),

      // Branches
      "branches.list": (p: Record<string, unknown>) =>
        this.get(`/projects/${encodeURIComponent(String(p.project_id))}/repository/branches`, { per_page: p.limit ?? 20 }),
    };
  }
}
