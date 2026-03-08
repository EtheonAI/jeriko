/**
 * TRUE END-TO-END Stripe Billing Test
 *
 * Creates REAL Stripe resources (customer, payment, subscription),
 * listens for REAL webhook events via Stripe CLI, and verifies the
 * license state transitions happen correctly in the database.
 *
 * Flow:
 *   1. Start webhook listener (Stripe CLI -> local HTTP -> processWebhookEvent)
 *   2. Create real customer with test Visa card
 *   3. Create real subscription (triggers checkout/invoice/subscription webhooks)
 *   4. Verify license upgraded to pro via real webhooks
 *   5. Cancel subscription (triggers deletion webhook)
 *   6. Verify license downgraded to free
 *   7. Create new subscription (re-upgrade)
 *   8. Verify license back to pro
 *   9. Cleanup all Stripe resources
 *
 * Usage: bun test/live/stripe-full-e2e.ts
 */

import Stripe from "stripe";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlinkSync, existsSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SK = process.env.STRIPE_BILLING_SECRET_KEY;
if (!SK) throw new Error("Set STRIPE_BILLING_SECRET_KEY env var");
const PRICE_ID = "price_1T6q0dCw9IdT3cEouDSeLlhk";
const PORT = 19877;

// Isolated DB
const TEST_DB = join(tmpdir(), `jeriko-full-e2e-${Date.now()}.db`);
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
} from "../../src/daemon/billing/license.js";
import { processWebhookEvent } from "../../src/daemon/billing/webhook.js";

initDatabase(TEST_DB);

const stripe = new Stripe(SK, { apiVersion: "2026-02-25.clover" as Stripe.LatestApiVersion });

// ---------------------------------------------------------------------------
// Webhook receiver
// ---------------------------------------------------------------------------

let webhookSecret: string | null = null;
const receivedEvents: Array<{ type: string; handled: boolean; id: string }> = [];

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  if (req.method !== "POST" || !webhookSecret) {
    res.writeHead(200);
    res.end();
    return;
  }

  const body = await readBody(req);
  const sig = req.headers["stripe-signature"] as string ?? "";

  process.env.STRIPE_BILLING_WEBHOOK_SECRET = webhookSecret;
  const result = processWebhookEvent(body, sig);

  let eventType = "unknown";
  let eventId = "unknown";
  try {
    const parsed = JSON.parse(body);
    eventType = parsed.type ?? "unknown";
    eventId = parsed.id ?? "unknown";
  } catch { /* ignore */ }

  receivedEvents.push({ type: eventType, handled: result.handled, id: eventId });

  // Only log billing-relevant events
  const billingEvents = [
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.paid",
    "invoice.payment_failed",
    "invoice.payment_succeeded",
  ];
  if (billingEvents.includes(eventType)) {
    console.log(`    WEBHOOK: ${eventType} -> ${result.handled ? "OK" : "FAIL: " + result.error}`);
  }

  res.writeHead(200);
  res.end(JSON.stringify({ ok: true }));
});

// ---------------------------------------------------------------------------
// Stripe CLI listener
// ---------------------------------------------------------------------------

function startListener(): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const proc = spawn("stripe", [
      "listen",
      "--forward-to", `http://127.0.0.1:${PORT}/webhook`,
      "--api-key", SK,
    ], { stdio: ["ignore", "pipe", "pipe"] });

    let output = "";
    const timeout = setTimeout(() => reject(new Error("Stripe CLI timeout")), 15000);

    function check(text: string): void {
      output += text;
      const match = output.match(/whsec_\S+/);
      if (match && !webhookSecret) {
        webhookSecret = match[0];
        clearTimeout(timeout);
        resolve(proc);
      }
    }

    proc.stdout!.on("data", (d: Buffer) => check(d.toString()));
    proc.stderr!.on("data", (d: Buffer) => check(d.toString()));
    proc.on("error", (err) => { clearTimeout(timeout); reject(err); });
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function waitForEvent(type: string, timeoutMs: number = 15000): Promise<boolean> {
  const start = Date.now();
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      if (receivedEvents.some((e) => e.type === type)) {
        clearInterval(interval);
        resolve(true);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        resolve(false);
      }
    }, 200);
  });
}

function clearEvents(): void {
  receivedEvents.length = 0;
}

function fail(msg: string): never {
  console.log(`\n  FAIL: ${msg}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Cleanup tracker
// ---------------------------------------------------------------------------

const createdCustomers: string[] = [];
const createdSubscriptions: string[] = [];

async function cleanupStripe(): Promise<void> {
  for (const subId of createdSubscriptions) {
    try {
      const sub = await stripe.subscriptions.retrieve(subId);
      if (sub.status !== "canceled") {
        await stripe.subscriptions.cancel(subId);
      }
    } catch { /* already cleaned */ }
  }
  for (const cusId of createdCustomers) {
    try {
      await stripe.customers.del(cusId);
    } catch { /* already cleaned */ }
  }
}

// ---------------------------------------------------------------------------
// Main test
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("\n=========================================================");
  console.log("  TRUE END-TO-END STRIPE BILLING TEST");
  console.log("  Real customer + Real payment + Real webhooks + Real DB");
  console.log("=========================================================\n");

  // ----- Start infrastructure -----
  await new Promise<void>((r) => server.listen(PORT, "127.0.0.1", r));
  console.log("  HTTP server started");

  let stripeProc: ChildProcess;
  try {
    stripeProc = await startListener();
    console.log("  Stripe CLI listener ready");
  } catch (err) {
    console.log(`  FAIL: ${err}`);
    server.close();
    process.exit(1);
  }

  try {
    // ==================================================================
    // STEP 1: Verify fresh install state
    // ==================================================================
    console.log("\n--- STEP 1: VERIFY FRESH INSTALL ---");
    let state = getLicenseState();
    console.log(`  Tier: ${state.tier} (${state.label})`);
    console.log(`  Connectors: limit=${state.connectorLimit}`);
    console.log(`  Triggers: limit=${state.triggerLimit}`);
    if (state.tier !== "free") fail("Fresh install should be free");
    console.log("  PASS\n");

    // ==================================================================
    // STEP 2: Create REAL customer with REAL payment method
    // ==================================================================
    console.log("--- STEP 2: CREATE REAL CUSTOMER + PAYMENT ---");
    const customer = await stripe.customers.create({
      email: `full-e2e-${Date.now()}@jeriko-test.ai`,
      name: "Full E2E Test User",
      metadata: { jeriko_user_id: "e2e-full-test", source: "full-e2e" },
    });
    createdCustomers.push(customer.id);
    console.log(`  Customer: ${customer.id}`);

    const pm = await stripe.paymentMethods.attach("pm_card_visa", { customer: customer.id });
    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: pm.id },
    });
    console.log(`  Payment method: ${pm.id} (test Visa 4242)`);
    console.log("  PASS\n");

    // ==================================================================
    // STEP 3: Create REAL subscription — triggers real webhooks
    // ==================================================================
    console.log("--- STEP 3: CREATE REAL SUBSCRIPTION ---");
    clearEvents();

    const sub = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: PRICE_ID }],
      metadata: {
        jeriko_user_id: "e2e-full-test",
        tier: "pro",
      },
    });
    createdSubscriptions.push(sub.id);
    console.log(`  Subscription: ${sub.id}`);
    console.log(`  Status: ${sub.status}`);
    console.log(`  Waiting for webhooks...`);

    // Wait for the key events
    const gotSubCreated = await waitForEvent("customer.subscription.created", 20000);
    const gotInvoicePaid = await waitForEvent("invoice.paid", 20000);
    console.log(`  customer.subscription.created received: ${gotSubCreated ? "YES" : "NO"}`);
    console.log(`  invoice.paid received: ${gotInvoicePaid ? "YES" : "NO"}`);

    if (!gotSubCreated) fail("Never received customer.subscription.created webhook");
    if (!gotInvoicePaid) fail("Never received invoice.paid webhook");

    // Check license state
    state = getLicenseState();
    let lic = getLicense();
    console.log(`  License tier: ${state.tier}`);
    console.log(`  DB: tier=${lic.tier}, conn=${lic.connector_limit}, trig=${lic.trigger_limit}`);
    console.log(`  subscription_id: ${lic.subscription_id}`);

    if (state.tier !== "pro") fail(`Expected pro after subscribe, got ${state.tier}`);

    // Gate checks
    const c100 = canActivateConnector(100);
    const t100 = canAddTrigger(100);
    console.log(`  100 connectors: ${c100.allowed ? "ALLOWED" : "BLOCKED"}`);
    console.log(`  100 triggers: ${t100.allowed ? "ALLOWED" : "BLOCKED"}`);
    if (!c100.allowed) fail("Pro should allow 100 connectors");
    if (!t100.allowed) fail("Pro should allow 100 triggers");
    console.log("  PASS: Subscription active, license upgraded to pro\n");

    // ==================================================================
    // STEP 4: CANCEL the subscription — triggers real webhooks
    // ==================================================================
    console.log("--- STEP 4: CANCEL SUBSCRIPTION ---");
    clearEvents();

    const canceled = await stripe.subscriptions.cancel(sub.id);
    console.log(`  Canceled: ${canceled.id} (status: ${canceled.status})`);
    console.log(`  Waiting for webhooks...`);

    const gotDeleted = await waitForEvent("customer.subscription.deleted", 20000);
    console.log(`  customer.subscription.deleted received: ${gotDeleted ? "YES" : "NO"}`);

    if (!gotDeleted) fail("Never received customer.subscription.deleted webhook");

    // Give a moment for processing
    await wait(1000);

    // Check license state
    state = getLicenseState();
    lic = getLicense();
    console.log(`  License tier: ${state.tier}`);
    console.log(`  DB: tier=${lic.tier}, conn=${lic.connector_limit}, trig=${lic.trigger_limit}`);

    if (state.tier !== "free") fail(`Expected free after cancel, got ${state.tier}`);
    if (state.connectorLimit !== TIER_LIMITS.free.connectors) {
      fail(`Connector limit should be ${TIER_LIMITS.free.connectors}, got ${state.connectorLimit}`);
    }
    if (state.triggerLimit !== TIER_LIMITS.free.triggers) {
      fail(`Trigger limit should be ${TIER_LIMITS.free.triggers}, got ${state.triggerLimit}`);
    }

    // Gate checks — should be blocked
    const c5 = canActivateConnector(TIER_LIMITS.free.connectors);
    const t10 = canAddTrigger(TIER_LIMITS.free.triggers);
    console.log(`  ${TIER_LIMITS.free.connectors} connectors (at limit): ${c5.allowed ? "ALLOWED (WRONG!)" : "BLOCKED"}`);
    console.log(`  ${TIER_LIMITS.free.triggers} triggers (at limit): ${t10.allowed ? "ALLOWED (WRONG!)" : "BLOCKED"}`);
    if (c5.allowed) fail("Should block connectors at free limit after cancel");
    if (t10.allowed) fail("Should block triggers at free limit after cancel");
    console.log("  PASS: Canceled, downgraded to free, gates enforced\n");

    // ==================================================================
    // STEP 5: RE-SUBSCRIBE — new subscription
    // ==================================================================
    console.log("--- STEP 5: RE-SUBSCRIBE ---");
    clearEvents();

    const sub2 = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: PRICE_ID }],
      metadata: {
        jeriko_user_id: "e2e-full-test",
        tier: "pro",
      },
    });
    createdSubscriptions.push(sub2.id);
    console.log(`  New subscription: ${sub2.id} (status: ${sub2.status})`);
    console.log(`  Waiting for webhooks...`);

    const gotResub = await waitForEvent("customer.subscription.created", 20000);
    console.log(`  customer.subscription.created received: ${gotResub ? "YES" : "NO"}`);
    if (!gotResub) fail("Never received re-subscription webhook");

    state = getLicenseState();
    console.log(`  License tier: ${state.tier}`);

    if (state.tier !== "pro") fail(`Expected pro after re-subscribe, got ${state.tier}`);

    const reConn = canActivateConnector(50);
    const reTrig = canAddTrigger(50);
    console.log(`  50 connectors: ${reConn.allowed ? "ALLOWED" : "BLOCKED"}`);
    console.log(`  50 triggers: ${reTrig.allowed ? "ALLOWED" : "BLOCKED"}`);
    if (!reConn.allowed || !reTrig.allowed) fail("Pro should allow 50 connectors/triggers");
    console.log("  PASS: Re-subscribed, pro access restored\n");

    // ==================================================================
    // STEP 6: Verify real Stripe invoice was paid
    // ==================================================================
    console.log("--- STEP 6: VERIFY REAL PAYMENT ---");
    const invoices = await stripe.invoices.list({
      subscription: sub2.id,
      limit: 1,
    });
    if (invoices.data.length > 0) {
      const inv = invoices.data[0];
      console.log(`  Invoice: ${inv.id}`);
      console.log(`  Status: ${inv.status}`);
      console.log(`  Amount: $${(inv.amount_paid ?? 0) / 100}`);
      console.log(`  Paid: ${inv.paid ? "YES" : "NO"} (status=${inv.status})`);
      // Stripe API versions differ on `.paid` vs `.status` — trust status
      if (inv.status !== "paid" && !inv.paid) fail("Invoice should be paid");
    } else {
      console.log("  No invoice found (may be pending)");
    }

    // Check charges
    const charges = await stripe.charges.list({
      customer: customer.id,
      limit: 5,
    });
    console.log(`  Total charges: ${charges.data.length}`);
    for (const charge of charges.data) {
      console.log(`    ${charge.id}: $${charge.amount / 100} — ${charge.status} (${charge.paid ? "paid" : "unpaid"})`);
    }
    const allPaid = charges.data.every((c) => c.paid);
    if (!allPaid) fail("All charges should be paid");
    console.log("  PASS: Real payments confirmed\n");

    // ==================================================================
    // STEP 7: Final cleanup cancel
    // ==================================================================
    console.log("--- STEP 7: FINAL CANCEL + VERIFY ---");
    clearEvents();

    await stripe.subscriptions.cancel(sub2.id);
    const gotFinalDelete = await waitForEvent("customer.subscription.deleted", 20000);
    console.log(`  Final deletion webhook: ${gotFinalDelete ? "YES" : "NO"}`);

    await wait(1000);
    state = getLicenseState();
    console.log(`  Final tier: ${state.tier}`);
    if (state.tier !== "free") fail(`Expected free after final cancel, got ${state.tier}`);
    console.log("  PASS: Final downgrade confirmed\n");

    // ==================================================================
    // Summary
    // ==================================================================
    console.log("--- WEBHOOK SUMMARY ---");
    const billingTypes = [
      "checkout.session.completed",
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "invoice.paid",
      "invoice.payment_failed",
      "invoice.payment_succeeded",
    ];
    for (const type of billingTypes) {
      const events = receivedEvents.filter((e) => e.type === type);
      if (events.length > 0) {
        const ok = events.filter((e) => e.handled).length;
        console.log(`  ${type}: ${ok}/${events.length} handled`);
      }
    }
    console.log(`  Total events received: ${receivedEvents.length}`);
    console.log(`  Total handled: ${receivedEvents.filter((e) => e.handled).length}`);
    console.log(`  Total rejected: ${receivedEvents.filter((e) => !e.handled).length}`);

  } finally {
    // Cleanup
    console.log("\n--- CLEANUP ---");
    stripeProc.kill("SIGTERM");
    server.close();
    await cleanupStripe();
    console.log("  Stripe resources cleaned up");
    try { closeDatabase(); } catch { /* ignore */ }
    if (existsSync(TEST_DB)) { try { unlinkSync(TEST_DB); } catch { /* ignore */ } }
    console.log("  Temp DB removed");
  }

  console.log("\n=========================================================");
  console.log("  TRUE END-TO-END TEST PASSED");
  console.log("  Real customer, real payment, real webhooks, real DB");
  console.log("=========================================================\n");
}

main().catch((err) => {
  console.error(`\nFATAL: ${err}\n`);
  cleanupStripe().finally(() => {
    try { closeDatabase(); } catch { /* ignore */ }
    if (existsSync(TEST_DB)) { try { unlinkSync(TEST_DB); } catch { /* ignore */ } }
    process.exit(1);
  });
});
