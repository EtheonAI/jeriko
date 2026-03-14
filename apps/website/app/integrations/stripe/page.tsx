"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

/**
 * Stripe Marketplace Integration Page
 *
 * This page is the "Marketplace install URL" — the landing page users see when
 * they click "Install from partner" in the Stripe App Marketplace.
 *
 * Jeriko is a CLI tool, so the OAuth flow is initiated from the CLI:
 *   1. User installs Jeriko CLI
 *   2. Runs `jeriko connect stripe`
 *   3. CLI opens the relay OAuth start URL (with proper state=userId.token)
 *   4. User authorizes on Stripe
 *   5. Relay exchanges code for tokens and delivers them to the daemon via WebSocket
 */

function StatusBanner() {
  const params = useSearchParams();
  const error = params.get("error");
  const success = params.get("success");

  if (success) {
    return (
      <div className="stripe-alert stripe-alert-success">
        Stripe connected successfully. You can now use the Stripe connector in
        Jeriko. Return to your terminal to start using it.
      </div>
    );
  }
  if (error) {
    return (
      <div className="stripe-alert stripe-alert-error">
        Connection failed: {error}. Please try again with{" "}
        <code>jeriko connect stripe</code>.
      </div>
    );
  }
  return null;
}

export default function StripeIntegrationPage() {
  return (
    <main className="page legal">
      <a href="/" className="back">&larr; Back to Jeriko</a>

      <h1>Connect Stripe to Jeriko</h1>
      <p className="effective">
        Manage your Stripe account with AI-powered natural language commands.
      </p>

      <Suspense fallback={null}>
        <StatusBanner />
      </Suspense>

      <section className="stripe-hero-card">
        <div className="stripe-logo-row">
          <img
            src="/jeriko-logo-white.png"
            alt="Jeriko"
            width={40}
            height={40}
          />
          <span className="stripe-plus">+</span>
          <svg viewBox="0 0 60 25" width={60} fill="#635BFF">
            <path d="M59.64 14.28h-8.06c.19 1.93 1.6 2.55 3.2 2.55 1.64 0 2.96-.37 4.05-.95v3.32a12.3 12.3 0 0 1-4.56.85c-4.14 0-6.98-2.41-6.98-7.17 0-4.23 2.5-7.2 6.4-7.2 3.83 0 5.97 2.97 5.97 7.2 0 .43-.02.95-.02 1.4zm-4.1-5.97c-1.17 0-2.17.88-2.4 2.8h4.74c-.07-1.73-.86-2.8-2.34-2.8zM41.8 18.87V5.92h4.14l.27 1.46c1.17-1.17 2.65-1.77 3.8-1.77.5 0 .87.05 1.17.15v4.2a5.3 5.3 0 0 0-1.42-.17c-.93 0-2.28.48-3.02 1.25v7.83H41.8zm-6.4-13.18c1.48 0 2.58.48 3.5 1.15V2.08h4.93v16.79h-4.1l-.32-1.2c-.98.96-2.36 1.5-3.78 1.5-3.42 0-5.82-2.95-5.82-7.17 0-4.58 2.58-7.31 5.59-7.31zm1.15 10.78c1.1 0 1.93-.55 2.58-1.25V9.92c-.63-.58-1.48-1-2.48-1-1.57 0-2.73 1.3-2.73 3.58 0 2.38 1.07 3.97 2.63 3.97zm-11.66 2.4V5.92h4.93v12.95h-4.93zm2.48-14.53c-1.55 0-2.65-1.03-2.65-2.38 0-1.38 1.1-2.41 2.65-2.41 1.57 0 2.66 1.03 2.66 2.4 0 1.36-1.1 2.4-2.66 2.4zM17.88 11c0-4.65 3.08-7.32 6.79-7.32a6.8 6.8 0 0 1 3.4.88V.67h4.93v18.2h-4.14l-.3-1.2c-.96.95-2.36 1.5-3.76 1.5-3.56 0-6.92-2.95-6.92-8.17zm7.2 4.38c1.1 0 1.98-.58 2.58-1.22v-6c-.6-.55-1.47-.98-2.48-.98-1.62 0-3.05 1.27-3.05 4 0 2.87 1.3 4.2 2.95 4.2zM6.49 18.87c-3.18 0-5.37-1.09-6.49-2.05v3.94h4.94v4.12H0V25h15.87v-6.13h-9.38zm6.3-9.57c0 3.84-2.65 6.73-7.58 6.73C1.93 16.03 0 14.28 0 14.28V6.72l4.94-1.05v6.68c.58.53 1.5.94 2.58.94 1.2 0 2.04-.5 2.04-1.73V5.92h4.93v.14l.3 3.24z" />
          </svg>
        </div>

        <p>
          Connect your Stripe account to Jeriko and manage payments, customers,
          invoices, subscriptions, and more — all through natural language
          commands in your terminal.
        </p>

        <h3>Get Started</h3>
        <div className="stripe-examples">
          <code>curl -fsSL https://jeriko.ai/install | sh</code>
          <code>jeriko init</code>
          <code>jeriko connect stripe</code>
        </div>
        <p style={{ marginTop: 12 }}>
          Running <code>jeriko connect stripe</code> opens the Stripe OAuth
          authorization page in your browser. After you authorize, the
          connection is established automatically.
        </p>
      </section>

      <section>
        <h2>How It Works</h2>
        <div className="stripe-steps">
          <div className="stripe-step">
            <span className="step-number">1</span>
            <h3>Install Jeriko</h3>
            <p>
              Install the Jeriko CLI with a single command. Run{" "}
              <code>jeriko init</code> to configure your AI provider
              (OpenAI, Claude, or local models).
            </p>
          </div>
          <div className="stripe-step">
            <span className="step-number">2</span>
            <h3>Connect Stripe</h3>
            <p>
              Run <code>jeriko connect stripe</code> in your terminal. This
              opens Stripe&apos;s OAuth page where you authorize Jeriko to
              access your account.
            </p>
          </div>
          <div className="stripe-step">
            <span className="step-number">3</span>
            <h3>Use Natural Language</h3>
            <p>
              Type commands like &quot;list my customers&quot; or &quot;create an
              invoice for $500&quot; directly in the Jeriko CLI.
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2>What You Can Do</h2>
        <ul>
          <li>View account balance and financial overview</li>
          <li>List, create, and manage customers</li>
          <li>Create and send invoices</li>
          <li>Manage subscriptions and recurring billing</li>
          <li>Process charges and payment intents</li>
          <li>Create checkout sessions and payment links</li>
          <li>Track refunds and payouts</li>
          <li>Monitor events and webhook activity</li>
          <li>Manage products and pricing</li>
        </ul>
      </section>

      <section>
        <h2>Example Commands</h2>
        <div className="stripe-examples">
          <code>jeriko &quot;show my Stripe balance&quot;</code>
          <code>jeriko &quot;list the last 10 customers&quot;</code>
          <code>jeriko &quot;create an invoice for customer cus_xxx for $200&quot;</code>
          <code>jeriko &quot;cancel subscription sub_xxx&quot;</code>
          <code>jeriko &quot;create a payment link for $49.99&quot;</code>
        </div>
      </section>

      <section>
        <h2>Disconnecting</h2>
        <p>To disconnect Stripe from Jeriko:</p>
        <div className="stripe-examples">
          <code>jeriko disconnect stripe</code>
        </div>
        <p>
          This revokes the OAuth token and removes stored credentials. You can
          also revoke access from your{" "}
          <a
            href="https://dashboard.stripe.com/settings/apps"
            target="_blank"
            rel="noreferrer"
          >
            Stripe Dashboard &rarr; Settings &rarr; Apps
          </a>
          .
        </p>
      </section>

      <section>
        <h2>Security</h2>
        <p>
          Jeriko uses OAuth 2.0 to connect to your Stripe account. Your API keys
          are never shared. Access tokens are stored locally on your machine and
          refreshed automatically. All API calls are made over HTTPS with
          timing-safe HMAC verification for webhooks.
        </p>
        <p>
          <a href="/privacy-policy">Privacy Policy</a> &middot;{" "}
          <a href="/terms-and-conditions">Terms & Conditions</a>
        </p>
      </section>
    </main>
  );
}
