import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Acceptable Use Policy | Jeriko",
  description: "Jeriko acceptable use policy — guidelines for responsible use of our software and services.",
};

export default function AcceptableUsePolicy() {
  return (
    <main className="page legal">
      <a href="/" className="back">&larr; Back</a>
      <h1>Acceptable Use Policy</h1>
      <p className="effective">Effective date: March 1, 2026</p>

      <section>
        <h2>1. Purpose</h2>
        <p>
          This Acceptable Use Policy (&ldquo;AUP&rdquo;) defines the rules and guidelines for using
          Jeriko and its associated services. By using Jeriko, you agree to comply with this policy.
        </p>
      </section>

      <section>
        <h2>2. Permitted Use</h2>
        <p>Jeriko is designed for legitimate personal and professional use, including:</p>
        <ul>
          <li>Automating workflows and tasks on your own systems</li>
          <li>Interacting with third-party services you are authorized to access</li>
          <li>Software development, system administration, and productivity</li>
          <li>Research and education</li>
        </ul>
      </section>

      <section>
        <h2>3. Prohibited Activities</h2>
        <p>You must not use Jeriko to:</p>
        <ul>
          <li>Access, modify, or damage systems or data you are not authorized to use</li>
          <li>Generate, distribute, or store malicious software, spam, or phishing content</li>
          <li>Harass, threaten, impersonate, or harm any individual or organization</li>
          <li>Violate any applicable law, regulation, or third-party rights</li>
          <li>Circumvent rate limits, access controls, or security measures of any service</li>
          <li>Generate content that exploits or harms minors</li>
          <li>Conduct automated attacks, credential stuffing, or denial-of-service activities</li>
          <li>Redistribute, resell, or sublicense Jeriko access in violation of your plan terms</li>
        </ul>
      </section>

      <section>
        <h2>4. AI Usage Guidelines</h2>
        <p>When using Jeriko&apos;s AI-powered features:</p>
        <ul>
          <li>You are responsible for reviewing and validating all AI-generated output before acting on it</li>
          <li>Do not use AI features to generate harmful, deceptive, or illegal content</li>
          <li>Do not attempt to bypass AI safety measures or content filters</li>
          <li>Respect the usage policies of the underlying AI providers (Anthropic, OpenAI, etc.)</li>
        </ul>
      </section>

      <section>
        <h2>5. Third-Party Services</h2>
        <p>
          When using Jeriko to interact with third-party services (Stripe, GitHub, Gmail, etc.),
          you must comply with each service&apos;s terms of use and acceptable use policies. Jeriko
          is not responsible for actions taken on third-party platforms through our tool.
        </p>
      </section>

      <section>
        <h2>6. Resource Usage</h2>
        <p>
          Use Jeriko&apos;s services in a manner consistent with your subscription plan. Do not
          attempt to abuse free tiers, exploit promotional offers, or consume resources in excess
          of reasonable use patterns.
        </p>
      </section>

      <section>
        <h2>7. Enforcement</h2>
        <p>
          We reserve the right to investigate and take action against violations of this policy,
          including but not limited to:
        </p>
        <ul>
          <li>Issuing a warning</li>
          <li>Temporarily or permanently suspending your account</li>
          <li>Revoking access to paid features without refund</li>
          <li>Reporting illegal activity to the appropriate authorities</li>
        </ul>
      </section>

      <section>
        <h2>8. Reporting Violations</h2>
        <p>
          If you become aware of any violation of this policy, please report it
          to <a href="mailto:abuse@jeriko.ai">abuse@jeriko.ai</a>.
        </p>
      </section>

      <section>
        <h2>9. Changes to This Policy</h2>
        <p>
          We may update this Acceptable Use Policy from time to time. Changes will be posted on
          this page with an updated effective date.
        </p>
      </section>

      <section>
        <h2>10. Contact</h2>
        <p>
          If you have questions about this policy, contact us
          at <a href="mailto:legal@jeriko.ai">legal@jeriko.ai</a>.
        </p>
      </section>
    </main>
  );
}
