/**
 * ConnectorBase — abstract base class for ALL connectors.
 *
 * Provides unified:
 *   - Lifecycle (init / health / shutdown)
 *   - Call dispatch (alias resolution + handler map + retry)
 *   - HTTP helpers (get / post / postForm / patch / put / del / toResult)
 *   - Extensibility hooks (buildAuthHeader / buildUrl / extraHeaders / aliases / parseRateLimit)
 *   - Default webhook handler
 *
 * Every connector extends ConnectorBase. Subclasses declare config, implement
 * handlers() and buildAuthHeader(), then optionally override hooks. That's it.
 *
 * Architecture:
 *
 *   ConnectorBase (abstract) — common lifecycle, dispatch, HTTP
 *     |
 *     +-- BearerConnector (abstract) — OAuth2 Bearer token + refresh
 *     |     +-- GDriveConnector, OneDriveConnector, GmailConnector, OutlookConnector
 *     |
 *     +-- StripeConnector  (Bearer, form-encoded POST)
 *     +-- GitHubConnector  (Bearer, custom headers)
 *     +-- VercelConnector  (Bearer, team param)
 *     +-- TwilioConnector  (Basic auth, form-encoded POST)
 *     +-- PayPalConnector  (client_credentials -> Bearer)
 *     +-- XConnector       (Bearer reads + OAuth 1.0a writes)
 *
 * Pattern for adding a new connector:
 *
 *   1. Create `src/daemon/services/connectors/<name>/connector.ts`
 *   2. Extend ConnectorBase (or BearerConnector for OAuth2 with refresh)
 *   3. Declare `name`, `version`, `baseUrl`, `healthPath`, `label`
 *   4. Implement `buildAuthHeader()` and `handlers()`
 *   5. Optionally override: `init()`, `aliases()`, `webhook()`, `extraHeaders()`,
 *      `parseRateLimit()`, `buildUrl()`
 *   6. Add to CONNECTOR_DEFS, OAUTH_PROVIDERS, CONNECTOR_FACTORIES, dispatcher
 */

import type {
  ConnectorInterface,
  ConnectorResult,
  HealthResult,
  WebhookEvent,
} from "./interface.js";
import { withRetry, withTimeout, refreshToken } from "./middleware.js";
import { saveSecret } from "../../../shared/secrets.js";
import { getRelayApiUrl, isSelfHosted } from "../../../shared/urls.js";
import { withHttpRetry } from "../../../shared/http-retry.js";

// ---------------------------------------------------------------------------
// ConnectorBase — abstract root for all connectors
// ---------------------------------------------------------------------------

type HandlerFn = (params: Record<string, unknown>) => Promise<ConnectorResult>;

export abstract class ConnectorBase implements ConnectorInterface {
  abstract readonly name: string;
  abstract readonly version: string;

  // ---------------------------------------------------------------------------
  // Subclass must implement
  // ---------------------------------------------------------------------------

  /** Return the method -> handler map. Called on every call(). */
  protected abstract handlers(): Record<string, HandlerFn>;

  /** Build the Authorization header value (e.g. "Bearer xxx", "Basic xxx"). */
  protected abstract buildAuthHeader(): Promise<string>;

  // ---------------------------------------------------------------------------
  // Subclass must declare (config)
  // ---------------------------------------------------------------------------

  /** Base URL for API requests (e.g. "https://api.stripe.com/v1"). */
  protected abstract readonly baseUrl: string;

  /** Path appended to baseUrl for health check (e.g. "/balance"). */
  protected abstract readonly healthPath: string;

  /** Human-readable label for error messages (e.g. "Stripe"). */
  protected abstract readonly label: string;

  // ---------------------------------------------------------------------------
  // Optional hooks — override for provider-specific behavior
  // ---------------------------------------------------------------------------

  /** Method aliases resolved before handler lookup (e.g. "charges" -> "charges.list"). */
  protected aliases(): Record<string, string> {
    return {};
  }

  /** Extra headers included with every request (e.g. GitHub's Accept header). */
  protected extraHeaders(): Record<string, string> {
    return {};
  }

  /** Parse rate-limit info from response headers. Override for providers that expose it. */
  protected parseRateLimit(_headers: Headers): { remaining: number; reset_at: string } | undefined {
    return undefined;
  }

  /** Build full URL from a path. Override for URL customization (e.g. Vercel teamId). */
  protected buildUrl(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /** Initialize connector. Override to load env vars and validate credentials. */
  async init(): Promise<void> {}

  /** Health check — hits healthPath with auth header, measures latency. */
  async health(): Promise<HealthResult> {
    const start = Date.now();
    try {
      const authHeader = await this.buildAuthHeader();
      const res = await withTimeout(
        () =>
          fetch(this.buildUrl(this.healthPath), {
            headers: { Authorization: authHeader, ...this.extraHeaders() },
          }),
        5000,
      );
      const latency = Date.now() - start;
      if (!res.ok) {
        return { healthy: false, latency_ms: latency, error: `HTTP ${res.status}`, status: res.status };
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

  /** Graceful shutdown. Override to clear tokens or close connections. */
  async shutdown(): Promise<void> {}

  // ---------------------------------------------------------------------------
  // Call dispatch — aliases + handler lookup + retry
  // ---------------------------------------------------------------------------

  async call(method: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    const resolved = this.aliases()[method] ?? method;
    const handlerMap = this.handlers();
    const handler = handlerMap[resolved];
    if (!handler) {
      return { ok: false, error: `Unknown ${this.label} method: ${method}` };
    }
    // Retry on thrown exceptions (network/DNS failure, unexpected parse error).
    // HTTP-status-aware retry lives in `fetchWithRetry()` and fires on 429/5xx.
    return withRetry(() => handler(params), 2, 500);
  }

  // ---------------------------------------------------------------------------
  // Centralised HTTP fetch — every helper below routes through this, so one
  // retry/backoff implementation applies to every connector method.
  // ---------------------------------------------------------------------------

  /**
   * Fetch with transparent retry on transient HTTP failures
   * (429 + Retry-After, 500, 502, 503, 504, 408, 425) and on thrown
   * network errors. Subclasses should NEVER call `fetch` directly.
   */
  protected fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
    return withHttpRetry(() => fetch(url, init));
  }

  // ---------------------------------------------------------------------------
  // Webhook — default implementation, override for provider-specific logic
  // ---------------------------------------------------------------------------

  async webhook(headers: Record<string, string>, body: string): Promise<WebhookEvent> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new Error(`Invalid JSON in ${this.label} webhook body`);
    }
    return {
      id: crypto.randomUUID(),
      source: this.name,
      type: `${this.name}.webhook`,
      data: parsed,
      verified: false,
      received_at: new Date().toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // HTTP helpers — all requests go through buildAuthHeader() + extraHeaders()
  // ---------------------------------------------------------------------------

  /** GET request. Optional params are appended as query string (filtering out "id"). */
  protected async get(path: string, params?: Record<string, unknown>): Promise<ConnectorResult> {
    let url = this.buildUrl(path);
    if (params && Object.keys(params).length > 0) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && k !== "id") qs.set(k, String(v));
      }
      const str = qs.toString();
      if (str) url += (url.includes("?") ? "&" : "?") + str;
    }
    const authHeader = await this.buildAuthHeader();
    const res = await this.fetchWithRetry(url, {
      headers: { Authorization: authHeader, ...this.extraHeaders() },
    });
    return this.toResult(res);
  }

  /** POST with JSON body. */
  protected async post(path: string, body: Record<string, unknown>): Promise<ConnectorResult> {
    const authHeader = await this.buildAuthHeader();
    const res = await this.fetchWithRetry(this.buildUrl(path), {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        ...this.extraHeaders(),
      },
      body: JSON.stringify(body),
    });
    return this.toResult(res);
  }

  /** POST with form-urlencoded body (Stripe, Twilio). Filters out "id" and undefined values. */
  protected async postForm(path: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    const authHeader = await this.buildAuthHeader();
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && k !== "id") body.set(k, String(v));
    }
    const res = await this.fetchWithRetry(this.buildUrl(path), {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/x-www-form-urlencoded",
        ...this.extraHeaders(),
      },
      body: body.toString(),
    });
    return this.toResult(res);
  }

  /** PATCH with JSON body. */
  protected async patch(path: string, body: Record<string, unknown>): Promise<ConnectorResult> {
    const authHeader = await this.buildAuthHeader();
    const res = await this.fetchWithRetry(this.buildUrl(path), {
      method: "PATCH",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        ...this.extraHeaders(),
      },
      body: JSON.stringify(body),
    });
    return this.toResult(res);
  }

  /** PUT with JSON body. */
  protected async put(path: string, body: Record<string, unknown>): Promise<ConnectorResult> {
    const authHeader = await this.buildAuthHeader();
    const res = await this.fetchWithRetry(this.buildUrl(path), {
      method: "PUT",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        ...this.extraHeaders(),
      },
      body: JSON.stringify(body),
    });
    return this.toResult(res);
  }

  /** DELETE request. Returns `{ ok: true }` for 204 No Content. */
  protected async del(path: string): Promise<ConnectorResult> {
    const authHeader = await this.buildAuthHeader();
    const res = await this.fetchWithRetry(this.buildUrl(path), {
      method: "DELETE",
      headers: { Authorization: authHeader, ...this.extraHeaders() },
    });
    if (res.status === 204) return { ok: true };
    return this.toResult(res);
  }

  /**
   * Parse response into ConnectorResult.
   *
   * Handles error extraction for all major API formats:
   *   - `error.message` (Stripe, Google)
   *   - `message` (GitHub, Twilio, PayPal)
   *   - `detail` / `title` (X API v2)
   *   - `error_description` (OAuth2 errors)
   *   - string `error` field
   *
   * Includes rate_limit if parseRateLimit() returns data.
   */
  protected async toResult(res: Response): Promise<ConnectorResult> {
    let data: unknown;
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    const rateLimit = this.parseRateLimit(res.headers);

    if (!res.ok) {
      const d = data as Record<string, unknown> | undefined;
      const errObj = d?.error as Record<string, unknown> | string | undefined;
      const msg =
        (typeof errObj === "object" ? (errObj as any)?.message : null) ??
        (d as any)?.message ??
        (d as any)?.detail ??
        (d as any)?.error_description ??
        (d as any)?.title ??
        (typeof errObj === "string" ? errObj : null) ??
        `HTTP ${res.status}`;
      return { ok: false, error: msg, status: res.status, ...(rateLimit ? { rate_limit: rateLimit } : {}) };
    }

    return { ok: true, data, ...(rateLimit ? { rate_limit: rateLimit } : {}) };
  }
}

// ---------------------------------------------------------------------------
// BearerConnector — specialization for OAuth2 Bearer tokens with refresh
// ---------------------------------------------------------------------------

/**
 * Auth configuration for BearerConnector subclasses.
 * Each subclass declares this once — the base handles everything else.
 */
export interface BearerAuthConfig {
  /** Base URL for API requests (e.g. "https://gmail.googleapis.com/gmail/v1"). */
  baseUrl: string;
  /** Env var holding the access token (e.g. "GMAIL_ACCESS_TOKEN"). */
  tokenVar: string;
  /** Env var for refresh token (e.g. "GMAIL_REFRESH_TOKEN"). */
  refreshTokenVar?: string;
  /** Env var for OAuth client ID (e.g. "GMAIL_OAUTH_CLIENT_ID"). */
  clientIdVar?: string;
  /** Env var for OAuth client secret (e.g. "GMAIL_OAUTH_CLIENT_SECRET"). */
  clientSecretVar?: string;
  /** OAuth token endpoint for refresh (e.g. "https://oauth2.googleapis.com/token"). */
  tokenUrl?: string;
  /** OAuth scope string for refresh (e.g. "Mail.ReadWrite Mail.Send offline_access"). */
  refreshScope?: string;
  /** Path appended to baseUrl for health check (e.g. "/users/me/profile"). */
  healthPath: string;
  /** Human label for error messages (e.g. "Gmail"). */
  label: string;
}

/**
 * BearerConnector — for connectors that use OAuth2 Bearer tokens with
 * optional token refresh (Google, Microsoft services).
 *
 * Subclasses declare `auth` config and implement `handlers()`. That's it.
 */
export abstract class BearerConnector extends ConnectorBase {
  protected abstract readonly auth: BearerAuthConfig;

  // Map auth config to ConnectorBase requirements
  protected get baseUrl(): string {
    return this.auth.baseUrl;
  }
  protected get healthPath(): string {
    return this.auth.healthPath;
  }
  protected get label(): string {
    return this.auth.label;
  }

  private accessToken = "";
  private refreshTokenValue = "";
  private clientId = "";
  private clientSecret = "";

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  override async init(): Promise<void> {
    const token = process.env[this.auth.tokenVar];
    if (!token) {
      throw new Error(`${this.auth.tokenVar} env var is required`);
    }
    this.accessToken = token;
    this.refreshTokenValue = this.auth.refreshTokenVar
      ? (process.env[this.auth.refreshTokenVar] ?? "")
      : "";
    this.clientId = this.auth.clientIdVar
      ? (process.env[this.auth.clientIdVar] ?? "")
      : "";
    this.clientSecret = this.auth.clientSecretVar
      ? (process.env[this.auth.clientSecretVar] ?? "")
      : "";
  }

  override async shutdown(): Promise<void> {
    this.accessToken = "";
  }

  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------

  protected async buildAuthHeader(): Promise<string> {
    return `Bearer ${await this.getToken()}`;
  }

  protected async getToken(): Promise<string> {
    if (this.accessToken) return this.accessToken;
    if (!this.canRefresh()) {
      throw new Error("No access token and no refresh credentials configured");
    }
    return refreshToken(this.name, () => this.doRefresh());
  }

  /**
   * Whether OAuth2 token refresh is possible.
   *
   * Two modes:
   *   1. Local refresh: has refresh token + client ID + client secret + token URL
   *   2. Relay refresh: has refresh token + relay auth secret (relay holds the secret)
   */
  private canRefresh(): boolean {
    if (!this.refreshTokenValue || !this.auth.tokenUrl) return false;
    // Local refresh — user has full credentials
    if (this.clientId && this.clientSecret) return true;
    // Relay refresh — daemon doesn't have client secret, relay does
    if (!isSelfHosted() && this.getRelayAuthSecret()) return true;
    return false;
  }

  /** Get the relay auth secret for relay-based token refresh. */
  private getRelayAuthSecret(): string | undefined {
    return process.env.RELAY_AUTH_SECRET ?? process.env.NODE_AUTH_SECRET;
  }

  // ---------------------------------------------------------------------------
  // 401-aware health — detect expired tokens and retry with refresh
  // ---------------------------------------------------------------------------

  override async health(): Promise<import("./interface.js").HealthResult> {
    const result = await super.health();
    if (!result.healthy && result.status === 401 && this.canRefresh()) {
      this.accessToken = "";
      return super.health();
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // 401-aware call — detect expired tokens and retry with refresh
  // ---------------------------------------------------------------------------

  /**
   * Override call() to handle token expiry transparently.
   *
   * Flow: try → if 401 and refresh credentials exist → clear token → retry once.
   * The retry triggers getToken() → doRefresh() → saveSecret() → new Bearer header.
   */
  override async call(
    method: string,
    params: Record<string, unknown>,
  ): Promise<ConnectorResult> {
    const result = await super.call(method, params);

    if (!result.ok && result.status === 401 && this.canRefresh()) {
      this.accessToken = "";
      return super.call(method, params);
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Token refresh — mutex-guarded, persists to disk
  // ---------------------------------------------------------------------------

  private async doRefresh(): Promise<string> {
    if (!this.auth.tokenUrl) {
      throw new Error(`No token URL configured for ${this.auth.label} refresh`);
    }

    // If we have local client credentials, refresh directly with the provider
    if (this.clientId && this.clientSecret) {
      return this.doLocalRefresh();
    }

    // Otherwise, delegate to the relay server which holds the client secret
    return this.doRelayRefresh();
  }

  /** Direct token refresh — daemon has full OAuth credentials. */
  private async doLocalRefresh(): Promise<string> {
    const params: Record<string, string> = {
      grant_type: "refresh_token",
      refresh_token: this.refreshTokenValue,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    };
    if (this.auth.refreshScope) {
      params.scope = this.auth.refreshScope;
    }

    const res = await this.fetchWithRetry(this.auth.tokenUrl!, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
    });

    if (!res.ok) {
      throw new Error(`${this.auth.label} token refresh failed: HTTP ${res.status}`);
    }

    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
    };

    return this.persistRefreshedTokens(data.access_token, data.refresh_token);
  }

  /**
   * Relay-based token refresh — daemon doesn't have client secret.
   * Sends the refresh token to the relay, which uses its client secret
   * to get a new access token from the provider.
   */
  private async doRelayRefresh(): Promise<string> {
    const authSecret = this.getRelayAuthSecret();
    if (!authSecret) {
      throw new Error(`${this.auth.label} relay refresh: no RELAY_AUTH_SECRET`);
    }

    const relayUrl = `${getRelayApiUrl()}/oauth/${this.name}/refresh`;

    const body: Record<string, string> = {
      refreshToken: this.refreshTokenValue,
    };
    if (this.auth.refreshScope) {
      body.scope = this.auth.refreshScope;
    }

    const res = await this.fetchWithRetry(relayUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authSecret}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`${this.auth.label} relay refresh failed: HTTP ${res.status} — ${text.slice(0, 200)}`);
    }

    const result = (await res.json()) as {
      ok: boolean;
      data?: { accessToken: string; refreshToken?: string; expiresIn?: number };
      error?: string;
    };

    if (!result.ok || !result.data?.accessToken) {
      throw new Error(`${this.auth.label} relay refresh: ${result.error ?? "no access token"}`);
    }

    return this.persistRefreshedTokens(result.data.accessToken, result.data.refreshToken);
  }

  /** Save refreshed tokens to disk and update in-memory state. */
  private persistRefreshedTokens(accessToken: string, newRefreshToken?: string): string {
    this.accessToken = accessToken;
    saveSecret(this.auth.tokenVar, accessToken);

    if (newRefreshToken && this.auth.refreshTokenVar) {
      this.refreshTokenValue = newRefreshToken;
      saveSecret(this.auth.refreshTokenVar, newRefreshToken);
    }

    return this.accessToken;
  }
}
