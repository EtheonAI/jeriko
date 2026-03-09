/**
 * Instagram connector — posts, stories, reels, comments, and insights.
 *
 * Extends BearerConnector for OAuth2 Bearer token auth via the Instagram
 * Platform API (graph.instagram.com). Uses the Instagram API v22.0 for
 * business/creator accounts.
 *
 * The Instagram Platform API uses `me` for the authenticated user — no need
 * to discover an Instagram Business Account ID via Facebook Pages. Tokens
 * obtained from the instagram_business_* OAuth scopes work directly.
 */

import { BearerConnector } from "../base.js";
import type { ConnectorResult } from "../interface.js";

export class InstagramConnector extends BearerConnector {
  readonly name = "instagram";
  readonly version = "1.0.0";

  protected readonly auth = {
    baseUrl: "https://graph.instagram.com/v22.0",
    tokenVar: "INSTAGRAM_ACCESS_TOKEN",
    clientIdVar: "INSTAGRAM_OAUTH_CLIENT_ID",
    clientSecretVar: "INSTAGRAM_OAUTH_CLIENT_SECRET",
    healthPath: "/me?fields=id,username",
    label: "Instagram",
  };

  // ---------------------------------------------------------------------------
  // Aliases
  // ---------------------------------------------------------------------------

  protected override aliases(): Record<string, string> {
    return {
      me: "profile",
      media: "media.list",
      stories: "stories.list",
      comments: "comments.list",
      insights: "insights",
      publish: "media.publish",
    };
  }

  // ---------------------------------------------------------------------------
  // API method dispatch — Instagram Platform API v22.0
  // ---------------------------------------------------------------------------

  protected handlers() {
    return {
      // Profile
      "profile": (p: Record<string, unknown>) => {
        const userId = p.user_id ?? "me";
        return this.get(`/${userId}`, {
          fields: p.fields ?? "id,username,name,account_type,media_count,profile_picture_url,followers_count,follows_count,biography",
        });
      },

      // Media
      "media.list": (p: Record<string, unknown>) => {
        const userId = p.user_id ?? "me";
        return this.get(`/${userId}/media`, {
          fields: p.fields ?? "id,caption,media_type,media_url,timestamp,permalink",
          limit: p.limit,
        });
      },
      "media.get": (p: Record<string, unknown>) =>
        this.get(`/${p.id}`, {
          fields: p.fields ?? "id,caption,media_type,media_url,timestamp,permalink,like_count,comments_count",
        }),
      "media.publish": (p: Record<string, unknown>) =>
        this.publishMedia(p),
      "media.delete": (p: Record<string, unknown>) =>
        this.del(`/${p.id}`),

      // Stories
      "stories.list": (p: Record<string, unknown>) => {
        const userId = p.user_id ?? "me";
        return this.get(`/${userId}/stories`, {
          fields: p.fields ?? "id,media_type,media_url,timestamp",
        });
      },

      // Comments
      "comments.list": (p: Record<string, unknown>) =>
        this.get(`/${p.media_id}/comments`, {
          fields: p.fields ?? "id,text,username,timestamp",
          limit: p.limit,
        }),
      "comments.create": (p: Record<string, unknown>) =>
        this.post(`/${p.media_id}/comments`, { message: p.message }),
      "comments.delete": (p: Record<string, unknown>) =>
        this.del(`/${p.id}`),

      // Tags
      "tags": (p: Record<string, unknown>) => {
        const userId = p.user_id ?? "me";
        return this.get(`/${userId}/tags`, {
          fields: p.fields ?? "id,caption,media_type,timestamp,permalink",
        });
      },

      // Insights — account level
      "insights": (p: Record<string, unknown>) => {
        const userId = p.user_id ?? "me";
        return this.get(`/${userId}/insights`, {
          metric: p.metric ?? "reach,accounts_engaged,total_interactions",
          period: p.period ?? "day",
        });
      },

      // Insights — media level
      "insights.media": (p: Record<string, unknown>) =>
        this.get(`/${p.media_id}/insights`, {
          metric: p.metric ?? "reach,likes,comments,shares,saved",
        }),

      // Content publishing limit
      "publishing_limit": (p: Record<string, unknown>) => {
        const userId = p.user_id ?? "me";
        return this.get(`/${userId}/content_publishing_limit`, {
          fields: "config,quota_usage",
        });
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Two-step media publish (container creation → publish)
  // ---------------------------------------------------------------------------

  /**
   * Instagram Platform API requires a two-step publish flow:
   *   1. POST /{user_id}/media — create a media container
   *   2. POST /{user_id}/media_publish — publish the container
   */
  private async publishMedia(p: Record<string, unknown>): Promise<ConnectorResult> {
    const userId = p.user_id ?? "me";

    // Step 1: Create container
    const containerBody: Record<string, unknown> = {};
    if (p.image_url) containerBody.image_url = p.image_url;
    if (p.video_url) containerBody.video_url = p.video_url;
    if (p.caption) containerBody.caption = p.caption;
    if (p.media_type) containerBody.media_type = p.media_type;
    if (p.location_id) containerBody.location_id = p.location_id;

    const containerResult = await this.post(`/${userId}/media`, containerBody);
    if (!containerResult.ok) return containerResult;

    const containerId = (containerResult.data as Record<string, unknown>)?.id;
    if (!containerId) {
      return { ok: false, error: "Failed to create media container — no container ID returned" };
    }

    // Step 2: Publish container
    return this.post(`/${userId}/media_publish`, {
      creation_id: containerId,
    });
  }
}
