import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "No worries | Jeriko",
  description: "Your checkout was cancelled. Jeriko is here whenever you're ready.",
};

const PERKS = [
  { title: "Unlimited AI", desc: "No message caps — ask as much as you need." },
  { title: "All Integrations", desc: "Stripe, GitHub, Gmail, and 10+ connectors unlocked." },
  { title: "Priority Support", desc: "Direct access to the team when you need help." },
] as const;

export default function BillingCancelPage() {
  return (
    <main className="cancel-page">
      <div className="cancel-card">
        <img
          src="/jeriko-logo-white.png"
          alt="Jeriko"
          className="cancel-logo"
          width={72}
          height={72}
        />

        <h1 className="cancel-title">We&apos;ll be here when you&apos;re ready.</h1>
        <p className="cancel-lead">
          No pressure — your free tier is still fully active.
          Whenever you want to unlock the full power of Jeriko, we&apos;re one click away.
        </p>

        <div className="cancel-perks">
          {PERKS.map((perk) => (
            <div key={perk.title} className="cancel-perk">
              <strong>{perk.title}</strong>
              <span>{perk.desc}</span>
            </div>
          ))}
        </div>

        <div className="cancel-actions">
          <a href="/docs/installation" className="cancel-btn-primary">
            Try Again
          </a>
          <a href="/" className="cancel-btn-secondary">
            Back to Home
          </a>
        </div>

        <p className="cancel-note">
          Questions? Reach out at <a href="mailto:support@jeriko.ai">support@jeriko.ai</a>
        </p>
      </div>
    </main>
  );
}
