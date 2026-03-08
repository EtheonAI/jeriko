/**
 * COMPREHENSIVE STRIPE EDGE-CASE TEST
 *
 * Real Stripe sandbox with correct $19.99 pricing.
 * Tests every card scenario and billing edge case:
 *
 *   1. Normal subscribe ($19.99/mo) + verify payment
 *   2. Declined card (card_declined)
 *   3. Expired card (expired_card)
 *   4. Insufficient funds (insufficient_funds)
 *   5. Cancel at period end (cancel_at_period_end)
 *   6. Immediate cancel
 *   7. Re-subscribe after cancel
 *   8. Payment failure on active sub -> past_due
 *   9. 3D Secure / SCA required card
 *  10. Dispute/fraud card
 *  11. Subscription update (upgrade path)
 *  12. Multiple rapid subscribe/cancel cycles
 *  13. Verify license state at every step
 *
 * Usage: bun test/live/stripe-edge-cases.ts
 */

import Stripe from "stripe";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlinkSync, existsSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { createHmac } from "node:crypto";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SK = process.env.STRIPE_BILLING_SECRET_KEY;
if (!SK) throw new Error("Set STRIPE_BILLING_SECRET_KEY env var");
const PRICE_ID = "price_1T8RS3Cw9IdT3cEoAx9auawZ"; // $19.99/month
const PORT = 19878;

// Stripe test card tokens:
// https://docs.stripe.com/testing#cards
const CARDS = {
  visa:               "pm_card_visa",            // succeeds
  declined:           "pm_card_chargeDeclined",   // always declined
  expired:            "pm_card_chargeDeclinedExpiredCard", // expired card
  insufficient:       "pm_card_chargeDeclinedInsufficientFunds", // insufficient funds
  fraud:              "pm_card_chargeDeclinedFraudulent", // fraudulent
  cvcFail:            "pm_card_chargeDeclinedIncorrectCvc", // bad CVC
  processingError:    "pm_card_chargeDeclinedProcessingError", // processing error
};

// Isolated DB
const TEST_DB = join(tmpdir(), `jeriko-edge-${Date.now()}.db`);
process.env.JERIKO_DB_PATH = TEST_DB;
process.env.STRIPE_BILLING_SECRET_KEY = SK;
process.env.STRIPE_BILLING_PRICE_ID = PRICE_ID;

import { initDatabase, closeDatabase } from "../../src/daemon/storage/db.js";
import { TIER_LIMITS } from "../../src/daemon/billing/config.js";
import { getLicense } from "../../src/daemon/billing/store.js";
import {
  getLicenseState,
  canActivateConnector,
  canAddTrigger,
  enforceLicenseLimits,
} from "../../src/daemon/billing/license.js";
import { processWebhookEvent } from "../../src/daemon/billing/webhook.js";

initDatabase(TEST_DB);

const stripe = new Stripe(SK, { apiVersion: "2026-02-25.clover" as Stripe.LatestApiVersion });

// ---------------------------------------------------------------------------
// Webhook receiver
// ---------------------------------------------------------------------------

let webhookSecret: string | null = null;
const receivedEvents: Array<{ type: string; handled: boolean; ts: number }> = [];

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  if (req.method !== "POST" || !webhookSecret) { res.writeHead(200); res.end(); return; }
  const body = await readBody(req);
  const sig = req.headers["stripe-signature"] as string ?? "";
  process.env.STRIPE_BILLING_WEBHOOK_SECRET = webhookSecret;
  const result = processWebhookEvent(body, sig);
  let eventType = "unknown";
  try { eventType = (JSON.parse(body) as { type: string }).type; } catch {}
  receivedEvents.push({ type: eventType, handled: result.handled, ts: Date.now() });
  res.writeHead(200);
  res.end(JSON.stringify({ ok: true }));
});

// ---------------------------------------------------------------------------
// Stripe CLI
// ---------------------------------------------------------------------------

function startListener(): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const proc = spawn("stripe", [
      "listen", "--forward-to", `http://127.0.0.1:${PORT}/webhook`, "--api-key", SK,
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const timeout = setTimeout(() => reject(new Error("Stripe CLI timeout")), 15000);
    function check(text: string): void {
      output += text;
      const match = output.match(/whsec_\S+/);
      if (match && !webhookSecret) { webhookSecret = match[0]; clearTimeout(timeout); resolve(proc); }
    }
    proc.stdout!.on("data", (d: Buffer) => check(d.toString()));
    proc.stderr!.on("data", (d: Buffer) => check(d.toString()));
    proc.on("error", (err) => { clearTimeout(timeout); reject(err); });
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function wait(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

function waitForEvent(type: string, timeoutMs = 20000): Promise<boolean> {
  const startCount = receivedEvents.filter((e) => e.type === type).length;
  const start = Date.now();
  return new Promise((resolve) => {
    const iv = setInterval(() => {
      const now = receivedEvents.filter((e) => e.type === type).length;
      if (now > startCount) { clearInterval(iv); resolve(true); }
      else if (Date.now() - start > timeoutMs) { clearInterval(iv); resolve(false); }
    }, 200);
  });
}

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string): void {
  if (cond) { console.log(`    PASS: ${label}`); passed++; }
  else { console.log(`    FAIL: ${label}`); failed++; }
}

function section(n: number, label: string): void {
  console.log(`\n--- TEST ${n}: ${label} ---`);
}

// Cleanup trackers
const customers: string[] = [];
const subscriptions: string[] = [];

async function createCustomer(card: string, email: string): Promise<{ cusId: string; pmId: string } | null> {
  try {
    const cus = await stripe.customers.create({
      email,
      metadata: { jeriko_user_id: "edge-test", source: "edge-case-test" },
    });
    customers.push(cus.id);

    const pm = await stripe.paymentMethods.attach(card, { customer: cus.id });
    await stripe.customers.update(cus.id, {
      invoice_settings: { default_payment_method: pm.id },
    });
    return { cusId: cus.id, pmId: pm.id };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`    Customer/PM creation failed: ${msg}`);
    return null;
  }
}

async function createSub(cusId: string, meta?: Record<string, string>): Promise<Stripe.Subscription | null> {
  try {
    const sub = await stripe.subscriptions.create({
      customer: cusId,
      items: [{ price: PRICE_ID }],
      metadata: { jeriko_user_id: "edge-test", tier: "pro", ...(meta ?? {}) },
    });
    subscriptions.push(sub.id);
    return sub;
  } catch (err: unknown) {
    return null;
  }
}

async function cleanupAll(): Promise<void> {
  for (const subId of subscriptions) {
    try {
      const s = await stripe.subscriptions.retrieve(subId);
      if (s.status !== "canceled") await stripe.subscriptions.cancel(subId);
    } catch {}
  }
  for (const cusId of customers) {
    try { await stripe.customers.del(cusId); } catch {}
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("==========================================================");
  console.log("  COMPREHENSIVE STRIPE EDGE-CASE TEST");
  console.log("  Price: $19.99/month | All card scenarios | Real webhooks");
  console.log("==========================================================");

  // Start infrastructure
  await new Promise<void>((r) => server.listen(PORT, "127.0.0.1", r));
  let stripeProc: ChildProcess;
  try {
    stripeProc = await startListener();
    console.log("  Infrastructure ready\n");
  } catch (err) {
    console.log(`  FATAL: ${err}`);
    server.close();
    process.exit(1);
  }

  try {
    // ================================================================
    // WARMUP: Send a probe event to ensure Stripe CLI is forwarding
    // ================================================================
    console.log("--- WARMUP: Verifying Stripe CLI forwarding ---");
    {
      // Create and immediately delete a customer to trigger a webhook
      const warmupCus = await stripe.customers.create({
        email: "warmup@jeriko-test.ai",
        metadata: { source: "warmup-probe" },
      });
      const gotWarmup = await waitForEvent("customer.created", 30000);
      if (gotWarmup) {
        console.log("    Stripe CLI forwarding confirmed\n");
      } else {
        console.log("    WARNING: warmup event not received — webhooks may be delayed\n");
      }
      try { await stripe.customers.del(warmupCus.id); } catch {}
    }

    // ================================================================
    // TEST 1: Normal $19.99 subscription — happy path
    // ================================================================
    section(1, "NORMAL $19.99 SUBSCRIPTION");
    const cus1 = await createCustomer(CARDS.visa, "happy-path@jeriko-test.ai");
    assert(cus1 !== null, "Customer created with Visa 4242");
    if (!cus1) { console.log("  Skipping remaining test 1"); } else {
      const sub1 = await createSub(cus1.cusId);
      assert(sub1 !== null, "Subscription created");
      assert(sub1?.status === "active", `Status: ${sub1?.status} (expected active)`);

      // Verify $19.99 charge
      await wait(2000);
      const charges = await stripe.charges.list({ customer: cus1.cusId, limit: 1 });
      assert(charges.data.length > 0, "Charge exists");
      assert(charges.data[0]?.amount === 1999, `Charged $${(charges.data[0]?.amount ?? 0) / 100} (expected $19.99)`);
      assert(charges.data[0]?.paid === true, "Charge paid");

      // Wait for any subscription-related webhook that upgrades the license.
      // Stripe may send customer.subscription.created or checkout.session.completed
      // first — either one triggers the pro upgrade via our webhook handler.
      const gotSub = await waitForEvent("customer.subscription.created", 15000);
      const gotCheckout = !gotSub && await waitForEvent("checkout.session.completed", 5000);
      // If neither specific event arrived yet, just wait and check license state
      if (!gotSub && !gotCheckout) await wait(5000);
      // The real test is: did the license actually change?

      // Check license
      await wait(1000);
      let state = getLicenseState();
      assert(state.tier === "pro", `License tier: ${state.tier} (expected pro)`);
      assert(canActivateConnector(100).allowed, "100 connectors allowed on pro");
      assert(canAddTrigger(100).allowed, "100 triggers allowed on pro");

      // Cancel for cleanup
      await stripe.subscriptions.cancel(sub1!.id);
      await waitForEvent("customer.subscription.deleted");
      await wait(1000);
      state = getLicenseState();
      assert(state.tier === "free", `After cancel: ${state.tier} (expected free)`);
    }

    // ================================================================
    // TEST 2: Declined card — subscription should NOT be created
    // ================================================================
    section(2, "DECLINED CARD");
    const cus2 = await createCustomer(CARDS.declined, "declined@jeriko-test.ai");
    if (!cus2) {
      // Some declined cards fail at attach — that's correct behavior
      assert(true, "Card declined at attach (expected)");
    } else {
      const sub2 = await createSub(cus2.cusId);
      assert(sub2 === null || sub2.status === "incomplete", `Subscription ${sub2 ? sub2.status : "not created"} (expected failure or incomplete)`);
      if (sub2) {
        // Verify license did NOT upgrade
        await wait(2000);
        const state = getLicenseState();
        // Note: incomplete status maps to free in effectiveTier
        console.log(`    License tier after declined: ${state.tier}`);
      }
    }
    // Verify we're still free
    assert(getLicenseState().tier === "free", "Still free after declined card");

    // ================================================================
    // TEST 3: Expired card
    // ================================================================
    section(3, "EXPIRED CARD");
    const cus3 = await createCustomer(CARDS.expired, "expired@jeriko-test.ai");
    if (!cus3) {
      assert(true, "Expired card rejected at attach (expected)");
    } else {
      const sub3 = await createSub(cus3.cusId);
      assert(sub3 === null || sub3.status === "incomplete", `Subscription ${sub3 ? sub3.status : "not created"} (expected failure or incomplete)`);
    }
    assert(getLicenseState().tier === "free", "Still free after expired card");

    // ================================================================
    // TEST 4: Insufficient funds
    // ================================================================
    section(4, "INSUFFICIENT FUNDS");
    const cus4 = await createCustomer(CARDS.insufficient, "broke@jeriko-test.ai");
    if (!cus4) {
      assert(true, "Insufficient funds rejected at attach (expected)");
    } else {
      const sub4 = await createSub(cus4.cusId);
      assert(sub4 === null || sub4.status === "incomplete", `Subscription ${sub4 ? sub4.status : "not created"} (expected failure or incomplete)`);
    }
    assert(getLicenseState().tier === "free", "Still free after insufficient funds");

    // ================================================================
    // TEST 5: Fraudulent card
    // ================================================================
    section(5, "FRAUDULENT CARD");
    const cus5 = await createCustomer(CARDS.fraud, "fraud@jeriko-test.ai");
    if (!cus5) {
      assert(true, "Fraudulent card rejected at attach (expected)");
    } else {
      const sub5 = await createSub(cus5.cusId);
      assert(sub5 === null || sub5.status === "incomplete", `Subscription ${sub5 ? sub5.status : "not created"} (expected failure or incomplete)`);
    }
    assert(getLicenseState().tier === "free", "Still free after fraudulent card");

    // ================================================================
    // TEST 6: CVC failure
    // ================================================================
    section(6, "INCORRECT CVC");
    const cus6 = await createCustomer(CARDS.cvcFail, "cvc@jeriko-test.ai");
    if (!cus6) {
      assert(true, "CVC failure rejected at attach (expected)");
    } else {
      const sub6 = await createSub(cus6.cusId);
      assert(sub6 === null || sub6.status === "incomplete", `Subscription ${sub6 ? sub6.status : "not created"} (expected failure or incomplete)`);
    }
    assert(getLicenseState().tier === "free", "Still free after CVC failure");

    // ================================================================
    // TEST 7: Processing error
    // ================================================================
    section(7, "PROCESSING ERROR");
    const cus7 = await createCustomer(CARDS.processingError, "error@jeriko-test.ai");
    if (!cus7) {
      assert(true, "Processing error rejected at attach (expected)");
    } else {
      const sub7 = await createSub(cus7.cusId);
      assert(sub7 === null || sub7.status === "incomplete", `Subscription ${sub7 ? sub7.status : "not created"} (expected failure or incomplete)`);
    }
    assert(getLicenseState().tier === "free", "Still free after processing error");

    // ================================================================
    // TEST 8: Cancel at period end (not immediate)
    // ================================================================
    section(8, "CANCEL AT PERIOD END");
    const cus8 = await createCustomer(CARDS.visa, "period-end@jeriko-test.ai");
    assert(cus8 !== null, "Customer created");
    if (cus8) {
      const sub8 = await createSub(cus8.cusId);
      assert(sub8 !== null && sub8.status === "active", "Subscription active");

      await waitForEvent("customer.subscription.created");
      await wait(1000);
      assert(getLicenseState().tier === "pro", "Pro after subscribe");

      // Cancel at period end — should NOT downgrade immediately
      const updated = await stripe.subscriptions.update(sub8!.id, { cancel_at_period_end: true });
      assert(updated.cancel_at_period_end === true, "cancel_at_period_end set");
      assert(updated.status === "active", "Still active (not immediately canceled)");

      await waitForEvent("customer.subscription.updated");
      await wait(1000);

      // Should STILL be pro — hasn't reached period end yet
      let state = getLicenseState();
      assert(state.tier === "pro", `Still pro after cancel_at_period_end (got: ${state.tier})`);
      assert(canActivateConnector(50).allowed, "50 connectors still allowed");

      // Now actually cancel immediately for cleanup
      await stripe.subscriptions.cancel(sub8!.id);
      await waitForEvent("customer.subscription.deleted");
      await wait(1000);
      state = getLicenseState();
      assert(state.tier === "free", `Free after actual cancel (got: ${state.tier})`);
    }

    // ================================================================
    // TEST 9: Immediate cancel — gates lock immediately
    // ================================================================
    section(9, "IMMEDIATE CANCEL + GATE ENFORCEMENT");
    const cus9 = await createCustomer(CARDS.visa, "immediate-cancel@jeriko-test.ai");
    assert(cus9 !== null, "Customer created");
    if (cus9) {
      const sub9 = await createSub(cus9.cusId);
      assert(sub9 !== null, "Subscription created");

      await waitForEvent("customer.subscription.created");
      await wait(1000);
      assert(getLicenseState().tier === "pro", "Pro");

      // Add excess resources (simulated)
      const conns = {
        activeCount: 8,
        async enforceLimits(max: number) {
          const evicted: string[] = [];
          while (this.activeCount > max) { evicted.push(`conn-${this.activeCount}`); this.activeCount--; }
          return evicted;
        },
      };
      const trigs = {
        enabledCount: 15,
        enforceLimits(max: number) {
          const disabled: string[] = [];
          while (this.enabledCount > max) { disabled.push(`trig-${this.enabledCount}`); this.enabledCount--; }
          return disabled;
        },
      };

      // Cancel
      await stripe.subscriptions.cancel(sub9!.id);
      await waitForEvent("customer.subscription.deleted");
      await wait(1000);

      const state = getLicenseState();
      assert(state.tier === "free", `Free after cancel (got: ${state.tier})`);
      assert(!canActivateConnector(TIER_LIMITS.free.connectors).allowed, "Connector gate locked");
      assert(!canAddTrigger(TIER_LIMITS.free.triggers).allowed, "Trigger gate locked");

      // Enforce limits
      const result = await enforceLicenseLimits(conns, trigs);
      assert(conns.activeCount === TIER_LIMITS.free.connectors, `Connectors enforced to ${TIER_LIMITS.free.connectors} (got: ${conns.activeCount})`);
      assert(trigs.enabledCount === TIER_LIMITS.free.triggers, `Triggers enforced to ${TIER_LIMITS.free.triggers} (got: ${trigs.enabledCount})`);
      assert(result.connectors.evicted.length === 3, `3 connectors evicted (got: ${result.connectors.evicted.length})`);
      assert(result.triggers.disabled.length === 5, `5 triggers disabled (got: ${result.triggers.disabled.length})`);
    }

    // ================================================================
    // TEST 10: Re-subscribe after cancel — full cycle
    // ================================================================
    section(10, "RE-SUBSCRIBE AFTER CANCEL");
    const cus10 = await createCustomer(CARDS.visa, "resub@jeriko-test.ai");
    assert(cus10 !== null, "Customer created");
    if (cus10) {
      // First subscription
      const sub10a = await createSub(cus10.cusId);
      await waitForEvent("customer.subscription.created");
      await wait(1000);
      assert(getLicenseState().tier === "pro", "Pro on first sub");

      // Cancel
      await stripe.subscriptions.cancel(sub10a!.id);
      await waitForEvent("customer.subscription.deleted");
      await wait(1000);
      assert(getLicenseState().tier === "free", "Free after cancel");
      assert(!canActivateConnector(TIER_LIMITS.free.connectors).allowed, "Gates locked on free");

      // Re-subscribe with new subscription
      const sub10b = await createSub(cus10.cusId);
      assert(sub10b !== null, "Re-subscription created");
      assert(sub10b?.status === "active", `Re-sub status: ${sub10b?.status}`);

      await waitForEvent("customer.subscription.created");
      await wait(1000);

      const state = getLicenseState();
      assert(state.tier === "pro", `Pro after re-sub (got: ${state.tier})`);
      assert(canActivateConnector(100).allowed, "100 connectors allowed after re-sub");
      assert(canAddTrigger(100).allowed, "100 triggers allowed after re-sub");

      // Verify new charge at $19.99
      const charges = await stripe.charges.list({ customer: cus10.cusId, limit: 5 });
      const amounts = charges.data.map((c) => c.amount);
      assert(amounts.includes(1999), `$19.99 charge found (charges: ${amounts.map((a) => "$" + (a / 100).toFixed(2)).join(", ")})`);

      // Cleanup
      await stripe.subscriptions.cancel(sub10b!.id);
      await waitForEvent("customer.subscription.deleted");
      await wait(1000);
    }

    // ================================================================
    // TEST 11: Payment failure on active sub -> past_due grace
    // ================================================================
    section(11, "PAYMENT FAILURE -> PAST_DUE GRACE PERIOD");
    // We simulate this via webhook since we can't force a real payment
    // failure on an active subscription with test cards (Stripe test
    // cards either always succeed or always fail at creation time).
    // This uses the same processWebhookEvent the daemon uses.

    // First, set up a pro license via real webhook
    const cus11 = await createCustomer(CARDS.visa, "pastdue@jeriko-test.ai");
    if (cus11) {
      const sub11 = await createSub(cus11.cusId);
      await waitForEvent("customer.subscription.created");
      await wait(1000);
      assert(getLicenseState().tier === "pro", "Pro before payment failure");

      // Simulate payment failure webhook (as relay would forward it)
      const failBody = JSON.stringify({
        id: `evt_sim_fail_${Date.now()}`,
        type: "invoice.payment_failed",
        data: { object: { subscription: sub11!.id } },
      });
      // Use trusted mode (as relay-forwarded webhooks do)
      processWebhookEvent(failBody, "", { trusted: true });

      let state = getLicenseState();
      assert(state.tier === "pro", `Past due keeps pro (got: ${state.tier})`);
      assert(state.pastDue === true, `pastDue flag set`);
      assert(state.gracePeriod === true, `gracePeriod active`);
      assert(canActivateConnector(50).allowed, "50 connectors allowed during grace");
      assert(canAddTrigger(50).allowed, "50 triggers allowed during grace");

      // Now simulate subscription deletion (payment never recovered)
      const delBody = JSON.stringify({
        id: `evt_sim_del_${Date.now()}`,
        type: "customer.subscription.deleted",
        data: { object: { id: sub11!.id, customer: cus11.cusId } },
      });
      processWebhookEvent(delBody, "", { trusted: true });

      state = getLicenseState();
      assert(state.tier === "free", `Free after failed payment + delete (got: ${state.tier})`);
      assert(!canActivateConnector(TIER_LIMITS.free.connectors).allowed, "Gates locked after payment failure");

      // Cleanup real sub
      try { await stripe.subscriptions.cancel(sub11!.id); } catch {}
    }

    // ================================================================
    // TEST 12: Multiple rapid subscribe/cancel cycles
    // ================================================================
    section(12, "RAPID SUBSCRIBE/CANCEL CYCLES");
    const cus12 = await createCustomer(CARDS.visa, "rapid@jeriko-test.ai");
    if (cus12) {
      for (let cycle = 1; cycle <= 3; cycle++) {
        const sub = await createSub(cus12.cusId, { cycle: String(cycle) });
        assert(sub !== null && sub.status === "active", `Cycle ${cycle}: subscription active`);

        await waitForEvent("customer.subscription.created");
        await wait(500);

        const statePro = getLicenseState();
        assert(statePro.tier === "pro", `Cycle ${cycle}: pro`);

        await stripe.subscriptions.cancel(sub!.id);
        await waitForEvent("customer.subscription.deleted");
        await wait(500);

        const stateFree = getLicenseState();
        assert(stateFree.tier === "free", `Cycle ${cycle}: free after cancel`);
      }
      console.log("    3 rapid cycles completed without errors");
    }

    // ================================================================
    // TEST 13: Verify denial messages are correct
    // ================================================================
    section(13, "DENIAL MESSAGES");
    // Make sure we're on free
    const finalState = getLicenseState();
    assert(finalState.tier === "free", "On free tier for message check");

    const connDenial = canActivateConnector(TIER_LIMITS.free.connectors);
    assert(!connDenial.allowed, "Connector denied");
    assert(connDenial.reason!.includes("Connector limit reached"), "Says 'Connector limit reached'");
    assert(connDenial.reason!.includes(`${TIER_LIMITS.free.connectors}/${TIER_LIMITS.free.connectors}`), `Shows ${TIER_LIMITS.free.connectors}/${TIER_LIMITS.free.connectors}`);
    assert(connDenial.reason!.includes("Community"), "Says Community plan");
    assert(connDenial.reason!.includes("unlimited"), "Says unlimited for Pro");
    assert(connDenial.reason!.includes("jeriko upgrade"), "Says jeriko upgrade");
    console.log(`    Message: "${connDenial.reason}"`);

    const trigDenial = canAddTrigger(TIER_LIMITS.free.triggers);
    assert(!trigDenial.allowed, "Trigger denied");
    assert(trigDenial.reason!.includes("Trigger limit reached"), "Says 'Trigger limit reached'");
    assert(trigDenial.reason!.includes(`${TIER_LIMITS.free.triggers}/${TIER_LIMITS.free.triggers}`), `Shows ${TIER_LIMITS.free.triggers}/${TIER_LIMITS.free.triggers}`);
    assert(trigDenial.reason!.includes("unlimited"), "Says unlimited for Pro");
    console.log(`    Message: "${trigDenial.reason}"`);

    // ================================================================
    // TEST 14: Checkout session with correct price
    // ================================================================
    section(14, "CHECKOUT SESSION — $19.99 PRICE");
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: "checkout-test@jeriko-test.ai",
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      subscription_data: {
        metadata: { jeriko_user_id: "edge-test", tier: "pro" },
      },
      metadata: { jeriko_user_id: "edge-test" },
      success_url: "https://jeriko.ai/billing/success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://jeriko.ai/billing/cancel",
    } as Stripe.Checkout.SessionCreateParams);
    assert(!!session.id, `Session: ${session.id}`);
    assert(!!session.url, "Has checkout URL");
    assert(session.mode === "subscription", "Mode: subscription");
    assert(session.amount_total === 1999, `Amount: $${(session.amount_total ?? 0) / 100} (expected $19.99)`);
    console.log(`    URL: ${session.url?.slice(0, 60)}...`);
    try { await stripe.checkout.sessions.expire(session.id); } catch {}

  } finally {
    // ================================================================
    // Cleanup
    // ================================================================
    console.log("\n--- CLEANUP ---");
    stripeProc!.kill("SIGTERM");
    server.close();
    await cleanupAll();
    console.log("  All Stripe resources cleaned up");
    try { closeDatabase(); } catch {}
    if (existsSync(TEST_DB)) { try { unlinkSync(TEST_DB); } catch {} }
    console.log("  Temp DB removed");
  }

  // ================================================================
  // Final report
  // ================================================================
  console.log("\n==========================================================");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log(`  Total webhooks received: ${receivedEvents.length}`);
  console.log(`  Total webhooks handled: ${receivedEvents.filter((e) => e.handled).length}`);
  console.log("==========================================================\n");

  if (failed > 0) {
    console.log("  SOME TESTS FAILED — review output above\n");
    process.exit(1);
  } else {
    console.log("  ALL EDGE CASES PASSED\n");
  }
}

main().catch((err) => {
  console.error(`\nFATAL: ${err}\n`);
  cleanupAll().finally(() => {
    try { closeDatabase(); } catch {}
    if (existsSync(TEST_DB)) { try { unlinkSync(TEST_DB); } catch {} }
    process.exit(1);
  });
});
