/**
 * LIVE USER SIMULATION — tests billing gates exactly as the daemon does.
 *
 * This is NOT a unit test. This simulates a real user journey:
 *   1. Fresh install (free tier) -> add connectors until gated
 *   2. Subscribe (pro tier) -> add unlimited connectors
 *   3. Cancel subscription -> verify downgrade + enforcement
 *   4. Same for triggers
 *   5. Re-subscribe -> verify everything lifts
 *   6. Payment failure -> grace period
 *   7. Recovery -> back to normal
 */

import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlinkSync, existsSync } from "node:fs";
import { createHmac } from "node:crypto";

// Isolated temp DB — like a fresh install
const TEST_DB = join(tmpdir(), `jeriko-live-user-${Date.now()}.db`);
process.env.JERIKO_DB_PATH = TEST_DB;
if (!process.env.STRIPE_BILLING_SECRET_KEY) throw new Error("Set STRIPE_BILLING_SECRET_KEY env var");
const WEBHOOK_SECRET = "whsec_live_user_test";
process.env.STRIPE_BILLING_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.STRIPE_BILLING_PRICE_ID = "price_1T6q0dCw9IdT3cEouDSeLlhk";

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sign(body: string): string {
  const ts = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", WEBHOOK_SECRET).update(`${ts}.${body}`).digest("hex");
  return `t=${ts},v1=${sig}`;
}

function evt(type: string, data: Record<string, unknown>): string {
  return JSON.stringify({
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    data: { object: data },
  });
}

function fail(msg: string): never {
  console.log(`  FAIL: ${msg}`);
  process.exit(1);
}

// Mock ConnectorManager (mirrors real manager.ts enforceLimits)
class MockConnectors {
  items = new Map<string, boolean>();
  add(name: string): void { this.items.set(name, true); }
  get activeCount(): number { return this.items.size; }
  async enforceLimits(max: number): Promise<string[]> {
    const keys = [...this.items.keys()].reverse(); // newest first
    const evicted: string[] = [];
    while (this.items.size > max) {
      const k = keys.shift()!;
      this.items.delete(k);
      evicted.push(k);
    }
    return evicted;
  }
  list(): string[] { return [...this.items.keys()]; }
}

// Mock TriggerEngine (mirrors real engine.ts enforceLimits)
class MockTriggers {
  items = new Map<string, boolean>();
  add(id: string): void { this.items.set(id, true); }
  get enabledCount(): number { return [...this.items.values()].filter(Boolean).length; }
  enforceLimits(max: number): string[] {
    const enabled = [...this.items.entries()].filter(([, v]) => v);
    const disabled: string[] = [];
    // Disable from the end (newest first)
    for (let i = enabled.length - 1; i >= max; i--) {
      this.items.set(enabled[i][0], false);
      disabled.push(enabled[i][0]);
    }
    return disabled;
  }
  isEnabled(id: string): boolean { return this.items.get(id) === true; }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

initDatabase(TEST_DB);

console.log("\n  LIVE USER BILLING SIMULATION\n");

// ===================================================================
// STEP 1: Fresh install — free tier
// ===================================================================
console.log("--- STEP 1: FRESH INSTALL (Free Tier) ---");
let state = getLicenseState();
let lic = getLicense();
console.log(`  Tier: ${state.tier} (${state.label})`);
console.log(`  Connector limit: ${state.connectorLimit}`);
console.log(`  Trigger limit: ${state.triggerLimit}`);
console.log(`  DB: tier=${lic.tier}, conn_limit=${lic.connector_limit}, trig_limit=${lic.trigger_limit}`);

if (state.tier !== "free") fail("Expected free tier on fresh install");
if (state.connectorLimit !== TIER_LIMITS.free.connectors) fail(`Connector limit should be ${TIER_LIMITS.free.connectors}`);
if (state.triggerLimit !== TIER_LIMITS.free.triggers) fail(`Trigger limit should be ${TIER_LIMITS.free.triggers}`);
console.log("  PASS: Fresh install is free tier\n");

// ===================================================================
// STEP 2: Add connectors one by one until gated
// ===================================================================
console.log("--- STEP 2: ADD CONNECTORS ONE-BY-ONE ---");
for (let i = 0; i <= TIER_LIMITS.free.connectors; i++) {
  const check = canActivateConnector(i);
  if (i < TIER_LIMITS.free.connectors) {
    if (!check.allowed) fail(`Connector ${i + 1} should be allowed (have ${i}, limit ${TIER_LIMITS.free.connectors})`);
    console.log(`  [${i + 1}/${TIER_LIMITS.free.connectors}] Adding connector: ALLOWED`);
  } else {
    if (check.allowed) fail(`Connector ${i + 1} should be BLOCKED (at limit)`);
    console.log(`  [${i + 1}/${TIER_LIMITS.free.connectors}] Adding connector: BLOCKED`);
    console.log(`    Reason: "${check.reason}"`);
  }
}
console.log("  PASS: Free tier gates at correct limit\n");

// ===================================================================
// STEP 3: Add triggers one by one until gated
// ===================================================================
console.log("--- STEP 3: ADD TRIGGERS ONE-BY-ONE ---");
for (let i = 0; i <= TIER_LIMITS.free.triggers; i++) {
  const check = canAddTrigger(i);
  if (i < TIER_LIMITS.free.triggers) {
    if (!check.allowed) fail(`Trigger ${i + 1} should be allowed (have ${i}, limit ${TIER_LIMITS.free.triggers})`);
    if (i === 0 || i === TIER_LIMITS.free.triggers - 1) {
      console.log(`  [${i + 1}/${TIER_LIMITS.free.triggers}] Adding trigger: ALLOWED`);
    }
  } else {
    if (check.allowed) fail(`Trigger ${i + 1} should be BLOCKED (at limit)`);
    console.log(`  [${i + 1}/${TIER_LIMITS.free.triggers}] Adding trigger: BLOCKED`);
    console.log(`    Reason: "${check.reason}"`);
  }
}
console.log("  PASS: Free tier gates triggers at correct limit\n");

// ===================================================================
// STEP 4: User subscribes via Stripe checkout
// ===================================================================
console.log("--- STEP 4: USER SUBSCRIBES (checkout webhook) ---");
const checkoutBody = evt("checkout.session.completed", {
  id: "cs_live_test",
  subscription: "sub_live_user_test",
  customer: "cus_live_user_test",
  customer_email: "user@example.com",
  metadata: { jeriko_user_id: "live-test-user" },
});
const res = processWebhookEvent(checkoutBody, sign(checkoutBody));
if (!res.handled) fail("Checkout webhook not handled");

state = getLicenseState();
lic = getLicense();
console.log(`  Tier: ${state.tier} (${state.label})`);
console.log(`  Connector limit: ${state.connectorLimit}`);
console.log(`  Trigger limit: ${state.triggerLimit}`);
console.log(`  DB: tier=${lic.tier}, conn_limit=${lic.connector_limit}, trig_limit=${lic.trigger_limit}`);

if (state.tier !== "pro") fail("Expected pro tier after subscribe");
console.log("  PASS: Upgraded to Pro\n");

// ===================================================================
// STEP 5: Pro user — unlimited connectors and triggers
// ===================================================================
console.log("--- STEP 5: PRO — UNLIMITED RESOURCES ---");
const testCounts = [5, 10, 25, 50, 100, 500, 1000];
for (const n of testCounts) {
  const c = canActivateConnector(n);
  const t = canAddTrigger(n);
  if (!c.allowed) fail(`Pro should allow ${n} connectors`);
  if (!t.allowed) fail(`Pro should allow ${n} triggers`);
}
console.log(`  Tested counts: [${testCounts.join(", ")}]`);
console.log("  All connectors: ALLOWED");
console.log("  All triggers: ALLOWED");
console.log("  PASS: Pro tier is truly unlimited\n");

// ===================================================================
// STEP 6: User cancels with excess resources
// ===================================================================
console.log("--- STEP 6: USER CANCELS (excess resources) ---");

// Build up resources: 8 connectors, 15 triggers (above free limits)
const conns = new MockConnectors();
for (let i = 1; i <= 8; i++) conns.add(`stripe-${i}`);
const trigs = new MockTriggers();
for (let i = 1; i <= 15; i++) trigs.add(`cron-job-${i}`);

console.log(`  Before cancel: ${conns.activeCount} connectors, ${trigs.enabledCount} triggers`);

// Simulate subscription.deleted webhook
const deleteBody = evt("customer.subscription.deleted", {
  id: "sub_live_user_test",
  customer: "cus_live_user_test",
});
processWebhookEvent(deleteBody, sign(deleteBody));

state = getLicenseState();
console.log(`  Tier after cancel: ${state.tier} (${state.label})`);
console.log(`  New connector limit: ${state.connectorLimit}`);
console.log(`  New trigger limit: ${state.triggerLimit}`);

if (state.tier !== "free") fail("Should be free after cancel");

// Gate check: can user add more connectors? (they have 8, limit is 5)
const overLimit = canActivateConnector(8);
console.log(`  Can add connector with 8 active (limit ${TIER_LIMITS.free.connectors})? ${overLimit.allowed ? "YES" : "NO"}`);
if (overLimit.allowed) fail("Should block adding connectors when over limit");

// Gate check: can user add more triggers? (they have 15, limit is 10)
const overTrigLimit = canAddTrigger(15);
console.log(`  Can add trigger with 15 active (limit ${TIER_LIMITS.free.triggers})? ${overTrigLimit.allowed ? "YES" : "NO"}`);
if (overTrigLimit.allowed) fail("Should block adding triggers when over limit");

// Run enforcement (what the daemon does after webhook)
const enforced = await enforceLicenseLimits(conns, trigs);
console.log(`  After enforcement: ${conns.activeCount} connectors, ${trigs.enabledCount} triggers`);
console.log(`  Evicted connectors: [${enforced.connectors.evicted.join(", ")}]`);
console.log(`  Disabled triggers: [${enforced.triggers.disabled.join(", ")}]`);
console.log(`  Surviving connectors: [${conns.list().join(", ")}]`);

if (conns.activeCount !== TIER_LIMITS.free.connectors) fail(`Connectors should be ${TIER_LIMITS.free.connectors} after enforcement`);
if (trigs.enabledCount !== TIER_LIMITS.free.triggers) fail(`Triggers should be ${TIER_LIMITS.free.triggers} after enforcement`);

// Verify oldest survived (LIFO eviction)
if (!conns.list().includes("stripe-1")) fail("Oldest connector should survive");
if (!conns.list().includes("stripe-5")) fail("5th connector should survive");
if (conns.list().includes("stripe-8")) fail("Newest connector should be evicted");
if (!trigs.isEnabled("cron-job-1")) fail("Oldest trigger should survive");
if (!trigs.isEnabled("cron-job-10")) fail("10th trigger should survive");
if (trigs.isEnabled("cron-job-11")) fail("11th trigger should be disabled");
if (trigs.isEnabled("cron-job-15")) fail("Newest trigger should be disabled");

console.log("  PASS: Enforcement correct — oldest survive, newest evicted/disabled\n");

// ===================================================================
// STEP 7: User re-subscribes
// ===================================================================
console.log("--- STEP 7: USER RE-SUBSCRIBES ---");
const resubBody = evt("checkout.session.completed", {
  id: "cs_resub",
  subscription: "sub_resub_test",
  customer: "cus_live_user_test",
  customer_email: "user@example.com",
  metadata: { jeriko_user_id: "live-test-user" },
});
processWebhookEvent(resubBody, sign(resubBody));

state = getLicenseState();
console.log(`  Tier: ${state.tier} (${state.label})`);
if (state.tier !== "pro") fail("Should be pro after re-subscribe");

const recheck = canActivateConnector(100);
console.log(`  100 connectors after re-sub: ${recheck.allowed ? "ALLOWED" : "BLOCKED"}`);
if (!recheck.allowed) fail("Pro should allow 100 connectors");
console.log("  PASS: Pro access fully restored\n");

// ===================================================================
// STEP 8: Payment fails -> past_due grace period
// ===================================================================
console.log("--- STEP 8: PAYMENT FAILS -> GRACE PERIOD ---");
const failBody = evt("invoice.payment_failed", { subscription: "sub_resub_test" });
processWebhookEvent(failBody, sign(failBody));

state = getLicenseState();
console.log(`  Tier: ${state.tier}, pastDue: ${state.pastDue}, grace: ${state.gracePeriod}`);
if (state.tier !== "pro") fail("Past due should keep pro tier");
if (!state.pastDue) fail("pastDue flag should be true");

const graceCheck = canActivateConnector(50);
console.log(`  50 connectors during grace: ${graceCheck.allowed ? "ALLOWED" : "BLOCKED"}`);
if (!graceCheck.allowed) fail("Grace period should allow full access");
console.log("  PASS: Grace period keeps pro access\n");

// ===================================================================
// STEP 9: Payment recovers
// ===================================================================
console.log("--- STEP 9: PAYMENT RECOVERS ---");
const recoverBody = evt("customer.subscription.updated", {
  id: "sub_resub_test",
  customer: "cus_live_user_test",
  status: "active",
  metadata: { tier: "pro" },
});
processWebhookEvent(recoverBody, sign(recoverBody));

state = getLicenseState();
console.log(`  Tier: ${state.tier}, pastDue: ${state.pastDue}`);
if (state.tier !== "pro") fail("Should be pro after recovery");
if (state.pastDue) fail("pastDue should be false after recovery");
console.log("  PASS: Fully recovered\n");

// ===================================================================
// Cleanup
// ===================================================================
closeDatabase();
if (existsSync(TEST_DB)) unlinkSync(TEST_DB);

console.log("================================================");
console.log("  ALL 9 STEPS PASSED — billing gates work live");
console.log("================================================\n");
