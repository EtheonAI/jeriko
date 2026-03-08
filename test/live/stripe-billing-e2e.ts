/**
 * Live Stripe Billing E2E Test
 *
 * Tests the full billing lifecycle using Stripe test-mode API:
 *   1. API connectivity — verify test keys work
 *   2. Checkout session creation — create a real Stripe session
 *   3. Webhook processing — simulate all 9 Stripe events via CLI triggers
 *   4. License state transitions — verify gate checks at each stage
 *   5. Downgrade enforcement — verify excess resources are gated
 *   6. Grace period — verify past_due behavior
 *   7. Re-upgrade — verify limits lift after resubscription
 *
 * Usage:
 *   STRIPE_BILLING_SECRET_KEY=sk_test_... \
 *   STRIPE_BILLING_PRICE_ID=price_... \
 *   bun test/live/stripe-billing-e2e.ts
 *
 * Requirements:
 *   - Stripe test keys (provided via env vars)
 *   - No daemon needed — tests billing logic directly
 */

import Stripe from "stripe";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unlinkSync, existsSync } from "node:fs";
import { createHmac } from "node:crypto";

// Database init (temp file for isolation)
const TEST_DB = join(tmpdir(), `jeriko-stripe-e2e-${Date.now()}.db`);
process.env.JERIKO_DB_PATH = TEST_DB;

// Set billing env vars from command line
const SK = process.env.STRIPE_BILLING_SECRET_KEY;
if (!SK) throw new Error("Set STRIPE_BILLING_SECRET_KEY env var");
const PRICE_ID = process.env.STRIPE_BILLING_PRICE_ID
  ?? "price_1T6q0dCw9IdT3cEouDSeLlhk";
const WEBHOOK_SECRET = "whsec_live_e2e_test_secret";

process.env.STRIPE_BILLING_SECRET_KEY = SK;
process.env.STRIPE_BILLING_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.STRIPE_BILLING_PRICE_ID = PRICE_ID;

// Imports (after env setup)
import { initDatabase, closeDatabase } from "../../src/daemon/storage/db.js";
import {
  TIER_LIMITS,
  UNLIMITED_TRIGGERS_STORED,
} from "../../src/daemon/billing/config.js";
import {
  getLicense,
  updateLicense,
  upsertSubscription,
  getSubscriptionById,
} from "../../src/daemon/billing/store.js";
import {
  getLicenseState,
  canActivateConnector,
  canAddTrigger,
  effectiveTier,
  enforceLicenseLimits,
} from "../../src/daemon/billing/license.js";
import { processWebhookEvent } from "../../src/daemon/billing/webhook.js";

// ---------------------------------------------------------------------------
// Test framework
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
let skipped = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

function section(label: string): void {
  console.log(`\n━━ ${label} ━━`);
}

function signPayload(body: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${body}`;
  const signature = createHmac("sha256", WEBHOOK_SECRET).update(signedPayload).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

function makeEvent(type: string, data: Record<string, unknown>, id?: string): string {
  return JSON.stringify({
    id: id ?? `evt_e2e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    data: { object: data },
  });
}

// Mock connectors/triggers for enforcement tests
class MockConnectors {
  private instances = new Map<string, boolean>();
  addInstance(name: string): void { this.instances.set(name, true); }
  get activeCount(): number { return this.instances.size; }
  async enforceLimits(max: number): Promise<string[]> {
    const entries = [...this.instances.keys()].reverse();
    const evicted: string[] = [];
    const excess = this.instances.size - max;
    if (excess <= 0) return [];
    for (const name of entries) {
      if (evicted.length >= excess) break;
      this.instances.delete(name);
      evicted.push(name);
    }
    return evicted;
  }
  getActiveNames(): string[] { return [...this.instances.keys()]; }
}

class MockTriggers {
  private triggers = new Map<string, { enabled: boolean; created_at: string }>();
  addTrigger(id: string, enabled: boolean, created_at?: string): void {
    this.triggers.set(id, { enabled, created_at: created_at ?? new Date().toISOString() });
  }
  get enabledCount(): number {
    return [...this.triggers.values()].filter((t) => t.enabled).length;
  }
  enforceLimits(max: number): string[] {
    const enabled = [...this.triggers.entries()]
      .filter(([, t]) => t.enabled)
      .sort((a, b) => new Date(a[1].created_at).getTime() - new Date(b[1].created_at).getTime());
    if (enabled.length <= max) return [];
    const excess = enabled.slice(max);
    const disabled: string[] = [];
    for (const [id] of excess) {
      const t = this.triggers.get(id)!;
      t.enabled = false;
      disabled.push(id);
    }
    return disabled;
  }
  isEnabled(id: string): boolean {
    return this.triggers.get(id)?.enabled ?? false;
  }
}

// ---------------------------------------------------------------------------
// Test 1: Stripe API connectivity
// ---------------------------------------------------------------------------

async function testStripeConnectivity(): Promise<void> {
  section("1. STRIPE API CONNECTIVITY");

  const stripe = new Stripe(SK, { apiVersion: "2026-02-25.clover" as Stripe.LatestApiVersion });

  // Verify we can list products
  try {
    const products = await stripe.products.list({ limit: 1 });
    assert(products.data.length >= 0, `API responds — ${products.data.length} product(s) found`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    assert(false, `API connectivity failed: ${msg}`);
    return;
  }

  // Verify price exists
  try {
    const price = await stripe.prices.retrieve(PRICE_ID);
    assert(price.id === PRICE_ID, `Price ${PRICE_ID} exists`);
    assert(price.recurring !== null, `Price is recurring (subscription)`);
    assert(price.active === true, `Price is active`);
    console.log(`    Amount: $${(price.unit_amount ?? 0) / 100}/${price.recurring?.interval}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    assert(false, `Price retrieval failed: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Test 2: Checkout session creation
// ---------------------------------------------------------------------------

async function testCheckoutCreation(): Promise<void> {
  section("2. CHECKOUT SESSION CREATION");

  const stripe = new Stripe(SK, { apiVersion: "2026-02-25.clover" as Stripe.LatestApiVersion });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: "e2e-test@jeriko.ai",
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      subscription_data: {
        metadata: {
          source: "jeriko-e2e-test",
          jeriko_user_id: "test-user-e2e",
        },
      },
      metadata: {
        source: "jeriko-e2e-test",
        jeriko_user_id: "test-user-e2e",
      },
      success_url: "https://jeriko.ai/billing/success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://jeriko.ai/billing/cancel",
    } as Stripe.Checkout.SessionCreateParams);

    assert(!!session.id, `Session created: ${session.id}`);
    assert(!!session.url, `Checkout URL generated`);
    assert(session.mode === "subscription", `Mode is subscription`);
    console.log(`    URL: ${session.url?.slice(0, 60)}...`);

    // Expire the session immediately (cleanup)
    try {
      await stripe.checkout.sessions.expire(session.id);
      console.log(`    Session expired (cleanup)`);
    } catch { /* might already be expired */ }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    assert(false, `Checkout creation failed: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Test 3: Create real subscription via API (for webhook testing)
// ---------------------------------------------------------------------------

let testCustomerId: string | null = null;
let testSubscriptionId: string | null = null;

async function testCreateSubscription(): Promise<void> {
  section("3. CREATE REAL TEST SUBSCRIPTION");

  const stripe = new Stripe(SK, { apiVersion: "2026-02-25.clover" as Stripe.LatestApiVersion });

  // Create customer
  try {
    const customer = await stripe.customers.create({
      email: `e2e-${Date.now()}@jeriko-test.ai`,
      name: "Jeriko E2E Test",
      metadata: { jeriko_user_id: "test-user-e2e", source: "e2e-test" },
    });
    testCustomerId = customer.id;
    assert(!!testCustomerId, `Customer created: ${testCustomerId}`);
  } catch (err: unknown) {
    assert(false, `Customer creation failed: ${err}`);
    return;
  }

  // Attach test payment method
  try {
    const pm = await stripe.paymentMethods.attach("pm_card_visa", {
      customer: testCustomerId!,
    });
    await stripe.customers.update(testCustomerId!, {
      invoice_settings: { default_payment_method: pm.id },
    });
    assert(true, `Payment method attached (test Visa)`);
  } catch (err: unknown) {
    assert(false, `Payment method attach failed: ${err}`);
    return;
  }

  // Create subscription
  try {
    const sub = await stripe.subscriptions.create({
      customer: testCustomerId!,
      items: [{ price: PRICE_ID }],
      metadata: {
        jeriko_user_id: "test-user-e2e",
        source: "e2e-test",
        tier: "pro",
      },
    });
    testSubscriptionId = sub.id;
    assert(!!testSubscriptionId, `Subscription created: ${testSubscriptionId}`);
    assert(sub.status === "active", `Status: ${sub.status}`);
    console.log(`    Period: ${new Date((sub.current_period_start ?? 0) * 1000).toISOString().slice(0, 10)} → ${new Date((sub.current_period_end ?? 0) * 1000).toISOString().slice(0, 10)}`);
  } catch (err: unknown) {
    assert(false, `Subscription creation failed: ${err}`);
  }
}

// ---------------------------------------------------------------------------
// Test 4: Webhook processing — full lifecycle
// ---------------------------------------------------------------------------

async function testWebhookLifecycle(): Promise<void> {
  section("4. WEBHOOK PROCESSING — FULL LIFECYCLE");

  if (!testSubscriptionId || !testCustomerId) {
    console.log("  ⏭ Skipped (no subscription created)");
    skipped += 6;
    return;
  }

  // 4a. Simulate checkout.session.completed
  const checkoutEvent = makeEvent("checkout.session.completed", {
    id: `cs_e2e_${Date.now()}`,
    subscription: testSubscriptionId,
    customer: testCustomerId,
    customer_email: "e2e@jeriko-test.ai",
    consent: { terms_of_service: "accepted" },
    billing_address_collection: "required",
    metadata: {
      jeriko_user_id: "test-user-e2e",
      client_ip: "127.0.0.1",
      user_agent: "jeriko-e2e-test/1.0",
    },
  });
  const checkoutResult = processWebhookEvent(checkoutEvent, signPayload(checkoutEvent));
  assert(checkoutResult.handled, `checkout.session.completed processed`);

  // Verify license updated to pro
  let lic = getLicense();
  assert(lic.tier === "pro", `License tier: pro (got: ${lic.tier})`);
  assert(lic.connector_limit === UNLIMITED_TRIGGERS_STORED, `Connector limit: unlimited (got: ${lic.connector_limit})`);
  assert(lic.trigger_limit === UNLIMITED_TRIGGERS_STORED, `Trigger limit: unlimited (got: ${lic.trigger_limit})`);
  assert(lic.subscription_id === testSubscriptionId, `Subscription ID linked`);

  // Verify license state
  let state = getLicenseState();
  assert(state.tier === "pro", `Effective tier: pro`);
  assert(state.label === "Pro", `Label: Pro`);

  // 4b. Verify gates are open on pro
  section("4b. PRO TIER GATES");
  assert(canActivateConnector(0).allowed, `0 connectors → allowed`);
  assert(canActivateConnector(50).allowed, `50 connectors → allowed (unlimited)`);
  assert(canActivateConnector(999).allowed, `999 connectors → allowed (unlimited)`);
  assert(canAddTrigger(0).allowed, `0 triggers → allowed`);
  assert(canAddTrigger(100).allowed, `100 triggers → allowed (unlimited)`);
  assert(canAddTrigger(999).allowed, `999 triggers → allowed (unlimited)`);

  // 4c. Simulate invoice.paid
  section("4c. INVOICE PAID");
  const invoicePaidEvent = makeEvent("invoice.paid", {
    subscription: testSubscriptionId,
  });
  const invoiceResult = processWebhookEvent(invoicePaidEvent, signPayload(invoicePaidEvent));
  assert(invoiceResult.handled, `invoice.paid processed`);
  lic = getLicense();
  assert(lic.verified_at !== null, `verified_at updated`);
  assert(lic.valid_until !== null, `valid_until set (grace period)`);

  // 4d. Simulate invoice.payment_failed → past_due
  section("4d. PAYMENT FAILED → PAST DUE");
  const paymentFailedEvent = makeEvent("invoice.payment_failed", {
    subscription: testSubscriptionId,
  });
  const failResult = processWebhookEvent(paymentFailedEvent, signPayload(paymentFailedEvent));
  assert(failResult.handled, `invoice.payment_failed processed`);

  const sub = getSubscriptionById(testSubscriptionId);
  assert(sub?.status === "past_due", `Subscription status: past_due (got: ${sub?.status})`);

  state = getLicenseState();
  assert(state.tier === "pro", `Past due keeps pro tier`);
  assert(state.pastDue === true, `pastDue flag set`);
  // Gates still open during grace
  assert(canActivateConnector(50).allowed, `Connectors still allowed during past_due`);
  assert(canAddTrigger(100).allowed, `Triggers still allowed during past_due`);

  // 4e. Simulate subscription.deleted → downgrade to free
  section("4e. SUBSCRIPTION DELETED → FREE");
  const deleteEvent = makeEvent("customer.subscription.deleted", {
    id: testSubscriptionId,
    customer: testCustomerId,
  });
  const deleteResult = processWebhookEvent(deleteEvent, signPayload(deleteEvent));
  assert(deleteResult.handled, `customer.subscription.deleted processed`);

  lic = getLicense();
  assert(lic.tier === "free", `License tier: free (got: ${lic.tier})`);
  assert(lic.connector_limit === TIER_LIMITS.free.connectors, `Connector limit: ${TIER_LIMITS.free.connectors} (got: ${lic.connector_limit})`);
  assert(lic.trigger_limit === TIER_LIMITS.free.triggers, `Trigger limit: ${TIER_LIMITS.free.triggers} (got: ${lic.trigger_limit})`);

  state = getLicenseState();
  assert(state.tier === "free", `Effective tier: free`);
  assert(state.label === "Community", `Label: Community`);

  // 4f. Verify gates are now enforced on free
  section("4f. FREE TIER GATES");
  assert(canActivateConnector(0).allowed, `0 connectors → allowed`);
  assert(canActivateConnector(TIER_LIMITS.free.connectors - 1).allowed, `${TIER_LIMITS.free.connectors - 1} connectors → allowed`);
  assert(!canActivateConnector(TIER_LIMITS.free.connectors).allowed, `${TIER_LIMITS.free.connectors} connectors → BLOCKED`);
  assert(!canActivateConnector(TIER_LIMITS.free.connectors + 5).allowed, `${TIER_LIMITS.free.connectors + 5} connectors → BLOCKED`);

  assert(canAddTrigger(0).allowed, `0 triggers → allowed`);
  assert(canAddTrigger(TIER_LIMITS.free.triggers - 1).allowed, `${TIER_LIMITS.free.triggers - 1} triggers → allowed`);
  assert(!canAddTrigger(TIER_LIMITS.free.triggers).allowed, `${TIER_LIMITS.free.triggers} triggers → BLOCKED`);
  assert(!canAddTrigger(TIER_LIMITS.free.triggers + 5).allowed, `${TIER_LIMITS.free.triggers + 5} triggers → BLOCKED`);

  // Check denial messages
  const connDenial = canActivateConnector(TIER_LIMITS.free.connectors);
  assert(connDenial.reason!.includes("Connector limit reached"), `Denial says 'Connector limit reached'`);
  assert(connDenial.reason!.includes("unlimited"), `Denial mentions unlimited pro`);
  assert(connDenial.reason!.includes("jeriko upgrade"), `Denial mentions upgrade command`);

  const trigDenial = canAddTrigger(TIER_LIMITS.free.triggers);
  assert(trigDenial.reason!.includes("Trigger limit reached"), `Denial says 'Trigger limit reached'`);
  assert(trigDenial.reason!.includes("unlimited"), `Denial mentions unlimited pro`);
}

// ---------------------------------------------------------------------------
// Test 5: Downgrade enforcement — excess resources
// ---------------------------------------------------------------------------

async function testDowngradeEnforcement(): Promise<void> {
  section("5. DOWNGRADE ENFORCEMENT");

  // Scenario: User had pro with 12 connectors + 20 triggers, then cancels
  // Expected: evict to 5 connectors, disable to 10 triggers

  // Set up pro state
  updateLicense({
    tier: "pro",
    connector_limit: UNLIMITED_TRIGGERS_STORED,
    trigger_limit: UNLIMITED_TRIGGERS_STORED,
    subscription_id: "sub_enforce_test",
    verified_at: Math.floor(Date.now() / 1000),
    valid_until: Math.floor(Date.now() / 1000) + 604800,
  });
  upsertSubscription({
    id: "sub_enforce_test",
    customer_id: "cus_enforce",
    email: "enforce@test.com",
    tier: "pro",
    status: "active",
    current_period_start: null,
    current_period_end: null,
    cancel_at_period_end: false,
    terms_accepted_at: null,
  });

  // Create mock resources (above free limits)
  const connectors = new MockConnectors();
  for (let i = 1; i <= 12; i++) connectors.addInstance(`connector-${i}`);

  const triggers = new MockTriggers();
  const base = new Date("2025-01-01").getTime();
  for (let i = 1; i <= 20; i++) {
    triggers.addTrigger(`trigger-${i}`, true, new Date(base + i * 86400000).toISOString());
  }

  console.log(`  Before: ${connectors.activeCount} connectors, ${triggers.enabledCount} triggers`);
  assert(connectors.activeCount === 12, `12 connectors active`);
  assert(triggers.enabledCount === 20, `20 triggers enabled`);

  // Downgrade to free
  updateLicense({
    tier: "free",
    connector_limit: TIER_LIMITS.free.connectors,
    trigger_limit: TIER_LIMITS.free.triggers,
    subscription_id: "sub_enforce_test",
  });
  upsertSubscription({
    id: "sub_enforce_test",
    customer_id: "cus_enforce",
    email: "enforce@test.com",
    tier: "free",
    status: "canceled",
    current_period_start: null,
    current_period_end: null,
    cancel_at_period_end: false,
    terms_accepted_at: null,
  });

  // Run enforcement
  const result = await enforceLicenseLimits(connectors, triggers);

  console.log(`  After: ${connectors.activeCount} connectors, ${triggers.enabledCount} triggers`);
  console.log(`  Evicted: ${result.connectors.evicted.length} connectors`);
  console.log(`  Disabled: ${result.triggers.disabled.length} triggers`);

  assert(connectors.activeCount === TIER_LIMITS.free.connectors, `Connectors reduced to ${TIER_LIMITS.free.connectors} (got: ${connectors.activeCount})`);
  assert(triggers.enabledCount === TIER_LIMITS.free.triggers, `Triggers reduced to ${TIER_LIMITS.free.triggers} (got: ${triggers.enabledCount})`);
  assert(result.connectors.evicted.length === 7, `7 connectors evicted (got: ${result.connectors.evicted.length})`);
  assert(result.triggers.disabled.length === 10, `10 triggers disabled (got: ${result.triggers.disabled.length})`);

  // Verify oldest connectors survived (LIFO eviction)
  assert(connectors.getActiveNames().includes("connector-1"), `Oldest connector (connector-1) survived`);
  assert(connectors.getActiveNames().includes("connector-5"), `connector-5 survived`);
  assert(!connectors.getActiveNames().includes("connector-12"), `Newest connector (connector-12) evicted`);
  assert(!connectors.getActiveNames().includes("connector-8"), `connector-8 evicted`);

  // Verify oldest triggers survived
  assert(triggers.isEnabled("trigger-1"), `Oldest trigger (trigger-1) survived`);
  assert(triggers.isEnabled("trigger-10"), `trigger-10 survived`);
  assert(!triggers.isEnabled("trigger-11"), `trigger-11 disabled`);
  assert(!triggers.isEnabled("trigger-20"), `Newest trigger (trigger-20) disabled`);

  // Verify enforcement is idempotent
  const result2 = await enforceLicenseLimits(connectors, triggers);
  assert(result2.connectors.evicted.length === 0, `Second enforcement: 0 evictions (idempotent)`);
  assert(result2.triggers.disabled.length === 0, `Second enforcement: 0 disables (idempotent)`);
}

// ---------------------------------------------------------------------------
// Test 6: Status → tier mapping (all statuses)
// ---------------------------------------------------------------------------

async function testStatusMapping(): Promise<void> {
  section("6. STATUS → TIER MAPPING");

  const testCases = [
    { status: "active", expected: "pro" },
    { status: "trialing", expected: "pro" },
    { status: "past_due", expected: "pro" },
    { status: "canceled", expected: "free" },
    { status: "unpaid", expected: "free" },
    { status: "paused", expected: "free" },
    { status: "incomplete", expected: "free" },
    { status: "incomplete_expired", expected: "free" },
    { status: "unknown_status", expected: "free" },
    { status: "none", expected: "free" },
  ];

  for (const tc of testCases) {
    const tier = effectiveTier(tc.status, "pro");
    assert(tier === tc.expected, `${tc.status} → ${tc.expected} (got: ${tier})`);
  }
}

// ---------------------------------------------------------------------------
// Test 7: Re-upgrade after cancel
// ---------------------------------------------------------------------------

async function testReUpgrade(): Promise<void> {
  section("7. RE-UPGRADE AFTER CANCEL");

  // Start on free
  updateLicense({
    tier: "free",
    connector_limit: TIER_LIMITS.free.connectors,
    trigger_limit: TIER_LIMITS.free.triggers,
    subscription_id: null,
  });

  let state = getLicenseState();
  assert(state.tier === "free", `Starting tier: free`);
  assert(!canActivateConnector(TIER_LIMITS.free.connectors).allowed, `Gated at free connector limit`);
  assert(!canAddTrigger(TIER_LIMITS.free.triggers).allowed, `Gated at free trigger limit`);

  // Re-upgrade via checkout webhook
  const reUpgradeEvent = makeEvent("checkout.session.completed", {
    id: `cs_reupgrade_${Date.now()}`,
    subscription: "sub_reupgrade",
    customer: "cus_reupgrade",
    customer_email: "reupgrade@jeriko-test.ai",
    metadata: { jeriko_user_id: "test-user-e2e" },
  });
  processWebhookEvent(reUpgradeEvent, signPayload(reUpgradeEvent));

  state = getLicenseState();
  assert(state.tier === "pro", `Re-upgraded tier: pro`);
  assert(canActivateConnector(TIER_LIMITS.free.connectors).allowed, `Connectors ungated after upgrade`);
  assert(canActivateConnector(100).allowed, `100 connectors allowed on pro`);
  assert(canAddTrigger(TIER_LIMITS.free.triggers).allowed, `Triggers ungated after upgrade`);
  assert(canAddTrigger(500).allowed, `500 triggers allowed on pro`);
}

// ---------------------------------------------------------------------------
// Test 8: Webhook event edge cases
// ---------------------------------------------------------------------------

async function testWebhookEdgeCases(): Promise<void> {
  section("8. WEBHOOK EDGE CASES");

  // 8a. Paused subscription
  const pauseEvent = makeEvent("customer.subscription.paused", {
    id: "sub_pause_test",
    customer: "cus_pause",
  });

  // First create the subscription
  upsertSubscription({
    id: "sub_pause_test",
    customer_id: "cus_pause",
    email: "pause@test.com",
    tier: "pro",
    status: "active",
    current_period_start: null,
    current_period_end: null,
    cancel_at_period_end: false,
    terms_accepted_at: null,
  });
  updateLicense({
    tier: "pro",
    connector_limit: UNLIMITED_TRIGGERS_STORED,
    trigger_limit: UNLIMITED_TRIGGERS_STORED,
    subscription_id: "sub_pause_test",
  });

  processWebhookEvent(pauseEvent, signPayload(pauseEvent));
  let state = getLicenseState();
  assert(state.tier === "free", `Paused → free (got: ${state.tier})`);

  // 8b. Resumed subscription
  const resumeEvent = makeEvent("customer.subscription.resumed", {
    id: "sub_pause_test",
    customer: "cus_pause",
    status: "active",
    metadata: { tier: "pro" },
  });
  processWebhookEvent(resumeEvent, signPayload(resumeEvent));
  state = getLicenseState();
  assert(state.tier === "pro", `Resumed → pro (got: ${state.tier})`);

  // 8c. Duplicate event (idempotency)
  const dupeId = `evt_dupe_${Date.now()}`;
  const dupeEvent = makeEvent("invoice.paid", { subscription: "sub_pause_test" }, dupeId);
  const first = processWebhookEvent(dupeEvent, signPayload(dupeEvent));
  const second = processWebhookEvent(dupeEvent, signPayload(dupeEvent));
  assert(first.handled, `First event processed`);
  assert(second.handled, `Duplicate silently accepted (idempotent)`);

  // 8d. Invalid signature
  const badSig = processWebhookEvent(dupeEvent, "t=123,v1=invalid_sig");
  assert(!badSig.handled, `Invalid signature rejected`);

  // 8e. Missing signature header
  const noSig = processWebhookEvent(dupeEvent, "");
  assert(!noSig.handled, `Empty signature rejected`);

  // 8f. payment_action_required (should NOT downgrade)
  updateLicense({
    tier: "pro",
    connector_limit: UNLIMITED_TRIGGERS_STORED,
    trigger_limit: UNLIMITED_TRIGGERS_STORED,
    subscription_id: "sub_action_required",
  });
  upsertSubscription({
    id: "sub_action_required",
    customer_id: "cus_action",
    email: "action@test.com",
    tier: "pro",
    status: "active",
    current_period_start: null,
    current_period_end: null,
    cancel_at_period_end: false,
    terms_accepted_at: null,
  });

  const actionEvent = makeEvent("invoice.payment_action_required", {
    subscription: "sub_action_required",
    hosted_invoice_url: "https://invoice.stripe.com/test",
  });
  processWebhookEvent(actionEvent, signPayload(actionEvent));
  state = getLicenseState();
  assert(state.tier === "pro", `payment_action_required keeps pro (got: ${state.tier})`);
}

// ---------------------------------------------------------------------------
// Test 9: Real Stripe subscription lifecycle
// ---------------------------------------------------------------------------

async function testRealSubscriptionLifecycle(): Promise<void> {
  section("9. REAL STRIPE SUBSCRIPTION LIFECYCLE");

  if (!testSubscriptionId || !testCustomerId) {
    console.log("  ⏭ Skipped (no subscription created)");
    skipped += 3;
    return;
  }

  const stripe = new Stripe(SK, { apiVersion: "2026-02-25.clover" as Stripe.LatestApiVersion });

  // Verify subscription is active
  try {
    const sub = await stripe.subscriptions.retrieve(testSubscriptionId);
    assert(sub.status === "active", `Real subscription status: ${sub.status}`);
    assert(sub.metadata.jeriko_user_id === "test-user-e2e", `Metadata preserved: jeriko_user_id`);
  } catch (err: unknown) {
    assert(false, `Failed to retrieve subscription: ${err}`);
    return;
  }

  // Cancel at period end
  try {
    const updated = await stripe.subscriptions.update(testSubscriptionId, {
      cancel_at_period_end: true,
    });
    assert(updated.cancel_at_period_end === true, `cancel_at_period_end set`);
    assert(updated.status === "active", `Still active until period end`);
  } catch (err: unknown) {
    assert(false, `Failed to cancel subscription: ${err}`);
  }

  // Actually cancel immediately (for cleanup)
  try {
    const canceled = await stripe.subscriptions.cancel(testSubscriptionId);
    assert(canceled.status === "canceled", `Subscription canceled: ${canceled.status}`);
  } catch (err: unknown) {
    assert(false, `Failed to cancel subscription: ${err}`);
  }
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

async function cleanup(): Promise<void> {
  section("CLEANUP");

  const stripe = new Stripe(SK, { apiVersion: "2026-02-25.clover" as Stripe.LatestApiVersion });

  // Cancel subscription if still active
  if (testSubscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(testSubscriptionId);
      if (sub.status !== "canceled") {
        await stripe.subscriptions.cancel(testSubscriptionId);
      }
      console.log(`  Subscription ${testSubscriptionId} cleaned up`);
    } catch { /* already canceled */ }
  }

  // Delete test customer
  if (testCustomerId) {
    try {
      await stripe.customers.del(testCustomerId);
      console.log(`  Customer ${testCustomerId} deleted`);
    } catch { /* might fail */ }
  }

  // Close database
  try {
    closeDatabase();
  } catch { /* ignore */ }

  // Remove temp database
  if (existsSync(TEST_DB)) {
    try {
      unlinkSync(TEST_DB);
      console.log(`  Temp DB removed: ${TEST_DB}`);
    } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("╔═══════════════════════════════════════════════════╗");
  console.log("║  LIVE STRIPE BILLING E2E TEST (sandbox mode)     ║");
  console.log("╠═══════════════════════════════════════════════════╣");
  console.log(`║  Free tier: ${TIER_LIMITS.free.connectors} connectors, ${TIER_LIMITS.free.triggers} triggers             ║`);
  console.log(`║  Pro tier:  unlimited connectors, unlimited trig  ║`);
  console.log("╚═══════════════════════════════════════════════════╝");

  // Init database
  initDatabase(TEST_DB);

  try {
    await testStripeConnectivity();
    await testCheckoutCreation();
    await testCreateSubscription();
    await testWebhookLifecycle();
    await testDowngradeEnforcement();
    await testStatusMapping();
    await testReUpgrade();
    await testWebhookEdgeCases();
    await testRealSubscriptionLifecycle();
  } catch (err: unknown) {
    console.error(`\n  FATAL: ${err}`);
    failed++;
  } finally {
    await cleanup();
  }

  console.log("\n═══════════════════════════════════════════════════════");
  console.log(`  Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log("═══════════════════════════════════════════════════════");

  process.exit(failed > 0 ? 1 : 0);
}

main();
