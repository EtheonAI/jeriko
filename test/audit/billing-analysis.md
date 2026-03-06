# Billing System Audit Analysis

Audit date: 2026-03-06
Auditor: Claude Opus 4.6

## 1. Tier System

| Tier       | Label       | Connectors | Triggers  |
|------------|-------------|------------|-----------|
| free       | Community   | 2          | 3         |
| pro        | Pro         | 10         | Unlimited |
| team       | Team        | 10         | Unlimited |
| enterprise | Enterprise  | 10         | Unlimited |

- Pro price: $19.99/mo (displayed via `PRO_PRICE_DISPLAY` constant).
- Team and Enterprise have the same limits as Pro currently. They exist as future expansion tiers.
- `UNLIMITED_TRIGGERS_STORED = 999_999` is used as the SQLite sentinel for Infinity (SQLite cannot store Infinity).

## 2. Stripe Integration Flow

### Checkout Flow
1. User runs `jeriko upgrade --email user@example.com`
2. CLI sends `billing.checkout` IPC to daemon (or uses relay proxy / direct Stripe SDK)
3. Daemon creates a Stripe Checkout session with:
   - `mode: "subscription"`
   - `billing_address_collection: "required"` (AVS fraud checks)
   - `consent_collection: { terms_of_service: "required" }` (with fallback if ToS URL not configured in Stripe Dashboard)
   - Client IP and user agent in metadata (chargeback defense)
   - `client_reference_id: userId`
4. URL is opened in user's default browser
5. After payment, Stripe sends `checkout.session.completed` webhook

### Resolution Strategy (checkout + portal)
Both checkout and portal creation try:
1. Relay proxy first (distributed users without local Stripe keys)
2. Direct Stripe SDK fallback (self-hosted users with `STRIPE_BILLING_SECRET_KEY`)

## 3. Webhook Handling

### Entry Points
- **Direct**: `POST /billing/webhook` (public route, signature-verified locally)
- **Relay-forwarded**: Processed via `processWebhookEvent()` with `{ trusted: true }` (signature already verified by relay)

### Handled Events (9 types)
| Event                                  | Action                                           |
|----------------------------------------|--------------------------------------------------|
| `checkout.session.completed`           | Create subscription, store consent, update license |
| `customer.subscription.created`        | Upsert subscription, sync license                |
| `customer.subscription.updated`        | Upsert subscription, sync license                |
| `customer.subscription.deleted`        | Set tier=free, status=canceled, sync license      |
| `customer.subscription.paused`         | Set status=paused, sync license to free           |
| `customer.subscription.resumed`        | Restore tier from metadata, sync license          |
| `invoice.paid`                         | Extend valid_until grace period                   |
| `invoice.payment_failed`               | Mark subscription as past_due                     |
| `invoice.payment_action_required`      | Log only (3DS/SCA - not a failure)                |

### Idempotency
- Every event ID is checked via `hasEvent()` before processing.
- Duplicate events are silently accepted (return `handled: true`).
- Events are stored with `INSERT OR IGNORE` on the primary key.

### Audit Trail
- Full JSON payload stored in `billing_event` table for every webhook.
- Consent evidence (IP, user agent, ToS acceptance) stored in `billing_consent` table.

## 4. License Refresh Logic

Called at kernel boot (step 5.5) via `refreshFromStripe()`.

### Resolution Strategy (tries in order)
1. **Relay API** (`/billing/license/:userId`) - centralized, no Stripe SDK needed
2. **Direct Stripe API** - self-hosted mode with local `STRIPE_BILLING_SECRET_KEY`
3. **Keep current license** - offline mode, extend grace period

### Staleness Check
- `isLicenseStale()` returns true if `verified_at` is older than 7 days
- Free tier with no verification is NOT considered stale (no verification needed)
- Non-free tier with no verification IS stale (needs initial check)

## 5. Grace Period

### Two grace period mechanisms:

1. **Offline grace** (`GRACE_PERIOD_MS = 7 days`):
   - `valid_until` is set to 7 days from last Stripe verification
   - If machine is offline, continued access until `valid_until` expires
   - `isWithinGracePeriod()` handles both seconds and milliseconds timestamps

2. **Past-due grace** (`PAST_DUE_GRACE_MS = 7 days`):
   - When subscription status is `past_due`, user keeps their subscribed tier
   - `effectiveTier()` returns the subscribed tier (not free) for `past_due` status
   - `getLicenseState()` sets `pastDue: true` and `gracePeriod: true`

### Status Classification
- **Active** (full access): `active`, `trialing`
- **Grace** (7-day window): `past_due`
- **Inactive** (immediate free): `canceled`, `unpaid`, `incomplete_expired`, `paused`, `incomplete`

## 6. Gate Enforcement

### ConnectorManager (`src/daemon/services/connectors/manager.ts`)
- Gate check: `canActivateConnector(this.instances.size)` on `get()` calls
- Only active when `STRIPE_BILLING_SECRET_KEY` is set in environment
- Uses cached instance count (not configured count) for the gate check
- `enforceLimits(max)`: evicts excess cached instances on downgrade

### TriggerEngine (`src/daemon/services/triggers/engine.ts`)
- Gate check: `canAddTrigger(enabledCount)` on `add()` calls
- Only active when `STRIPE_BILLING_SECRET_KEY` is set
- `enforceLimits(max)`: disables excess enabled triggers on downgrade

### Post-Webhook Enforcement
- After processing events that may downgrade (deleted, updated, paused, payment_failed),
  the webhook route calls `enforceLicenseLimits()` to evict/disable excess resources.
- Enforcement evicts newest items first (preserves oldest/most-used).
- Enforcement is idempotent -- running twice does not over-evict.

### Limit Calculation in `getLicenseState()`
- Uses `Math.min(stored_limit, tier_limit)` -- the more restrictive wins.
- This prevents stale cached limits from being more permissive than the effective tier allows.
- For unlimited triggers (Infinity), stored limit is used directly.

## 7. CLI Commands

### `jeriko plan`
- Shows tier, label, status, email, connector/trigger usage and limits
- Falls back to direct DB access when daemon is not running
- Trigger count is 0 in direct mode (requires TriggerEngine)

### `jeriko upgrade --email <email>`
- Validates email format (contains @ and .)
- Captures local IP and user agent for chargeback defense
- Opens Stripe Checkout in browser

### `jeriko billing [events]`
- Default: opens Stripe Customer Portal
- `events` subcommand: lists recent billing events (audit trail)
- `--limit` and `--type` flags for event filtering

## 8. Database Schema

### Tables (migration 0005 + 0006)
- `billing_subscription` - mirrors Stripe subscription lifecycle
- `billing_event` - full event audit trail (indexed on type and subscription_id)
- `billing_license` - singleton license cache (key = 'current')
- `billing_consent` - consent evidence for chargeback defense (migration 0006)

### Key Design Decisions
- Booleans stored as integers (0/1) in SQLite
- `cancel_at_period_end` as integer, converted in `rowToSubscription()`
- License uses singleton pattern (always key='current')
- Events use `INSERT OR IGNORE` for idempotency

## 9. Potential Issues Found

### Issue 1: `effectiveTier` grace period is status-based, not time-based
- `effectiveTier("past_due", "pro")` returns `"pro"` unconditionally.
- The 7-day time-based check happens in `isWithinGracePeriod()`, which only affects the
  `gracePeriod` boolean in `LicenseState` -- it does NOT affect the effective tier.
- This means a `past_due` subscription keeps Pro tier indefinitely until Stripe changes
  the status to `canceled` or `unpaid`. This is actually correct behavior since Stripe
  manages the transition from `past_due` to `canceled` after its own retry schedule.

### Issue 2: `syncLicenseFromTier` for "free" sets trigger_limit to 3
- In `webhook.ts`, `syncLicenseFromTier("free", ...)` computes limits from `TIER_LIMITS.free`,
  which has `triggers: 3`. Since `3 !== Infinity`, the ternary `limits.triggers === Infinity ? 999999 : limits.triggers`
  correctly stores `3`. No bug here.

### Issue 3: `canAddTrigger` compares against stored limit (999999), not Infinity
- In `license.ts` `getLicenseState()`, for pro tier: `tierLimits.triggers === Infinity` is true,
  so `triggerLimit` is set to `license.trigger_limit` (999999).
- In `canAddTrigger()`, the check is `state.triggerLimit === Infinity || currentCount < state.triggerLimit`.
- Since stored limit is 999999 (not Infinity), the first branch is never true for pro.
  Instead, it falls through to `currentCount < 999999`, which effectively allows up to 999,998 triggers.
- This is effectively unlimited but technically imposes a ceiling of 999,998. Not a practical bug.

### Issue 4: No subscription.paused/resumed handlers update subscription status cleanly
- `handleSubscriptionPaused` only calls `upsertSubscription` if an existing record is found.
  If no existing record exists (edge case), it still calls `syncLicenseFromTier` with empty strings
  for customer_id and email. This won't crash but creates a license with empty metadata.
- Same pattern in `handleSubscriptionResumed`.

### Issue 5: `billing_address_collected` detection in checkout handler
- The webhook handler checks `session.billing_address_collection === "required"` to determine
  if billing address was collected. This is the session configuration, not confirmation that
  the address was actually provided. However, since the checkout cannot complete without
  providing the required fields, this is a reasonable proxy.

## 10. Security Observations

- Stripe webhook signatures verified via HMAC-SHA256 (reuses connector's `verifyStripeSignature`)
- Relay-forwarded webhooks skip local verification (`trusted: true`) -- relies on relay auth
- Billing env vars use `STRIPE_BILLING_` prefix to avoid collision with user's Stripe connector
- Client IP and user agent captured for chargeback defense
- Consent evidence stored separately for dispute resolution
- `NODE_AUTH_SECRET` required for relay communication
