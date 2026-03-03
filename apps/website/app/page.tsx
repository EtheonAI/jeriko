"use client";

import { InstallBox } from "./components/install-box";

export default function Home() {
  return (
    <main className="page">
      <section className="hero">
        <img
          src="/jeriko-logo-white.png"
          alt="Jeriko"
          className="hero-logo"
          width={56}
          height={56}
        />
        <p className="eyebrow">Jeriko</p>
        <h1>Unix-first autonomous AI for your OS</h1>
        <p className="lead">
          Jeriko runs as a local daemon and CLI, using shell commands and native OS capabilities
          instead of brittle tool abstractions.
        </p>
        <div className="actions">
          <a href="/docs/installation">Install</a>
          <a href="https://github.com/khaleel737/jeriko" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a href="/docs">API Docs</a>
        </div>
      </section>

      <InstallBox />

      <section id="features" className="grid">
        <article>
          <h2>Your OS, One Command</h2>
          <p>Files, browser, email, calendar, music — control everything with natural language.</p>
        </article>
        <article>
          <h2>Always-On Daemon</h2>
          <p>Runs in the background. Scheduled tasks, triggers, and instant responses around the clock.</p>
        </article>
        <article>
          <h2>Any AI Model</h2>
          <p>OpenAI, Claude, Ollama, or custom providers. Swap models anytime — zero lock-in.</p>
        </article>
        <article>
          <h2>Talk From Anywhere</h2>
          <p>Telegram, WhatsApp, or your terminal. Your AI follows you across every device.</p>
        </article>
        <article>
          <h2>Privacy First</h2>
          <p>Runs locally on your machine. Your data never leaves your network.</p>
        </article>
        <article>
          <h2>10+ Integrations</h2>
          <p>Stripe, GitHub, Gmail, Google Drive, PayPal, and more — connected out of the box.</p>
        </article>
      </section>

      <footer className="footer">
        <p>&copy; {new Date().getFullYear()} Jeriko. All rights reserved.</p>
        <nav>
          <a href="/privacy-policy">Privacy Policy</a>
          <a href="/terms-and-conditions">Terms &amp; Conditions</a>
          <a href="/docs">API Docs</a>
        </nav>
      </footer>
    </main>
  );
}
