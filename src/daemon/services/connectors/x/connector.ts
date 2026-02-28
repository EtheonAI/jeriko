/**
 * X (Twitter) connector — tweets, users, timelines, and webhook handling.
 *
 * Uses X API v2 with dual authentication:
 *   - OAuth2 Bearer token (app-only) for read operations (search, get, timeline)
 *   - OAuth 1.0a HMAC-SHA1 (user context) for write operations (post, like, retweet, DM)
 *
 * OAuth 1.0a signing follows RFC 5849: https://tools.ietf.org/html/rfc5849
 */

import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import type {
  ConnectorInterface,
  ConnectorResult,
  HealthResult,
  WebhookEvent,
} from "../interface.js";
import { withRetry, withTimeout } from "../middleware.js";

const X_API = "https://api.twitter.com/2";

/** Shorthand aliases resolved before handler lookup. */
const ALIASES: Record<string, string> = {
  "post": "tweets.create",
  "search": "tweets.search",
  "timeline": "users.timeline",
  "like": "likes.create",
  "retweet": "retweets.create",
  "bookmark": "bookmarks.list",
  "follow": "users.follow",
  "dm": "dm.send",
};

/** Methods that require OAuth 1.0a User Context (write operations). */
const USER_CONTEXT_METHODS = new Set([
  "tweets.create",
  "tweets.delete",
  "likes.create",
  "likes.delete",
  "retweets.create",
  "users.follow",
  "bookmarks.list",
  "dm.send",
  "dm.list",
  "mute.create",
  "mute.delete",
]);

export class XConnector implements ConnectorInterface {
  readonly name = "x";
  readonly version = "1.0.0";

  private bearerToken = "";
  private apiKey = "";
  private apiSecret = "";
  private accessToken = "";
  private accessTokenSecret = "";
  private webhookSecret = "";

  /** Whether OAuth 1.0a credentials are available for write operations. */
  private hasUserContext = false;

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async init(): Promise<void> {
    const bearer = process.env.X_BEARER_TOKEN ?? process.env.TWITTER_BEARER_TOKEN;
    if (!bearer) {
      throw new Error("X_BEARER_TOKEN env var is required");
    }
    this.bearerToken = bearer;
    this.apiKey = process.env.X_API_KEY ?? process.env.TWITTER_API_KEY ?? "";
    this.apiSecret = process.env.X_API_SECRET ?? process.env.TWITTER_API_SECRET ?? "";
    this.accessToken = process.env.X_ACCESS_TOKEN ?? process.env.TWITTER_ACCESS_TOKEN ?? "";
    this.accessTokenSecret =
      process.env.X_ACCESS_TOKEN_SECRET ?? process.env.TWITTER_ACCESS_TOKEN_SECRET ?? "";
    this.webhookSecret =
      process.env.X_WEBHOOK_SECRET ?? process.env.TWITTER_WEBHOOK_SECRET ?? "";

    this.hasUserContext = !!(this.apiKey && this.apiSecret && this.accessToken && this.accessTokenSecret);
  }

  async health(): Promise<HealthResult> {
    const start = Date.now();
    try {
      const res = await withTimeout(
        () =>
          fetch(`${X_API}/users/me`, {
            headers: { Authorization: `Bearer ${this.bearerToken}` },
          }),
        5000,
      );
      const latency = Date.now() - start;
      // 401 = bad token, but 403 = app-only token (expected for /users/me)
      if (!res.ok && res.status !== 403) {
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
    // Resolve aliases before handler lookup.
    const resolved = ALIASES[method] ?? method;

    // Check if this method requires user context and if credentials are available
    if (USER_CONTEXT_METHODS.has(resolved) && !this.hasUserContext) {
      return {
        ok: false,
        error: `Write operation "${method}" requires OAuth 1.0a credentials. Set X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, and X_ACCESS_TOKEN_SECRET.`,
      };
    }

    const handlers: Record<string, (p: Record<string, unknown>) => Promise<ConnectorResult>> = {
      "tweets.create": (p) =>
        this.postOAuth("/tweets", { text: p.text, reply: p.reply, media: p.media }),
      "tweets.delete": (p) => this.delOAuth(`/tweets/${p.id}`),
      "tweets.get": (p) => {
        const fields = p.tweet_fields ?? "created_at,public_metrics,author_id";
        return this.get(`/tweets/${p.id}?tweet.fields=${fields}`);
      },
      "tweets.search": (p) => {
        const fields = p.tweet_fields ?? "created_at,public_metrics,author_id";
        return this.get(
          `/tweets/search/recent?query=${encodeURIComponent(String(p.query))}&tweet.fields=${fields}&max_results=${p.max_results ?? 10}`,
        );
      },
      "users.get": (p) => this.get(`/users/${p.id}?user.fields=public_metrics,description`),
      "users.by_username": (p) =>
        this.get(`/users/by/username/${p.username}?user.fields=public_metrics,description`),
      "users.followers": (p) =>
        this.get(`/users/${p.id}/followers?max_results=${p.max_results ?? 100}`),
      "users.following": (p) =>
        this.get(`/users/${p.id}/following?max_results=${p.max_results ?? 100}`),
      "users.follow": (p) =>
        this.postOAuth(`/users/${p.source_user_id}/following`, {
          target_user_id: String(p.target_user_id),
        }),
      "users.timeline": (p) => {
        const fields = p.tweet_fields ?? "created_at,public_metrics";
        return this.get(
          `/users/${p.id}/tweets?tweet.fields=${fields}&max_results=${p.max_results ?? 10}`,
        );
      },
      "likes.create": (p) =>
        this.postOAuth(`/users/${p.user_id}/likes`, { tweet_id: String(p.tweet_id) }),
      "likes.delete": (p) => this.delOAuth(`/users/${p.user_id}/likes/${p.tweet_id}`),
      "retweets.create": (p) =>
        this.postOAuth(`/users/${p.user_id}/retweets`, { tweet_id: String(p.tweet_id) }),
      "bookmarks.list": (p) =>
        this.getOAuth(`/users/${p.user_id}/bookmarks?max_results=${p.max_results ?? 20}`),

      // Direct messages
      "dm.send": (p) =>
        this.postOAuth(`/dm_conversations/with/${p.participant_id ?? p.to}/messages`, {
          text: String(p.text),
        }),
      "dm.list": (p) => this.getOAuth(`/dm_events?max_results=${p.max_results ?? 20}`),

      // Lists
      "lists.list": (p) => this.get(`/users/${p.user_id}/owned_lists`),
      "lists.get": (p) => this.get(`/lists/${p.id}`),

      // Mutes
      "mute.create": (p) =>
        this.postOAuth(`/users/${p.source_user_id}/muting`, {
          target_user_id: String(p.target_user_id),
        }),
      "mute.delete": (p) => this.delOAuth(`/users/${p.source_user_id}/muting/${p.target_user_id}`),
    };

    const handler = handlers[resolved];
    if (!handler) {
      return { ok: false, error: `Unknown X method: ${method}` };
    }

    return withRetry(() => handler(params), 2, 500);
  }

  // ---------------------------------------------------------------------------
  // Webhooks — CRC validation + HMAC-SHA256 verification
  // ---------------------------------------------------------------------------

  async webhook(headers: Record<string, string>, body: string): Promise<WebhookEvent> {
    const signature = headers["x-twitter-webhooks-signature"] ?? "";
    const verified = this.verifySignature(body, signature);

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new Error("Invalid JSON in X webhook body");
    }

    // X Account Activity API wraps events by type.
    const eventTypes = Object.keys(parsed).filter(
      (k) => k !== "for_user_id" && k !== "user_has_blocked",
    );
    const eventType = eventTypes[0] ?? "unknown";

    return {
      id: crypto.randomUUID(),
      source: this.name,
      type: eventType,
      data: parsed,
      verified,
      received_at: new Date().toISOString(),
    };
  }

  /**
   * Generate CRC response token for X webhook registration.
   * X sends a GET with `crc_token` query param; respond with
   * `{"response_token": "sha256=<hmac>"}`.
   */
  generateCrcResponse(crcToken: string): string {
    const hmac = createHmac("sha256", this.apiSecret).update(crcToken).digest("base64");
    return `sha256=${hmac}`;
  }

  private verifySignature(body: string, signature: string): boolean {
    if (!this.apiSecret || !signature) return false;
    const expected = "sha256=" + createHmac("sha256", this.apiSecret).update(body).digest("base64");
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
  // OAuth 1.0a signing (RFC 5849)
  // ---------------------------------------------------------------------------

  /**
   * Generate OAuth 1.0a Authorization header for X API v2.
   *
   * Steps per RFC 5849:
   *   1. Collect OAuth params (consumer_key, token, nonce, timestamp, signature_method, version)
   *   2. Build signature base string: METHOD&encoded_url&encoded_params
   *   3. Sign with HMAC-SHA1 using composite key: consumer_secret&token_secret
   *   4. Build Authorization header with all OAuth params + signature
   */
  private buildOAuthHeader(method: string, url: string): string {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = randomBytes(16).toString("hex");

    const oauthParams: Record<string, string> = {
      oauth_consumer_key: this.apiKey,
      oauth_nonce: nonce,
      oauth_signature_method: "HMAC-SHA1",
      oauth_timestamp: timestamp,
      oauth_token: this.accessToken,
      oauth_version: "1.0",
    };

    // Parse URL to separate base URL from query params
    const urlObj = new URL(url);
    const baseUrl = `${urlObj.origin}${urlObj.pathname}`;

    // Collect all params: OAuth params + query string params
    const allParams: Record<string, string> = { ...oauthParams };
    urlObj.searchParams.forEach((value, key) => {
      allParams[key] = value;
    });

    // Sort params alphabetically and encode per RFC 5849
    const paramString = Object.keys(allParams)
      .sort()
      .map((k) => `${percentEncode(k)}=${percentEncode(allParams[k]!)}`)
      .join("&");

    // Build signature base string: METHOD&url&params
    const signatureBase = [
      method.toUpperCase(),
      percentEncode(baseUrl),
      percentEncode(paramString),
    ].join("&");

    // Sign with composite key: consumer_secret&token_secret
    const signingKey = `${percentEncode(this.apiSecret)}&${percentEncode(this.accessTokenSecret)}`;
    const signature = createHmac("sha1", signingKey)
      .update(signatureBase)
      .digest("base64");

    oauthParams.oauth_signature = signature;

    // Build Authorization header
    const headerParams = Object.keys(oauthParams)
      .sort()
      .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k]!)}"`)
      .join(", ");

    return `OAuth ${headerParams}`;
  }

  // ---------------------------------------------------------------------------
  // HTTP helpers — Bearer token (read) and OAuth 1.0a (write)
  // ---------------------------------------------------------------------------

  /** GET with Bearer token — for public/read-only endpoints. */
  private async get(path: string): Promise<ConnectorResult> {
    const res = await fetch(`${X_API}${path}`, {
      headers: { Authorization: `Bearer ${this.bearerToken}` },
    });
    return this.toResult(res);
  }

  /** GET with OAuth 1.0a — for user-context read endpoints (bookmarks, DMs). */
  private async getOAuth(path: string): Promise<ConnectorResult> {
    const url = `${X_API}${path}`;
    const res = await fetch(url, {
      headers: { Authorization: this.buildOAuthHeader("GET", url) },
    });
    return this.toResult(res);
  }

  /** POST with OAuth 1.0a — for all write operations. */
  private async postOAuth(path: string, body: Record<string, unknown>): Promise<ConnectorResult> {
    const url = `${X_API}${path}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: this.buildOAuthHeader("POST", url),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return this.toResult(res);
  }

  /** DELETE with OAuth 1.0a — for delete operations. */
  private async delOAuth(path: string): Promise<ConnectorResult> {
    const url = `${X_API}${path}`;
    const res = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: this.buildOAuthHeader("DELETE", url) },
    });
    return this.toResult(res);
  }

  private async toResult(res: Response): Promise<ConnectorResult> {
    let data: unknown;
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    const rateLimit = this.parseRateLimit(res.headers);

    if (!res.ok) {
      const detail = (data as any)?.detail ?? (data as any)?.title ?? `HTTP ${res.status}`;
      return { ok: false, error: detail, rate_limit: rateLimit };
    }
    return { ok: true, data, rate_limit: rateLimit };
  }

  private parseRateLimit(headers: Headers): { remaining: number; reset_at: string } | undefined {
    const remaining = headers.get("x-rate-limit-remaining");
    const reset = headers.get("x-rate-limit-reset");
    if (remaining !== null && reset !== null) {
      return {
        remaining: parseInt(remaining, 10),
        reset_at: new Date(parseInt(reset, 10) * 1000).toISOString(),
      };
    }
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// RFC 5849 percent encoding
// ---------------------------------------------------------------------------

/** Percent-encode per RFC 5849 section 3.6 (stricter than encodeURIComponent). */
function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) =>
    `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}
