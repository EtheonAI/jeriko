/**
 * Threads connector — posts, replies, insights, and user profiles.
 *
 * Extends BearerConnector for OAuth2 Bearer token auth via Meta's Threads API.
 * Uses the Threads API v1.0 (graph.threads.net).
 */

import { BearerConnector } from "../base.js";
import type { ConnectorResult } from "../interface.js";

export class ThreadsConnector extends BearerConnector {
  readonly name = "threads";
  readonly version = "1.0.0";

  protected readonly auth = {
    baseUrl: "https://graph.threads.net/v1.0",
    tokenVar: "THREADS_ACCESS_TOKEN",
    clientIdVar: "THREADS_OAUTH_CLIENT_ID",
    clientSecretVar: "THREADS_OAUTH_CLIENT_SECRET",
    healthPath: "/me?fields=id,username",
    label: "Threads",
  };

  // ---------------------------------------------------------------------------
  // Aliases
  // ---------------------------------------------------------------------------

  protected override aliases(): Record<string, string> {
    return {
      me: "me",
      posts: "posts.list",
      replies: "replies.list",
      insights: "insights",
    };
  }

  // ---------------------------------------------------------------------------
  // API method dispatch — Threads API v1.0
  // ---------------------------------------------------------------------------

  protected handlers() {
    return {
      // Profile
      "me": (_p: Record<string, unknown>) =>
        this.get("/me", { fields: "id,username,threads_profile_picture_url,threads_biography" }),

      // Posts
      "posts.list": (p: Record<string, unknown>) => {
        const userId = p.user_id ?? "me";
        return this.get(`/${userId}/threads`, {
          fields: p.fields ?? "id,text,media_type,media_url,timestamp,permalink,is_reply",
          limit: p.limit,
        });
      },
      "posts.get": (p: Record<string, unknown>) =>
        this.get(`/${p.id}`, {
          fields: p.fields ?? "id,text,media_type,media_url,timestamp,permalink",
        }),
      "posts.create": (p: Record<string, unknown>) =>
        this.publishThread(p),
      "posts.delete": (p: Record<string, unknown>) =>
        this.del(`/${p.id}`),

      // Replies
      "replies.list": (p: Record<string, unknown>) =>
        this.get(`/${p.thread_id}/replies`, {
          fields: p.fields ?? "id,text,username,timestamp",
          limit: p.limit,
        }),
      "replies.create": (p: Record<string, unknown>) =>
        this.publishThread({ ...p, reply_to_id: p.reply_to_id ?? p.thread_id }),

      // Insights — account level
      "insights": (p: Record<string, unknown>) => {
        const userId = p.user_id ?? "me";
        return this.get(`/${userId}/threads_insights`, {
          metric: p.metric ?? "views,likes,replies,reposts",
        });
      },

      // Insights — post level
      "insights.post": (p: Record<string, unknown>) =>
        this.get(`/${p.thread_id}/insights`, {
          metric: p.metric ?? "views,likes,replies,reposts",
        }),
    };
  }

  // ---------------------------------------------------------------------------
  // Two-step thread publish (container creation → publish)
  // ---------------------------------------------------------------------------

  /**
   * Threads API requires a two-step publish flow:
   *   1. POST /{user_id}/threads — create a media container
   *   2. POST /{user_id}/threads_publish — publish the container
   */
  private async publishThread(p: Record<string, unknown>): Promise<ConnectorResult> {
    const userId = p.user_id ?? "me";

    // Step 1: Create container
    const containerBody: Record<string, unknown> = {
      media_type: p.media_type ?? "TEXT",
    };
    if (p.text) containerBody.text = p.text;
    if (p.image_url) containerBody.image_url = p.image_url;
    if (p.video_url) containerBody.video_url = p.video_url;
    if (p.reply_to_id) containerBody.reply_to_id = p.reply_to_id;

    const containerResult = await this.post(`/${userId}/threads`, containerBody);
    if (!containerResult.ok) return containerResult;

    const containerId = (containerResult.data as Record<string, unknown>)?.id;
    if (!containerId) {
      return { ok: false, error: "Failed to create thread container — no container ID returned" };
    }

    // Step 2: Publish container
    return this.post(`/${userId}/threads_publish`, {
      creation_id: containerId,
    });
  }
}
