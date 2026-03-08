"use client";

import { InstallBox } from "./components/install-box";

/* ── Marquee capabilities (trimmed to strongest, 2 rows) ── */

const CAPABILITIES_ROW1 = [
  { icon: "globe",     label: "Build Web Apps" },
  { icon: "mobile",    label: "Build Mobile Apps" },
  { icon: "browser",   label: "Browser Automation" },
  { icon: "search",    label: "Deep Research" },
  { icon: "slides",    label: "PowerPoint & Slides" },
  { icon: "image",     label: "Image Generation" },
  { icon: "voice",     label: "Voice & Text-to-Speech" },
  { icon: "mail",      label: "Email Management" },
  { icon: "deploy",    label: "Deploy to Production" },
  { icon: "db",        label: "Database Management" },
  { icon: "translate", label: "Translate & Localize" },
  { icon: "doc",       label: "Resumes & Documents" },
];

const CAPABILITIES_ROW2 = [
  { icon: "os",        label: "Full PC Control" },
  { icon: "phone",     label: "Control On The Go" },
  { icon: "multi",     label: "Parallel Agents" },
  { icon: "chat",      label: "Telegram & WhatsApp" },
  { icon: "auto",      label: "24/7 Automation" },
  { icon: "stripe",    label: "Payments & Billing" },
  { icon: "github",    label: "GitHub & GitLab" },
  { icon: "skill",     label: "Custom Skills" },
  { icon: "shield",    label: "Secure & Private" },
  { icon: "bolt",      label: "Lightweight & Fast" },
  { icon: "notify",    label: "Notifications" },
  { icon: "code",      label: "Full-Stack Dev" },
];

/* ── SVG icon paths (Material Icons, 24x24 viewBox) ── */

const ICON_MAP: Record<string, string> = {
  globe:     "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z",
  mobile:    "M15.5 1h-8C6.12 1 5 2.12 5 3.5v17C5 21.88 6.12 23 7.5 23h8c1.38 0 2.5-1.12 2.5-2.5v-17C18 2.12 16.88 1 15.5 1zm-4 21c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4.5-4H7V4h9v14z",
  browser:   "M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V8h16v12zM6 6h2v2H6V6zm3 0h2v2H9V6z",
  search:    "M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z",
  slides:    "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM7 10h2v7H7zm4-3h2v10h-2zm4 6h2v4h-2z",
  image:     "M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z",
  voice:     "M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z",
  mail:      "M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z",
  deploy:    "M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z",
  db:        "M12 3C7.58 3 4 4.79 4 7v10c0 2.21 3.58 4 8 4s8-1.79 8-4V7c0-2.21-3.58-4-8-4zm0 2c3.87 0 6 1.5 6 2s-2.13 2-6 2-6-1.5-6-2 2.13-2 6-2zM6 17V14.77c1.61.77 3.72 1.23 6 1.23s4.39-.46 6-1.23V17c0 .5-2.13 2-6 2s-6-1.5-6-2z",
  translate: "M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v2h11.17c-.67 1.93-1.73 3.78-3.17 5.34-.88-.96-1.63-2-2.24-3.1H4.8c.73 1.41 1.64 2.74 2.73 3.96L2.88 16.8l1.12 1.12 4.5-4.5 2.8 2.8.67-1.15zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z",
  doc:       "M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z",
  os:        "M20 3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H4V7h16v12zm-2-7H6v-2h12v2zm-4 4H6v-2h8v2z",
  phone:     "M15.5 1h-8C6.12 1 5 2.12 5 3.5v17C5 21.88 6.12 23 7.5 23h8c1.38 0 2.5-1.12 2.5-2.5v-17C18 2.12 16.88 1 15.5 1zm-4 21c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4.5-4H7V4h9v14z",
  multi:     "M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z",
  chat:      "M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z",
  auto:      "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z",
  stripe:    "M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12zm-7-7c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z",
  github:    "M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12c0-5.52-4.48-10-10-10z",
  skill:     "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
  shield:    "M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z",
  bolt:      "M11 21h-1l1-7H7.5c-.58 0-.57-.32-.38-.66.19-.34.05-.08.07-.12C8.48 10.94 10.42 7.54 13 3h1l-1 7h3.5c.49 0 .56.33.47.51l-.07.15C12.96 17.55 11 21 11 21z",
  notify:    "M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z",
  code:      "M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z",
};

function CapIcon({ name }: { name: string }) {
  const d = ICON_MAP[name];
  if (!d) return null;
  return (
    <svg className="cap-icon" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
      <path d={d} />
    </svg>
  );
}

function MarqueeRow({ items, reverse }: { items: typeof CAPABILITIES_ROW1; reverse?: boolean }) {
  const doubled = [...items, ...items];
  return (
    <div className={`marquee-track ${reverse ? "marquee-reverse" : ""}`}>
      <div className="marquee-content">
        {doubled.map((cap, i) => (
          <span key={i} className="cap-pill">
            <CapIcon name={cap.icon} />
            {cap.label}
          </span>
        ))}
      </div>
    </div>
  );
}

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

      {/* ── Capabilities Marquee ── */}
      <section className="section-capabilities">
        <h2>What Can Jeriko Do?</h2>
        <div className="marquee-container">
          <MarqueeRow items={CAPABILITIES_ROW1} />
          <MarqueeRow items={CAPABILITIES_ROW2} reverse />
        </div>
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
            Telegram, WhatsApp, or your terminal. Your AI
            follows you across every device.
          </p>
        </article>
        <article>
          <h2>20+ Connectors</h2>
          <p>
            GitHub, Stripe, Gmail, Google Drive, PayPal,
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
              Connect GitHub, Telegram — your AI follows your team
              across every channel and responds in real time.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
