import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms and Conditions | Jeriko",
  description: "Jeriko terms and conditions of use.",
};

export default function TermsAndConditions() {
  return (
    <main className="page legal">
      <a href="/" className="back">&larr; Back</a>
      <h1>Terms and Conditions</h1>
      <p className="effective">Effective date: March 1, 2026</p>

      <section>
        <h2>1. Agreement to Terms</h2>
        <p>
          By accessing or using Jeriko (&ldquo;the Software&rdquo;), you agree to be bound by these
          Terms and Conditions. If you do not agree, do not use the Software.
        </p>
      </section>

      <section>
        <h2>2. Description of Service</h2>
        <p>
          Jeriko is a locally-installed CLI toolkit and daemon that enables AI agents to interact with
          your operating system, third-party services, and development tools. The Software runs on your
          machine and communicates with external APIs based on your configuration.
        </p>
      </section>

      <section>
        <h2>3. License</h2>
        <p>
          Jeriko is provided under the terms specified in the LICENSE file included with the Software.
          You may use, modify, and distribute the Software in accordance with that license.
        </p>
      </section>

      <section>
        <h2>4. User Responsibilities</h2>
        <ul>
          <li>You are responsible for securing your API keys, tokens, and credentials</li>
          <li>You are responsible for all actions taken by the Software on your behalf</li>
          <li>You must comply with the terms of service of any third-party APIs you connect</li>
          <li>You must not use the Software for unlawful purposes</li>
          <li>You are responsible for reviewing AI-generated actions before execution in production environments</li>
        </ul>
      </section>

      <section>
        <h2>5. Third-Party Services</h2>
        <p>
          Jeriko integrates with third-party services including but not limited to Google, Stripe, GitHub,
          Twilio, OpenAI, and Anthropic. Your use of these services through Jeriko is subject to their
          respective terms of service. We are not responsible for the availability, accuracy, or conduct
          of third-party services.
        </p>
      </section>

      <section>
        <h2>6. AI-Generated Content</h2>
        <p>
          Jeriko uses AI models to generate responses, execute tasks, and automate workflows. AI-generated
          content and actions may be inaccurate or unintended. You acknowledge that you are solely
          responsible for reviewing and validating any output or action produced by the AI features.
        </p>
      </section>

      <section>
        <h2>7. Data and Privacy</h2>
        <p>
          Your use of Jeriko is also governed by our{" "}
          <a href="/privacy-policy">Privacy Policy</a>. All data is stored locally on your machine.
          We do not collect, transmit, or store your data on our servers.
        </p>
      </section>

      <section>
        <h2>8. Disclaimer of Warranties</h2>
        <p>
          THE SOFTWARE IS PROVIDED &ldquo;AS IS&rdquo; WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
          INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
          AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SOFTWARE WILL BE UNINTERRUPTED, ERROR-FREE,
          OR SECURE.
        </p>
      </section>

      <section>
        <h2>9. Limitation of Liability</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL JERIKO, ITS AUTHORS, OR CONTRIBUTORS
          BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING
          FROM YOUR USE OF THE SOFTWARE, INCLUDING BUT NOT LIMITED TO LOSS OF DATA, REVENUE, OR PROFITS.
        </p>
      </section>

      <section>
        <h2>10. Indemnification</h2>
        <p>
          You agree to indemnify and hold harmless Jeriko, its authors, and contributors from any claims,
          damages, or expenses arising from your use of the Software, your violation of these Terms, or
          your violation of any third-party rights.
        </p>
      </section>

      <section>
        <h2>11. Modifications</h2>
        <p>
          We reserve the right to modify these Terms at any time. Changes will be posted on this page
          with an updated effective date. Your continued use of the Software after changes constitutes
          acceptance of the modified Terms.
        </p>
      </section>

      <section>
        <h2>12. Governing Law</h2>
        <p>
          These Terms shall be governed by and construed in accordance with the laws of the jurisdiction
          in which the primary maintainers reside, without regard to conflict of law principles.
        </p>
      </section>

      <section>
        <h2>13. Contact</h2>
        <p>
          If you have questions about these Terms, contact us
          at <a href="mailto:legal@jeriko.ai">legal@jeriko.ai</a>.
        </p>
      </section>
    </main>
  );
}
