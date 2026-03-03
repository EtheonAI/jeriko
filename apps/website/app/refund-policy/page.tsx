import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Refund Policy | Jeriko",
  description: "Jeriko refund and cancellation policy for paid subscriptions.",
};

export default function RefundPolicy() {
  return (
    <main className="page legal">
      <a href="/" className="back">&larr; Back</a>
      <h1>Refund Policy</h1>
      <p className="effective">Effective date: March 1, 2026</p>

      <section>
        <h2>1. Overview</h2>
        <p>
          Jeriko offers paid subscription plans that provide access to premium features, higher usage
          limits, and priority support. This policy explains how refunds and cancellations work.
        </p>
      </section>

      <section>
        <h2>2. Free Tier</h2>
        <p>
          Jeriko offers a free tier at no cost. No payment information is required for the free tier,
          and no refund applies.
        </p>
      </section>

      <section>
        <h2>3. Subscription Cancellation</h2>
        <p>
          You may cancel your subscription at any time. Upon cancellation:
        </p>
        <ul>
          <li>Your subscription remains active until the end of the current billing period</li>
          <li>You will not be charged for subsequent billing periods</li>
          <li>You retain access to paid features until the current period expires</li>
          <li>Your account reverts to the free tier after the paid period ends</li>
        </ul>
      </section>

      <section>
        <h2>4. Refund Eligibility</h2>
        <h3>Within 7 days of initial purchase</h3>
        <p>
          If you are unsatisfied with Jeriko, you may request a full refund within 7 days of your
          first subscription payment. This applies only to your initial purchase, not to renewal charges.
        </p>
        <h3>After 7 days</h3>
        <p>
          Refunds are generally not available after the 7-day window. Exceptions may be made at our
          discretion for circumstances such as:
        </p>
        <ul>
          <li>Extended service outages caused by Jeriko</li>
          <li>Duplicate or erroneous charges</li>
          <li>Billing errors on our part</li>
        </ul>
      </section>

      <section>
        <h2>5. How to Request a Refund</h2>
        <p>
          To request a refund, contact us at{" "}
          <a href="mailto:billing@jeriko.ai">billing@jeriko.ai</a> with:
        </p>
        <ul>
          <li>Your account email address</li>
          <li>The date of the charge</li>
          <li>The reason for your refund request</li>
        </ul>
        <p>
          We aim to respond to all refund requests within 3 business days. Approved refunds are
          processed to your original payment method within 5&ndash;10 business days.
        </p>
      </section>

      <section>
        <h2>6. Plan Changes</h2>
        <p>
          If you upgrade your plan mid-cycle, you are charged the prorated difference for the
          remainder of the billing period. If you downgrade, the new rate takes effect at the start
          of your next billing period. No partial refunds are issued for mid-cycle downgrades.
        </p>
      </section>

      <section>
        <h2>7. Chargebacks</h2>
        <p>
          If you believe a charge is unauthorized, please contact us before initiating a chargeback
          with your bank. We are happy to resolve billing disputes directly and promptly.
        </p>
      </section>

      <section>
        <h2>8. Changes to This Policy</h2>
        <p>
          We may update this Refund Policy from time to time. Changes will be posted on this page
          with an updated effective date. Existing subscriptions are honored under the policy in
          effect at the time of purchase.
        </p>
      </section>

      <section>
        <h2>9. Contact</h2>
        <p>
          For billing questions or refund requests, contact us
          at <a href="mailto:billing@jeriko.ai">billing@jeriko.ai</a>.
        </p>
      </section>
    </main>
  );
}
