/**
 * Live E2E test — relay server + billing integration.
 *
 * Tests the full production stack with real HTTP requests to bot.jeriko.ai:
 *   - Relay health (public + authenticated)
 *   - Billing webhook signature verification
 *   - License persistence across DO hibernation
 *   - Full subscription lifecycle (upgrade → payment fail → recover → cancel)
 *   - Stripe API (checkout session, subscription queries)
 *   - Webhook error handling (invalid sig, missing header, unknown user)
 *   - Authentication (license endpoint auth, wrong token)
 *
 * Prerequisites:
 *   - ~/.config/jeriko/.env with STRIPE_BILLING_* + RELAY_AUTH_SECRET
 *   - Relay deployed at bot.jeriko.ai
 *   - Daemon running and connected to relay
 *
 * Usage: bun test/live/relay-billing-e2e.ts
 */

import { createHmac } from "node:crypto";

// ---------------------------------------------------------------------------
// Configuration — read from env
// ---------------------------------------------------------------------------

const RELAY_URL = process.env.JERIKO_RELAY_URL
  ? process.env.JERIKO_RELAY_URL.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://").replace(/\/relay\/?$/, "")
  : "https://bot.jeriko.ai";

const WEBHOOK_SECRET = process.env.STRIPE_BILLING_WEBHOOK_SECRET ?? "";
const AUTH_SECRET = process.env.RELAY_AUTH_SECRET ?? process.env.NODE_AUTH_SECRET ?? "";
const USER_ID = process.env.JERIKO_USER_ID ?? "";
const STRIPE_KEY = process.env.STRIPE_BILLING_SECRET_KEY ?? "";
const STRIPE_PRICE_ID = process.env.STRIPE_BILLING_PRICE_ID ?? "";

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
let skipped = 0;
const sections: string[] = [];

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ ${label}`);
    failed++;
  }
}

function skip(label: string, reason: string): void {
  console.log(`  ○ ${label} (skipped: ${reason})`);
  skipped++;
}

function section(label: string): void {
  sections.push(label);
  console.log(`\n── ${label} ──`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a valid Stripe webhook signature for a payload. */
function signPayload(payload: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;
  const signature = createHmac("sha256", secret).update(signedPayload).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

/** Send a signed billing webhook to the relay. */
async function sendWebhook(payload: string): Promise<Response> {
  const sig = signPayload(payload, WEBHOOK_SECRET);
  return fetch(`${RELAY_URL}/billing/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Stripe-Signature": sig,
    },
    body: payload,
    signal: AbortSignal.timeout(10_000),
  });
}

/** Check the license for our user via the relay API. */
async function checkLicense(): Promise<Record<string, unknown>> {
  const resp = await fetch(`${RELAY_URL}/billing/license/${USER_ID}`, {
    headers: { Authorization: `Bearer ${AUTH_SECRET}` },
    signal: AbortSignal.timeout(10_000),
  });
  const data = await resp.json() as { ok: boolean; data: Record<string, unknown> };
  return data.data;
}

/** Generate a unique event ID to avoid idempotency collisions. */
function eventId(prefix: string): string {
  return `evt_e2e_${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Section 1: Relay Health
// ---------------------------------------------------------------------------

async function testRelayHealth(): Promise<void> {
  section("1. RELAY HEALTH");

  // Public health endpoint
  const healthResp = await fetch(`${RELAY_URL}/health`, {
    signal: AbortSignal.timeout(10_000),
  });
  const health = await healthResp.json() as { ok: boolean; data: Record<string, unknown> };

  assert(health.ok === true, "Public /health returns ok=true");
  assert(health.data.service === "jeriko-relay", "Service name is 'jeriko-relay'");
  assert(health.data.status === "healthy", "Status is 'healthy'");
  assert(typeof health.data.connected_daemons === "number", "connected_daemons is a number");

  // Authenticated health status
  const statusResp = await fetch(`${RELAY_URL}/health/status`, {
    headers: { Authorization: `Bearer ${AUTH_SECRET}` },
    signal: AbortSignal.timeout(10_000),
  });
  const status = await statusResp.json() as { ok: boolean; data: Record<string, unknown> };

  assert(status.ok === true, "Authenticated /health/status returns ok=true");
  assert(typeof status.data.connections === "number", "connections is a number");
  assert(Array.isArray(status.data.users), "users is an array");

  // Check our daemon is connected
  const users = status.data.users as Array<{ userId: string }>;
  const ourDaemon = users.find((u) => u.userId === USER_ID);
  assert(!!ourDaemon, `Our daemon (${USER_ID.slice(0, 8)}...) is connected`);

  // Unauthorized health status
  const unauthResp = await fetch(`${RELAY_URL}/health/status`, {
    headers: { Authorization: "Bearer wrong-token" },
    signal: AbortSignal.timeout(10_000),
  });
  const unauth = await unauthResp.json() as { ok: boolean };
  assert(unauth.ok === false, "Wrong token rejected on /health/status");
}

// ---------------------------------------------------------------------------
// Section 2: Webhook Signature Verification
// ---------------------------------------------------------------------------

async function testWebhookSignature(): Promise<void> {
  section("2. WEBHOOK SIGNATURE VERIFICATION");

  // Valid signature
  const payload = JSON.stringify({
    id: eventId("sig_valid"),
    type: "customer.subscription.updated",
    data: { object: { id: "sub_sig", customer: "cus_sig", status: "active", metadata: { jeriko_user_id: USER_ID } } },
  });
  const validResp = await sendWebhook(payload);
  const validData = await validResp.json() as { ok: boolean };
  assert(validData.ok === true, "Valid signature accepted");

  // Invalid signature
  const invalidResp = await fetch(`${RELAY_URL}/billing/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Stripe-Signature": "t=1234567890,v1=invalid_signature",
    },
    body: payload,
    signal: AbortSignal.timeout(10_000),
  });
  const invalidData = await invalidResp.json() as { ok: boolean; error: string };
  assert(invalidData.ok === false, "Invalid signature rejected");
  assert(invalidData.error === "Invalid signature", "Error message is 'Invalid signature'");

  // Missing signature header
  const missingResp = await fetch(`${RELAY_URL}/billing/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    signal: AbortSignal.timeout(10_000),
  });
  const missingData = await missingResp.json() as { ok: boolean; error: string };
  assert(missingData.ok === false, "Missing signature header rejected");
  assert(missingData.error === "Missing Stripe-Signature header", "Error message correct");

  // Replay attack (timestamp > 5 min old)
  const oldTimestamp = Math.floor(Date.now() / 1000) - 600;
  const replaySignature = createHmac("sha256", WEBHOOK_SECRET)
    .update(`${oldTimestamp}.${payload}`)
    .digest("hex");
  const replayResp = await fetch(`${RELAY_URL}/billing/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Stripe-Signature": `t=${oldTimestamp},v1=${replaySignature}`,
    },
    body: payload,
    signal: AbortSignal.timeout(10_000),
  });
  const replayData = await replayResp.json() as { ok: boolean };
  assert(replayData.ok === false, "Replay attack (old timestamp) rejected");
}

// ---------------------------------------------------------------------------
// Section 3: License Persistence Across Hibernation
// ---------------------------------------------------------------------------

async function testLicensePersistence(): Promise<void> {
  section("3. LICENSE PERSISTENCE ACROSS HIBERNATION");

  // Send a checkout webhook to set tier=pro
  const checkoutPayload = JSON.stringify({
    id: eventId("persist_checkout"),
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_persist",
        subscription: "sub_persist_e2e",
        customer: "cus_persist_e2e",
        customer_email: "persist@e2e.test",
        metadata: { jeriko_user_id: USER_ID, terms_accepted: "true" },
      },
    },
  });

  const webhookResp = await sendWebhook(checkoutPayload);
  const webhookData = await webhookResp.json() as { ok: boolean };
  assert(webhookData.ok === true, "Checkout webhook accepted");

  // Check license immediately
  const license1 = await checkLicense();
  assert(license1.tier === "pro", "License is pro after checkout");
  assert(license1.status === "active", "Status is active");
  assert(license1.email === "persist@e2e.test", "Email preserved");

  // Wait for potential DO hibernation (DOs can hibernate in <10s of inactivity)
  console.log("  ... waiting 12s for potential DO hibernation ...");
  await new Promise((r) => setTimeout(r, 12_000));

  // Check license again — should still be pro (persisted in DO storage)
  const license2 = await checkLicense();
  assert(license2.tier === "pro", "License still pro after hibernation");
  assert(license2.status === "active", "Status still active after hibernation");
  assert(license2.subscriptionId === "sub_persist_e2e", "subscriptionId preserved");
}

// ---------------------------------------------------------------------------
// Section 4: Full Subscription Lifecycle
// ---------------------------------------------------------------------------

async function testSubscriptionLifecycle(): Promise<void> {
  section("4. SUBSCRIPTION LIFECYCLE");

  // Step 1: Checkout completed (upgrade to pro)
  console.log("  [Step 1] Checkout completed → pro");
  await sendWebhook(JSON.stringify({
    id: eventId("lc_checkout"),
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_lc",
        subscription: "sub_lc_001",
        customer: "cus_lc_001",
        customer_email: "lifecycle@e2e.test",
        metadata: { jeriko_user_id: USER_ID, terms_accepted: "true" },
      },
    },
  }));
  let license = await checkLicense();
  assert(license.tier === "pro", "Step 1: tier=pro");
  assert(license.status === "active", "Step 1: status=active");

  // Step 2: Subscription created (Stripe sends this after checkout)
  console.log("  [Step 2] Subscription created");
  await sendWebhook(JSON.stringify({
    id: eventId("lc_sub_created"),
    type: "customer.subscription.created",
    data: {
      object: {
        id: "sub_lc_001",
        customer: "cus_lc_001",
        status: "active",
        metadata: { jeriko_user_id: USER_ID, tier: "pro" },
      },
    },
  }));
  license = await checkLicense();
  assert(license.tier === "pro", "Step 2: tier=pro after sub created");

  // Step 3: Invoice payment failed → past_due
  console.log("  [Step 3] Payment failed → past_due");
  await sendWebhook(JSON.stringify({
    id: eventId("lc_pay_fail"),
    type: "invoice.payment_failed",
    data: {
      object: {
        id: "in_lc_fail",
        subscription: "sub_lc_001",
        metadata: { jeriko_user_id: USER_ID },
      },
    },
  }));
  license = await checkLicense();
  assert(license.tier === "pro", "Step 3: tier still pro during grace");
  assert(license.status === "past_due", "Step 3: status=past_due");

  // Step 4: Payment recovered → active
  console.log("  [Step 4] Payment recovered → active");
  await sendWebhook(JSON.stringify({
    id: eventId("lc_pay_ok"),
    type: "invoice.payment_succeeded",
    data: {
      object: {
        id: "in_lc_ok",
        subscription: "sub_lc_001",
        metadata: { jeriko_user_id: USER_ID },
      },
    },
  }));
  license = await checkLicense();
  assert(license.status === "active", "Step 4: status=active after recovery");

  // Step 5: Cancel at period end (subscription.updated with cancel_at_period_end)
  console.log("  [Step 5] Cancel at period end");
  await sendWebhook(JSON.stringify({
    id: eventId("lc_cancel_end"),
    type: "customer.subscription.updated",
    data: {
      object: {
        id: "sub_lc_001",
        customer: "cus_lc_001",
        status: "active",
        cancel_at_period_end: true,
        metadata: { jeriko_user_id: USER_ID, tier: "pro" },
      },
    },
  }));
  license = await checkLicense();
  assert(license.tier === "pro", "Step 5: still pro until period end");
  assert(license.status === "active", "Step 5: status still active");

  // Step 6: Subscription actually deleted → free
  console.log("  [Step 6] Subscription deleted → free");
  await sendWebhook(JSON.stringify({
    id: eventId("lc_deleted"),
    type: "customer.subscription.deleted",
    data: {
      object: {
        id: "sub_lc_001",
        customer: "cus_lc_001",
        status: "canceled",
        metadata: { jeriko_user_id: USER_ID },
      },
    },
  }));
  license = await checkLicense();
  assert(license.tier === "free", "Step 6: tier=free after deletion");
  assert(license.status === "canceled", "Step 6: status=canceled");

  // Step 7: Re-upgrade with new subscription
  console.log("  [Step 7] Re-upgrade with new subscription");
  await sendWebhook(JSON.stringify({
    id: eventId("lc_reupgrade"),
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_lc_2",
        subscription: "sub_lc_002",
        customer: "cus_lc_001",
        customer_email: "reupgrade@e2e.test",
        metadata: { jeriko_user_id: USER_ID, terms_accepted: "true" },
      },
    },
  }));
  license = await checkLicense();
  assert(license.tier === "pro", "Step 7: tier=pro after re-upgrade");
  assert(license.subscriptionId === "sub_lc_002", "Step 7: new subscription ID");

  // Step 8: Subscription paused → still shows pro (relay keeps tier, status changes)
  console.log("  [Step 8] Subscription paused");
  await sendWebhook(JSON.stringify({
    id: eventId("lc_paused"),
    type: "customer.subscription.updated",
    data: {
      object: {
        id: "sub_lc_002",
        customer: "cus_lc_001",
        status: "paused",
        metadata: { jeriko_user_id: USER_ID },
      },
    },
  }));
  license = await checkLicense();
  assert(license.status === "paused", "Step 8: status=paused");

  // Step 9: Subscription resumed
  console.log("  [Step 9] Subscription resumed");
  await sendWebhook(JSON.stringify({
    id: eventId("lc_resumed"),
    type: "customer.subscription.updated",
    data: {
      object: {
        id: "sub_lc_002",
        customer: "cus_lc_001",
        status: "active",
        metadata: { jeriko_user_id: USER_ID, tier: "pro" },
      },
    },
  }));
  license = await checkLicense();
  assert(license.tier === "pro", "Step 9: tier=pro after resume");
  assert(license.status === "active", "Step 9: status=active after resume");
}

// ---------------------------------------------------------------------------
// Section 5: Stripe API Direct Tests
// ---------------------------------------------------------------------------

async function testStripeApi(): Promise<void> {
  section("5. STRIPE API (DIRECT)");

  if (!STRIPE_KEY) {
    skip("Stripe API tests", "STRIPE_BILLING_SECRET_KEY not set");
    return;
  }

  const headers = {
    Authorization: `Basic ${btoa(STRIPE_KEY + ":")}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };

  // List products
  const productsResp = await fetch("https://api.stripe.com/v1/products", {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  const products = await productsResp.json() as { data: Array<{ id: string; name: string; active: boolean }> };
  assert(products.data.length > 0, "At least one product exists");

  const jerikoProduct = products.data.find((p) => p.name.includes("Jeriko"));
  assert(!!jerikoProduct, "Jeriko product found");
  assert(jerikoProduct?.active === true, "Jeriko product is active");

  // Check price
  if (STRIPE_PRICE_ID) {
    const priceResp = await fetch(`https://api.stripe.com/v1/prices/${STRIPE_PRICE_ID}`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    const price = await priceResp.json() as {
      id: string;
      active: boolean;
      unit_amount: number;
      currency: string;
      recurring: { interval: string };
    };
    assert(price.active === true, "Price is active");
    assert(price.unit_amount === 1999, "Price is $19.99 (1999 cents)");
    assert(price.currency === "usd", "Currency is USD");
    assert(price.recurring?.interval === "month", "Recurring interval is monthly");
  }

  // Create checkout session
  const checkoutParams = new URLSearchParams({
    mode: "subscription",
    customer_email: "e2e-test@jeriko.ai",
    "line_items[0][price]": STRIPE_PRICE_ID,
    "line_items[0][quantity]": "1",
    success_url: "https://jeriko.ai/billing/success?session_id={CHECKOUT_SESSION_ID}",
    cancel_url: "https://jeriko.ai/billing/cancel",
    "subscription_data[metadata][source]": "jeriko-e2e-test",
    "subscription_data[metadata][jeriko_user_id]": USER_ID,
    "metadata[source]": "jeriko-e2e-test",
    "metadata[jeriko_user_id]": USER_ID,
  });

  const sessionResp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers,
    body: checkoutParams.toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const session = await sessionResp.json() as { id: string; url: string; mode: string };
  assert(!!session.id, "Checkout session created");
  assert(session.id.startsWith("cs_"), "Session ID starts with cs_");
  assert(!!session.url, "Checkout URL returned");
  assert(session.url.includes("checkout.stripe.com"), "URL points to Stripe checkout");
  assert(session.mode === "subscription", "Mode is subscription");

  // Verify no stale subscriptions
  const subsResp = await fetch("https://api.stripe.com/v1/subscriptions", {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  const subs = await subsResp.json() as { data: Array<{ id: string }> };
  console.log(`  Active subscriptions: ${subs.data.length}`);
  // No assertion — just informational
}

// ---------------------------------------------------------------------------
// Section 6: Webhook Routing & Error Handling
// ---------------------------------------------------------------------------

async function testWebhookRouting(): Promise<void> {
  section("6. WEBHOOK ROUTING & ERROR HANDLING");

  // Unregistered trigger
  const unreg = await fetch(`${RELAY_URL}/hooks/${USER_ID}/non-existent-trigger`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"test":true}',
    signal: AbortSignal.timeout(10_000),
  });
  const unregData = await unreg.json() as { ok: boolean; error: string };
  assert(unregData.ok === false, "Unregistered trigger returns ok=false");
  assert(unregData.error.includes("not registered"), "Error mentions 'not registered'");

  // Disconnected user
  const disconn = await fetch(`${RELAY_URL}/hooks/fake-user-id/some-trigger`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"test":true}',
    signal: AbortSignal.timeout(10_000),
  });
  const disconnData = await disconn.json() as { ok: boolean; error: string };
  assert(disconnData.ok === false, "Disconnected user returns ok=false");
  assert(disconnData.error.includes("not connected"), "Error mentions 'not connected'");

  // Legacy route (no userId)
  const legacy = await fetch(`${RELAY_URL}/hooks/some-trigger`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"test":true}',
    signal: AbortSignal.timeout(10_000),
  });
  const legacyData = await legacy.json() as { ok: boolean; error: string };
  assert(legacyData.ok === false, "Legacy route with no owner returns ok=false");

  // 404 on unknown path
  const notFound = await fetch(`${RELAY_URL}/nonexistent-path`, {
    signal: AbortSignal.timeout(10_000),
  });
  const notFoundData = await notFound.json() as { ok: boolean; error: string };
  assert(notFoundData.ok === false, "Unknown path returns ok=false");
  assert(notFoundData.error === "Not found", "Error is 'Not found'");
}

// ---------------------------------------------------------------------------
// Section 7: License Endpoint Auth
// ---------------------------------------------------------------------------

async function testLicenseAuth(): Promise<void> {
  section("7. LICENSE ENDPOINT AUTH");

  // No auth header
  const noAuth = await fetch(`${RELAY_URL}/billing/license/${USER_ID}`, {
    signal: AbortSignal.timeout(10_000),
  });
  const noAuthData = await noAuth.json() as { ok: boolean; error: string };
  assert(noAuthData.ok === false, "No auth header rejected");
  assert(noAuthData.error === "Unauthorized", "Error is 'Unauthorized'");

  // Wrong token
  const wrongToken = await fetch(`${RELAY_URL}/billing/license/${USER_ID}`, {
    headers: { Authorization: "Bearer definitely-wrong-token" },
    signal: AbortSignal.timeout(10_000),
  });
  const wrongData = await wrongToken.json() as { ok: boolean; error: string };
  assert(wrongData.ok === false, "Wrong token rejected");
  assert(wrongData.error === "Unauthorized", "Error is 'Unauthorized'");

  // Unknown user returns free
  const unknownUser = await fetch(`${RELAY_URL}/billing/license/unknown-user-that-never-existed`, {
    headers: { Authorization: `Bearer ${AUTH_SECRET}` },
    signal: AbortSignal.timeout(10_000),
  });
  const unknownData = await unknownUser.json() as { ok: boolean; data: Record<string, unknown> };
  assert(unknownData.ok === true, "Unknown user returns ok=true");
  assert(unknownData.data.tier === "free", "Unknown user gets free tier");
  assert(unknownData.data.subscriptionId === null, "Unknown user has null subscriptionId");

  // Valid auth returns license data
  const valid = await fetch(`${RELAY_URL}/billing/license/${USER_ID}`, {
    headers: { Authorization: `Bearer ${AUTH_SECRET}` },
    signal: AbortSignal.timeout(10_000),
  });
  const validData = await valid.json() as { ok: boolean; data: Record<string, unknown> };
  assert(validData.ok === true, "Valid auth returns ok=true");
  assert(typeof validData.data.tier === "string", "tier is a string");
  assert(typeof validData.data.status === "string", "status is a string");
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

async function cleanup(): Promise<void> {
  section("CLEANUP");

  // Reset to free tier
  await sendWebhook(JSON.stringify({
    id: eventId("cleanup"),
    type: "customer.subscription.deleted",
    data: {
      object: {
        id: "sub_lc_002",
        customer: "cus_lc_001",
        status: "canceled",
        metadata: { jeriko_user_id: USER_ID },
      },
    },
  }));

  const license = await checkLicense();
  assert(license.tier === "free", "Cleanup: reset to free tier");
  console.log("  License reset to free tier");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("╔═══════════════════════════════════════════════════╗");
  console.log("║  LIVE E2E: RELAY + BILLING (bot.jeriko.ai)       ║");
  console.log("╚═══════════════════════════════════════════════════╝");
  console.log(`  Relay:   ${RELAY_URL}`);
  console.log(`  User:    ${USER_ID.slice(0, 8)}...`);
  console.log(`  Stripe:  ${STRIPE_KEY ? "configured" : "not configured"}`);

  // Validate prerequisites
  if (!WEBHOOK_SECRET || !AUTH_SECRET || !USER_ID) {
    console.error("\n  FATAL: Missing required env vars:");
    if (!WEBHOOK_SECRET) console.error("    - STRIPE_BILLING_WEBHOOK_SECRET");
    if (!AUTH_SECRET) console.error("    - RELAY_AUTH_SECRET or NODE_AUTH_SECRET");
    if (!USER_ID) console.error("    - JERIKO_USER_ID");
    process.exit(1);
  }

  try {
    await testRelayHealth();
    await testWebhookSignature();
    await testLicensePersistence();
    await testSubscriptionLifecycle();
    await testStripeApi();
    await testWebhookRouting();
    await testLicenseAuth();
    await cleanup();
  } catch (err: unknown) {
    console.error(`\n  FATAL ERROR: ${err}`);
    if (err instanceof Error) console.error(`  Stack: ${err.stack}`);
    failed++;
  }

  console.log("\n═══════════════════════════════════════════════════════");
  console.log(`  Sections: ${sections.length}`);
  console.log(`  Results:  ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log("═══════════════════════════════════════════════════════");

  process.exit(failed > 0 ? 1 : 0);
}

main();
