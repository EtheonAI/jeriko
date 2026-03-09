import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Jeriko",
  description: "Jeriko privacy policy — how we handle your data. A product of Etheon, Inc.",
};

export default function PrivacyPolicy() {
  return (
    <main className="page legal">
      <a href="/" className="back">&larr; Back</a>
      <h1>Privacy Policy</h1>
      <p className="effective">Published: September 19, 2025 | Effective: September 19, 2025</p>

      <section>
        <p>
          This Privacy Policy explains how <strong>Etheon, Inc.</strong>, a Delaware corporation with
          its principal office at 524 Market Street, San Francisco, CA 94105, and{" "}
          <strong>Etheon AI LTD</strong>, a United Kingdom limited company with its principal office at
          3rd Floor Suite, 207 Regent Street, London, England, W1B 3HH (&ldquo;Etheon,&rdquo;
          &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) handles information in connection
          with Jeriko and our related services (collectively, the &ldquo;Services&rdquo;).
        </p>
        <p>
          By using the Services, you agree to this Privacy Policy. If you do not agree, do not use
          the Services.
        </p>
      </section>

      <section>
        <h2>1. Our Privacy Commitment</h2>
        <p>
          Jeriko is built with privacy at its core. Unlike cloud-based AI tools that process your data
          on remote servers, Jeriko runs entirely on your local machine as a compiled standalone binary.
          We fundamentally do not collect your data, and we do not share your data with anyone.
        </p>
        <p>
          Your conversations, commands, credentials, session history, configurations, and all other
          data generated through your use of Jeriko remain exclusively on your device. We have no
          access to it and no ability to retrieve it.
        </p>
      </section>

      <section>
        <h2>2. Information We Do Not Collect</h2>
        <p>To be clear, Jeriko does <strong>not</strong> collect:</p>
        <ul>
          <li>Your conversations with AI models</li>
          <li>Your commands, prompts, or outputs</li>
          <li>Your API keys, OAuth tokens, or credentials</li>
          <li>Your files, documents, or code</li>
          <li>Your usage patterns or telemetry</li>
          <li>Your system information or device identifiers</li>
          <li>Any personal data processed through the software</li>
        </ul>
      </section>

      <section>
        <h2>3. Data Stored Locally on Your Device</h2>
        <h3>3.1 Configuration and Credentials</h3>
        <p>
          Jeriko stores configuration in <code>~/.config/jeriko/</code> and data in{" "}
          <code>~/.jeriko/</code> on your local machine. API keys and OAuth tokens are stored locally
          with restricted file permissions (<code>0600</code>). These credentials are sent only to
          the respective third-party APIs you have explicitly configured and authorized.
        </p>
        <h3>3.2 Session Data</h3>
        <p>
          All session history, conversation logs, memory files, and agent data are stored in a local
          SQLite database on your device. This data never leaves your machine.
        </p>
        <h3>3.3 Binary Security</h3>
        <p>
          Jeriko is distributed as a compiled standalone binary. The binary cannot be opened, inspected,
          or decompiled on your local machine. No third party&mdash;including Etheon&mdash;can remotely
          access data processed by Jeriko on your device. This makes Jeriko more secure than any
          cloud-based or interpreted AI tool.
        </p>
      </section>

      <section>
        <h2>4. Information We May Collect</h2>
        <h3>4.1 Account Information</h3>
        <p>
          If you create an account for a paid subscription, we collect your email address and billing
          information. Billing is processed securely through Stripe; we do not store your full payment
          card details.
        </p>
        <h3>4.2 Website Analytics</h3>
        <p>
          When you visit jeriko.ai, we may collect basic analytics data (page views, referral source)
          using Google Analytics. This data is anonymized and used solely to improve our website.
        </p>
        <h3>4.3 Communications</h3>
        <p>
          If you contact us at <a href="mailto:info@etheon.ai">info@etheon.ai</a>, we retain the
          content of your communication to respond to your inquiry.
        </p>
      </section>

      <section>
        <h2>5. How We Use Information</h2>
        <p>The limited information we may collect is used only to:</p>
        <ul>
          <li>Process billing and manage your subscription</li>
          <li>Respond to support inquiries</li>
          <li>Send essential product updates (e.g., security patches)</li>
          <li>Improve our website and documentation</li>
          <li>Comply with legal obligations</li>
        </ul>
      </section>

      <section>
        <h2>6. Data Sharing</h2>
        <p>
          <strong>We do not sell, rent, trade, or share your personal information with third parties.</strong>
        </p>
        <p>The only exceptions are:</p>
        <ul>
          <li>
            <strong>Payment processing:</strong> Stripe processes payments on our behalf under their
            own privacy policy
          </li>
          <li>
            <strong>Legal requirements:</strong> We may disclose information if required by law, court
            order, or governmental authority
          </li>
          <li>
            <strong>Your explicit connections:</strong> When you use Jeriko to connect to third-party
            services (Gmail, GitHub, Stripe, etc.), your credentials are sent directly from your
            device to those services&mdash;not through our servers
          </li>
        </ul>
      </section>

      <section>
        <h2>7. Third-Party AI Providers</h2>
        <p>
          When you use Jeriko&apos;s AI features, your prompts are sent directly from your device to
          the AI provider you have selected (Anthropic, OpenAI, or a local model). Etheon does not
          intercept, store, or process these communications. Each AI provider has its own privacy
          policy governing how they handle your data.
        </p>
      </section>

      <section>
        <h2>8. Data Security</h2>
        <p>
          Jeriko employs multiple layers of security to protect your data:
        </p>
        <ul>
          <li>Compiled binary distribution&mdash;source code cannot be extracted or inspected</li>
          <li>All sensitive credentials stored with <code>0600</code> file permissions</li>
          <li>Sensitive environment variables automatically redacted from logs and output</li>
          <li>Network communication with third-party APIs uses TLS encryption</li>
          <li>Timing-safe authentication across all security-critical operations</li>
          <li>No central server that stores or has access to your data</li>
        </ul>
      </section>

      <section>
        <h2>9. Data Retention</h2>
        <p>
          All operational data is stored locally on your machine. You can delete it at any time by
          removing the Jeriko configuration and data directories (<code>~/.config/jeriko/</code>{" "}
          and <code>~/.jeriko/</code>), or by uninstalling Jeriko entirely. We do not retain copies
          of your data on our infrastructure.
        </p>
        <p>
          Account and billing information is retained for the duration of your subscription and for
          the period required by applicable tax and accounting laws.
        </p>
      </section>

      <section>
        <h2>10. Your Rights</h2>
        <p>You have full control over your data:</p>
        <ul>
          <li>Disconnect any connected service at any time</li>
          <li>Revoke OAuth tokens and delete API keys</li>
          <li>Delete all local data by removing Jeriko&apos;s directories</li>
          <li>Uninstall Jeriko completely</li>
          <li>Request deletion of your account and billing information</li>
          <li>Request a copy of any personal information we hold about you</li>
        </ul>
        <p>
          If you are in the European Economic Area, the United Kingdom, or another jurisdiction with
          data protection laws, you may have additional rights including the right to access, correct,
          delete, or port your data. Contact us at{" "}
          <a href="mailto:info@etheon.ai">info@etheon.ai</a> to exercise these rights.
        </p>
      </section>

      <section>
        <h2>11. International Data Transfers</h2>
        <p>
          Etheon is headquartered in the United States with operations in the United Kingdom. If you
          provide us with account information from outside these jurisdictions, that information may be
          transferred to and processed in the United States or United Kingdom. We ensure appropriate
          safeguards are in place as required by applicable data protection laws.
        </p>
      </section>

      <section>
        <h2>12. Children&apos;s Privacy</h2>
        <p>
          The Services are not directed at children under 13 (or the age of digital consent in your
          jurisdiction). We do not knowingly collect personal information from children. If you believe
          a child has provided us with personal information, contact us and we will promptly delete it.
        </p>
      </section>

      <section>
        <h2>13. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. For material changes, we will give at
          least 30 days&apos; notice via email or in-product notice. Changes will be posted on this
          page with an updated effective date. Your continued use of the Services after changes means
          you accept the updated policy.
        </p>
      </section>

      <section>
        <h2>14. Contact</h2>
        <p>
          If you have questions about this Privacy Policy or how we handle your data, contact us
          at <a href="mailto:info@etheon.ai">info@etheon.ai</a>.
        </p>
        <p>
          For legal matters: <a href="mailto:legal@etheon.ai">legal@etheon.ai</a>
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
