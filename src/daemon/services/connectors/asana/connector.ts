/**
 * Asana connector — tasks, projects, sections, workspaces, and teams.
 *
 * Extends BearerConnector for OAuth2 Bearer token auth with refresh.
 * Asana uses standard OAuth 2.0 with refresh tokens.
 */

import { BearerConnector } from "../base.js";

export class AsanaConnector extends BearerConnector {
  readonly name = "asana";
  readonly version = "1.0.0";

  protected readonly auth = {
    baseUrl: "https://app.asana.com/api/1.0",
    tokenVar: "ASANA_ACCESS_TOKEN",
    refreshTokenVar: "ASANA_REFRESH_TOKEN",
    clientIdVar: "ASANA_OAUTH_CLIENT_ID",
    clientSecretVar: "ASANA_OAUTH_CLIENT_SECRET",
    tokenUrl: "https://app.asana.com/-/oauth_token",
    healthPath: "/users/me",
    label: "Asana",
  };

  // ---------------------------------------------------------------------------
  // Aliases
  // ---------------------------------------------------------------------------

  protected override aliases(): Record<string, string> {
    return {
      tasks: "tasks.list",
      projects: "projects.list",
      workspaces: "workspaces.list",
      sections: "sections.list",
      teams: "teams.list",
    };
  }

  // ---------------------------------------------------------------------------
  // API method dispatch — Asana REST API
  // ---------------------------------------------------------------------------

  protected handlers() {
    return {
      // Tasks
      "tasks.list": (p: Record<string, unknown>) => {
        if (p.project) return this.get(`/projects/${p.project}/tasks`, { opt_fields: "name,completed,assignee.name,due_on,modified_at", limit: p.limit ?? 25 });
        if (p.section) return this.get(`/sections/${p.section}/tasks`, { opt_fields: "name,completed,assignee.name,due_on", limit: p.limit ?? 25 });
        return this.get("/tasks", { assignee: p.assignee ?? "me", workspace: p.workspace, opt_fields: "name,completed,assignee.name,due_on,projects.name,modified_at", limit: p.limit ?? 25 });
      },
      "tasks.get": (p: Record<string, unknown>) =>
        this.get(`/tasks/${p.id}`, { opt_fields: "name,notes,completed,assignee.name,due_on,projects.name,tags.name,custom_fields,created_at,modified_at" }),
      "tasks.create": (p: Record<string, unknown>) =>
        this.post("/tasks", { data: { name: p.name, notes: p.notes, assignee: p.assignee, projects: p.projects ? [p.projects] : undefined, due_on: p.due_on, workspace: p.workspace } }),
      "tasks.update": (p: Record<string, unknown>) =>
        this.put(`/tasks/${p.id}`, { data: { name: p.name, notes: p.notes, completed: p.completed, assignee: p.assignee, due_on: p.due_on } }),
      "tasks.delete": (p: Record<string, unknown>) =>
        this.del(`/tasks/${p.id}`),
      "tasks.search": (p: Record<string, unknown>) =>
        this.get(`/workspaces/${p.workspace}/tasks/search`, { "text.value": p.query, opt_fields: "name,completed,assignee.name", limit: p.limit ?? 25 }),
      "tasks.subtasks": (p: Record<string, unknown>) =>
        this.get(`/tasks/${p.id}/subtasks`, { opt_fields: "name,completed,assignee.name" }),
      "tasks.add_comment": (p: Record<string, unknown>) =>
        this.post(`/tasks/${p.id}/stories`, { data: { text: p.text ?? p.comment } }),

      // Projects
      "projects.list": (p: Record<string, unknown>) =>
        this.get("/projects", { workspace: p.workspace, opt_fields: "name,color,current_status,due_date,owner.name,modified_at", limit: p.limit ?? 25 }),
      "projects.get": (p: Record<string, unknown>) =>
        this.get(`/projects/${p.id}`, { opt_fields: "name,notes,color,current_status,due_date,owner.name,members.name,created_at" }),
      "projects.create": (p: Record<string, unknown>) =>
        this.post("/projects", { data: { name: p.name, notes: p.notes, workspace: p.workspace, team: p.team, default_view: p.default_view ?? "list" } }),
      "projects.update": (p: Record<string, unknown>) =>
        this.put(`/projects/${p.id}`, { data: { name: p.name, notes: p.notes, color: p.color } }),
      "projects.delete": (p: Record<string, unknown>) =>
        this.del(`/projects/${p.id}`),

      // Sections
      "sections.list": (p: Record<string, unknown>) =>
        this.get(`/projects/${p.project}/sections`),
      "sections.create": (p: Record<string, unknown>) =>
        this.post(`/projects/${p.project}/sections`, { data: { name: p.name } }),
      "sections.update": (p: Record<string, unknown>) =>
        this.put(`/sections/${p.id}`, { data: { name: p.name } }),
      "sections.add_task": (p: Record<string, unknown>) =>
        this.post(`/sections/${p.section}/addTask`, { data: { task: p.task_id ?? p.task } }),

      // Workspaces
      "workspaces.list": () =>
        this.get("/workspaces"),
      "workspaces.get": (p: Record<string, unknown>) =>
        this.get(`/workspaces/${p.id}`),

      // Teams
      "teams.list": (p: Record<string, unknown>) =>
        this.get(`/organizations/${p.workspace}/teams`),

      // Users
      "users.me": () => this.get("/users/me"),
      "users.list": (p: Record<string, unknown>) =>
        this.get(`/workspaces/${p.workspace}/users`, { opt_fields: "name,email" }),

      // Tags
      "tags.list": (p: Record<string, unknown>) =>
        this.get("/tags", { workspace: p.workspace, limit: p.limit ?? 25 }),
    };
  }
}
