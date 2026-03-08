// Relay-proxied billing operations — checkout and portal session creation.
//
// Distributed users don't have STRIPE_BILLING_SECRET_KEY locally. These
// functions proxy the Stripe API calls through the relay server (bot.jeriko.ai),
// which holds the key and creates sessions on their behalf.
//
// Follows the same pattern as refreshFromRelay() in license.ts:
//   - Uses getRelayApiUrl() for URL resolution (respects JERIKO_RELAY_URL)
//   - Authenticates with RELAY_AUTH_SECRET / NODE_AUTH_SECRET
//   - Returns null on failure (caller falls back to direct Stripe)
//   - 10s timeout to prevent blocking the user on network issues

import { getLogger } from "../../shared/logger.js";

const log = getLogger();

/** Timeout for relay proxy requests (10 seconds). */
const RELAY_PROXY_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RelayCheckoutResult {
  url: string;
  sessionId: string;
}

export interface RelayPortalResult {
  url: string;
}

/** Client metadata for chargeback defense evidence. */
export interface ClientMeta {
  clientIp?: string;
  userAgent?: string;
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

/**
 * Create a Stripe Checkout session via the relay server.
 *
 * The relay server holds the Stripe secret key and creates the session
 * on behalf of the daemon. This allows distributed users to upgrade
 * without needing any Stripe keys locally.
 *
 * Client metadata (IP, user agent) is forwarded to the relay server
 * for storage in the Stripe session metadata (chargeback defense).
 *
 * @param email       Customer email for Stripe Checkout
 * @param clientMeta  IP address and user agent from the originating request
 * @returns Checkout URL and session ID, or null if relay unavailable
 */
export async function createCheckoutViaRelay(
  email: string,
  clientMeta?: ClientMeta,
): Promise<RelayCheckoutResult | null> {
  const context = await getRelayContext();
  if (!context) return null;

  try {
    const response = await fetch(`${context.relayUrl}/billing/checkout`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${context.authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId: context.userId,
        email,
        clientIp: clientMeta?.clientIp ?? "unknown",
        userAgent: clientMeta?.userAgent ?? "unknown",
      }),
      signal: AbortSignal.timeout(RELAY_PROXY_TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: string };
      log.warn(`Relay checkout failed (${response.status}): ${body.error ?? "unknown error"}`);
      return null;
    }

    const result = (await response.json()) as {
      ok: boolean;
      data?: { url: string; sessionId: string };
      error?: string;
    };

    if (!result.ok || !result.data?.url) {
      log.warn(`Relay checkout returned error: ${result.error ?? "no URL in response"}`);
      return null;
    }

    log.info("Checkout session created via relay");
    return result.data;
  } catch (err) {
    log.debug(`Relay checkout proxy failed: ${err}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Portal
// ---------------------------------------------------------------------------

/**
 * Create a Stripe Customer Portal session via the relay server.
 *
 * @param customerId  Stripe customer ID (cus_xxx)
 * @returns Portal URL, or null if relay unavailable
 */
export async function createPortalViaRelay(
  customerId: string,
): Promise<RelayPortalResult | null> {
  const context = await getRelayContext();
  if (!context) return null;

  try {
    const response = await fetch(`${context.relayUrl}/billing/portal`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${context.authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ customerId }),
      signal: AbortSignal.timeout(RELAY_PROXY_TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: string };
      log.warn(`Relay portal failed (${response.status}): ${body.error ?? "unknown error"}`);
      return null;
    }

    const result = (await response.json()) as {
      ok: boolean;
      data?: { url: string };
      error?: string;
    };

    if (!result.ok || !result.data?.url) {
      log.warn(`Relay portal returned error: ${result.error ?? "no URL in response"}`);
      return null;
    }

    log.info("Portal session created via relay");
    return result.data;
  } catch (err) {
    log.debug(`Relay portal proxy failed: ${err}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Shared context resolution
// ---------------------------------------------------------------------------

interface RelayContext {
  relayUrl: string;
  userId: string;
  authToken: string;
}

/**
 * Resolve the relay context needed for proxy calls.
 *
 * Returns null if any required component is missing:
 *   - userId (not yet installed / no JERIKO_USER_ID)
 *   - authToken (no RELAY_AUTH_SECRET or NODE_AUTH_SECRET)
 *   - self-hosted mode (JERIKO_PUBLIC_URL set — no relay needed)
 */
async function getRelayContext(): Promise<RelayContext | null> {
  const { getUserId } = await import("../../shared/config.js");
  const { getRelayApiUrl, isSelfHosted } = await import("../../shared/urls.js");

  const userId = getUserId();
  if (!userId || isSelfHosted()) return null;

  // Auth token resolution order:
  // 1. RELAY_AUTH_SECRET env var — explicit override (self-hosted relay)
  // 2. Baked-in relay secret — compiled into the binary for distributed users
  // 3. NODE_AUTH_SECRET — daemon's own auth secret (dev mode fallback)
  // 4. null — no auth available, relay calls will be skipped
  let authToken = process.env.RELAY_AUTH_SECRET;
  if (!authToken) {
    const { BAKED_RELAY_AUTH_SECRET } = await import("../../shared/baked-oauth-ids.js");
    authToken = BAKED_RELAY_AUTH_SECRET;
  }
  if (!authToken) {
    authToken = process.env.NODE_AUTH_SECRET;
  }
  if (!authToken) {
    log.debug("No relay auth token available (RELAY_AUTH_SECRET, baked secret, or NODE_AUTH_SECRET)");
    return null;
  }

  return {
    relayUrl: getRelayApiUrl(),
    userId,
    authToken,
  };
}
