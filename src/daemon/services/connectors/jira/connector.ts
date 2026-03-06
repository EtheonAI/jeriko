/**
 * Jira connector — issues, projects, boards, sprints, and search.
 *
 * Extends BearerConnector for OAuth2 Bearer token auth with refresh.
 * Jira Cloud uses Atlassian OAuth 2.0 (3LO) with a cloud ID prefix on all URLs.
 * The cloud ID is resolved dynamically from the accessible-resources endpoint.
 */

import { BearerConnector } from "../base.js";
import type { ConnectorResult } from "../interface.js";

export class JiraConnector extends BearerConnector {
  readonly name = "jira";
  readonly version = "1.0.0";

  private cloudId = "";

  protected readonly auth = {
    baseUrl: "https://api.atlassian.com",
    tokenVar: "JIRA_ACCESS_TOKEN",
    refreshTokenVar: "JIRA_REFRESH_TOKEN",
    clientIdVar: "JIRA_OAUTH_CLIENT_ID",
    clientSecretVar: "JIRA_OAUTH_CLIENT_SECRET",
    tokenUrl: "https://auth.atlassian.com/oauth/token",
    healthPath: "/oauth/token/accessible-resources",
    label: "Jira",
  };

  // ---------------------------------------------------------------------------
  // Lifecycle — resolve cloud ID
  // ---------------------------------------------------------------------------

  override async init(): Promise<void> {
    await super.init();
    this.cloudId = process.env.JIRA_CLOUD_ID ?? "";
  }

  /** Resolve cloud ID from Atlassian accessible-resources if not set. */
  private async resolveCloudId(): Promise<string> {
    if (this.cloudId) return this.cloudId;
    const result = await this.get("/oauth/token/accessible-resources");
    if (result.ok && Array.isArray(result.data) && result.data.length > 0) {
      this.cloudId = (result.data[0] as { id: string }).id;
    }
    return this.cloudId;
  }

  /** Build Jira REST API path with cloud ID prefix. */
  private async jiraPath(path: string): Promise<string> {
    const cid = await this.resolveCloudId();
    return `/ex/jira/${cid}/rest/api/3${path}`;
  }

  /** Build Jira Agile API path with cloud ID prefix. */
  private async agilePath(path: string): Promise<string> {
    const cid = await this.resolveCloudId();
    return `/ex/jira/${cid}/rest/agile/1.0${path}`;
  }

  // ---------------------------------------------------------------------------
  // Aliases
  // ---------------------------------------------------------------------------

  protected override aliases(): Record<string, string> {
    return {
      issues: "issues.search",
      projects: "projects.list",
      boards: "boards.list",
      sprints: "sprints.list",
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers for async path resolution
  // ---------------------------------------------------------------------------

  private async jiraGet(path: string, params?: Record<string, unknown>): Promise<ConnectorResult> {
    return this.get(await this.jiraPath(path), params);
  }

  private async jiraPost(path: string, body: Record<string, unknown>): Promise<ConnectorResult> {
    return this.post(await this.jiraPath(path), body);
  }

  private async jiraPut(path: string, body: Record<string, unknown>): Promise<ConnectorResult> {
    return this.put(await this.jiraPath(path), body);
  }

  private async jiraDel(path: string): Promise<ConnectorResult> {
    return this.del(await this.jiraPath(path));
  }

  private async agileGet(path: string, params?: Record<string, unknown>): Promise<ConnectorResult> {
    return this.get(await this.agilePath(path), params);
  }

  // ---------------------------------------------------------------------------
  // API method dispatch — Jira REST API v3 + Agile API
  // ---------------------------------------------------------------------------

  protected handlers() {
    return {
      // Issues
      "issues.get": (p: Record<string, unknown>) =>
        this.jiraGet(`/issue/${p.id ?? p.key}`),
      "issues.create": (p: Record<string, unknown>) =>
        this.jiraPost("/issue", {
          fields: p.fields ?? {
            project: { key: p.project },
            summary: p.summary,
            description: p.description ? { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: p.description }] }] } : undefined,
            issuetype: { name: p.issue_type ?? "Task" },
            assignee: p.assignee ? { accountId: p.assignee } : undefined,
            priority: p.priority ? { name: p.priority } : undefined,
          },
        }),
      "issues.update": (p: Record<string, unknown>) =>
        this.jiraPut(`/issue/${p.id ?? p.key}`, { fields: p.fields ?? p }),
      "issues.delete": (p: Record<string, unknown>) =>
        this.jiraDel(`/issue/${p.id ?? p.key}`),
      "issues.transition": (p: Record<string, unknown>) =>
        this.jiraPost(`/issue/${p.id ?? p.key}/transitions`, {
          transition: { id: p.transition_id },
        }),
      "issues.search": (p: Record<string, unknown>) =>
        this.jiraPost("/search", {
          jql: p.jql ?? p.query ?? "ORDER BY updated DESC",
          maxResults: p.limit ?? 25,
          startAt: p.offset ?? 0,
          fields: ["summary", "status", "assignee", "priority", "issuetype", "created", "updated"],
        }),
      "issues.assign": (p: Record<string, unknown>) =>
        this.jiraPut(`/issue/${p.id ?? p.key}/assignee`, { accountId: p.assignee }),
      "issues.comment": (p: Record<string, unknown>) =>
        this.jiraPost(`/issue/${p.id ?? p.key}/comment`, {
          body: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: String(p.body ?? p.comment) }] }] },
        }),

      // Projects
      "projects.list": (p: Record<string, unknown>) =>
        this.jiraGet("/project/search", p),
      "projects.get": (p: Record<string, unknown>) =>
        this.jiraGet(`/project/${p.id ?? p.key}`),

      // Boards (Agile)
      "boards.list": (p: Record<string, unknown>) =>
        this.agileGet("/board", p),
      "boards.get": (p: Record<string, unknown>) =>
        this.agileGet(`/board/${p.id}`),

      // Sprints (Agile)
      "sprints.list": (p: Record<string, unknown>) =>
        this.agileGet(`/board/${p.board_id}/sprint`, p),
      "sprints.get": (p: Record<string, unknown>) =>
        this.agileGet(`/sprint/${p.id}`),
      "sprints.issues": (p: Record<string, unknown>) =>
        this.agileGet(`/sprint/${p.id}/issue`, p),

      // Users
      "users.search": (p: Record<string, unknown>) =>
        this.jiraGet(`/user/search?query=${encodeURIComponent(String(p.query ?? ""))}`),
      "users.me": () => this.jiraGet("/myself"),

      // Statuses
      "statuses.list": (p: Record<string, unknown>) =>
        this.jiraGet(`/project/${p.project ?? p.key}/statuses`),
    };
  }
}
