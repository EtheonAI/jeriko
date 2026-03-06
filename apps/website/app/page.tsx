"use client";

import { InstallBox } from "./components/install-box";

export default function Home() {
  return (
    <main className="page">
      {/* ── Hero ── */}
      <section className="hero">
        <img
          src="/jeriko-logo-white.png"
          alt="Jeriko"
          className="hero-logo"
          width={64}
          height={64}
        />
        <p className="eyebrow">macOS Jeriko</p>
        <h1>The New Intelligent OS</h1>
        <p className="lead">
          Jeriko transforms your Mac into an AI-powered operating system.
          One daemon, one CLI, total control — your entire machine responds to
          natural language.
        </p>
        <div className="actions">
          <a href="/docs/installation">Install</a>
          <a href="https://github.com/EtheonAI/jerikoai" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a href="/docs">API Docs</a>
        </div>
      </section>

      {/* ── Install ── */}
      <InstallBox />

      {/* ── What is Jeriko? ── */}
      <section className="section-about">
        <h2>What is Jeriko?</h2>
        <p className="lead">
          Jeriko is an AI layer that runs natively on macOS (and Linux). It
          controls your files, browser, email, calendar, terminal —
          everything through natural language. It runs as a local daemon with
          an interactive CLI, connecting to any AI model — OpenAI, Claude,
          Ollama, or custom providers. No cloud lock-in. No data leaves your
          machine. Just a single binary that turns your operating system into
          something intelligent.
        </p>
      </section>

      {/* ── Feature Grid (3×3) ── */}
      <section id="features" className="grid">
        <article>
          <h2>Control Your OS</h2>
          <p>
            Files, browser, screenshots, clipboard, notifications — one
            command. Your Mac becomes a programmable surface.
          </p>
        </article>
        <article>
          <h2>Always-On Daemon</h2>
          <p>
            Runs in the background. Cron tasks, triggers, webhooks — your AI
            works 24/7 even when you close the terminal.
          </p>
        </article>
        <article>
          <h2>Any AI Model</h2>
          <p>
            OpenAI, Claude, Ollama, or custom. Swap models anytime with a
            single flag. Zero vendor lock-in.
          </p>
        </article>
        <article>
          <h2>Talk From Anywhere</h2>
          <p>
            Telegram, WhatsApp, Discord, Slack, or your terminal. Your AI
            follows you across every device.
          </p>
        </article>
        <article>
          <h2>20+ Connectors</h2>
          <p>
            GitHub, Stripe, Gmail, Google Drive, PayPal, Slack, Discord,
            HubSpot, Shopify, and more — OAuth in one click.
          </p>
        </article>
        <article>
          <h2>Privacy First</h2>
          <p>
            Runs locally on your machine. Your API keys, your data, your
            control. Nothing phones home.
          </p>
        </article>
        <article>
          <h2>Triggers & Automation</h2>
          <p>
            Cron schedules, file watchers, webhooks, email triggers — fully
            automated workflows that fire without you.
          </p>
        </article>
        <article>
          <h2>Skills System</h2>
          <p>
            Teachable skills that extend your agent. Create, share, and
            install custom capabilities — your AI gets smarter over time.
          </p>
        </article>
        <article>
          <h2>Interactive Terminal</h2>
          <p>
            Rich Ink-based CLI with markdown rendering, syntax highlighting,
            autocomplete, and multi-line input. The terminal, reimagined.
          </p>
        </article>
      </section>

      {/* ── How It Works ── */}
      <section className="section-steps">
        <h2>How It Works</h2>
        <div className="grid">
          <article>
            <span className="step-number">1</span>
            <h3>Install</h3>
            <p>One command install on macOS or Linux. A single binary, no dependencies.</p>
          </article>
          <article>
            <span className="step-number">2</span>
            <h3>Setup</h3>
            <p>
              <code>jeriko init</code> configures your AI provider,
              integrations, and channels in seconds.
            </p>
          </article>
          <article>
            <span className="step-number">3</span>
            <h3>Chat</h3>
            <p>
              <code>jeriko</code> launches the interactive AI terminal.
              Ask anything — your OS responds.
            </p>
          </article>
          <article>
            <span className="step-number">4</span>
            <h3>Automate</h3>
            <p>
              Add triggers, channels, and connectors. Jeriko works 24/7 in
              the background — even while you sleep.
            </p>
          </article>
        </div>
      </section>

      {/* ── Built For ── */}
      <section className="section-audience">
        <h2>Built For</h2>
        <div className="grid">
          <article>
            <h3>Developers</h3>
            <p>
              Automate git workflows, deployments, code reviews, and CI/CD
              pipelines. Your AI pair programmer lives in the terminal.
            </p>
          </article>
          <article>
            <h3>Power Users</h3>
            <p>
              Control your entire OS with natural language. File management,
              browser automation, system administration — no manual needed.
            </p>
          </article>
          <article>
            <h3>Teams</h3>
            <p>
              Connect Slack, Discord, GitHub — your AI follows your team
              across every channel and responds in real time.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
