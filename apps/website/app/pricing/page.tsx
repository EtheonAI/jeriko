export default function PricingPage() {
  return (
    <main className="page legal">
      <a href="/" className="back">&larr; Back to Jeriko</a>

      <h1>Pricing</h1>
      <p className="effective">
        Jeriko is open source and free to use. Pay only if you want managed infrastructure.
      </p>

      <div className="pricing-grid">
        <article className="pricing-card">
          <h2>Open Source</h2>
          <p className="pricing-price">Free<span> forever</span></p>
          <ul>
            <li>Full source code (MIT license)</li>
            <li>Build from source with Bun</li>
            <li>All 51 CLI commands</li>
            <li>All 17 agent tools</li>
            <li>All connectors (self-hosted OAuth)</li>
            <li>All automation triggers</li>
            <li>Any AI model (bring your own keys)</li>
            <li>Custom skills</li>
            <li>Community support via GitHub</li>
          </ul>
        </article>

        <article className="pricing-card">
          <h2>Free</h2>
          <p className="pricing-price">$0<span>/month</span></p>
          <ul>
            <li>Pre-compiled binary (one-line install)</li>
            <li>Interactive CLI + chat REPL</li>
            <li>2 connectors with managed OAuth</li>
            <li>3 automation triggers</li>
            <li>All 17 agent tools</li>
            <li>Custom skills</li>
            <li>Community support</li>
          </ul>
        </article>

        <article className="pricing-card pricing-card-highlight">
          <h2>Pro</h2>
          <p className="pricing-price">$19<span>/month</span></p>
          <ul>
            <li>Everything in Free, plus:</li>
            <li>Unlimited connectors</li>
            <li>Unlimited automation triggers</li>
            <li>Telegram &amp; WhatsApp channels</li>
            <li>Relay server access</li>
            <li>Priority support</li>
          </ul>
        </article>
      </div>

      <section>
        <h2>FAQ</h2>

        <h3>Is Jeriko really free?</h3>
        <p>
          Yes. Jeriko is fully open source under the MIT license. You can build
          from source, self-host everything, and use all features with zero
          cost. The paid plans provide convenience (pre-compiled binaries,
          managed OAuth, relay infrastructure) — not gated features.
        </p>

        <h3>What AI providers are supported?</h3>
        <p>
          Jeriko works with OpenAI, Anthropic (Claude), Ollama, LM Studio,
          and 22+ custom providers. You provide your own API keys — Jeriko
          does not charge for AI usage.
        </p>

        <h3>Can I cancel anytime?</h3>
        <p>
          Yes. Cancel your subscription at any time with{" "}
          <code>jeriko billing cancel</code> or from the{" "}
          <a href="/billing/cancel">billing portal</a>. Your plan continues
          until the end of the billing period.
        </p>

        <h3>What&apos;s the difference between Open Source and Free?</h3>
        <p>
          Open Source means you build from source and manage your own OAuth
          credentials and infrastructure. The Free tier gives you a
          pre-compiled binary with managed OAuth for up to 2 connectors and
          3 triggers — no setup required.
        </p>
      </section>
    </main>
  );
}
