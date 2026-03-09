import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Acceptable Use Policy | Jeriko",
  description: "Jeriko acceptable use policy — guidelines for responsible use. A product of Etheon, Inc.",
};

export default function AcceptableUsePolicy() {
  return (
    <main className="page legal">
      <a href="/" className="back">&larr; Back</a>
      <h1>Acceptable Use Policy</h1>
      <p className="effective">Published: September 19, 2025 | Effective: September 19, 2025</p>

      <section>
        <p>
          This Acceptable Use Policy (&ldquo;AUP&rdquo;) defines the rules and guidelines for using
          Jeriko and its associated services, provided by <strong>Etheon, Inc.</strong>, a Delaware
          corporation, and <strong>Etheon AI LTD</strong>, a United Kingdom limited company
          (collectively, &ldquo;Etheon,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or
          &ldquo;our&rdquo;). By using Jeriko, you agree to comply with this policy.
        </p>
      </section>

      <section>
        <h2>1. Permitted Use</h2>
        <p>Jeriko is designed for legitimate personal and professional use, including:</p>
        <ul>
          <li>Automating workflows and tasks on your own systems</li>
          <li>Interacting with third-party services you are authorized to access</li>
          <li>Software development, system administration, and productivity</li>
          <li>Research and education</li>
          <li>AI-assisted task execution and automation</li>
        </ul>
      </section>

      <section>
        <h2>2. Prohibited Activities</h2>
        <p>You will not, and will not allow others to, use Jeriko to:</p>
        <ul>
          <li>Access, modify, or damage systems or data you are not authorized to use</li>
          <li>Generate, distribute, or store malicious software, spam, or phishing content</li>
          <li>Harass, threaten, impersonate, or harm any individual or organization</li>
          <li>Violate any applicable law, regulation, or third-party rights</li>
          <li>Circumvent rate limits, access controls, or security measures of any service</li>
          <li>Generate content that exploits or harms minors</li>
          <li>Conduct automated attacks, credential stuffing, or denial-of-service activities</li>
          <li>Redistribute, resell, or sublicense Jeriko access in violation of your plan terms</li>
          <li>Reverse-engineer, decompile, or attempt to extract source code or underlying models except where prohibited from restriction by law</li>
          <li>Misrepresent AI-generated output as human-generated when material to a decision</li>
          <li>Use output to build or train models that compete with Etheon</li>
        </ul>
      </section>

      <section>
        <h2>3. AI Usage Guidelines</h2>
        <p>When using Jeriko&apos;s AI-powered features:</p>
        <ul>
          <li>You are responsible for reviewing and validating all AI-generated output before acting on it</li>
          <li>Do not use AI features to generate harmful, deceptive, or illegal content</li>
          <li>Do not attempt to bypass AI safety measures or content filters</li>
          <li>Respect the usage policies of the underlying AI providers (Anthropic, OpenAI, etc.)</li>
          <li>AI output may be probabilistic, incomplete, or inaccurate&mdash;do not rely on it as a sole source of truth</li>
        </ul>
      </section>

      <section>
        <h2>4. Third-Party Services</h2>
        <p>
          When using Jeriko to interact with third-party services (Stripe, GitHub, Gmail, etc.),
          you must comply with each service&apos;s terms of use and acceptable use policies. Etheon
          is not responsible for actions taken on third-party platforms through Jeriko.
        </p>
      </section>

      <section>
        <h2>5. Resource Usage</h2>
        <p>
          Use Jeriko&apos;s services in a manner consistent with your subscription plan. Do not
          attempt to abuse free tiers, exploit promotional offers, or consume resources in excess
          of reasonable use patterns.
        </p>
      </section>

      <section>
        <h2>6. Security</h2>
        <p>
          Jeriko runs as a compiled binary on your local machine. You are responsible for the
          security of your device and the credentials you store within Jeriko. Do not share your
          API keys, OAuth tokens, or Jeriko configuration files with unauthorized parties.
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
          to <a href="mailto:info@etheon.ai">info@etheon.ai</a>.
        </p>
      </section>

      <section>
        <h2>9. Changes to This Policy</h2>
        <p>
          We may update this Acceptable Use Policy from time to time. For material changes, we will
          give at least 30 days&apos; notice. Changes will be posted on this page with an updated
          effective date.
        </p>
      </section>

      <section>
        <h2>10. Contact</h2>
        <p>
          If you have questions about this policy, contact us
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
