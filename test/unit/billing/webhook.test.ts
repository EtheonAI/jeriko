// Billing webhook tests — event processing, idempotency, and subscription lifecycle.

import { describe, expect, it, beforeAll, afterAll, beforeEach } from "bun:test";
import { createHmac } from "node:crypto";
import { initDatabase, closeDatabase } from "../../../src/daemon/storage/db.js";
import { processWebhookEvent } from "../../../src/daemon/billing/webhook.js";
import {
  getSubscription,
  getSubscriptionById,
  getLicense,
  hasEvent,
  getRecentEvents,
} from "../../../src/daemon/billing/store.js";
import { BILLING_ENV } from "../../../src/daemon/billing/config.js";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unlinkSync, existsSync } from "node:fs";
import type { Database } from "bun:sqlite";

const TEST_DB = join(tmpdir(), `jeriko-billing-webhook-test-${Date.now()}.db`);
const TEST_WEBHOOK_SECRET = "whsec_test_secret_for_unit_tests";

describe("billing/webhook", () => {
  let db: Database;
  let savedEnv: Record<string, string | undefined>;

  beforeAll(() => {
    // Save and set env
    savedEnv = {};
    for (const val of Object.values(BILLING_ENV)) {
      savedEnv[val] = process.env[val];
    }
    process.env[BILLING_ENV.secretKey] = "sk_test_fake";
    process.env[BILLING_ENV.webhookSecret] = TEST_WEBHOOK_SECRET;

    db = initDatabase(TEST_DB);
  });

  afterAll(() => {
    closeDatabase();
    // Restore env
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val !== undefined) {
        process.env[key] = val;
      } else {
        delete process.env[key];
      }
    }
    for (const suffix of ["", "-wal", "-shm"]) {
      try {
        if (existsSync(TEST_DB + suffix)) unlinkSync(TEST_DB + suffix);
      } catch { /* cleanup best effort */ }
    }
  });

  beforeEach(() => {
    // Clean billing tables between tests
    db.prepare("DELETE FROM billing_subscription").run();
    db.prepare("DELETE FROM billing_license").run();
    db.prepare("DELETE FROM billing_event").run();
  });

  // ── Helper: create a signed webhook payload ──────────────────

  function signPayload(body: string, secret: string = TEST_WEBHOOK_SECRET): string {
    const timestamp = Math.floor(Date.now() / 1000);
    const signedPayload = `${timestamp}.${body}`;
    const signature = createHmac("sha256", secret).update(signedPayload).digest("hex");
    return `t=${timestamp},v1=${signature}`;
  }

  function makeEvent(type: string, data: Record<string, unknown>, id?: string): string {
    return JSON.stringify({
      id: id ?? `evt_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      data: { object: data },
    });
  }

  // ── Signature verification ─────────────────────────────────────

  describe("signature verification", () => {
    it("rejects missing signature header", () => {
      const body = makeEvent("invoice.paid", {});
      const result = processWebhookEvent(body, "");
      expect(result.handled).toBe(false);
      expect(result.error).toContain("Invalid signature");
    });

    it("rejects invalid signature", () => {
      const body = makeEvent("invoice.paid", {});
      const result = processWebhookEvent(body, "t=123,v1=invalid_signature");
      expect(result.handled).toBe(false);
    });

    it("accepts valid signature", () => {
      const body = makeEvent("some.unhandled.event", {});
      const sig = signPayload(body);
      const result = processWebhookEvent(body, sig);
      expect(result.handled).toBe(true);
    });
  });

  // ── Idempotency ────────────────────────────────────────────────

  describe("idempotency", () => {
    it("processes event only once", () => {
      const eventId = "evt_idempotent_test";
      const body = makeEvent("invoice.paid", { subscription: "sub_idem" }, eventId);
      const sig = signPayload(body);

      const first = processWebhookEvent(body, sig);
      expect(first.handled).toBe(true);
      expect(first.eventId).toBe(eventId);

      // Re-sign since timestamp changes
      const sig2 = signPayload(body);
      const second = processWebhookEvent(body, sig2);
      expect(second.handled).toBe(true);
      expect(second.eventId).toBe(eventId);

      // Should only have one event recorded
      const events = getRecentEvents(100);
      const matching = events.filter((e) => e.id === eventId);
      expect(matching.length).toBe(1);
    });
  });

  // ── Event recording ────────────────────────────────────────────

  describe("event recording", () => {
    it("stores every event in audit trail", () => {
      const eventId = `evt_audit_${Date.now()}`;
      const body = makeEvent("customer.subscription.created", {
        id: "sub_audit",
        customer: "cus_audit",
        status: "active",
      }, eventId);
      const sig = signPayload(body);

      processWebhookEvent(body, sig);
      expect(hasEvent(eventId)).toBe(true);
    });

    it("stores full JSON payload", () => {
      const eventId = `evt_payload_${Date.now()}`;
      const payload = {
        id: "sub_full",
        customer: "cus_full",
        status: "active",
        metadata: { tier: "pro" },
      };
      const body = makeEvent("customer.subscription.updated", payload, eventId);
      const sig = signPayload(body);

      processWebhookEvent(body, sig);

      const events = getRecentEvents(100);
      const found = events.find((e) => e.id === eventId);
      expect(found).toBeTruthy();
      const parsed = JSON.parse(found!.payload);
      expect(parsed.data.object.customer).toBe("cus_full");
    });
  });

  // ── checkout.session.completed ─────────────────────────────────

  describe("checkout.session.completed", () => {
    it("creates subscription and updates license", () => {
      const eventId = `evt_checkout_${Date.now()}`;
      const body = makeEvent("checkout.session.completed", {
        subscription: "sub_new_checkout",
        customer: "cus_new",
        customer_email: "new@example.com",
        metadata: {
          source: "jeriko-cli",
          terms_accepted: "true",
          terms_accepted_at: new Date().toISOString(),
        },
      }, eventId);
      const sig = signPayload(body);

      const result = processWebhookEvent(body, sig);
      expect(result.handled).toBe(true);

      // Subscription should be created
      const sub = getSubscriptionById("sub_new_checkout");
      expect(sub).not.toBeNull();
      expect(sub!.customer_id).toBe("cus_new");
      expect(sub!.email).toBe("new@example.com");
      expect(sub!.tier).toBe("pro");
      expect(sub!.status).toBe("active");
      expect(sub!.terms_accepted_at).not.toBeNull();

      // License should be updated
      const license = getLicense();
      expect(license.tier).toBe("pro");
      expect(license.email).toBe("new@example.com");
      expect(license.subscription_id).toBe("sub_new_checkout");
      expect(license.customer_id).toBe("cus_new");
    });
  });

  // ── customer.subscription.updated ──────────────────────────────

  describe("customer.subscription.updated", () => {
    it("updates subscription status", () => {
      // First create a subscription
      const checkoutBody = makeEvent("checkout.session.completed", {
        subscription: "sub_update_test",
        customer: "cus_update",
        customer_email: "update@example.com",
        metadata: {},
      });
      processWebhookEvent(checkoutBody, signPayload(checkoutBody));

      // Now update it
      const updateBody = makeEvent("customer.subscription.updated", {
        id: "sub_update_test",
        customer: "cus_update",
        status: "past_due",
        cancel_at_period_end: true,
        current_period_start: 1700000000,
        current_period_end: 1702592000,
        metadata: { tier: "pro" },
      });
      processWebhookEvent(updateBody, signPayload(updateBody));

      const sub = getSubscriptionById("sub_update_test");
      expect(sub).not.toBeNull();
      expect(sub!.status).toBe("past_due");
      expect(sub!.cancel_at_period_end).toBe(true);
    });
  });

  // ── customer.subscription.deleted ──────────────────────────────

  describe("customer.subscription.deleted", () => {
    it("downgrades to free tier", () => {
      // Create subscription first
      const checkoutBody = makeEvent("checkout.session.completed", {
        subscription: "sub_delete_test",
        customer: "cus_delete",
        customer_email: "delete@example.com",
        metadata: {},
      });
      processWebhookEvent(checkoutBody, signPayload(checkoutBody));

      // Verify it's pro
      let license = getLicense();
      expect(license.tier).toBe("pro");

      // Delete subscription
      const deleteBody = makeEvent("customer.subscription.deleted", {
        id: "sub_delete_test",
        customer: "cus_delete",
      });
      processWebhookEvent(deleteBody, signPayload(deleteBody));

      // Should be free now
      const sub = getSubscriptionById("sub_delete_test");
      expect(sub!.tier).toBe("free");
      expect(sub!.status).toBe("canceled");

      license = getLicense();
      expect(license.tier).toBe("free");
      expect(license.connector_limit).toBe(2);
      expect(license.trigger_limit).toBe(3);
    });
  });

  // ── invoice.paid ───────────────────────────────────────────────

  describe("invoice.paid", () => {
    it("extends valid_until grace period", () => {
      // Create subscription
      const checkoutBody = makeEvent("checkout.session.completed", {
        subscription: "sub_invoice_test",
        customer: "cus_invoice",
        customer_email: "invoice@example.com",
        metadata: {},
      });
      processWebhookEvent(checkoutBody, signPayload(checkoutBody));

      // Record invoice
      const invoiceBody = makeEvent("invoice.paid", {
        subscription: "sub_invoice_test",
      });
      processWebhookEvent(invoiceBody, signPayload(invoiceBody));

      const license = getLicense();
      expect(license.verified_at).not.toBeNull();
      expect(license.valid_until).not.toBeNull();
      // valid_until should be ~7 days from now
      const now = Math.floor(Date.now() / 1000);
      expect(license.valid_until!).toBeGreaterThan(now);
    });
  });

  // ── invoice.payment_failed ─────────────────────────────────────

  describe("invoice.payment_failed", () => {
    it("marks subscription as past_due", () => {
      // Create subscription
      const checkoutBody = makeEvent("checkout.session.completed", {
        subscription: "sub_failed_test",
        customer: "cus_failed",
        customer_email: "failed@example.com",
        metadata: {},
      });
      processWebhookEvent(checkoutBody, signPayload(checkoutBody));

      // Fail payment
      const failBody = makeEvent("invoice.payment_failed", {
        subscription: "sub_failed_test",
      });
      processWebhookEvent(failBody, signPayload(failBody));

      const sub = getSubscriptionById("sub_failed_test");
      expect(sub!.status).toBe("past_due");
    });
  });

  // ── Unhandled event types ──────────────────────────────────────

  describe("unhandled events", () => {
    it("records but does not process unhandled event types", () => {
      const eventId = `evt_unhandled_${Date.now()}`;
      const body = makeEvent("charge.succeeded", { id: "ch_123" }, eventId);
      const sig = signPayload(body);

      const result = processWebhookEvent(body, sig);
      expect(result.handled).toBe(true);
      expect(result.eventType).toBe("charge.succeeded");

      // Event should still be recorded in audit trail
      expect(hasEvent(eventId)).toBe(true);
    });
  });

  // ── Trusted mode (relay-forwarded webhooks) ─────────────────────

  describe("trusted mode", () => {
    it("skips signature verification when trusted", () => {
      const body = makeEvent("checkout.session.completed", {
        subscription: "sub_trusted_test",
        customer: "cus_trusted",
        customer_email: "trusted@example.com",
        metadata: {},
      });

      // No valid signature — would fail without trusted mode
      const result = processWebhookEvent(body, "invalid-signature", { trusted: true });
      expect(result.handled).toBe(true);
      expect(result.eventType).toBe("checkout.session.completed");

      // Verify the event was actually processed (subscription created)
      const sub = getSubscriptionById("sub_trusted_test");
      expect(sub).not.toBeNull();
      expect(sub!.customer_id).toBe("cus_trusted");
      expect(sub!.tier).toBe("pro");
    });

    it("still verifies signature when not trusted", () => {
      const body = makeEvent("invoice.paid", { subscription: "sub_verify" });
      const result = processWebhookEvent(body, "invalid-signature");
      expect(result.handled).toBe(false);
      expect(result.error).toContain("Invalid signature");
    });

    it("still verifies signature when trusted is false", () => {
      const body = makeEvent("invoice.paid", { subscription: "sub_verify2" });
      const result = processWebhookEvent(body, "invalid-signature", { trusted: false });
      expect(result.handled).toBe(false);
      expect(result.error).toContain("Invalid signature");
    });

    it("processes trusted event with empty signature header", () => {
      const body = makeEvent("customer.subscription.updated", {
        id: "sub_trusted_update",
        customer: "cus_trusted2",
        status: "active",
        metadata: { tier: "pro" },
      });

      const result = processWebhookEvent(body, "", { trusted: true });
      expect(result.handled).toBe(true);
    });

    it("rejects invalid JSON even in trusted mode", () => {
      const result = processWebhookEvent("not valid json", "", { trusted: true });
      expect(result.handled).toBe(false);
      expect(result.error).toContain("Invalid JSON");
    });

    it("preserves idempotency in trusted mode", () => {
      const eventId = `evt_trusted_idem_${Date.now()}`;
      const body = makeEvent("invoice.paid", { subscription: "sub_idem_trusted" }, eventId);

      const first = processWebhookEvent(body, "", { trusted: true });
      expect(first.handled).toBe(true);

      const second = processWebhookEvent(body, "", { trusted: true });
      expect(second.handled).toBe(true);
      expect(second.eventId).toBe(eventId);

      // Only one event recorded
      const events = getRecentEvents(100);
      const matching = events.filter((e) => e.id === eventId);
      expect(matching.length).toBe(1);
    });
  });

  // ── Invalid payloads ───────────────────────────────────────────

  describe("invalid payloads", () => {
    it("handles checkout without subscription ID gracefully", () => {
      const body = makeEvent("checkout.session.completed", {
        customer: "cus_no_sub",
        customer_email: "nosub@example.com",
        metadata: {},
        // No subscription field
      });
      const sig = signPayload(body);

      const result = processWebhookEvent(body, sig);
      // Should still handle (event recorded) but not create subscription
      expect(result.handled).toBe(true);
    });
  });
});
