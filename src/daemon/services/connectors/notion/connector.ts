/**
 * Notion connector — pages, databases, blocks, users, and search.
 *
 * Extends BearerConnector for OAuth2 Bearer token auth.
 * Notion tokens are permanent (no refresh). Requires Notion-Version header.
 * Token exchange uses Basic auth (base64 client_id:client_secret).
 */

import { BearerConnector } from "../base.js";
import type { WebhookEvent } from "../interface.js";

export class NotionConnector extends BearerConnector {
  readonly name = "notion";
  readonly version = "1.0.0";

  protected readonly auth = {
    baseUrl: "https://api.notion.com/v1",
    tokenVar: "NOTION_ACCESS_TOKEN",
    // Notion tokens are permanent — no refresh
    healthPath: "/users/me",
    label: "Notion",
  };

  // ---------------------------------------------------------------------------
  // Extra headers — Notion requires API version
  // ---------------------------------------------------------------------------

  protected override extraHeaders(): Record<string, string> {
    return { "Notion-Version": "2022-06-28" };
  }

  // ---------------------------------------------------------------------------
  // Aliases
  // ---------------------------------------------------------------------------

  protected override aliases(): Record<string, string> {
    return {
      pages: "pages.list",
      databases: "databases.list",
      blocks: "blocks.children",
      users: "users.list",
    };
  }

  // ---------------------------------------------------------------------------
  // API method dispatch — Notion API
  // ---------------------------------------------------------------------------

  protected handlers() {
    return {
      // Search
      "search": (p: Record<string, unknown>) =>
        this.post("/search", {
          query: p.query ?? "",
          filter: p.filter ? { value: p.filter, property: "object" } : undefined,
          page_size: p.limit ?? p.page_size ?? 10,
          start_cursor: p.start_cursor,
        }),

      // Pages
      "pages.get": (p: Record<string, unknown>) =>
        this.get(`/pages/${p.id}`),
      "pages.create": (p: Record<string, unknown>) =>
        this.post("/pages", {
          parent: p.parent,
          properties: p.properties,
          children: p.children,
          icon: p.icon,
          cover: p.cover,
        }),
      "pages.update": (p: Record<string, unknown>) =>
        this.patch(`/pages/${p.id}`, {
          properties: p.properties,
          archived: p.archived,
          icon: p.icon,
          cover: p.cover,
        }),
      "pages.delete": (p: Record<string, unknown>) =>
        this.patch(`/pages/${p.id}`, { archived: true }),

      // Databases
      "databases.list": (p: Record<string, unknown>) =>
        this.post("/search", {
          filter: { value: "database", property: "object" },
          page_size: p.limit ?? 10,
        }),
      "databases.get": (p: Record<string, unknown>) =>
        this.get(`/databases/${p.id}`),
      "databases.query": (p: Record<string, unknown>) =>
        this.post(`/databases/${p.id}/query`, {
          filter: p.filter,
          sorts: p.sorts,
          page_size: p.limit ?? p.page_size ?? 10,
          start_cursor: p.start_cursor,
        }),
      "databases.create": (p: Record<string, unknown>) =>
        this.post("/databases", {
          parent: p.parent,
          title: p.title,
          properties: p.properties,
        }),
      "databases.update": (p: Record<string, unknown>) =>
        this.patch(`/databases/${p.id}`, {
          title: p.title,
          properties: p.properties,
        }),

      // Blocks
      "blocks.get": (p: Record<string, unknown>) =>
        this.get(`/blocks/${p.id}`),
      "blocks.children": (p: Record<string, unknown>) =>
        this.get(`/blocks/${p.id}/children?page_size=${p.limit ?? 100}`),
      "blocks.append": (p: Record<string, unknown>) =>
        this.patch(`/blocks/${p.id}/children`, { children: p.children }),
      "blocks.update": (p: Record<string, unknown>) =>
        this.patch(`/blocks/${p.id}`, p),
      "blocks.delete": (p: Record<string, unknown>) =>
        this.del(`/blocks/${p.id}`),

      // Users
      "users.list": (p: Record<string, unknown>) =>
        this.get(`/users?page_size=${p.limit ?? 100}`),
      "users.get": (p: Record<string, unknown>) =>
        this.get(`/users/${p.id}`),
      "users.me": () => this.get("/users/me"),

      // Comments
      "comments.list": (p: Record<string, unknown>) =>
        this.get(`/comments?block_id=${p.block_id ?? p.id}`),
      "comments.create": (p: Record<string, unknown>) =>
        this.post("/comments", {
          parent: p.parent ?? { page_id: p.page_id },
          rich_text: p.rich_text,
        }),
    };
  }
}
