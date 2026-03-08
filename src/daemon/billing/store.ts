// Billing store — SQLite persistence for subscriptions, events, and license cache.
//
// Follows the same patterns as storage/share.ts and triggers/store.ts:
//   - getDatabase() singleton for DB access
//   - Typed row interfaces for SQLite ↔ TypeScript mapping
//   - Upsert semantics for subscriptions and license
//   - Append-only event log for audit trail

import { getDatabase } from "../storage/db.js";
import { TIER_LIMITS, type BillingTier } from "./config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BillingSubscription {
  id: string;                         // Stripe subscription ID (sub_xxx)
  customer_id: string;                // Stripe customer ID (cus_xxx)
  email: string;                      // Customer email
  tier: BillingTier;                  // free | pro | team | enterprise
  status: string;                     // Stripe status: active, past_due, canceled, etc.
  current_period_start: number | null;
  current_period_end: number | null;
  cancel_at_period_end: boolean;
  terms_accepted_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface BillingEvent {
  id: string;                         // Stripe event ID (evt_xxx)
  type: string;                       // Event type (e.g. invoice.paid)
  subscription_id: string | null;     // Related subscription
  payload: string;                    // Full JSON event payload
  processed_at: number;
}

export interface BillingLicense {
  key: string;
  tier: BillingTier;
  email: string | null;
  subscription_id: string | null;
  customer_id: string | null;
  valid_until: number | null;
  verified_at: number | null;
  connector_limit: number;
  trigger_limit: number;
}

// ---------------------------------------------------------------------------
// Row types (SQLite representation — booleans stored as integers)
// ---------------------------------------------------------------------------

interface SubscriptionRow {
  id: string;
  customer_id: string;
  email: string;
  tier: string;
  status: string;
  current_period_start: number | null;
  current_period_end: number | null;
  cancel_at_period_end: number;
  terms_accepted_at: number | null;
  created_at: number;
  updated_at: number;
}

interface EventRow {
  id: string;
  type: string;
  subscription_id: string | null;
  payload: string;
  processed_at: number;
}

interface LicenseRow {
  key: string;
  tier: string;
  email: string | null;
  subscription_id: string | null;
  customer_id: string | null;
  valid_until: number | null;
  verified_at: number | null;
  connector_limit: number;
  trigger_limit: number;
}

// ---------------------------------------------------------------------------
// Subscription CRUD
// ---------------------------------------------------------------------------

/**
 * Get the current subscription record (latest by updated_at).
 * Returns null if no subscription exists.
 */
export function getSubscription(): BillingSubscription | null {
  const db = getDatabase();
  const row = db
    .query<SubscriptionRow, []>(
      "SELECT * FROM billing_subscription ORDER BY updated_at DESC LIMIT 1",
    )
    .get();
  return row ? rowToSubscription(row) : null;
}

/**
 * Get a subscription by its Stripe ID.
 */
export function getSubscriptionById(id: string): BillingSubscription | null {
  const db = getDatabase();
  const row = db
    .query<SubscriptionRow, [string]>(
      "SELECT * FROM billing_subscription WHERE id = ?",
    )
    .get(id);
  return row ? rowToSubscription(row) : null;
}

/**
 * Upsert a subscription record.
 * Updates all fields on conflict (Stripe is the source of truth).
 */
export function upsertSubscription(sub: Omit<BillingSubscription, "created_at" | "updated_at"> & {
  created_at?: number;
  updated_at?: number;
}): void {
  const db = getDatabase();
  const now = Math.floor(Date.now() / 1000);

  db.prepare(`
    INSERT INTO billing_subscription (
      id, customer_id, email, tier, status,
      current_period_start, current_period_end, cancel_at_period_end,
      terms_accepted_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      customer_id          = excluded.customer_id,
      email                = excluded.email,
      tier                 = excluded.tier,
      status               = excluded.status,
      current_period_start = excluded.current_period_start,
      current_period_end   = excluded.current_period_end,
      cancel_at_period_end = excluded.cancel_at_period_end,
      terms_accepted_at    = excluded.terms_accepted_at,
      updated_at           = excluded.updated_at
  `).run(
    sub.id,
    sub.customer_id,
    sub.email,
    sub.tier,
    sub.status,
    sub.current_period_start ?? null,
    sub.current_period_end ?? null,
    sub.cancel_at_period_end ? 1 : 0,
    sub.terms_accepted_at ?? null,
    sub.created_at ?? now,
    sub.updated_at ?? now,
  );
}

// ---------------------------------------------------------------------------
// Event audit trail
// ---------------------------------------------------------------------------

/**
 * Record a Stripe webhook event. Idempotent — duplicate event IDs are ignored.
 */
export function recordEvent(event: Omit<BillingEvent, "processed_at"> & {
  processed_at?: number;
}): void {
  const db = getDatabase();
  db.prepare(`
    INSERT OR IGNORE INTO billing_event (id, type, subscription_id, payload, processed_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    event.id,
    event.type,
    event.subscription_id ?? null,
    event.payload,
    event.processed_at ?? Math.floor(Date.now() / 1000),
  );
}

/**
 * Check if an event has already been processed (idempotency guard).
 */
export function hasEvent(eventId: string): boolean {
  const db = getDatabase();
  const row = db
    .query<{ id: string }, [string]>(
      "SELECT id FROM billing_event WHERE id = ?",
    )
    .get(eventId);
  return row !== null;
}

/**
 * Get events by type, most recent first.
 */
export function getEventsByType(type: string, limit: number = 50): BillingEvent[] {
  const db = getDatabase();
  const rows = db
    .query<EventRow, [string, number]>(
      "SELECT * FROM billing_event WHERE type = ? ORDER BY processed_at DESC LIMIT ?",
    )
    .all(type, limit);
  return rows;
}

/**
 * Get recent events across all types, most recent first.
 */
export function getRecentEvents(limit: number = 50): BillingEvent[] {
  const db = getDatabase();
  const rows = db
    .query<EventRow, [number]>(
      "SELECT * FROM billing_event ORDER BY processed_at DESC LIMIT ?",
    )
    .all(limit);
  return rows;
}

// ---------------------------------------------------------------------------
// License cache
// ---------------------------------------------------------------------------

/** Default free-tier license (used when no license record exists). */
const DEFAULT_LICENSE: BillingLicense = {
  key: "current",
  tier: "free",
  email: null,
  subscription_id: null,
  customer_id: null,
  valid_until: null,
  verified_at: null,
  connector_limit: TIER_LIMITS.free.connectors,
  trigger_limit: TIER_LIMITS.free.triggers,
};

/**
 * Get the current license. Returns free-tier defaults if no record exists.
 */
export function getLicense(): BillingLicense {
  const db = getDatabase();
  const row = db
    .query<LicenseRow, []>(
      "SELECT * FROM billing_license WHERE key = 'current'",
    )
    .get();

  if (!row) return { ...DEFAULT_LICENSE };

  return {
    key: row.key,
    tier: row.tier as BillingTier,
    email: row.email,
    subscription_id: row.subscription_id,
    customer_id: row.customer_id,
    valid_until: row.valid_until,
    verified_at: row.verified_at,
    connector_limit: row.connector_limit,
    trigger_limit: row.trigger_limit,
  };
}

/**
 * Update the license cache. Merges partial updates into the existing record.
 */
export function updateLicense(updates: Partial<Omit<BillingLicense, "key">>): void {
  const db = getDatabase();
  const current = getLicense();

  const merged: BillingLicense = {
    ...current,
    ...updates,
    key: "current", // Always use the singleton key
  };

  db.prepare(`
    INSERT INTO billing_license (
      key, tier, email, subscription_id, customer_id,
      valid_until, verified_at, connector_limit, trigger_limit
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      tier             = excluded.tier,
      email            = excluded.email,
      subscription_id  = excluded.subscription_id,
      customer_id      = excluded.customer_id,
      valid_until      = excluded.valid_until,
      verified_at      = excluded.verified_at,
      connector_limit  = excluded.connector_limit,
      trigger_limit    = excluded.trigger_limit
  `).run(
    merged.key,
    merged.tier,
    merged.email ?? null,
    merged.subscription_id ?? null,
    merged.customer_id ?? null,
    merged.valid_until ?? null,
    merged.verified_at ?? null,
    merged.connector_limit,
    merged.trigger_limit,
  );
}

// ---------------------------------------------------------------------------
// Consent evidence (chargeback defense)
// ---------------------------------------------------------------------------

export interface BillingConsent {
  id: string;
  subscription_id: string | null;
  customer_id: string | null;
  email: string | null;
  client_ip: string | null;
  user_agent: string | null;
  terms_url: string | null;
  terms_version: string | null;
  terms_accepted_at: number | null;
  privacy_url: string | null;
  billing_address_collected: boolean;
  stripe_consent_collected: boolean;
  checkout_session_id: string | null;
  created_at: number;
}

interface ConsentRow {
  id: string;
  subscription_id: string | null;
  customer_id: string | null;
  email: string | null;
  client_ip: string | null;
  user_agent: string | null;
  terms_url: string | null;
  terms_version: string | null;
  terms_accepted_at: number | null;
  privacy_url: string | null;
  billing_address_collected: number;
  stripe_consent_collected: number;
  checkout_session_id: string | null;
  created_at: number;
}

/**
 * Record consent evidence collected at checkout.
 *
 * Called by the checkout.session.completed webhook handler.
 * Stores IP address, user agent, terms acceptance, and billing address
 * collection status for chargeback defense.
 */
export function recordConsent(consent: Omit<BillingConsent, "created_at"> & {
  created_at?: number;
}): void {
  const db = getDatabase();
  db.prepare(`
    INSERT OR IGNORE INTO billing_consent (
      id, subscription_id, customer_id, email,
      client_ip, user_agent,
      terms_url, terms_version, terms_accepted_at, privacy_url,
      billing_address_collected, stripe_consent_collected,
      checkout_session_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    consent.id,
    consent.subscription_id ?? null,
    consent.customer_id ?? null,
    consent.email ?? null,
    consent.client_ip ?? null,
    consent.user_agent ?? null,
    consent.terms_url ?? null,
    consent.terms_version ?? null,
    consent.terms_accepted_at ?? null,
    consent.privacy_url ?? null,
    consent.billing_address_collected ? 1 : 0,
    consent.stripe_consent_collected ? 1 : 0,
    consent.checkout_session_id ?? null,
    consent.created_at ?? Math.floor(Date.now() / 1000),
  );
}

/**
 * Get consent evidence for a subscription (for dispute defense).
 */
export function getConsentBySubscription(subscriptionId: string): BillingConsent | null {
  const db = getDatabase();
  const row = db
    .query<ConsentRow, [string]>(
      "SELECT * FROM billing_consent WHERE subscription_id = ? ORDER BY created_at DESC LIMIT 1",
    )
    .get(subscriptionId);
  return row ? rowToConsent(row) : null;
}

/**
 * Get consent evidence by checkout session ID.
 */
export function getConsentBySession(sessionId: string): BillingConsent | null {
  const db = getDatabase();
  const row = db
    .query<ConsentRow, [string]>(
      "SELECT * FROM billing_consent WHERE checkout_session_id = ? LIMIT 1",
    )
    .get(sessionId);
  return row ? rowToConsent(row) : null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowToConsent(row: ConsentRow): BillingConsent {
  return {
    id: row.id,
    subscription_id: row.subscription_id,
    customer_id: row.customer_id,
    email: row.email,
    client_ip: row.client_ip,
    user_agent: row.user_agent,
    terms_url: row.terms_url,
    terms_version: row.terms_version,
    terms_accepted_at: row.terms_accepted_at,
    privacy_url: row.privacy_url,
    billing_address_collected: row.billing_address_collected === 1,
    stripe_consent_collected: row.stripe_consent_collected === 1,
    checkout_session_id: row.checkout_session_id,
    created_at: row.created_at,
  };
}

function rowToSubscription(row: SubscriptionRow): BillingSubscription {
  return {
    id: row.id,
    customer_id: row.customer_id,
    email: row.email,
    tier: row.tier as BillingTier,
    status: row.status,
    current_period_start: row.current_period_start,
    current_period_end: row.current_period_end,
    cancel_at_period_end: row.cancel_at_period_end === 1,
    terms_accepted_at: row.terms_accepted_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
