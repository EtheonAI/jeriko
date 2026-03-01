import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Jeriko",
  description: "Jeriko privacy policy — how we handle your data.",
};

export default function PrivacyPolicy() {
  return (
    <main className="page legal">
      <a href="/" className="back">&larr; Back</a>
      <h1>Privacy Policy</h1>
      <p className="effective">Effective date: March 1, 2026</p>

      <section>
        <h2>1. Introduction</h2>
        <p>
          Jeriko (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) is a locally-installed CLI toolkit
          and daemon for AI agents. This Privacy Policy explains how we collect, use, and protect information
          when you use our software and services.
        </p>
      </section>

      <section>
        <h2>2. Information We Collect</h2>
        <h3>2.1 Data Stored Locally</h3>
        <p>
          Jeriko runs on your machine. All configuration, credentials, session data, and logs are stored
          locally on your device (typically in <code>~/.config/jeriko/</code> and <code>~/.jeriko/</code>).
          We do not transmit this data to our servers.
        </p>
        <h3>2.2 Third-Party API Credentials</h3>
        <p>
          When you connect services (Gmail, Stripe, GitHub, etc.), your API keys and OAuth tokens are stored
          locally in an encrypted configuration file with restricted file permissions (<code>0600</code>).
          These credentials are sent only to the respective third-party APIs you have configured.
        </p>
        <h3>2.3 Website &amp; Waitlist</h3>
        <p>
          If you sign up for our waitlist or visit jeriko.ai, we may collect your email address and basic
          analytics data (page views, referral source). We use this solely to communicate product updates.
        </p>
      </section>

      <section>
        <h2>3. How We Use Information</h2>
        <ul>
          <li>To provide and maintain the Jeriko software</li>
          <li>To authenticate with third-party services you connect</li>
          <li>To send product updates if you opted into our waitlist</li>
          <li>To improve our software and documentation</li>
        </ul>
      </section>

      <section>
        <h2>4. Data Sharing</h2>
        <p>
          We do not sell, rent, or share your personal information with third parties. Your API credentials
          are only used to communicate with the services you explicitly configure. When you use AI features,
          your prompts are sent to the AI provider you have selected (Anthropic, OpenAI, or a local model).
        </p>
      </section>

      <section>
        <h2>5. Data Security</h2>
        <p>
          All sensitive credentials are stored with restricted file permissions on your local machine.
          Network communication with third-party APIs uses TLS encryption. We do not operate a central
          server that stores your data.
        </p>
      </section>

      <section>
        <h2>6. Third-Party Services</h2>
        <p>
          Jeriko integrates with third-party services (Google, Stripe, GitHub, Twilio, etc.). Each service
          has its own privacy policy. We encourage you to review their policies. Jeriko only accesses the
          data and scopes you explicitly authorize.
        </p>
      </section>

      <section>
        <h2>7. Data Retention</h2>
        <p>
          All data is stored locally on your machine. You can delete it at any time by removing the
          Jeriko configuration directories. We do not retain copies of your data on our infrastructure.
        </p>
      </section>

      <section>
        <h2>8. Your Rights</h2>
        <p>
          You have full control over your data. You can disconnect any service, revoke OAuth tokens,
          delete your local data, or uninstall Jeriko at any time. If you joined our waitlist, you can
          unsubscribe from emails at any time.
        </p>
      </section>

      <section>
        <h2>9. Children&apos;s Privacy</h2>
        <p>
          Jeriko is not directed at children under 13. We do not knowingly collect personal information
          from children.
        </p>
      </section>

      <section>
        <h2>10. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. Changes will be posted on this page with
          an updated effective date.
        </p>
      </section>

      <section>
        <h2>11. Contact</h2>
        <p>
          If you have questions about this Privacy Policy, contact us
          at <a href="mailto:privacy@jeriko.ai">privacy@jeriko.ai</a>.
        </p>
      </section>
    </main>
  );
}
