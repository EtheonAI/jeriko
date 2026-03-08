/**
 * Instagram connector — posts, stories, reels, comments, and insights.
 *
 * Extends BearerConnector for OAuth2 Bearer token auth via Meta's Graph API.
 * Uses the Instagram Graph API v21.0 for business/creator accounts.
 *
 * Important: The Instagram Graph API lives on graph.facebook.com (NOT
 * graph.instagram.com, which is the deprecated Basic Display API).
 * Most endpoints require the Instagram Business Account ID, not "me".
 * The account ID is discovered via /me/accounts?fields=instagram_business_account.
 */

import { BearerConnector } from "../base.js";
import type { ConnectorResult } from "../interface.js";

export class InstagramConnector extends BearerConnector {
  readonly name = "instagram";
  readonly version = "1.0.0";

  protected readonly auth = {
    baseUrl: "https://graph.facebook.com/v21.0",
    tokenVar: "INSTAGRAM_ACCESS_TOKEN",
    clientIdVar: "INSTAGRAM_OAUTH_CLIENT_ID",
    clientSecretVar: "INSTAGRAM_OAUTH_CLIENT_SECRET",
    healthPath: "/me?fields=id,name",
    label: "Instagram",
  };

  // ---------------------------------------------------------------------------
  // Aliases
  // ---------------------------------------------------------------------------

  protected override aliases(): Record<string, string> {
    return {
      me: "me",
      accounts: "accounts",
      media: "media.list",
      stories: "stories.list",
      comments: "comments.list",
      insights: "insights",
    };
  }

  // ---------------------------------------------------------------------------
  // API method dispatch — Instagram Graph API v21.0 (via graph.facebook.com)
  // ---------------------------------------------------------------------------

  protected handlers() {
    return {
      // Facebook user profile (to discover linked IG accounts)
      "me": (_p: Record<string, unknown>) =>
        this.get("/me", { fields: "id,name" }),

      // Discover Instagram Business Accounts linked to Facebook Pages
      "accounts": (_p: Record<string, unknown>) =>
        this.get("/me/accounts", { fields: "id,name,instagram_business_account{id,username,media_count,profile_picture_url}" }),

      // Instagram Business Account profile (requires IG account ID)
      "profile": (p: Record<string, unknown>) =>
        this.get(`/${p.user_id}`, {
          fields: p.fields ?? "id,username,media_count,profile_picture_url,biography,followers_count,follows_count",
        }),

      // Media
      "media.list": (p: Record<string, unknown>) => {
        if (!p.user_id) return Promise.resolve({ ok: false, error: "user_id is required (Instagram Business Account ID)" } as ConnectorResult);
        return this.get(`/${p.user_id}/media`, {
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
        if (!p.user_id) return Promise.resolve({ ok: false, error: "user_id is required (Instagram Business Account ID)" } as ConnectorResult);
        return this.get(`/${p.user_id}/stories`, {
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

      // Insights — account level
      "insights": (p: Record<string, unknown>) => {
        if (!p.user_id) return Promise.resolve({ ok: false, error: "user_id is required (Instagram Business Account ID)" } as ConnectorResult);
        return this.get(`/${p.user_id}/insights`, {
          metric: p.metric ?? "impressions,reach,profile_views",
          period: p.period ?? "day",
        });
      },

      // Insights — media level
      "insights.media": (p: Record<string, unknown>) =>
        this.get(`/${p.media_id}/insights`, {
          metric: p.metric ?? "impressions,reach,engagement",
        }),
    };
  }

  // ---------------------------------------------------------------------------
  // Two-step media publish (container creation → publish)
  // ---------------------------------------------------------------------------

  /**
   * Instagram Graph API requires a two-step publish flow:
   *   1. POST /{user_id}/media — create a media container
   *   2. POST /{user_id}/media_publish — publish the container
   *
   * user_id must be the Instagram Business Account ID.
   */
  private async publishMedia(p: Record<string, unknown>): Promise<ConnectorResult> {
    if (!p.user_id) {
      return { ok: false, error: "user_id is required (Instagram Business Account ID)" };
    }
    const userId = p.user_id;

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
