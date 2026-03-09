"use client";

import { useState } from "react";
import { InstallBox } from "./components/install-box";

/* ── Feature cards with icons ── */

const FEATURES = [
  { icon: "globe",     title: "Build Web & Mobile Apps",  desc: "40+ templates, live dev server, checkpoint & rollback. From idea to deployed app in one conversation." },
  { icon: "browser",   title: "Browser Automation",       desc: "Full Chrome with your real cookies and sessions. Anti-detection stealth, CAPTCHA detection, shadow DOM traversal." },
  { icon: "search",    title: "Deep Research",            desc: "Up to 20 parallel sub-agents researching simultaneously. Web search, browsing, and document analysis at scale." },
  { icon: "os",        title: "Full PC Control",          desc: "Files, screenshots, clipboard, windows, processes, notifications — your entire machine responds to natural language." },
  { icon: "chat",      title: "Control On The Go",        desc: "Telegram, WhatsApp, or your terminal. Send a message from your phone, your AI executes on your machine." },
  { icon: "auto",      title: "24/7 Automation",          desc: "Cron schedules, file watchers, webhooks, email triggers. Your AI works in the background while you sleep." },
  { icon: "stripe",    title: "20+ Connectors",           desc: "Stripe, GitHub, Gmail, Google Drive, PayPal, HubSpot, Shopify, and more — connected with one click via OAuth." },
  { icon: "image",     title: "Image Generation",         desc: "Generate images with DALL-E 3 directly from chat. Create visuals, mockups, and assets without leaving the terminal." },
  { icon: "voice",     title: "Voice & Text-to-Speech",   desc: "Speech-to-text transcription via Whisper. Text-to-speech with OpenAI or native macOS voices. Voice messages supported." },
  { icon: "slides",    title: "PowerPoint & Slides",      desc: "Create presentations from natural language. Markdown to reveal.js or beamer via pandoc. Pitch decks in minutes." },
  { icon: "doc",       title: "Documents & Resumes",      desc: "Draft resumes, cover letters, reports. Convert to PDF, Word, or any format. 10+ document types supported." },
  { icon: "mail",      title: "Email Management",         desc: "Gmail, Outlook, SendGrid, Mailchimp connectors. Read, compose, and send emails. Email triggers fire agent prompts." },
  { icon: "deploy",    title: "Deploy to Production",     desc: "Vercel connector for one-command deployment. Build, test, and ship from the same conversation." },
  { icon: "db",        title: "Database Management",      desc: "SQLite built-in, Drizzle ORM for schema. Push migrations, execute SQL, manage data — all via natural language." },
  { icon: "code",      title: "Full-Stack Development",   desc: "Read, write, edit, search across any codebase. Git workflows, CI/CD pipelines, code reviews — your AI pair programmer." },
  { icon: "translate", title: "Translate & Localize",     desc: "Translate documents, websites, and content into any language. Bilingual output, localization at scale." },
  { icon: "skill",     title: "Custom Skills",            desc: "Teachable SKILL.md files that extend your agent. Create, share, and install capabilities. Your AI gets smarter over time." },
  { icon: "model",     title: "Any AI Model",             desc: "OpenAI, Claude, Ollama, or 22+ custom providers. Swap models with a single flag. Zero vendor lock-in." },
  { icon: "shield",    title: "Secure & Private",         desc: "Runs 100% locally. Your API keys, your data, your machine. Nothing phones home. Full exec sandboxing." },
  { icon: "bolt",      title: "Lightweight & Fast",       desc: "Single 66MB binary. No dependencies, no Docker, no runtime. One command install, instant startup." },
  { icon: "memory",    title: "Persistent Memory",        desc: "Your agent remembers preferences, decisions, and context across sessions. It learns your workflow and gets better over time." },
  { icon: "eye",       title: "Vision & Screenshots",     desc: "Your agent can see your screen, analyze images, and use your camera. Debug UI bugs, read documents, or monitor visual changes." },
  { icon: "api",       title: "Full HTTP API",            desc: "REST API and WebSocket for real-time streaming. Build dashboards, mobile apps, or custom integrations on top of Jeriko." },
];

const INITIAL_COUNT = 9;

const ICON_MAP: Record<string, string> = {
  globe:     "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z",
  browser:   "M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V8h16v12zM6 6h2v2H6V6zm3 0h2v2H9V6z",
  search:    "M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z",
  os:        "M20 3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H4V7h16v12zm-2-7H6v-2h12v2zm-4 4H6v-2h8v2z",
  chat:      "M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z",
  auto:      "M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z",
  stripe:    "M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12zm-7-7c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z",
  image:     "M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z",
  voice:     "M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z",
  slides:    "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM7 10h2v7H7zm4-3h2v10h-2zm4 6h2v4h-2z",
  doc:       "M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z",
  mail:      "M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z",
  deploy:    "M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z",
  db:        "M12 3C7.58 3 4 4.79 4 7v10c0 2.21 3.58 4 8 4s8-1.79 8-4V7c0-2.21-3.58-4-8-4zm0 2c3.87 0 6 1.5 6 2s-2.13 2-6 2-6-1.5-6-2 2.13-2 6-2zM6 17V14.77c1.61.77 3.72 1.23 6 1.23s4.39-.46 6-1.23V17c0 .5-2.13 2-6 2s-6-1.5-6-2z",
  code:      "M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z",
  translate: "M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v2h11.17c-.67 1.93-1.73 3.78-3.17 5.34-.88-.96-1.63-2-2.24-3.1H4.8c.73 1.41 1.64 2.74 2.73 3.96L2.88 16.8l1.12 1.12 4.5-4.5 2.8 2.8.67-1.15zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z",
  skill:     "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
  model:     "M21 10.12h-6.78l2.74-2.82c-2.73-2.7-7.15-2.8-9.88-.1-2.73 2.71-2.73 7.08 0 9.79s7.15 2.71 9.88 0C18.32 15.65 19 14.08 19 12.1h2c0 1.98-.88 4.55-2.64 6.29-3.51 3.48-9.21 3.48-12.72 0-3.5-3.47-3.53-9.11-.02-12.58s9.14-3.49 12.65 0L21 3v7.12z",
  shield:    "M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z",
  bolt:      "M11 21h-1l1-7H7.5c-.58 0-.57-.32-.38-.66.19-.34.05-.08.07-.12C8.48 10.94 10.42 7.54 13 3h1l-1 7h3.5c.49 0 .56.33.47.51l-.07.15C12.96 17.55 11 21 11 21z",
  memory:    "M15 9H9v6h6V9zm-2 4h-2v-2h2v2zm8-2V9h-2V7c0-1.1-.9-2-2-2h-2V3h-2v2h-2V3H9v2H7c-1.1 0-2 .9-2 2v2H3v2h2v2H3v2h2v2c0 1.1.9 2 2 2h2v2h2v-2h2v2h2v-2h2c1.1 0 2-.9 2-2v-2h2v-2h-2v-2h2zm-4 6H7V7h10v10z",
  eye:       "M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z",
  api:       "M14 12l-2 2-2-2 2-2 2 2zm-2-6l2.12 2.12 2.5-2.5L12 1 7.38 5.62l2.5 2.5L12 6zm-6 6l2.12-2.12-2.5-2.5L1 12l4.62 4.62 2.5-2.5L6 12zm12 0l-2.12 2.12 2.5 2.5L23 12l-4.62-4.62-2.5 2.5L18 12zm-6 6l-2.12-2.12-2.5 2.5L12 23l4.62-4.62-2.5-2.5L12 18z",
};

function FeatureIcon({ name }: { name: string }) {
  const d = ICON_MAP[name];
  if (!d) return null;
  return (
    <svg className="feature-icon" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
      <path d={d} />
    </svg>
  );
}

export default function Home() {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? FEATURES : FEATURES.slice(0, INITIAL_COUNT);

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

      {/* ── Features ── */}
      <section id="features" className="section-features">
        <h2>What Can Jeriko Do?</h2>
        <div className="feature-grid">
          {visible.map((f) => (
            <article key={f.title} className="feature-card">
              <div className="feature-icon-wrap">
                <FeatureIcon name={f.icon} />
              </div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </article>
          ))}
        </div>
        {!showAll && (
          <button className="show-all-btn" onClick={() => setShowAll(true)}>
            Show all {FEATURES.length} features
          </button>
        )}
      </section>

      {/* ── How It Works ── */}
      <section className="section-steps">
        <h2>How It Works</h2>
        <div className="steps-grid">
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
        <div className="audience-grid">
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
