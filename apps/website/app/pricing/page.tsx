export default function PricingPage() {
  return (
    <main className="page legal">
      <a href="/" className="back">&larr; Back to Jeriko</a>

      <h1>Pricing</h1>
      <p className="effective">
        Simple, transparent pricing. Start free, upgrade when you need more.
      </p>

      <div className="pricing-grid">
        <article className="pricing-card">
          <h2>Free</h2>
          <p className="pricing-price">$0<span>/month</span></p>
          <ul>
            <li>Full AI agent with any model</li>
            <li>Interactive CLI + chat REPL</li>
            <li>2 connectors (e.g. Stripe, GitHub)</li>
            <li>3 automation triggers</li>
            <li>All agent tools (17 tools)</li>
            <li>Custom skills</li>
            <li>Community support</li>
          </ul>
        </article>

        <article className="pricing-card pricing-card-highlight">
          <h2>Pro</h2>
          <p className="pricing-price">$19<span>/month</span></p>
          <ul>
            <li>Everything in Free, plus:</li>
            <li>10 connectors</li>
            <li>Unlimited automation triggers</li>
            <li>Telegram & WhatsApp channels</li>
            <li>Priority support</li>
            <li>Relay server access</li>
          </ul>
        </article>

        <article className="pricing-card">
          <h2>Team</h2>
          <p className="pricing-price">$49<span>/month per seat</span></p>
          <ul>
            <li>Everything in Pro, plus:</li>
            <li>Unlimited connectors</li>
            <li>Team collaboration features</li>
            <li>Shared skills & workflows</li>
            <li>Admin dashboard</li>
            <li>Dedicated support</li>
          </ul>
        </article>
      </div>

      <section>
        <h2>Stripe Integration Pricing</h2>
        <p>
          The Stripe connector is available on all plans, including Free. You
          can connect one Stripe account and use all supported operations
          (customers, invoices, subscriptions, charges, products, and more) at
          no additional cost from Jeriko. Standard Stripe processing fees
          apply to transactions made through your Stripe account.
        </p>
      </section>

      <section>
        <h2>FAQ</h2>

        <h3>Do I need to pay for the Stripe connector?</h3>
        <p>
          No. The Stripe connector is included in all plans, including the
          Free tier. Jeriko does not charge any additional fees for Stripe
          API access.
        </p>

        <h3>What AI providers are supported?</h3>
        <p>
          Jeriko works with OpenAI, Anthropic (Claude), Ollama, LM Studio,
          and 22+ custom providers. You provide your own API keys — Jeriko
          does not charge for AI usage.
        </p>

        <h3>Can I cancel anytime?</h3>
        <p>
          Yes. You can cancel your subscription at any time from the CLI
          with <code>jeriko billing cancel</code> or from the{" "}
          <a href="/billing/cancel">billing portal</a>. Your plan continues
          until the end of the billing period.
        </p>

        <h3>Is there a refund policy?</h3>
        <p>
          Yes. See our <a href="/refund-policy">refund policy</a> for
          details.
        </p>
      </section>
    </main>
  );
}
