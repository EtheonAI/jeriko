/**
 * Linear connector — issues, projects, teams, cycles, and labels.
 *
 * Extends BearerConnector for OAuth2 Bearer token auth.
 * Linear uses GraphQL exclusively — all methods send POST to /graphql.
 * Tokens are permanent (no refresh).
 */

import { BearerConnector } from "../base.js";
import type { ConnectorResult } from "../interface.js";

export class LinearConnector extends BearerConnector {
  readonly name = "linear";
  readonly version = "1.0.0";

  protected readonly auth = {
    baseUrl: "https://api.linear.app",
    tokenVar: "LINEAR_ACCESS_TOKEN",
    // Linear tokens are permanent — no refresh
    healthPath: "/graphql",
    label: "Linear",
  };

  // ---------------------------------------------------------------------------
  // Health — POST-based GraphQL health check
  // ---------------------------------------------------------------------------

  override async health(): Promise<import("../interface.js").HealthResult> {
    const start = Date.now();
    try {
      const result = await this.graphql("{ viewer { id name email } }");
      const latency = Date.now() - start;
      return result.ok
        ? { healthy: true, latency_ms: latency }
        : { healthy: false, latency_ms: latency, error: result.error };
    } catch (err) {
      return {
        healthy: false,
        latency_ms: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Aliases
  // ---------------------------------------------------------------------------

  protected override aliases(): Record<string, string> {
    return {
      issues: "issues.list",
      projects: "projects.list",
      teams: "teams.list",
      cycles: "cycles.list",
      labels: "labels.list",
    };
  }

  // ---------------------------------------------------------------------------
  // GraphQL helper
  // ---------------------------------------------------------------------------

  private async graphql(query: string, variables?: Record<string, unknown>): Promise<ConnectorResult> {
    const authHeader = await this.buildAuthHeader();
    const res = await fetch(`${this.auth.baseUrl}/graphql`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });
    const data = (await res.json()) as { data?: unknown; errors?: Array<{ message: string }> };
    if (data.errors?.length) {
      return { ok: false, error: data.errors.map((e) => e.message).join("; ") };
    }
    return { ok: true, data: data.data };
  }

  // ---------------------------------------------------------------------------
  // API method dispatch — Linear GraphQL
  // ---------------------------------------------------------------------------

  protected handlers() {
    return {
      // Issues
      "issues.list": (p: Record<string, unknown>) =>
        this.graphql(`query($first: Int) {
          issues(first: $first, orderBy: updatedAt) {
            nodes { id identifier title state { name } assignee { name } priority priorityLabel createdAt updatedAt }
          }
        }`, { first: p.limit ?? 25 }),

      "issues.get": (p: Record<string, unknown>) =>
        this.graphql(`query($id: String!) {
          issue(id: $id) { id identifier title description state { name } assignee { name } priority priorityLabel labels { nodes { name } } createdAt updatedAt }
        }`, { id: p.id }),

      "issues.create": (p: Record<string, unknown>) =>
        this.graphql(`mutation($input: IssueCreateInput!) {
          issueCreate(input: $input) { success issue { id identifier title url } }
        }`, { input: { title: p.title, description: p.description, teamId: p.team_id, assigneeId: p.assignee_id, priority: p.priority, labelIds: p.label_ids } }),

      "issues.update": (p: Record<string, unknown>) =>
        this.graphql(`mutation($id: String!, $input: IssueUpdateInput!) {
          issueUpdate(id: $id, input: $input) { success issue { id identifier title state { name } } }
        }`, { id: p.id, input: { title: p.title, description: p.description, stateId: p.state_id, assigneeId: p.assignee_id, priority: p.priority } }),

      "issues.delete": (p: Record<string, unknown>) =>
        this.graphql(`mutation($id: String!) {
          issueDelete(id: $id) { success }
        }`, { id: p.id }),

      "issues.search": (p: Record<string, unknown>) =>
        this.graphql(`query($term: String!, $first: Int) {
          searchIssues(term: $term, first: $first) { nodes { id identifier title state { name } assignee { name } } }
        }`, { term: p.query, first: p.limit ?? 10 }),

      // Projects
      "projects.list": (p: Record<string, unknown>) =>
        this.graphql(`query($first: Int) {
          projects(first: $first) { nodes { id name state progress startDate targetDate lead { name } } }
        }`, { first: p.limit ?? 25 }),

      "projects.get": (p: Record<string, unknown>) =>
        this.graphql(`query($id: String!) {
          project(id: $id) { id name description state progress startDate targetDate lead { name } members { nodes { name } } }
        }`, { id: p.id }),

      "projects.create": (p: Record<string, unknown>) =>
        this.graphql(`mutation($input: ProjectCreateInput!) {
          projectCreate(input: $input) { success project { id name url } }
        }`, { input: { name: p.name, description: p.description, teamIds: p.team_ids } }),

      // Teams
      "teams.list": (p: Record<string, unknown>) =>
        this.graphql(`query($first: Int) {
          teams(first: $first) { nodes { id name key description } }
        }`, { first: p.limit ?? 50 }),

      "teams.get": (p: Record<string, unknown>) =>
        this.graphql(`query($id: String!) {
          team(id: $id) { id name key description members { nodes { id name email } } states { nodes { id name type } } labels { nodes { id name color } } }
        }`, { id: p.id }),

      // Cycles
      "cycles.list": (p: Record<string, unknown>) =>
        this.graphql(`query($first: Int) {
          cycles(first: $first) { nodes { id number name startsAt endsAt progress completedAt } }
        }`, { first: p.limit ?? 10 }),

      // Labels
      "labels.list": (p: Record<string, unknown>) =>
        this.graphql(`query($first: Int) {
          issueLabels(first: $first) { nodes { id name color } }
        }`, { first: p.limit ?? 50 }),

      // Viewer (current user)
      "me": () =>
        this.graphql("{ viewer { id name email admin createdAt } }"),

      // Comments
      "comments.create": (p: Record<string, unknown>) =>
        this.graphql(`mutation($input: CommentCreateInput!) {
          commentCreate(input: $input) { success comment { id body } }
        }`, { input: { issueId: p.issue_id, body: p.body } }),

      // Workflow states
      "states.list": (p: Record<string, unknown>) =>
        this.graphql(`query($first: Int) {
          workflowStates(first: $first) { nodes { id name type team { name } } }
        }`, { first: p.limit ?? 50 }),
    };
  }
}
