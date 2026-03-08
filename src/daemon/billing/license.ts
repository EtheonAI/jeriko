// License guard — tier enforcement for connectors and triggers.
//
// Reads from BillingStore on every call (no global state, no caching).
// Provides pure functions for gate checks and tier resolution.
//
// Key design principles:
//   - Never kill running automations — only gate NEW activations
//   - Past-due subscriptions get a 7-day grace period
//   - Offline machines get a 7-day grace from last verification
//   - All tier limits are sourced from config.ts TIER_LIMITS

import {
  TIER_LIMITS,
  ACTIVE_STATUSES,
  GRACE_STATUSES,
  GRACE_PERIOD_MS,
  PAST_DUE_GRACE_MS,
  UNLIMITED_TRIGGERS_STORED,
  type BillingTier,
  isBillingTier,
} from "./config.js";
import { getLicense, getSubscription, getSubscriptionById, updateLicense, type BillingLicense } from "./store.js";
import { getConfiguredConnectorCount } from "../../shared/connector.js";
import { getLogger } from "../../shared/logger.js";

const log = getLogger();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LicenseState {
  tier: BillingTier;
  label: string;
  connectorLimit: number;
  triggerLimit: number;
  email: string | null;
  subscriptionId: string | null;
  status: string;
  validUntil: number | null;
  pastDue: boolean;
  gracePeriod: boolean;
}

export interface GateResult {
  allowed: boolean;
  reason?: string;
}

// ---------------------------------------------------------------------------
// License state
// ---------------------------------------------------------------------------

/**
 * Get the current effective license state.
 *
 * Combines the cached license with subscription status to determine
 * the effective tier and limits. No network calls — reads SQLite only.
 *
 * Limits are read from the license table (set by webhook handlers) rather
 * than derived from TIER_LIMITS. This allows the webhook handler to be the
 * single source of truth for limits and supports future custom plans.
 *
 * The effective tier is computed from subscription status for display,
 * but if the effective tier disagrees with stored limits (e.g., stale cache),
 * the more restrictive limits apply.
 */
export function getLicenseState(): LicenseState {
  const license = getLicense();

  // Look up the specific subscription tied to the current license first.
  // Falls back to latest subscription only when no subscription_id is recorded
  // on the license (e.g., fresh install before any webhook fires).
  const subscription = license.subscription_id
    ? getSubscriptionById(license.subscription_id) ?? getSubscription()
    : getSubscription();

  const status = subscription?.status ?? "none";
  const rawTier = license.tier;
  const tier = effectiveTier(status, rawTier);
  const tierLimits = TIER_LIMITS[tier];

  // Use stored limits from the license table — they are set by the webhook handler
  // which is the source of truth. Fall back to TIER_LIMITS for the computed tier
  // when stored limits would be MORE permissive than the effective tier allows
  // (e.g., license says "pro" but subscription was canceled → free tier applies).
  const connectorLimit = tierLimits.connectors === Infinity
    ? license.connector_limit
    : Math.min(license.connector_limit, tierLimits.connectors);
  const triggerLimit = tierLimits.triggers === Infinity
    ? license.trigger_limit
    : Math.min(license.trigger_limit, tierLimits.triggers);

  const pastDue = GRACE_STATUSES.has(status);
  const gracePeriod = pastDue || isWithinGracePeriod(license);

  return {
    tier,
    label: tierLimits.label,
    connectorLimit,
    triggerLimit,
    email: license.email,
    subscriptionId: license.subscription_id,
    status,
    validUntil: license.valid_until,
    pastDue,
    gracePeriod,
  };
}

// ---------------------------------------------------------------------------
// Gate checks
// ---------------------------------------------------------------------------

/**
 * Check if a new connector can be activated.
 *
 * Uses the configured connector count (env vars set) as the usage metric.
 * This is the single source of truth — all surfaces (CLI, channels, API, IPC)
 * use the same count via `getConfiguredConnectorCount()`.
 *
 * @param currentCount  Override for current count (used by tests). When omitted,
 *                      reads the actual configured count from CONNECTOR_DEFS.
 * @returns Gate result with reason if denied.
 */
export function canActivateConnector(currentCount?: number): GateResult {
  const state = getLicenseState();

  const count = currentCount ?? getConfiguredConnectorCount();

  if (count < state.connectorLimit) {
    return { allowed: true };
  }

  const tierLabel = TIER_LIMITS[state.tier].label;
  const proLimit = TIER_LIMITS.pro.connectors;
  const proDesc = proLimit === Infinity ? "unlimited" : `${proLimit}`;
  return {
    allowed: false,
    reason: `Connector limit reached (${count}/${state.connectorLimit} on ${tierLabel} plan). `
      + `Upgrade to Pro for ${proDesc} connectors: run \`jeriko upgrade\``,
  };
}

/**
 * Check if a new trigger can be created.
 *
 * @param currentCount  Number of currently enabled triggers.
 * @returns Gate result with reason if denied.
 */
export function canAddTrigger(currentCount: number): GateResult {
  const state = getLicenseState();

  if (state.triggerLimit === Infinity || currentCount < state.triggerLimit) {
    return { allowed: true };
  }

  const tierLabel = TIER_LIMITS[state.tier].label;
  return {
    allowed: false,
    reason: `Trigger limit reached (${currentCount}/${state.triggerLimit} on ${tierLabel} plan). `
      + `Upgrade to Pro for unlimited triggers: run \`jeriko upgrade\``,
  };
}

// ---------------------------------------------------------------------------
// Tier resolution
// ---------------------------------------------------------------------------

/**
 * Determine the effective tier based on Stripe subscription status.
 *
 * | Status         | Effective Tier           |
 * |----------------|--------------------------|
 * | active         | Subscribed tier           |
 * | trialing       | Subscribed tier           |
 * | past_due       | Keep current for 7 days   |
 * | canceled       | free                      |
 * | unpaid         | free                      |
 * | paused         | free                      |
 * | incomplete     | free                      |
 * | none           | free                      |
 */
export function effectiveTier(status: string, tier: string): BillingTier {
  const validTier = isBillingTier(tier) ? tier : "free";

  if (ACTIVE_STATUSES.has(status)) {
    return validTier;
  }

  if (GRACE_STATUSES.has(status)) {
    // Past-due: keep current tier during grace period
    // The actual time-based grace check is in isWithinGracePeriod()
    return validTier;
  }

  // All other statuses revert to free
  return "free";
}

// ---------------------------------------------------------------------------
// Grace period
// ---------------------------------------------------------------------------

/**
 * Check if the current license is within its offline grace period.
 *
 * The license has a `valid_until` timestamp set to 7 days from the last
 * Stripe verification. If the machine is offline, this allows continued
 * access for a week.
 */
export function isWithinGracePeriod(license?: BillingLicense): boolean {
  const lic = license ?? getLicense();

  // No valid_until means never verified — no grace
  if (lic.valid_until === null) return false;

  // Convert to ms if stored as seconds
  const validUntil = lic.valid_until < 1e12 ? lic.valid_until * 1000 : lic.valid_until;
  return Date.now() < validUntil;
}

/**
 * Check if the license cache is stale (> 7 days since last verification).
 * Returns true if a refresh from Stripe is needed.
 */
export function isLicenseStale(): boolean {
  const license = getLicense();

  // Never verified — needs initial check
  if (license.verified_at === null) {
    return license.tier !== "free"; // Free tier doesn't need verification
  }

  const verifiedAt = license.verified_at < 1e12 ? license.verified_at * 1000 : license.verified_at;
  return Date.now() - verifiedAt > GRACE_PERIOD_MS;
}

// ---------------------------------------------------------------------------
// License enforcement (downgrade)
// ---------------------------------------------------------------------------

/**
 * Enforce license limits on active connectors and triggers after a downgrade.
 *
 * Called by the webhook route after processing events that change the license
 * (subscription deleted, updated to lower tier, payment failed beyond grace, etc.).
 *
 * Strategy:
 *   - Connectors: evict excess cached instances (graceful shutdown). They are NOT
 *     deleted — they will re-gate through canActivateConnector() on next get().
 *   - Triggers: disable excess enabled triggers (set enabled=false). Config is
 *     preserved — user can re-enable after upgrading.
 *   - Newest items are evicted/disabled first (preserves oldest/most-used).
 *
 * @param connectors  ConnectorManager instance (from daemon AppContext)
 * @param triggers    TriggerEngine instance (from daemon AppContext)
 * @returns Summary of enforcement actions taken
 */
export async function enforceLicenseLimits(
  connectors: { enforceLimits(max: number): Promise<string[]>; activeCount: number },
  triggers: { enforceLimits(max: number): string[]; enabledCount: number },
): Promise<{
  connectors: { evicted: string[]; activeCount: number; limit: number };
  triggers: { disabled: string[]; enabledCount: number; limit: number };
}> {
  const state = getLicenseState();

  const evictedConnectors = await connectors.enforceLimits(state.connectorLimit);
  const disabledTriggers = triggers.enforceLimits(
    state.triggerLimit === Infinity ? Number.MAX_SAFE_INTEGER : state.triggerLimit,
  );

  if (evictedConnectors.length > 0 || disabledTriggers.length > 0) {
    log.info(
      `License enforcement: evicted ${evictedConnectors.length} connector(s), `
      + `disabled ${disabledTriggers.length} trigger(s) — `
      + `tier=${state.tier}, connectorLimit=${state.connectorLimit}, `
      + `triggerLimit=${state.triggerLimit}`,
    );
  }

  return {
    connectors: {
      evicted: evictedConnectors,
      activeCount: connectors.activeCount,
      limit: state.connectorLimit,
    },
    triggers: {
      disabled: disabledTriggers,
      enabledCount: triggers.enabledCount,
      limit: state.triggerLimit === Infinity ? -1 : state.triggerLimit,
    },
  };
}

// ---------------------------------------------------------------------------
// License refresh
// ---------------------------------------------------------------------------

/**
 * Refresh the local license cache.
 *
 * Called at kernel boot (step 5.5) and periodically when the license is stale.
 *
 * Resolution strategy (tries in order):
 *   1. Relay API (if userId available) — centralized billing, no Stripe SDK needed
 *   2. Direct Stripe API (if billing configured locally) — self-hosted mode
 *   3. Keep current license + extend grace period — offline mode
 */
export async function refreshFromStripe(): Promise<void> {
  const license = getLicense();

  // No subscription to verify — nothing to refresh
  if (!license.subscription_id) {
    log.debug("License refresh: no subscription_id — skipping");
    return;
  }

  // Strategy 1: Try relay API first (centralized billing)
  const refreshedViaRelay = await refreshFromRelay(license);
  if (refreshedViaRelay) return;

  // Strategy 2: Direct Stripe API (self-hosted or relay unavailable)
  try {
    const { getStripeSubscription } = await import("./stripe.js");
    const sub = await getStripeSubscription(license.subscription_id);

    if (!sub) {
      log.warn("License refresh: subscription not found on Stripe — downgrading to free");
      updateLicense({
        tier: "free",
        connector_limit: TIER_LIMITS.free.connectors,
        trigger_limit: TIER_LIMITS.free.triggers,
        verified_at: Math.floor(Date.now() / 1000),
        valid_until: Math.floor((Date.now() + GRACE_PERIOD_MS) / 1000),
      });
      return;
    }

    const tier = effectiveTier(sub.status, license.tier);
    const limits = TIER_LIMITS[tier];
    const now = Math.floor(Date.now() / 1000);

    updateLicense({
      tier,
      connector_limit: limits.connectors === Infinity ? UNLIMITED_TRIGGERS_STORED : limits.connectors,
      trigger_limit: limits.triggers === Infinity ? UNLIMITED_TRIGGERS_STORED : limits.triggers,
      verified_at: now,
      valid_until: now + Math.floor(GRACE_PERIOD_MS / 1000),
    });

    log.info(`License refreshed: tier=${tier}, status=${sub.status}`);
  } catch (err) {
    // Network failure — keep current license, extend grace period
    log.warn(`License refresh failed (keeping current): ${err}`);

    const now = Math.floor(Date.now() / 1000);
    if (!isWithinGracePeriod(license)) {
      updateLicense({
        valid_until: now + Math.floor(GRACE_PERIOD_MS / 1000),
      });
    }
  }
}

/**
 * Try to refresh the license via the relay server's billing API.
 *
 * The relay server caches license state from Stripe webhooks, so the daemon
 * doesn't need the Stripe SDK or direct Stripe API access.
 *
 * @returns true if successfully refreshed via relay, false to fall through
 */
async function refreshFromRelay(license: BillingLicense): Promise<boolean> {
  try {
    const { getUserId } = await import("../../shared/config.js");
    const { getRelayApiUrl, isSelfHosted } = await import("../../shared/urls.js");
    const userId = getUserId();

    // Skip relay if no userId or using self-hosted tunnel
    if (!userId || isSelfHosted()) return false;

    // Authenticate with relay — same secret used for WebSocket auth
    const authToken = process.env.NODE_AUTH_SECRET;
    if (!authToken) return false;

    const relayUrl = `${getRelayApiUrl()}/billing/license/${userId}`;
    const response = await fetch(relayUrl, {
      headers: { authorization: `Bearer ${authToken}` },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) return false;

    const result = (await response.json()) as {
      ok: boolean;
      data?: {
        tier: string;
        status: string;
        subscriptionId: string | null;
        customerId: string | null;
        email: string | null;
      };
    };

    if (!result.ok || !result.data) return false;

    const { data } = result;
    const tier = effectiveTier(data.status, data.tier);
    const limits = TIER_LIMITS[tier];
    const now = Math.floor(Date.now() / 1000);

    updateLicense({
      tier,
      connector_limit: limits.connectors === Infinity ? UNLIMITED_TRIGGERS_STORED : limits.connectors,
      trigger_limit: limits.triggers === Infinity ? UNLIMITED_TRIGGERS_STORED : limits.triggers,
      verified_at: now,
      valid_until: now + Math.floor(GRACE_PERIOD_MS / 1000),
      ...(data.email ? { email: data.email } : {}),
      ...(data.subscriptionId ? { subscription_id: data.subscriptionId } : {}),
      ...(data.customerId ? { customer_id: data.customerId } : {}),
    });

    log.info(`License refreshed via relay: tier=${tier}, status=${data.status}`);
    return true;
  } catch (err) {
    log.debug(`License refresh via relay failed (will try Stripe directly): ${err}`);
    return false;
  }
}
