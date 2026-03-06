# ADR-002: Billing Subscription Flow — Stripe Alignment

**Status:** Accepted
**Date:** 2026-03-06
**Author:** Claude (PHD analysis)
**Affects:** billing, checkout, webhooks, relay, CLI, daemon, DB schema

---

## Context

Jeriko's billing uses Stripe Checkout in subscription mode. An audit against Stripe's official subscription documentation revealed compliance gaps and missing best practices that expose us to chargeback risk and reduce dispute defensibility.

**Sources analyzed:**
- Stripe Billing Subscriptions Overview
- Stripe Checkout Sessions API
- Stripe Webhooks for Subscriptions
- Stripe Dispute Prevention Guide
- Stripe Security Guide
- Stripe Customer Portal docs

---

## Decision

Align the billing flow with Stripe's recommended subscription lifecycle. Store all evidence needed for chargeback protection. Use Stripe's built-in consent collection.

---

## Gap Analysis

### What's Already Correct (No Change)
| Feature | Status | Location |
|---------|--------|----------|
| `mode: 'subscription'` on checkout | ✅ | stripe.ts:101 |
| `cancel_at_period_end: true` for cancellations | ✅ | stripe.ts:228 |
| Idempotent webhook processing (event ID dedup) | ✅ | webhook.ts:115 |
| Full event payload audit trail | ✅ | webhook.ts:122 |
| 7-day grace period for past_due | ✅ | config.ts:79 |
| 8 webhook event handlers | ✅ | webhook.ts:44 |
| Customer Portal session creation | ✅ | stripe.ts:144 |
| Offline grace period (7 days) | ✅ | license.ts:208 |
| License enforcement on downgrade | ✅ | license.ts:256 |

### Gaps Found (Must Fix)

| # | Gap | Risk | Fix |
|---|-----|------|-----|
| 1 | No IP address collected at checkout | Cannot prove customer initiated purchase (chargeback defense) | Pass `client_ip` in checkout metadata + store in DB |
| 2 | No user agent collected | Weak device fingerprint for dispute evidence | Pass `user_agent` in checkout metadata + store in DB |
| 3 | No `billing_address_collection` | Higher fraud risk, weaker dispute evidence | Add `billing_address_collection: 'required'` to checkout |
| 4 | No `consent_collection` | No Stripe-verified ToS acceptance record | Add `consent_collection: { terms_of_service: 'required' }` |
| 5 | No `client_reference_id` | Cannot correlate Stripe session to internal user in Dashboard | Set `client_reference_id: userId` on checkout |
| 6 | Missing `invoice.payment_action_required` webhook | 3DS/SCA failures silently ignored | Add handler that logs + flags subscription |
| 7 | No consent evidence in DB | Terms acceptance only in Stripe metadata, not locally queryable | Add `billing_consent` table |
| 8 | Relay proxy doesn't forward client metadata | Centralized users lose IP/UA evidence | Add `clientIp`, `userAgent` to relay checkout request |
| 9 | `customer_creation` not set | Could create orphan sessions without customer | Set `customer_creation: 'always'` |
| 10 | No `payment_method_collection` explicit | Stripe default works but explicit is safer | Set `payment_method_collection: 'always'` |

---

## Implementation Plan

### Phase 1: Database Schema (migration 0006)
- New table: `billing_consent` — stores IP, user agent, terms version, terms URL, timestamp
- Add index on `subscription_id` for consent lookups

### Phase 2: Checkout Session Enhancement (stripe.ts)
- Add `billing_address_collection: 'required'`
- Add `consent_collection: { terms_of_service: 'required' }`
- Add `client_reference_id: userId`
- Add `customer_creation: 'always'`
- Add `payment_method_collection: 'always'`
- Move `client_ip` and `user_agent` into `subscription_data.metadata`
- Accept `clientIp` and `userAgent` as parameters

### Phase 3: Webhook Handler Enhancement (webhook.ts)
- Add `invoice.payment_action_required` handler
- Enhance `checkout.session.completed` to extract and store consent data
- Extract customer details (billing address) from completed session

### Phase 4: Store Enhancement (store.ts)
- Add `recordConsent()` function
- Add `getConsent()` function for dispute evidence retrieval

### Phase 5: Relay Proxy Enhancement (relay-proxy.ts)
- Add `clientIp` and `userAgent` to checkout request body
- Relay server passes these through to Stripe

### Phase 6: API + CLI Enhancement
- Pass client IP (from request headers) and user agent through checkout route
- CLI captures terminal user agent string

### Phase 7: Relay Server Updates
- Both relay implementations accept and forward client metadata
- Billing checkout route extracts IP from request if not provided

---

## Data Flow (After)

```
User runs `jeriko upgrade --email foo@example.com --terms-accepted`
  │
  ├── CLI captures: email, IP (via relay or local), user agent (process info)
  │
  ├── Daemon IPC → billing.checkout { email, terms_accepted, client_ip, user_agent }
  │   │
  │   ├── Strategy 1: Relay proxy (POST /billing/checkout)
  │   │   Body: { userId, email, termsAccepted, clientIp, userAgent }
  │   │   Relay creates Stripe Checkout session with all metadata
  │   │
  │   └── Strategy 2: Direct Stripe (createCheckoutSession)
  │       Same metadata passed directly
  │
  ├── Stripe Checkout Session created with:
  │   - mode: 'subscription'
  │   - billing_address_collection: 'required'
  │   - consent_collection: { terms_of_service: 'required' }
  │   - client_reference_id: userId
  │   - customer_creation: 'always'
  │   - payment_method_collection: 'always'
  │   - subscription_data.metadata: { source, jeriko_user_id, client_ip, user_agent }
  │   - metadata: { source, jeriko_user_id }
  │
  └── User redirected to Stripe Checkout hosted page
      │
      ├── Stripe collects: card details, billing address, name, ToS consent
      ├── Stripe handles: PCI compliance, 3DS/SCA, payment processing
      │
      └── On success → redirect to success_url
          │
          └── Stripe fires: checkout.session.completed webhook
              │
              ├── Extract: subscription_id, customer_id, email, consent data
              ├── Store subscription record (billing_subscription)
              ├── Store consent evidence (billing_consent):
              │   - client_ip, user_agent, terms_url, terms_version
              │   - terms_accepted_at, billing_address_collected: true
              ├── Sync license (tier=pro, limits updated)
              └── Log event in audit trail (billing_event)
```

---

## Chargeback Defense Evidence (What We Store)

| Evidence Type | Source | Storage |
|---------------|--------|---------|
| Customer email | Stripe Checkout | billing_subscription.email |
| IP address at purchase | CLI/API request | billing_consent.client_ip |
| User agent at purchase | CLI/API request | billing_consent.user_agent |
| Terms of Service acceptance | Stripe consent_collection | billing_consent.terms_accepted_at |
| Terms URL + version | Our config | billing_consent.terms_url, terms_version |
| Billing address collected | Stripe Checkout | billing_consent.billing_address_collected |
| Full webhook event payloads | Stripe webhooks | billing_event.payload |
| Subscription lifecycle | Stripe webhooks | billing_subscription (status history) |
| Payment receipts | Stripe (automatic) | Stripe Dashboard |
| Usage/access logs | Daemon | Session logs (existing) |

---

## Stripe Handles (We Do NOT Touch)

- PCI Level 1 compliance (card data never touches our servers)
- Payment page UI (hosted Checkout)
- Card storage and tokenization
- Invoice generation and delivery
- Receipt emails (automatic)
- Smart Retries (ML-optimized retry timing)
- SCA/3D Secure authentication flows
- Proration calculations on plan changes
- Customer Portal UI
- Webhook delivery with retry logic

---

## What We Are Responsible For

- Provisioning/revoking access based on subscription status
- Mapping Stripe customer ID ↔ internal user ID
- Verifying webhook signatures
- Idempotent webhook processing
- Storing evidence for dispute defense
- TLS on all endpoints
- API key security (env vars only, never client-side)
- Cancellation policy (end-of-period, already implemented)

---

## Risk Assessment

| Risk | Mitigation | Residual |
|------|-----------|----------|
| Chargeback without evidence | Store IP, UA, ToS consent, full event payloads | Low |
| PCI non-compliance | Using Stripe Checkout (hosted) — Stripe handles all card data | None |
| 3DS/SCA failure undetected | Add `invoice.payment_action_required` webhook handler | Low |
| Terms acceptance dispute | Stripe `consent_collection` creates verifiable record | None |
| Billing address fraud | `billing_address_collection: 'required'` enables AVS checks | Low |
| Orphan checkout sessions | `customer_creation: 'always'` ensures customer record | None |

---

## Backward Compatibility

- New migration (0006) adds table only — no schema changes to existing tables
- Checkout sessions created before this change work fine (missing consent data won't break anything)
- All webhook handlers remain backward-compatible (new handler is additive)
- CLI `--terms-accepted` flag remains, but Stripe consent_collection is now the primary record
