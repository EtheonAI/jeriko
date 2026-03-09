import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms and Conditions | Jeriko",
  description: "Jeriko terms and conditions of use — a product of Etheon, Inc.",
};

export default function TermsAndConditions() {
  return (
    <main className="page legal">
      <a href="/" className="back">&larr; Back</a>
      <h1>Terms and Conditions</h1>
      <p className="effective">Published: September 19, 2025 | Effective: September 19, 2025</p>

      <section>
        <p>
          Thank you for using Jeriko! These Terms and Conditions (&ldquo;Terms&rdquo;) form a legally
          binding agreement between you and <strong>Etheon, Inc.</strong>, a Delaware corporation with
          its principal office at 524 Market Street, San Francisco, CA 94105, and{" "}
          <strong>Etheon AI LTD</strong>, a United Kingdom limited company with its principal office at
          3rd Floor Suite, 207 Regent Street, London, England, W1B 3HH (&ldquo;Etheon,&rdquo;
          &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;). They govern your access to and
          use of Jeriko, including the CLI toolkit, daemon, APIs, relay services, website, and any
          other services we make available (collectively, the &ldquo;Services&rdquo;).
        </p>
        <p>
          By using the Services, you agree to these Terms. If you are using the Services on behalf of
          an organization, you represent and warrant that you have authority to bind that organization
          and that it accepts these Terms.
        </p>
      </section>

      <section>
        <h2>1. Who We Are</h2>
        <p>
          Jeriko is a product of Etheon, a real-time AI development and research firm incorporated in
          Delaware and operating from San Francisco. Etheon&apos;s mission is to enable self-adapting,
          self-healing, and self-training AI systems and to advance real-time artificial intelligence
          research for the benefit of society.
        </p>
      </section>

      <section>
        <h2>2. Description of Service</h2>
        <p>
          Jeriko is a locally-installed, Unix-first CLI toolkit and daemon that enables AI agents to
          interact with your operating system, third-party services, and development tools. Jeriko is
          distributed as a compiled standalone binary and runs entirely on your local machine. Your
          data, credentials, sessions, and configurations never leave your device unless you explicitly
          connect to a third-party service.
        </p>
      </section>

      <section>
        <h2>3. Registration and Access</h2>
        <h3>Minimum Age</h3>
        <p>
          You must be at least 13 years old (or the age of digital consent in your jurisdiction) to
          use the Services. If you are under 18, you must have parent or legal guardian permission.
        </p>
        <h3>Account Accuracy</h3>
        <p>
          Provide accurate and complete information when registering and keep it up to date. You are
          responsible for all activity under your account.
        </p>
        <h3>Organizational Accounts</h3>
        <p>
          If you register using a corporate email address, Etheon may transfer your account to your
          organization&apos;s control after providing notice.
        </p>
      </section>

      <section>
        <h2>4. Using Our Services</h2>
        <h3>Permitted Use</h3>
        <p>
          Subject to these Terms, Etheon grants you a limited, non-exclusive, non-transferable license
          to access and use the Services for lawful purposes.
        </p>
        <h3>Prohibited Use</h3>
        <p>You will not, and will not allow others to:</p>
        <ul>
          <li>Use the Services in violation of law or to infringe others&apos; rights</li>
          <li>Copy, sell, sublicense, or distribute the Services</li>
          <li>Reverse-engineer, decompile, or attempt to extract source code or underlying models except where prohibited from restriction by law</li>
          <li>Circumvent security or rate limits</li>
          <li>Misrepresent AI-generated output as human-generated when material to a decision</li>
          <li>Use output to build or train models that compete with Etheon</li>
        </ul>
        <h3>Third-Party Services</h3>
        <p>
          Some features may rely on third-party services or output. Their use is subject to their own
          terms, and Etheon is not responsible for them.
        </p>
      </section>

      <section>
        <h2>5. Content</h2>
        <h3>Your Content</h3>
        <p>
          &ldquo;Input&rdquo; means content you provide; &ldquo;Output&rdquo; means the AI-generated
          results returned. Together, they are &ldquo;Content.&rdquo; You are responsible for your
          Input and for evaluating the accuracy and appropriateness of Output.
        </p>
        <h3>Ownership</h3>
        <p>
          You retain ownership of your Input and, subject to applicable law, you own the Output.
          Etheon assigns to you any rights it may have in the Output, excluding any third-party content.
        </p>
        <h3>Etheon&apos;s Use of Content</h3>
        <p>
          We may use Content to operate, maintain, and improve our Services and to comply with law.
          You can request that your Content be excluded from model-training by contacting us.
        </p>
        <h3>Accuracy Notice</h3>
        <p>
          Output may be probabilistic, incomplete, or inaccurate. Do not rely on it as a sole source
          of truth or for making legally or materially significant decisions without independent
          verification.
        </p>
      </section>

      <section>
        <h2>6. Security and Data Protection</h2>
        <p>
          Jeriko is distributed as a compiled standalone binary. The binary cannot be opened, inspected,
          or decompiled on your local machine, making Jeriko more secure than cloud-based or
          interpreted alternatives. All data, credentials, configuration, and session history remain
          entirely on your device. We do not collect, transmit, or store your data on our servers.
          We do not share your data with any third party. Your use of the Services is also governed
          by our <a href="/privacy-policy">Privacy Policy</a>.
        </p>
      </section>

      <section>
        <h2>7. Intellectual Property</h2>
        <p>
          All rights, title, and interest in and to the Services&mdash;including software, models,
          algorithms, and trademarks&mdash;remain the exclusive property of Etheon and its licensors.
          You may not use Etheon&apos;s or Jeriko&apos;s name or logo except as permitted by our
          published brand guidelines.
        </p>
      </section>

      <section>
        <h2>8. Paid Accounts</h2>
        <h3>Billing</h3>
        <p>
          If you purchase paid Services, you agree to provide valid billing information and pay all
          applicable fees and taxes. Payments are processed securely through Stripe.
        </p>
        <h3>Renewals and Changes</h3>
        <p>
          Subscriptions renew automatically unless cancelled. We may change prices with at least 30
          days&apos; notice; increases apply at your next renewal.
        </p>
        <h3>Cancellation</h3>
        <p>
          You may cancel at any time. Upon cancellation, your subscription remains active until the
          end of the current billing period. Payments are non-refundable except where required by law
          or as described in our <a href="/refund-policy">Refund Policy</a>.
        </p>
      </section>

      <section>
        <h2>9. Termination and Suspension</h2>
        <p>
          You may stop using the Services at any time. We may suspend or terminate your account if:
        </p>
        <ul>
          <li>You breach these Terms or our <a href="/acceptable-use">Acceptable Use Policy</a></li>
          <li>Required by law</li>
          <li>Your use could harm Etheon, other users, or the public</li>
        </ul>
        <p>
          We may also close inactive free accounts after 12 months with notice.
        </p>
      </section>

      <section>
        <h2>10. Discontinuation</h2>
        <p>
          We may discontinue Services with reasonable advance notice and refund any prepaid unused fees.
        </p>
      </section>

      <section>
        <h2>11. Disclaimer of Warranties</h2>
        <p>
          THE SERVICES ARE PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE.&rdquo; TO THE MAXIMUM
          EXTENT PERMITTED BY LAW, ETHEON AND ITS AFFILIATES DISCLAIM ALL WARRANTIES, EXPRESS OR
          IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, AND
          THAT THE SERVICES WILL BE ERROR-FREE OR UNINTERRUPTED.
        </p>
      </section>

      <section>
        <h2>12. Limitation of Liability</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, ETHEON, ITS AFFILIATES, SUPPLIERS, AND LICENSORS
          SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR EXEMPLARY
          DAMAGES, OR FOR LOSS OF PROFITS, REVENUE, DATA, OR GOODWILL.
        </p>
        <p>
          ETHEON&apos;S AGGREGATE LIABILITY FOR ANY CLAIM WILL NOT EXCEED THE GREATER OF: (A) THE
          AMOUNTS YOU PAID FOR THE SERVICE IN THE 12 MONTHS PRECEDING THE CLAIM OR (B) $100.
        </p>
      </section>

      <section>
        <h2>13. Indemnification</h2>
        <p>
          If you are a business or organization, you will indemnify and hold harmless Etheon, its
          affiliates, and personnel from any third-party claims and costs (including reasonable
          attorneys&apos; fees) arising out of your use of the Services or your breach of these Terms.
        </p>
      </section>

      <section>
        <h2>14. Dispute Resolution</h2>
        <h3>Informal Resolution</h3>
        <p>
          Before starting arbitration or litigation, you agree to attempt to resolve disputes with
          Etheon informally by contacting{" "}
          <a href="mailto:legal@etheon.ai">legal@etheon.ai</a> and allowing 60 days for response.
        </p>
        <h3>Arbitration &amp; Class Action Waiver</h3>
        <p>
          Any dispute arising out of these Terms or the Services will be resolved by binding
          arbitration under the Federal Arbitration Act, administered by National Arbitration and
          Mediation (NAM) or a comparable forum. You and Etheon waive any right to a jury trial or
          to participate in class or representative actions. Only individual relief is available.
        </p>
        <h3>Governing Law and Venue</h3>
        <p>
          These Terms are governed by the laws of the State of California, excluding its
          conflicts-of-law rules. Any court proceedings permitted (e.g., to enforce arbitration
          awards) shall be in the state or federal courts located in San Francisco, California.
        </p>
      </section>

      <section>
        <h2>15. Copyright Complaints</h2>
        <p>
          If you believe your intellectual property rights are infringed, send notice to:
        </p>
        <p>
          Etheon, Inc.<br />
          Attn: General Counsel / Copyright Agent<br />
          524 Market Street<br />
          San Francisco, CA 94105<br />
          Email: <a href="mailto:legal@etheon.ai">legal@etheon.ai</a>
        </p>
        <p>Your notice must include:</p>
        <ul>
          <li>Your physical or electronic signature</li>
          <li>Identification of the copyrighted work</li>
          <li>Identification of the infringing material and its location</li>
          <li>Your contact information</li>
          <li>A statement of good-faith belief that use is unauthorized</li>
          <li>A statement, under penalty of perjury, that the notice is accurate and you are the owner or authorized agent</li>
        </ul>
      </section>

      <section>
        <h2>16. General Terms</h2>
        <h3>Assignment</h3>
        <p>
          You may not assign rights or obligations under these Terms without Etheon&apos;s prior
          written consent. Etheon may assign them to affiliates or a successor.
        </p>
        <h3>Changes</h3>
        <p>
          We may update these Terms or the Services for legal, security, or operational reasons. For
          material changes, we will give at least 30 days&apos; notice via email or in-product notice.
          Your continued use after changes means you accept the updated Terms.
        </p>
        <h3>Trade Controls</h3>
        <p>
          You must comply with all applicable export control and sanctions laws.
        </p>
        <h3>Entire Agreement</h3>
        <p>
          These Terms are the entire agreement between you and Etheon regarding the Services and
          supersede any prior agreements.
        </p>
        <h3>Severability</h3>
        <p>
          If any provision is unenforceable, the remainder remains in effect.
        </p>
      </section>

      <section>
        <h2>17. Contact</h2>
        <p>
          For questions about these Terms, contact us
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
