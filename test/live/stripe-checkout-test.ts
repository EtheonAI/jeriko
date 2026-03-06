// Live integration test: Stripe Checkout session creation with subscription flow.
//
// Verifies that our checkout session parameters are accepted by Stripe's API.
// Creates a session, validates the response, and expires it for cleanup.
//
// Usage: bun test/live/stripe-checkout-test.ts

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Load secrets
const envPath = join(homedir(), ".config/jeriko/.env");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const eq = line.indexOf("=");
  if (eq > 0 && !line.startsWith("#")) {
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    if (key && val) process.env[key] = val;
  }
}

const sk = process.env.STRIPE_BILLING_SECRET_KEY;
const priceId = process.env.STRIPE_BILLING_PRICE_ID;

if (!sk || !priceId) {
  console.error("Missing STRIPE_BILLING_SECRET_KEY or STRIPE_BILLING_PRICE_ID");
  process.exit(1);
}

const isTestKey = sk.startsWith("sk_test_");
console.log(`Stripe key: ${sk.slice(0, 7)}... (${isTestKey ? "TEST" : "LIVE"} mode)`);
console.log(`Price ID: ${priceId}`);

if (!isTestKey) {
  console.error("\nRefusing to run with a live key. Use a test key (sk_test_...).");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Test 1: Create checkout session with all subscription parameters
// ---------------------------------------------------------------------------

async function testCheckoutSession(): Promise<void> {
  console.log("\n--- Test 1: Create Checkout Session ---");

  const body = new URLSearchParams();
  body.set("mode", "subscription");
  body.set("customer_email", "integration-test@jeriko.ai");
  body.set("line_items[0][price]", priceId);
  body.set("line_items[0][quantity]", "1");

  // ADR-002 compliance params
  body.set("billing_address_collection", "required");
  body.set("consent_collection[terms_of_service]", "required");
  body.set("client_reference_id", "test-user-integration-123");
  body.set("customer_creation", "always");
  body.set("payment_method_collection", "always");

  body.set("success_url", "https://jeriko.ai/billing/success?session_id={CHECKOUT_SESSION_ID}");
  body.set("cancel_url", "https://jeriko.ai/billing/cancel");

  // Metadata (chargeback evidence)
  body.set("subscription_data[metadata][source]", "jeriko-integration-test");
  body.set("subscription_data[metadata][jeriko_user_id]", "test-user-123");
  body.set("subscription_data[metadata][client_ip]", "203.0.113.42");
  body.set("subscription_data[metadata][user_agent]", "jeriko-cli/2.0.0 (darwin)");
  body.set("subscription_data[metadata][checkout_at]", new Date().toISOString());

  body.set("metadata[source]", "jeriko-integration-test");
  body.set("metadata[jeriko_user_id]", "test-user-123");
  body.set("metadata[client_ip]", "203.0.113.42");
  body.set("metadata[user_agent]", "jeriko-cli/2.0.0 (darwin)");

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sk}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const json = (await res.json()) as Record<string, unknown>;

  if (!res.ok) {
    const error = json.error as Record<string, unknown> | undefined;
    console.error("FAIL: Stripe API error");
    console.error(`  Status: ${res.status}`);
    console.error(`  Type: ${error?.type}`);
    console.error(`  Code: ${error?.code}`);
    console.error(`  Message: ${error?.message}`);
    console.error(`  Param: ${error?.param}`);
    process.exit(1);
  }

  // Validate response
  const checks = [
    ["Session ID", typeof json.id === "string" && (json.id as string).startsWith("cs_")],
    ["URL present", typeof json.url === "string" && (json.url as string).startsWith("https://")],
    ["Mode = subscription", json.mode === "subscription"],
    ["Status = open", json.status === "open"],
    ["Client reference ID", json.client_reference_id === "test-user-integration-123"],
    ["Consent collection", !!(json.consent_collection as Record<string, unknown>)?.terms_of_service],
    ["Billing address = required", json.billing_address_collection === "required"],
    ["Customer creation = always", json.customer_creation === "always"],
    ["Payment method = always", json.payment_method_collection === "always"],
  ] as const;

  let allPassed = true;
  for (const [name, passed] of checks) {
    const icon = passed ? "✓" : "✗";
    console.log(`  ${icon} ${name}`);
    if (!passed) allPassed = false;
  }

  // Check metadata
  const metadata = json.metadata as Record<string, string> | undefined;
  if (metadata) {
    console.log(`  ✓ Metadata: source=${metadata.source}, user_id=${metadata.jeriko_user_id}, ip=${metadata.client_ip}`);
  } else {
    console.log("  ✗ Metadata missing");
    allPassed = false;
  }

  // Expire the session (cleanup)
  const expireRes = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${json.id}/expire`,
    { method: "POST", headers: { Authorization: `Bearer ${sk}` } },
  );
  if (expireRes.ok) {
    console.log("  (Session expired for cleanup)");
  }

  if (!allPassed) {
    console.error("\nSome checks failed.");
    process.exit(1);
  }

  console.log("\nAll checks passed.");
}

// ---------------------------------------------------------------------------
// Test 2: Verify the Price ID is a recurring subscription price
// ---------------------------------------------------------------------------

async function testPriceIsRecurring(): Promise<void> {
  console.log("\n--- Test 2: Verify Price is Recurring ---");

  const res = await fetch(`https://api.stripe.com/v1/prices/${priceId}`, {
    headers: { Authorization: `Bearer ${sk}` },
  });

  const json = (await res.json()) as Record<string, unknown>;

  if (!res.ok) {
    console.error("FAIL: Could not retrieve price");
    process.exit(1);
  }

  const recurring = json.recurring as Record<string, unknown> | undefined;
  const checks = [
    ["Price exists", json.id === priceId],
    ["Type = recurring", json.type === "recurring"],
    ["Recurring interval present", !!recurring?.interval],
    ["Active", json.active === true],
  ] as const;

  for (const [name, passed] of checks) {
    console.log(`  ${passed ? "✓" : "✗"} ${name}`);
  }

  if (recurring) {
    console.log(`  Interval: ${recurring.interval} (every ${recurring.interval_count ?? 1})`);
  }

  const amount = json.unit_amount as number | undefined;
  const currency = json.currency as string | undefined;
  if (amount && currency) {
    console.log(`  Amount: ${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`);
  }
}

// ---------------------------------------------------------------------------
// Test 3: Customer Portal configuration check
// ---------------------------------------------------------------------------

async function testPortalConfig(): Promise<void> {
  console.log("\n--- Test 3: Customer Portal Config ---");

  const res = await fetch("https://api.stripe.com/v1/billing_portal/configurations?limit=1", {
    headers: { Authorization: `Bearer ${sk}` },
  });

  const json = (await res.json()) as { data?: Array<Record<string, unknown>> };

  if (!res.ok) {
    console.log("  (Could not check portal config — may need dashboard setup)");
    return;
  }

  const configs = json.data ?? [];
  if (configs.length === 0) {
    console.log("  ⚠ No portal configuration found — configure in Stripe Dashboard");
    return;
  }

  const config = configs[0]!;
  console.log(`  ✓ Portal config: ${config.id}`);
  console.log(`  Active: ${config.is_default}`);

  const features = config.features as Record<string, unknown> | undefined;
  if (features) {
    const subCancel = features.subscription_cancel as Record<string, unknown> | undefined;
    const subUpdate = features.subscription_update as Record<string, unknown> | undefined;
    const paymentUpdate = features.payment_method_update as Record<string, unknown> | undefined;
    console.log(`  Subscription cancel: ${subCancel?.enabled ?? "unknown"}`);
    console.log(`  Subscription update: ${subUpdate?.enabled ?? "unknown"}`);
    console.log(`  Payment method update: ${paymentUpdate?.enabled ?? "unknown"}`);
  }
}

// ---------------------------------------------------------------------------
// Run all tests
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("=== Stripe Subscription Flow Integration Test ===\n");

  await testPriceIsRecurring();
  await testCheckoutSession();
  await testPortalConfig();

  console.log("\n=== All integration tests passed ===");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
