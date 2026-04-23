// Tests for the zod-backed Stripe event parser. Verifies that malformed
// payloads throw a typed error rather than coercing silently.

import { describe, it, expect } from "bun:test";
import {
  parseEventEnvelope,
  parseCheckoutSession,
  parseSubscription,
  parseInvoice,
  StripeEventParseError,
} from "../../../src/daemon/billing/stripe-events.js";

describe("stripe-events", () => {
  describe("parseEventEnvelope", () => {
    it("accepts a minimal valid envelope", () => {
      const event = parseEventEnvelope({
        id: "evt_123",
        type: "checkout.session.completed",
        data: { object: { id: "cs_1" } },
      });
      expect(event.id).toBe("evt_123");
      expect(event.type).toBe("checkout.session.completed");
    });

    it("rejects a missing id", () => {
      expect(() =>
        parseEventEnvelope({ type: "x", data: { object: {} } }),
      ).toThrow(StripeEventParseError);
    });

    it("rejects a missing type", () => {
      expect(() =>
        parseEventEnvelope({ id: "e1", data: { object: {} } }),
      ).toThrow(StripeEventParseError);
    });

    it("rejects a non-object data.object", () => {
      expect(() =>
        parseEventEnvelope({ id: "e1", type: "x", data: { object: "nope" } }),
      ).toThrow(StripeEventParseError);
    });
  });

  describe("parseCheckoutSession", () => {
    it("extracts email from customer_email", () => {
      const s = parseCheckoutSession("checkout.session.completed", {
        id: "cs_1",
        subscription: "sub_1",
        customer: "cus_1",
        customer_email: "user@example.com",
      });
      expect(s.customer_email).toBe("user@example.com");
    });

    it("extracts email from customer_details fallback", () => {
      const s = parseCheckoutSession("checkout.session.completed", {
        id: "cs_1",
        customer_details: { email: "buyer@example.com" },
      });
      expect(s.customer_details?.email).toBe("buyer@example.com");
    });

    it("rejects a non-string subscription id", () => {
      // The kind of silent coercion the old `as string | undefined` cast missed.
      expect(() =>
        parseCheckoutSession("checkout.session.completed", {
          subscription: 12345,
          customer: "cus_1",
        }),
      ).toThrow(StripeEventParseError);
    });

    it("rejects a non-record metadata", () => {
      expect(() =>
        parseCheckoutSession("checkout.session.completed", {
          metadata: "bogus",
        }),
      ).toThrow(StripeEventParseError);
    });

    it("accepts nullish metadata", () => {
      const s = parseCheckoutSession("checkout.session.completed", {
        id: "cs_1",
        metadata: null,
      });
      expect(s.metadata).toBeNull();
    });
  });

  describe("parseSubscription", () => {
    it("requires id and customer", () => {
      expect(() => parseSubscription("x", { id: "sub_1" })).toThrow(StripeEventParseError);
      expect(() => parseSubscription("x", { customer: "cus_1" })).toThrow(StripeEventParseError);
    });

    it("status is optional (deleted events skip it)", () => {
      const sub = parseSubscription("customer.subscription.deleted", {
        id: "sub_1",
        customer: "cus_1",
      });
      expect(sub.status).toBeUndefined();
      expect(sub.cancel_at_period_end).toBe(false); // default
    });

    it("parses a full subscription.updated payload", () => {
      const sub = parseSubscription("customer.subscription.updated", {
        id: "sub_1",
        customer: "cus_1",
        status: "active",
        cancel_at_period_end: true,
        current_period_start: 1700000000,
        current_period_end: 1702592000,
        metadata: { tier: "pro" },
      });
      expect(sub.status).toBe("active");
      expect(sub.cancel_at_period_end).toBe(true);
      expect(sub.current_period_start).toBe(1700000000);
      expect(sub.metadata?.tier).toBe("pro");
    });

    it("rejects non-numeric period timestamps", () => {
      expect(() =>
        parseSubscription("customer.subscription.updated", {
          id: "sub_1",
          customer: "cus_1",
          current_period_start: "not-a-number",
        }),
      ).toThrow(StripeEventParseError);
    });
  });

  describe("parseInvoice", () => {
    it("accepts a minimal invoice", () => {
      const inv = parseInvoice("invoice.paid", {
        id: "in_1",
        subscription: "sub_1",
      });
      expect(inv.subscription).toBe("sub_1");
    });

    it("rejects a non-url hosted_invoice_url", () => {
      expect(() =>
        parseInvoice("invoice.payment_action_required", {
          hosted_invoice_url: "not a url",
        }),
      ).toThrow(StripeEventParseError);
    });

    it("accepts a missing subscription (unattached invoices)", () => {
      const inv = parseInvoice("invoice.paid", { id: "in_2" });
      expect(inv.subscription).toBeUndefined();
    });
  });

  describe("StripeEventParseError", () => {
    it("includes event type and human-readable issues", () => {
      try {
        parseSubscription("customer.subscription.deleted", {});
        throw new Error("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(StripeEventParseError);
        if (err instanceof StripeEventParseError) {
          expect(err.eventType).toBe("customer.subscription.deleted");
          expect(err.message).toContain("customer.subscription.deleted");
          expect(err.issues.length).toBeGreaterThan(0);
        }
      }
    });
  });
});
