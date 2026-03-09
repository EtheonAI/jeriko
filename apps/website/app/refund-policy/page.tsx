import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Refund Policy | Jeriko",
  description: "Jeriko refund and cancellation policy for paid subscriptions. A product of Etheon, Inc.",
};

export default function RefundPolicy() {
  return (
    <main className="page legal">
      <a href="/" className="back">&larr; Back</a>
      <h1>Refund Policy</h1>
      <p className="effective">Published: September 19, 2025 | Effective: September 19, 2025</p>

      <section>
        <p>
          This Refund Policy applies to paid subscription plans for Jeriko, a product of{" "}
          <strong>Etheon, Inc.</strong>, a Delaware corporation with its principal office at 524 Market
          Street, San Francisco, CA 94105, and <strong>Etheon AI LTD</strong>, a United Kingdom limited
          company with its principal office at 3rd Floor Suite, 207 Regent Street, London, England,
          W1B 3HH (&ldquo;Etheon,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;).
        </p>
      </section>

      <section>
        <h2>1. Free Tier</h2>
        <p>
          Jeriko offers a free tier at no cost. No payment information is required for the free tier,
          and no refund applies.
        </p>
      </section>

      <section>
        <h2>2. Subscription Billing</h2>
        <p>
          Paid subscriptions are billed on a recurring basis (monthly or annually, depending on the
          plan selected). Payments are processed securely through Stripe. By subscribing, you agree
          to provide valid billing information and pay all applicable fees and taxes.
        </p>
        <p>
          Subscriptions renew automatically unless cancelled before the end of the current billing
          period. We may change subscription prices with at least 30 days&apos; notice; price
          increases take effect at your next renewal.
        </p>
      </section>

      <section>
        <h2>3. Cancellation</h2>
        <p>
          You may cancel your subscription at any time. Upon cancellation:
        </p>
        <ul>
          <li>Your subscription remains active until the end of the current billing period</li>
          <li>You will not be charged for subsequent billing periods</li>
          <li>You retain access to paid features until the current period expires</li>
          <li>Your account reverts to the free tier after the paid period ends</li>
          <li>Your data remains on your local machine and is not affected by cancellation</li>
        </ul>
      </section>

      <section>
        <h2>4. Refund Eligibility</h2>
        <h3>Within 7 Days of Initial Purchase</h3>
        <p>
          If you are unsatisfied with Jeriko, you may request a full refund within 7 days of your
          first subscription payment. This applies only to your initial purchase, not to renewal
          charges.
        </p>
        <h3>After 7 Days</h3>
        <p>
          Payments are generally non-refundable after the 7-day window, except where required by
          applicable law. Exceptions may be made at our discretion for circumstances such as:
        </p>
        <ul>
          <li>Extended service outages caused by Etheon</li>
          <li>Duplicate or erroneous charges</li>
          <li>Billing errors on our part</li>
        </ul>
      </section>

      <section>
        <h2>5. Plan Changes</h2>
        <p>
          If you upgrade your plan mid-cycle, you are charged the prorated difference for the
          remainder of the billing period. If you downgrade, the new rate takes effect at the start
          of your next billing period. No partial refunds are issued for mid-cycle downgrades.
        </p>
      </section>

      <section>
        <h2>6. Discontinuation of Services</h2>
        <p>
          If Etheon discontinues the Services, we will provide reasonable advance notice and refund
          any prepaid unused fees on a prorated basis.
        </p>
      </section>

      <section>
        <h2>7. How to Request a Refund</h2>
        <p>
          To request a refund, contact us at{" "}
          <a href="mailto:info@etheon.ai">info@etheon.ai</a> with:
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
        <h2>8. Chargebacks</h2>
        <p>
          If you believe a charge is unauthorized, please contact us at{" "}
          <a href="mailto:info@etheon.ai">info@etheon.ai</a> before initiating a chargeback with
          your bank. We are happy to resolve billing disputes directly and promptly.
        </p>
      </section>

      <section>
        <h2>9. Changes to This Policy</h2>
        <p>
          We may update this Refund Policy from time to time. For material changes, we will give at
          least 30 days&apos; notice. Changes will be posted on this page with an updated effective
          date. Existing subscriptions are honored under the policy in effect at the time of purchase.
        </p>
      </section>

      <section>
        <h2>10. Contact</h2>
        <p>
          For billing questions or refund requests, contact us
          at <a href="mailto:info@etheon.ai">info@etheon.ai</a>.
        </p>
        <p>
          Etheon, Inc.<br />
          524 Market Street<br />
          San Francisco, CA 94105
        </p>
      </section>
    </main>
  );
}
