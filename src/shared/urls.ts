// Shared — Public URL resolution for the Jeriko daemon.
// Single source of truth for all public-facing URLs (OAuth, webhooks, shares).
//
// URL routing modes:
//   1. Self-hosted (JERIKO_PUBLIC_URL set): URLs go directly to daemon
//   2. Relay (default): URLs include userId so bot.jeriko.ai can route
//   3. Local dev (no userId, no public URL): URLs use localhost

import { getUserId, JERIKO_DEFAULT_PORT } from "./config.js";
import { DEFAULT_RELAY_URL, RELAY_URL_ENV } from "./relay-protocol.js";

/** Default public base URL (relay server). */
const DEFAULT_PUBLIC_URL = "https://bot.jeriko.ai";

/** Strip trailing slashes from URLs to prevent double-slash in path construction. */
function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Convert a WebSocket URL to its HTTP equivalent.
 * ws:// → http://, wss:// → https://, strips /relay path suffix.
 */
function wsUrlToHttp(wsUrl: string): string {
  return wsUrl
    .replace(/^wss:\/\//, "https://")
    .replace(/^ws:\/\//, "http://")
    .replace(/\/relay\/?$/, "");
}

/**
 * Get the public base URL for the Jeriko daemon.
 * Used for OAuth callbacks, webhook endpoints, and share links.
 *
 * Resolution order:
 *   1. JERIKO_PUBLIC_URL env var (explicit override — self-hosted tunnel)
 *   2. Default: https://bot.jeriko.ai (relay server)
 */
export function getPublicUrl(): string {
  const raw = process.env.JERIKO_PUBLIC_URL ?? DEFAULT_PUBLIC_URL;
  return normalizeBaseUrl(raw);
}

/**
 * Get the relay server's HTTP API URL.
 * Used for billing license checks and other daemon-to-relay HTTP calls.
 *
 * Derived from the same source as the WebSocket URL so that local testing
 * works automatically: setting JERIKO_RELAY_URL=ws://localhost:8080/relay
 * makes this return http://localhost:8080.
 *
 * Resolution order:
 *   1. JERIKO_RELAY_URL env var (converted from ws:// to http://)
 *   2. Default relay URL (converted from wss://bot.jeriko.ai to https://bot.jeriko.ai)
 */
export function getRelayApiUrl(): string {
  const wsUrl = process.env[RELAY_URL_ENV] ?? DEFAULT_RELAY_URL;
  return normalizeBaseUrl(wsUrlToHttp(wsUrl));
}

/**
 * Whether this daemon is using a self-hosted tunnel (direct access, no relay).
 * When true, URLs go directly to the daemon without userId routing.
 */
export function isSelfHosted(): boolean {
  return !!process.env.JERIKO_PUBLIC_URL;
}

/**
 * Build the webhook URL for a specific trigger.
 *
 * When using the relay (no JERIKO_PUBLIC_URL), includes userId in the path
 * so the relay can route to the correct daemon:
 *   https://bot.jeriko.ai/hooks/:userId/:triggerId
 *
 * When self-hosted (JERIKO_PUBLIC_URL set), goes directly to daemon:
 *   https://my-tunnel.example.com/hooks/:triggerId
 *
 * When no userId is available (local dev), falls back to request-derived URL:
 *   http://127.0.0.1:3000/hooks/:triggerId
 *
 * @param triggerId  The trigger's unique ID
 * @param localBaseUrl  Optional base URL from the request (for local dev fallback)
 */
export function buildWebhookUrl(triggerId: string, localBaseUrl?: string): string {
  const publicUrl = getPublicUrl();
  const userId = getUserId();

  if (isSelfHosted()) {
    // Self-hosted tunnel — direct to daemon, no userId in URL
    return `${publicUrl}/hooks/${triggerId}`;
  }

  if (userId) {
    // Relay mode — include userId for routing
    return `${publicUrl}/hooks/${userId}/${triggerId}`;
  }

  // Local dev fallback — use request-derived URL
  const base = localBaseUrl ?? `http://127.0.0.1:${process.env.JERIKO_PORT ?? JERIKO_DEFAULT_PORT}`;
  return `${base}/hooks/${triggerId}`;
}

/**
 * Build the OAuth callback URL for a specific provider.
 *
 * Always a clean URL without userId in the path:
 *   https://bot.jeriko.ai/oauth/:provider/callback
 *
 * The userId is carried in the `state` query parameter (composite state)
 * so the relay can route without exposing userId in the URL path.
 */
export function buildOAuthCallbackUrl(provider: string): string {
  const publicUrl = getPublicUrl();
  return `${publicUrl}/oauth/${provider}/callback`;
}

/**
 * Build the OAuth start URL (where the browser is redirected to begin consent).
 *
 * Always a clean URL without userId in the path. The userId is embedded
 * in the composite state token for relay routing.
 */
export function buildOAuthStartUrl(
  provider: string,
  stateToken: string,
  context?: Record<string, string>,
): string {
  const publicUrl = getPublicUrl();
  const params = new URLSearchParams({ state: stateToken });

  // Provider-specific context (e.g. shop=mystore for Shopify)
  if (context) {
    for (const [key, value] of Object.entries(context)) {
      params.set(key, value);
    }
  }

  return `${publicUrl}/oauth/${provider}/start?${params.toString()}`;
}

/**
 * Get the base URL for share links.
 * Allows a separate domain for public share pages (e.g. jeriko.ai vs bot.jeriko.ai).
 *
 * Resolution order:
 *   1. JERIKO_SHARE_URL env var (dedicated share domain)
 *   2. JERIKO_PUBLIC_URL env var (shared with API)
 *   3. Default: https://bot.jeriko.ai
 */
export function getShareUrl(): string {
  return process.env.JERIKO_SHARE_URL ?? getPublicUrl();
}

/**
 * Build a full share link URL from a share ID.
 *
 * When using the relay (default), includes userId so the relay can route
 * the request to the correct daemon:
 *   https://bot.jeriko.ai/s/:userId/:shareId
 *
 * When self-hosted (JERIKO_PUBLIC_URL or JERIKO_SHARE_URL set), goes directly
 * to daemon without userId:
 *   https://my-tunnel.example.com/s/:shareId
 */
export function buildShareLink(shareId: string): string {
  const shareUrl = getShareUrl();
  const userId = getUserId();

  // Self-hosted or dedicated share URL — direct to daemon
  if (isSelfHosted() || process.env.JERIKO_SHARE_URL) {
    return `${shareUrl}/s/${shareId}`;
  }

  // Relay mode — include userId for routing
  if (userId) {
    return `${shareUrl}/s/${userId}/${shareId}`;
  }

  // Local dev — no userId
  return `${shareUrl}/s/${shareId}`;
}
