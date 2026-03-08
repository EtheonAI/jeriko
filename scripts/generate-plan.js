#!/usr/bin/env node
/**
 * Generate JerikoOS Business + Technical Plan (.docx)
 * Output: ~/Desktop/JerikoOS-Business-Technical-Plan.docx
 */
const docx = require('docx');
const fs = require('fs');
const path = require('path');

const {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  AlignmentType, PageBreak, ShadingType, TableOfContents,
  StyleLevel, TabStopType, TabStopPosition,
} = docx;

// ── Helpers ────────────────────────────────────────────────
function heading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({ heading: level, children: [new TextRun({ text, bold: true })] });
}
function h1(t) { return heading(t, HeadingLevel.HEADING_1); }
function h2(t) { return heading(t, HeadingLevel.HEADING_2); }
function h3(t) { return heading(t, HeadingLevel.HEADING_3); }

function para(text, opts = {}) {
  const runs = [];
  if (typeof text === 'string') {
    runs.push(new TextRun({ text, bold: !!opts.bold, italics: !!opts.italic, size: opts.size || 24 }));
  } else if (Array.isArray(text)) {
    for (const t of text) {
      if (typeof t === 'string') runs.push(new TextRun({ text: t, size: 24 }));
      else runs.push(new TextRun({ ...t, size: t.size || 24 }));
    }
  }
  return new Paragraph({
    children: runs,
    spacing: { after: 120 },
    alignment: opts.align || AlignmentType.LEFT,
  });
}

function bullet(text, level = 0) {
  const runs = [];
  if (typeof text === 'string') {
    runs.push(new TextRun({ text, size: 24 }));
  } else if (Array.isArray(text)) {
    for (const t of text) {
      if (typeof t === 'string') runs.push(new TextRun({ text: t, size: 24 }));
      else runs.push(new TextRun({ ...t, size: t.size || 24 }));
    }
  }
  return new Paragraph({
    children: runs,
    bullet: { level },
    spacing: { after: 60 },
  });
}

function spacer() {
  return new Paragraph({ children: [new TextRun('')], spacing: { after: 200 } });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

function makeTable(headers, rows) {
  const hdrCells = headers.map(h => new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 22, color: 'FFFFFF' })], alignment: AlignmentType.CENTER })],
    shading: { fill: '1a1a2e', type: ShadingType.SOLID, color: '1a1a2e' },
    width: { size: Math.floor(9000 / headers.length), type: WidthType.DXA },
  }));
  const dataRows = rows.map(row => {
    const cells = row.map(cell => new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: String(cell), size: 22 })], spacing: { after: 40 } })],
      width: { size: Math.floor(9000 / headers.length), type: WidthType.DXA },
    }));
    return new TableRow({ children: cells });
  });
  return new Table({
    rows: [new TableRow({ children: hdrCells }), ...dataRows],
    width: { size: 9000, type: WidthType.DXA },
  });
}

// ── Document Content ───────────────────────────────────────
const sections = [];

// ─── TITLE PAGE ────────────────────────────────────────────
sections.push(
  spacer(), spacer(), spacer(), spacer(), spacer(), spacer(),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'JerikoOS', bold: true, size: 72, color: '1a1a2e' })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text: "The World's First AI-Native Operating System", size: 36, italics: true, color: '444444' })],
  }),
  spacer(),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'Business & Technical Plan', size: 32, color: '666666' })],
  }),
  spacer(), spacer(),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'Etheon', size: 28, bold: true })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'February 2026', size: 24, color: '888888' })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'CONFIDENTIAL', size: 20, bold: true, color: 'CC0000' })],
  }),
  pageBreak(),
);

// ─── TABLE OF CONTENTS ────────────────────────────────────
sections.push(
  h1('Table of Contents'),
  spacer(),
  para('1. Executive Summary'),
  para('2. The Problem'),
  para('3. The Solution: JerikoOS'),
  para('4. Market Analysis'),
  para('5. Competitive Landscape'),
  para('6. What Exists Today (Jeriko v1.0)'),
  para('7. Technical Architecture: From CLI to OS'),
  para('8. The Daemon: Core of JerikoOS'),
  para('9. Kernel Integration & eBPF'),
  para('10. Security Architecture'),
  para('11. Six-Month Roadmap'),
  para('12. Team Structure (5 Engineers + Claude Code)'),
  para('13. Revenue Model'),
  para('14. Go-to-Market Strategy'),
  para('15. Key Metrics & Milestones'),
  para('16. Risk Analysis'),
  para('17. Financial Projections'),
  para('18. Technical Specifications'),
  para('19. Appendix'),
  pageBreak(),
);

// ─── 1. EXECUTIVE SUMMARY ─────────────────────────────────
sections.push(
  h1('1. Executive Summary'),
  spacer(),
  para([
    { text: 'JerikoOS ', bold: true },
    { text: "is a project to build the world's first AI-native operating system \u2014 an OS where artificial intelligence is not a feature bolted onto a traditional desktop, but the " },
    { text: 'primary interface ', bold: true },
    { text: 'through which users interact with their computer. There is no desktop. No icons. No menus. You speak to Jeriko, and Jeriko controls the machine at the kernel level.' },
  ]),
  spacer(),
  para('The foundation already exists. Jeriko v1.0 is a working Unix-first CLI toolkit with 46 commands that give any AI model full machine control \u2014 system management, file operations, browser automation, communication (Telegram, WhatsApp, iMessage, email, SMS, phone calls), payments (Stripe), social media (X/Twitter), cloud deployment (Vercel, GitHub), media capture (camera, audio, screenshots), and macOS-native app control (Notes, Calendar, Reminders, Contacts, Music). It supports 4 AI backends (Claude, OpenAI, local models via Ollama, Claude Code CLI), has a plugin system with trust-based security, a trigger engine for autonomous operation, and multi-machine orchestration via WebSocket.'),
  spacer(),
  para([
    { text: 'The next step is the OS layer: ', bold: true },
    { text: 'a native system daemon (Rust) that replaces the current Node.js server, integrates with the Linux kernel via eBPF for real-time observability, enforces security through namespaces/cgroups/seccomp, and serves a web-based control panel as the primary user interface. The system boots directly into the AI \u2014 no traditional desktop environment.' },
  ]),
  spacer(),
  para([
    { text: 'Timeline: ', bold: true },
    { text: '6 months with 5 engineers using Claude Code as an AI-accelerated development tool (estimated 3-4x productivity multiplier). ' },
    { text: 'Target: ', bold: true },
    { text: 'A bootable Linux image where Jeriko IS the operating system.' },
  ]),
  spacer(),

  h2('Key Facts'),
  bullet([{ text: 'Current state: ', bold: true }, { text: 'Jeriko v1.0 \u2014 46 commands, 4 AI backends, 15 dependencies, MIT licensed' }]),
  bullet([{ text: 'Architecture: ', bold: true }, { text: 'Unix CLI toolkit \u2192 Rust daemon \u2192 AI-native OS' }]),
  bullet([{ text: 'Competitive gap: ', bold: true }, { text: 'Nobody has shipped a real AI-native OS. OpenAI\'s hardware delayed to 2027. Google\'s Aluminium OS delayed to 2028. Humane is dead. Microsoft admits Copilot "doesn\'t really work."' }]),
  bullet([{ text: 'Market validation: ', bold: true }, { text: 'CLI tools empirically beating MCP (35x token reduction). Industry consensus shifting toward Unix-philosophy AI interfaces.' }]),
  bullet([{ text: 'TAM: ', bold: true }, { text: 'Operating Systems ($61B) \u00D7 AI Infrastructure ($72B) intersection. AI Developer Tools alone: $4.5B growing 17%/yr.' }]),
  bullet([{ text: 'Team: ', bold: true }, { text: '5 engineers + Claude Code (AI pair programming). Effective capacity: 15-20 engineer equivalents.' }]),
  pageBreak(),
);

// ─── 2. THE PROBLEM ───────────────────────────────────────
sections.push(
  h1('2. The Problem'),
  spacer(),
  para('Operating systems were designed for humans clicking mice. Every major OS \u2014 Windows, macOS, Linux desktops \u2014 is built around a graphical metaphor from the 1980s: windows, icons, menus, pointers (WIMP). AI models cannot use these interfaces natively. They need programmatic access.'),
  spacer(),

  h2('2.1 The AI-OS Gap'),
  para('Today, when an AI agent needs to perform an action on a computer, one of three things happens:'),
  spacer(),
  bullet([{ text: 'Proprietary tool abstractions: ', bold: true }, { text: 'Each AI vendor (Anthropic, OpenAI, Google) defines its own tool/function calling format. Developers must implement tools separately for each vendor. There is no standard.' }]),
  bullet([{ text: 'Screen scraping: ', bold: true }, { text: 'Projects like Anthropic\'s Computer Use or Rabbit\'s LAM try to "see" the screen and click GUI elements. This is slow (seconds per action), fragile (breaks when UI changes), expensive (vision model tokens), and fundamentally wrong \u2014 GUIs are for humans, not machines.' }]),
  bullet([{ text: 'MCP overhead: ', bold: true }, { text: 'Anthropic\'s Model Context Protocol (MCP) requires 55,000 tokens just to load GitHub\'s tool definitions. That\'s nearly half of GPT-4o\'s context window consumed by plumbing before a single task executes.' }]),
  spacer(),

  h2('2.2 What Every Major Player Gets Wrong'),
  spacer(),
  makeTable(
    ['Company', 'Approach', 'Why It Fails'],
    [
      ['Apple Intelligence', 'AI features added to existing macOS/iOS', 'Augmentation, not transformation. Siri overhaul delayed to 2026. Will never expose kernel-level AI control.'],
      ['Microsoft Copilot', 'AI sidebar embedded in Windows', 'CEO admitted it "doesn\'t really work." Scaling back. Copilot is a widget, not an OS paradigm.'],
      ['Google Aluminium OS', 'Android/ChromeOS merge with Gemini', 'Delayed to 2028. Two years away. Consumer-focused walled garden.'],
      ['OpenAI + Jony Ive', 'Custom hardware + AI OS', 'Hardware delayed to 2027. No OS shipped. $6.4B acquisition of io with nothing to show.'],
      ['Humane AI Pin', 'Dedicated AI hardware device', 'Dead. Devices bricked Feb 2025. Acquired by HP for $116M (from $230M raised). Complete failure.'],
      ['Rabbit R1', 'AI-native device OS', 'Niche hardware ($199). LAM concept failed. Pivoting to "Creations" (vibe coding). Still hardware-locked.'],
      ['MCP (Anthropic)', 'Universal tool protocol', '55,000 tokens for GitHub tools alone. CLI is 35x more token-efficient. Protocol overhead defeats the purpose.'],
    ]
  ),
  spacer(),

  h2('2.3 The Unix Insight'),
  para([
    { text: 'The answer has existed since 1969. ', bold: true },
    { text: 'Unix philosophy: small tools that do one thing well, connected by text streams. Every AI model already knows how to use command-line tools \u2014 they were trained on billions of lines of shell commands in documentation, Stack Overflow, GitHub, and man pages.' },
  ]),
  spacer(),
  para([
    { text: 'Independent benchmarks confirm this: ', bold: true },
    { text: 'CLI tools achieve 35x token reduction vs MCP, 33% better efficiency scores, 28% higher task completion rates, and 95% context window preservation (vs 64% for MCP). The data is clear: the command line is the optimal interface between AI and computers.' },
  ]),
  pageBreak(),
);

// ─── 3. THE SOLUTION ──────────────────────────────────────
sections.push(
  h1('3. The Solution: JerikoOS'),
  spacer(),
  para('JerikoOS is an operating system where the AI is not a feature \u2014 it IS the interface. Built on the Linux kernel, with a Rust system daemon providing kernel-level access, and the Jeriko CLI toolkit providing 46+ commands for machine control.'),
  spacer(),

  h2('3.1 How It Works'),
  para('The user boots their computer. There is no login screen, no desktop, no taskbar. A fullscreen interface appears:'),
  spacer(),
  para('"What do you need?"', { bold: true, align: AlignmentType.CENTER }),
  spacer(),
  para('The user speaks or types. Jeriko executes. Examples:'),
  spacer(),
  bullet('"Show me what\'s using my CPU" \u2192 eBPF instant per-process breakdown with history'),
  bullet('"Block Chrome from the network" \u2192 nftables/XDP rule applied at kernel level'),
  bullet('"Build me a portfolio website" \u2192 scaffolds project, writes code, deploys to Vercel'),
  bullet('"Send John the quarterly report" \u2192 finds contact, attaches file, sends via email'),
  bullet('"Call Mom and tell her I\'m running late" \u2192 Twilio voice call with TTS'),
  bullet('"What was eating my battery yesterday at 3pm?" \u2192 eBPF historical trace, instant answer'),
  bullet('"Record my screen for the last 30 seconds" \u2192 compositor-level frame buffer rewind'),
  spacer(),

  h2('3.2 Architecture Overview'),
  spacer(),
  para('Layer 1: Linux Kernel (unmodified)', { bold: true }),
  bullet('Standard Linux kernel with eBPF support'),
  bullet('Hardware drivers, filesystem, network stack \u2014 all stock Linux'),
  spacer(),
  para('Layer 2: JerikoOS Daemon (Rust)', { bold: true }),
  bullet('System service running as PID 1 (or managed by systemd)'),
  bullet('HTTP/WebSocket server for UI and multi-machine'),
  bullet('eBPF programs for real-time system observability'),
  bullet('Namespace/cgroup/seccomp enforcement for plugin sandboxing'),
  bullet('AI router (Claude, OpenAI, local models)'),
  bullet('Trigger engine (cron, webhook, email, HTTP monitor, file watch)'),
  spacer(),
  para('Layer 3: Web UI (React)', { bold: true }),
  bullet('Fullscreen kiosk browser \u2014 the "desktop" IS a web app'),
  bullet('Dashboard, settings, chat, terminal, file browser, plugin manager'),
  bullet('Responsive \u2014 works on desktop, tablet, phone'),
  spacer(),
  para('Layer 4: CLI Commands (46+)', { bold: true }),
  bullet('Unchanged Jeriko commands, callable by the daemon or directly'),
  bullet('Gradually migrated from Node.js to Rust for performance'),
  pageBreak(),
);

// ─── 4. MARKET ANALYSIS ──────────────────────────────────
sections.push(
  h1('4. Market Analysis'),
  spacer(),

  h2('4.1 Total Addressable Market'),
  spacer(),
  makeTable(
    ['Market', '2025 Size', '2030 Projection', 'CAGR'],
    [
      ['Operating Systems', '$61.25B', '$110.2B (2035)', '7.0%'],
      ['AI Infrastructure', '$72B', '$223.5B', '30.4%'],
      ['AI OS Platforms', '$14.89B', '$35.74B', '19.1%'],
      ['AI Developer Tools', '$4.5B', '$10B', '17.3%'],
      ['Agentic AI', '$7.84B', '$52.62B', '46.3%'],
      ['Software Dev Tools', '$6.41B', '$13.7B', '16.4%'],
    ]
  ),
  spacer(),

  h2('4.2 Market Dynamics'),
  bullet([{ text: 'AI startup funding (2025): ', bold: true }, { text: '$150B total \u2014 40%+ of all global venture capital' }]),
  bullet([{ text: 'Developer population: ', bold: true }, { text: '27-47 million globally' }]),
  bullet([{ text: 'AI-augmented development value: ', bold: true }, { text: '$3 trillion/year (a16z estimate)' }]),
  bullet([{ text: 'Agent-based automation: ', bold: true }, { text: '240% growth across sectors (Gartner)' }]),
  bullet([{ text: 'Productivity gap: ', bold: true }, { text: '4-to-1 between AI-native and non-AI companies by 2027 (McKinsey)' }]),
  bullet([{ text: 'Cursor (reference): ', bold: true }, { text: '$500M ARR at ~$10B valuation in 15 months \u2014 AI developer tools are proven to generate massive returns' }]),
  spacer(),

  h2('4.3 The CLI > MCP Trend'),
  para('Independent benchmarks published in February 2026 validate JerikoOS\'s core thesis:'),
  spacer(),
  makeTable(
    ['Metric', 'CLI', 'MCP', 'Advantage'],
    [
      ['Token usage (same task)', '~1,500', '~55,000', '35x reduction'],
      ['Efficiency score', '202', '152', '33% better'],
      ['Task completion rate', '94%', '66%', '28% higher'],
      ['Context preservation', '95% (121K/128K)', '64% (82K/128K)', '48% more headroom'],
    ]
  ),
  spacer(),
  para('The industry narrative is shifting: "CLI is the New MCP for AI Agents" (OneUptime, Feb 2026). JerikoOS is positioned at the center of this shift.'),
  pageBreak(),
);

// ─── 5. COMPETITIVE LANDSCAPE ─────────────────────────────
sections.push(
  h1('5. Competitive Landscape'),
  spacer(),
  para('Every major technology company is investing in AI integration with operating systems. None have shipped an AI-native OS. Here is the complete landscape as of February 2026:'),
  spacer(),

  h2('5.1 Big Tech'),
  spacer(),
  makeTable(
    ['Company', 'Project', 'Status', 'Threat Level'],
    [
      ['Apple', 'Apple Intelligence', 'Shipping (Siri overhaul delayed to Spring 2026)', 'Low \u2014 augments existing OS, will never expose kernel-level AI access'],
      ['Microsoft', 'Windows Copilot', 'Shipping but scaling back (CEO admitted failures)', 'Low \u2014 sidebar widget approach, not paradigm shift'],
      ['Google', 'Aluminium OS (Android/ChromeOS merge)', 'Delayed to 2028', 'Medium \u2014 real OS, but 2+ years away and consumer-focused'],
      ['OpenAI', 'AI OS + Jony Ive hardware', 'Vaporware (hardware delayed to 2027)', 'Medium \u2014 brand power, but no product and massive execution risk'],
    ]
  ),
  spacer(),

  h2('5.2 Startups & Hardware'),
  spacer(),
  makeTable(
    ['Company', 'Product', 'Status', 'Threat Level'],
    [
      ['Humane', 'AI Pin (CosmOS)', 'Dead \u2014 devices bricked Feb 2025, acquired by HP for $116M', 'None'],
      ['Rabbit', 'R1 (RabbitOS)', 'Active but niche \u2014 $199 hardware device, pivoted from LAM', 'None \u2014 hardware-locked'],
      ['Commotion/Tata', 'Enterprise AI OS', 'Launched Feb 2026 \u2014 enterprise SaaS, not real OS', 'None \u2014 different market'],
      ['Red Hat', 'Standard AI OS (llm-d)', 'In development \u2014 Kubernetes AI inference infra', 'None \u2014 infrastructure layer'],
    ]
  ),
  spacer(),

  h2('5.3 Open Source'),
  spacer(),
  makeTable(
    ['Project', 'Stars', 'Description', 'Threat Level'],
    [
      ['AIOS (agiresearch)', '4,100', 'LLM Agent OS \u2014 scheduling, memory mgmt for agents', 'Low \u2014 academic research, not product'],
      ['Bytebot', '2,000', 'Containerized Linux desktop for AI agents', 'Low \u2014 requires Docker/VM, not native'],
      ['OpenDAN', '1,600', 'Personal AI OS \u2014 agent teamwork, device control', 'None \u2014 stalled at v0.5 MVP'],
      ['MemOS', '1,200', 'Memory OS for LLMs \u2014 persistent skill memory', 'None \u2014 memory layer only'],
    ]
  ),
  spacer(),

  h2('5.4 JerikoOS Differentiation'),
  para('JerikoOS occupies an empty category. Every competitor falls into one of four traps:'),
  spacer(),
  bullet([{ text: 'AI ON the OS: ', bold: true }, { text: 'Apple, Microsoft, Google \u2014 bolting AI onto existing paradigms' }]),
  bullet([{ text: 'Hardware lock-in: ', bold: true }, { text: 'Humane, Rabbit \u2014 proprietary devices running Android underneath' }]),
  bullet([{ text: 'Enterprise SaaS: ', bold: true }, { text: 'Commotion, Red Hat \u2014 calling platforms "AI OS" for marketing' }]),
  bullet([{ text: 'Vaporware: ', bold: true }, { text: 'OpenAI \u2014 announced but years from shipping' }]),
  spacer(),
  para([
    { text: 'JerikoOS is AI AS the OS. ', bold: true },
    { text: 'No desktop. No icons. The AI controls the machine at the kernel level. It runs on commodity hardware (any x86/ARM Linux machine). It uses any AI model (zero vendor lock-in). And the foundation \u2014 46 working commands \u2014 already exists.' },
  ]),
  pageBreak(),
);

// ─── 6. WHAT EXISTS TODAY ─────────────────────────────────
sections.push(
  h1('6. What Exists Today: Jeriko v1.0'),
  spacer(),
  para('Jeriko is not a concept. It is a working product with 46 commands, a plugin system, trigger engine, multi-machine support, and 4 AI backends. It is the foundation on which JerikoOS is built.'),
  spacer(),

  h2('6.1 Command Coverage (46 Commands)'),
  spacer(),
  makeTable(
    ['Category', 'Commands', 'Count'],
    [
      ['System & Shell', 'sys, proc, exec, net', '4'],
      ['Files & Documents', 'fs, doc', '2'],
      ['Browser & Search', 'browse, search, screenshot', '3'],
      ['Desktop (macOS)', 'window, open, clipboard', '3'],
      ['Communication', 'notify, email, mail, msg, twilio', '5'],
      ['macOS Native', 'notes, remind, calendar, contacts, music, audio', '6'],
      ['Media & Location', 'camera, location', '2'],
      ['AI & Code', 'ai, code, chat, parallel', '4'],
      ['Project Scaffolding', 'create', '1'],
      ['Payments & APIs', 'stripe, x (Twitter)', '2'],
      ['Cloud & DevOps', 'github, vercel', '2'],
      ['Cloud Storage', 'gdrive, onedrive', '2'],
      ['Server & Plugins', 'server, install, uninstall, trust, plugin', '5'],
      ['Memory & Discovery', 'memory, discover, prompt, init', '4'],
      ['', 'TOTAL', '46'],
    ]
  ),
  spacer(),

  h2('6.2 Technical Stack'),
  bullet([{ text: 'Runtime: ', bold: true }, { text: 'Node.js 18+ (46 CLI commands + Express server)' }]),
  bullet([{ text: 'Dependencies: ', bold: true }, { text: '15 npm packages (minimal footprint)' }]),
  bullet([{ text: 'AI Backends: ', bold: true }, { text: 'Claude Code CLI, Anthropic API, OpenAI API, Local (Ollama/LM Studio/vLLM)' }]),
  bullet([{ text: 'Messaging: ', bold: true }, { text: 'Telegram (Telegraf), WhatsApp (Baileys)' }]),
  bullet([{ text: 'Triggers: ', bold: true }, { text: '5 types \u2014 cron, webhook, email (IMAP), HTTP monitor, file watch' }]),
  bullet([{ text: 'Multi-machine: ', bold: true }, { text: 'WebSocket hub \u2192 remote agents, HMAC-SHA256 auth, 30s heartbeat' }]),
  bullet([{ text: 'Plugins: ', bold: true }, { text: 'npm-based, manifest validation, trust model, env isolation, SHA-512 integrity, audit logging' }]),
  bullet([{ text: 'Output: ', bold: true }, { text: 'JSON (default) / text (AI-optimized, 30% fewer tokens) / logfmt' }]),
  bullet([{ text: 'Platforms: ', bold: true }, { text: 'macOS (full), Linux (core), Windows (via WSL)' }]),
  bullet([{ text: 'License: ', bold: true }, { text: 'MIT \u2014 Etheon' }]),
  spacer(),

  h2('6.3 What This Means'),
  para('Jeriko v1.0 is approximately 30% of JerikoOS. The command layer, AI routing, plugin system, trigger engine, and multi-machine orchestration are built and working. What remains is the system daemon (kernel integration) and the boot/UI layer.'),
  pageBreak(),
);

// ─── 7. TECHNICAL ARCHITECTURE ────────────────────────────
sections.push(
  h1('7. Technical Architecture: From CLI to OS'),
  spacer(),

  h2('7.1 Current Architecture (Node.js)'),
  spacer(),
  para('Three-layer design:'),
  bullet([{ text: 'Layer 1 \u2014 CLI Commands: ', bold: true }, { text: '46 independent executables (bin/jeriko-*). Run and exit. No server needed.' }]),
  bullet([{ text: 'Layer 2 \u2014 Tool Libraries: ', bold: true }, { text: 'Reusable functions (tools/*.js). Used by both CLI and Telegram bot.' }]),
  bullet([{ text: 'Layer 3 \u2014 Orchestration: ', bold: true }, { text: 'Express server + WebSocket + Telegram + WhatsApp + triggers. Always-on daemon.' }]),
  spacer(),

  h2('7.2 Target Architecture (JerikoOS)'),
  spacer(),
  para('Four-layer design:'),
  spacer(),
  para('Layer 1: Linux Kernel (unmodified)', { bold: true }),
  bullet('Standard Linux kernel with eBPF, namespaces, cgroups, seccomp support'),
  bullet('No kernel patches required \u2014 all JerikoOS features use standard kernel APIs'),
  spacer(),
  para('Layer 2: Rust Daemon (replaces Node.js server)', { bold: true }),
  bullet('Single static binary \u2014 no runtime dependencies'),
  bullet('HTTP/WebSocket server (axum/hyper)'),
  bullet('eBPF programs via aya crate'),
  bullet('Namespace/cgroup manager for plugin sandboxing'),
  bullet('AI router with streaming support'),
  bullet('Trigger engine with kernel-level hooks'),
  bullet('Memory: ~2-5MB idle (vs 50-100MB for Node.js)'),
  bullet('Startup: ~5ms (vs ~300ms for Node.js)'),
  spacer(),
  para('Layer 3: Web UI (React/Next.js)', { bold: true }),
  bullet('Served by the daemon on localhost'),
  bullet('Fullscreen kiosk mode \u2014 the "desktop"'),
  bullet('Dashboard, chat, settings, terminal, file browser, plugin manager'),
  spacer(),
  para('Layer 4: CLI Commands (gradual migration)', { bold: true }),
  bullet('Start as Node.js commands (already working)'),
  bullet('Migrate to Rust one-by-one as needed'),
  bullet('CLI remains usable independently of the daemon'),
  spacer(),

  h2('7.3 Migration Path'),
  spacer(),
  makeTable(
    ['Phase', 'Node.js', 'Rust Daemon', 'State'],
    [
      ['Today', 'Everything', 'Nothing', 'Jeriko v1.0'],
      ['Month 1-2', 'CLI commands', 'HTTP server, WebSocket, config', 'Daemon alongside Node.js'],
      ['Month 3-4', 'CLI commands', 'Telegram, triggers, AI router, eBPF', 'Daemon replaces server'],
      ['Month 5-6', 'Remaining commands', 'Full OS stack, boot, UI', 'JerikoOS v0.1'],
      ['Month 7-12', 'Migration continues', 'Commands migrate to Rust', 'JerikoOS v1.0'],
    ]
  ),
  pageBreak(),
);

// ─── 8. THE DAEMON ────────────────────────────────────────
sections.push(
  h1('8. The Daemon: Core of JerikoOS'),
  spacer(),
  para('The daemon is the single most important component. It replaces the Node.js server and becomes the bridge between the AI and the kernel.'),
  spacer(),

  h2('8.1 What It Replaces'),
  spacer(),
  makeTable(
    ['Node.js Server', 'Rust Daemon'],
    [
      ['Express HTTP server', 'axum/hyper (built-in HTTP)'],
      ['Telegram polling (telegraf)', 'Async task (reqwest + tokio)'],
      ['WhatsApp (Baileys)', 'Native WebSocket client'],
      ['Trigger engine (croner)', 'tokio timers + eBPF hooks + inotify'],
      ['WebSocket hub (ws)', 'Native WebSocket (tungstenite)'],
      ['AI router (fetch)', 'HTTP client (reqwest) to Claude/OpenAI/local'],
      ['CLI execution (child_process)', 'fork/exec directly (nix crate)'],
      ['.env config', 'OS keychain + config file'],
      ['npm plugin system', 'Native plugins (shared libs or WASM)'],
      ['50-100MB memory', '2-5MB memory'],
      ['300ms startup', '5ms startup'],
      ['Requires Node.js installed', 'Single static binary, zero deps'],
    ]
  ),
  spacer(),

  h2('8.2 What It Adds (New Capabilities)'),
  spacer(),
  para('Process & Isolation:', { bold: true }),
  bullet('Linux namespaces \u2014 PID, network, mount, user isolation per plugin'),
  bullet('cgroups \u2014 CPU, memory, I/O limits per process'),
  bullet('seccomp-bpf \u2014 syscall filtering per plugin (block exec, mount, etc.)'),
  bullet('Landlock \u2014 filesystem access control (plugin X can only read /tmp)'),
  spacer(),
  para('Kernel Observability (eBPF):', { bold: true }),
  bullet('Tracepoints \u2014 every syscall, schedule event, block I/O'),
  bullet('kprobes \u2014 hook any kernel function (file opens, socket connects)'),
  bullet('XDP/TC hooks \u2014 per-process network traffic, packet filtering'),
  bullet('LSM hooks \u2014 approve/deny file access, network connections in real-time'),
  spacer(),
  para('Filesystem:', { bold: true }),
  bullet('FUSE \u2014 virtual filesystems (e.g., ~/ai/ where files are AI-generated on read)'),
  bullet('fanotify \u2014 system-wide file event monitoring'),
  bullet('Overlayfs \u2014 layered filesystem with instant rollback'),
  spacer(),
  para('Network:', { bold: true }),
  bullet('nftables \u2014 per-application firewall rules'),
  bullet('DNS interception \u2014 resolve *.jeriko to local services'),
  bullet('TUN/TAP \u2014 virtual network interfaces for VPN/sandboxing'),
  spacer(),
  para('Hardware:', { bold: true }),
  bullet('Direct audio pipeline (ALSA/PipeWire)'),
  bullet('Direct camera access (V4L2)'),
  bullet('USB/HID device communication'),
  bullet('Input subsystem \u2014 raw keyboard/mouse events'),
  spacer(),
  para('System Integration:', { bold: true }),
  bullet('D-Bus \u2014 communicate with NetworkManager, Bluetooth, power management'),
  bullet('systemd \u2014 socket activation, watchdog, journal logging'),
  bullet('Keyring \u2014 OS-level secure credential storage (replace .env files)'),
  bullet('Polkit \u2014 fine-grained privilege escalation'),
  pageBreak(),
);

// ─── 9. KERNEL INTEGRATION & EBPF ────────────────────────
sections.push(
  h1('9. Kernel Integration & eBPF'),
  spacer(),
  para('eBPF (extended Berkeley Packet Filter) is the technology that makes JerikoOS fundamentally different from every AI assistant. It provides real-time, zero-overhead visibility into everything happening on the machine.'),
  spacer(),

  h2('9.1 eBPF Programs in JerikoOS'),
  spacer(),
  makeTable(
    ['Program', 'Hook Point', 'What It Does'],
    [
      ['process_monitor', 'tracepoint/sched_process_exec', 'Tracks every process start with args, parent, user'],
      ['process_exit', 'tracepoint/sched_process_exit', 'Tracks process termination with exit code and resource usage'],
      ['file_monitor', 'kprobe/vfs_open', 'Monitors file access system-wide (path, PID, mode)'],
      ['net_monitor', 'TC ingress/egress', 'Per-process network traffic (bytes, packets, connections)'],
      ['net_firewall', 'XDP', 'Kernel-level packet filtering by PID/app'],
      ['syscall_audit', 'tracepoint/raw_syscalls', 'Security auditing of sensitive syscalls'],
      ['dns_monitor', 'kprobe/udp_sendmsg', 'DNS query logging per process'],
      ['resource_tracker', 'perf_event', 'CPU, cache, branch prediction per process'],
    ]
  ),
  spacer(),

  h2('9.2 What This Enables'),
  spacer(),
  para('"What\'s using my bandwidth?"', { bold: true }),
  bullet('eBPF TC hook \u2192 per-process network stats \u2192 instant answer with historical data'),
  spacer(),
  para('"Block Spotify from accessing the internet"', { bold: true }),
  bullet('XDP program \u2192 drop packets by PID/cgroup \u2192 immediate enforcement'),
  spacer(),
  para('"Alert me if any process touches ~/.ssh"', { bold: true }),
  bullet('kprobe on vfs_open \u2192 path filter \u2192 Telegram notification in milliseconds'),
  spacer(),
  para('"Why was my machine slow yesterday at 3pm?"', { bold: true }),
  bullet('Historical eBPF data (ring buffer \u2192 persistent storage) \u2192 CPU/memory/disk/net per-process timeline'),
  spacer(),

  h2('9.3 Implementation: aya (Rust eBPF)'),
  para('JerikoOS uses the aya crate \u2014 a pure Rust eBPF library with no dependency on libbpf or bcc. This means:'),
  bullet('eBPF programs compiled to BPF bytecode at build time'),
  bullet('Loaded into kernel at daemon startup'),
  bullet('Data shared via BPF maps (ring buffers, hash maps, LRU caches)'),
  bullet('User-space daemon reads events via async polling (tokio)'),
  bullet('Overhead: <3% CPU (confirmed by AgentSight benchmarks)'),
  pageBreak(),
);

// ─── 10. SECURITY ARCHITECTURE ────────────────────────────
sections.push(
  h1('10. Security Architecture'),
  spacer(),
  para('An AI with kernel-level access requires the most rigorous security model in the industry. JerikoOS implements defense in depth across 5 layers.'),
  spacer(),

  h2('10.1 Current Security (Jeriko v1.0)'),
  bullet('Mandatory NODE_AUTH_SECRET (fails if unset)'),
  bullet('HMAC-SHA256 token authentication with timing-safe comparison'),
  bullet('Telegram admin allowlist (ADMIN_TELEGRAM_IDS)'),
  bullet('Environment variable stripping (SENSITIVE_KEYS array)'),
  bullet('AppleScript injection prevention (escapeAppleScript)'),
  bullet('Plugin env isolation (SAFE_ENV + declared vars only)'),
  bullet('Plugin trust model (untrusted by default)'),
  bullet('SHA-512 manifest integrity hashing'),
  bullet('Append-only audit log with auto-rotation (2MB)'),
  bullet('Rate limiting (120 req/min)'),
  bullet('Webhook signature verification (fail-closed)'),
  spacer(),

  h2('10.2 JerikoOS Security (Daemon)'),
  spacer(),
  para('Level 1: Application Security', { bold: true }),
  bullet('Input validation on all AI-generated commands'),
  bullet('Output sanitization (prevent prompt injection via tool results)'),
  bullet('Command allowlist/blocklist per security profile'),
  bullet('Rate limiting per user, per plugin, per command'),
  spacer(),
  para('Level 2: OS-Level Isolation (Namespaces + cgroups)', { bold: true }),
  bullet('Each plugin runs in its own namespace (PID, network, mount, user)'),
  bullet('cgroup resource limits prevent CPU/memory/IO abuse'),
  bullet('Plugins cannot see each other\'s processes or network connections'),
  bullet('Mount namespace: plugins get a restricted filesystem view'),
  spacer(),
  para('Level 3: Syscall Filtering (seccomp-bpf + Landlock)', { bold: true }),
  bullet('Per-plugin seccomp profiles block dangerous syscalls'),
  bullet('Landlock enforces filesystem boundaries (plugin X cannot read ~/.ssh)'),
  bullet('Blocked operations return EPERM and trigger audit log entry'),
  spacer(),
  para('Level 4: Kernel Observability (eBPF LSM)', { bold: true }),
  bullet('Real-time monitoring of all security-relevant operations'),
  bullet('LSM hooks approve/deny file access, network connections'),
  bullet('Anomaly detection: AI analyzes eBPF event stream for suspicious patterns'),
  bullet('Automatic response: isolate compromised plugin, alert user'),
  spacer(),
  para('Level 5: Credential Security', { bold: true }),
  bullet('OS keyring integration (replace .env files)'),
  bullet('Per-plugin credential isolation'),
  bullet('Token rotation with configurable TTL'),
  bullet('Zero plaintext secrets on disk'),
  spacer(),

  h2('10.3 Prompt Injection Defense'),
  para('The primary attack vector for an AI OS is prompt injection \u2014 malicious input that manipulates the AI into executing unauthorized commands.'),
  spacer(),
  bullet([{ text: 'Input sanitization: ', bold: true }, { text: 'Strip known injection patterns from user input and tool results' }]),
  bullet([{ text: 'Command classification: ', bold: true }, { text: 'Separate "safe" (read-only) from "dangerous" (write/delete/network) commands' }]),
  bullet([{ text: 'Approval gates: ', bold: true }, { text: 'Dangerous commands require explicit user confirmation (configurable)' }]),
  bullet([{ text: 'Execution manifests: ', bold: true }, { text: 'Plugins declare exactly what commands they can run; daemon enforces' }]),
  bullet([{ text: 'Audit trail: ', bold: true }, { text: 'Every AI decision logged with input, reasoning, and executed command' }]),
  pageBreak(),
);

// ─── 11. SIX-MONTH ROADMAP ───────────────────────────────
sections.push(
  h1('11. Six-Month Roadmap'),
  spacer(),

  h2('Month 1: Foundation'),
  para('Goal: Rust daemon boots, serves web UI, handles basic chat', { bold: true }),
  bullet('Set up Rust project with tokio, axum, aya, serde'),
  bullet('HTTP server serving static React app'),
  bullet('WebSocket server for real-time UI updates'),
  bullet('Configuration system (TOML config file + env vars)'),
  bullet('Basic chat UI with AI routing (Anthropic API)'),
  bullet('CI/CD pipeline (GitHub Actions, cross-compilation)'),
  bullet([{ text: 'Deliverable: ', bold: true }, { text: 'Daemon binary that starts, serves UI, routes messages to Claude' }]),
  spacer(),

  h2('Month 2: Command Integration'),
  para('Goal: All 46 commands running through daemon', { bold: true }),
  bullet('Command dispatcher in Rust (fork/exec Node.js commands)'),
  bullet('eBPF process monitoring (sched_process_exec, sched_process_exit)'),
  bullet('eBPF network monitoring (TC ingress/egress per process)'),
  bullet('Dashboard: real-time system stats from eBPF'),
  bullet('Settings UI: AI backend config, Telegram setup, env var management'),
  bullet([{ text: 'Deliverable: ', bold: true }, { text: 'Full Jeriko functionality running through Rust daemon with live system monitoring' }]),
  spacer(),

  h2('Month 3: Bootable Image'),
  para('Goal: Linux boots straight into JerikoOS', { bold: true }),
  bullet('Buildroot minimal Linux image (kernel + daemon + Chromium)'),
  bullet('Daemon as systemd service with socket activation'),
  bullet('Auto-login, kiosk mode (fullscreen Chromium \u2192 localhost:3000)'),
  bullet('Telegram/WhatsApp integration in daemon'),
  bullet('Trigger engine migrated to Rust (tokio timers, inotify)'),
  bullet('Plugin sandboxing: namespaces + cgroups for untrusted plugins'),
  bullet([{ text: 'Deliverable: ', bold: true }, { text: 'Bootable ISO that starts with "What do you need?"' }]),
  spacer(),

  h2('Month 4: Security & Isolation'),
  para('Goal: Production-grade security model', { bold: true }),
  bullet('seccomp-bpf profiles per plugin (block dangerous syscalls)'),
  bullet('Landlock filesystem restrictions per plugin'),
  bullet('eBPF LSM hooks for real-time security decisions'),
  bullet('OS keyring integration (replace .env files)'),
  bullet('Web dashboard complete: file browser, plugin manager, trigger builder'),
  bullet('Notification center in UI'),
  bullet([{ text: 'Deliverable: ', bold: true }, { text: 'Secure, sandboxed plugin execution with full dashboard' }]),
  spacer(),

  h2('Month 5: Polish & Hardware'),
  para('Goal: Runs on real hardware, OTA updates', { bold: true }),
  bullet('OTA update system (download + verify + swap root partition)'),
  bullet('Hardware testing across 5+ machines (different GPUs, WiFi chips, etc.)'),
  bullet('Network manager integration (D-Bus \u2192 NetworkManager)'),
  bullet('Bluetooth/audio/display auto-configuration'),
  bullet('Performance optimization (startup <2 seconds to interactive)'),
  bullet('Per-app firewall via eBPF XDP'),
  bullet([{ text: 'Deliverable: ', bold: true }, { text: 'Reliable OS running on commodity hardware with auto-updates' }]),
  spacer(),

  h2('Month 6: Launch Preparation'),
  para('Goal: Ready for public demo and early adopters', { bold: true }),
  bullet('Documentation: installation guide, user guide, developer guide'),
  bullet('Website: jerikoOS.dev with live demo video'),
  bullet('Installer: USB boot creator tool'),
  bullet('Security audit (internal + external review)'),
  bullet('CLI command migration: top 10 most-used commands rewritten in Rust'),
  bullet('Multi-machine: remote nodes connect to JerikoOS hub'),
  bullet([{ text: 'Deliverable: ', bold: true }, { text: 'Public alpha release with installer, docs, and demo' }]),
  pageBreak(),
);

// ─── 12. TEAM STRUCTURE ──────────────────────────────────
sections.push(
  h1('12. Team Structure (5 Engineers + Claude Code)'),
  spacer(),
  para('Each engineer works with Claude Code as an AI pair programmer, providing an estimated 3-4x productivity multiplier. Effective team capacity: 15-20 engineer equivalents.'),
  spacer(),

  h2('Engineer 1: Daemon Core (Rust)'),
  para('Owns: HTTP server, WebSocket, config system, AI router, command dispatcher', { italic: true }),
  bullet('Month 1-2: Core daemon (axum, tokio, serde, config)'),
  bullet('Month 3-4: Telegram/WhatsApp clients, trigger engine'),
  bullet('Month 5-6: Performance optimization, command migration to Rust'),
  bullet([{ text: 'Skills: ', bold: true }, { text: 'Rust, async programming, systems architecture' }]),
  spacer(),

  h2('Engineer 2: Kernel Integration (Rust + eBPF)'),
  para('Owns: eBPF programs, namespace sandboxing, security enforcement', { italic: true }),
  bullet('Month 1-2: eBPF process + network monitoring (aya crate)'),
  bullet('Month 3-4: Namespace/cgroup/seccomp plugin isolation'),
  bullet('Month 5-6: Landlock, LSM hooks, per-app firewall (XDP)'),
  bullet([{ text: 'Skills: ', bold: true }, { text: 'Rust, Linux kernel internals, eBPF, security' }]),
  spacer(),

  h2('Engineer 3: UI / Web Dashboard (React)'),
  para('Owns: Web-based control panel, chat interface, responsive design', { italic: true }),
  bullet('Month 1-2: Dashboard (system stats, chat, settings)'),
  bullet('Month 3-4: Plugin manager, trigger builder, file browser, terminal (xterm.js)'),
  bullet('Month 5-6: Themes, notifications, mobile responsive, accessibility'),
  bullet([{ text: 'Skills: ', bold: true }, { text: 'React/Next.js, WebSocket, CSS, data visualization' }]),
  spacer(),

  h2('Engineer 4: OS Image & Boot (Linux)'),
  para('Owns: Buildroot image, boot sequence, hardware support, OTA updates', { italic: true }),
  bullet('Month 1-2: Buildroot config, minimal Linux image, daemon as service'),
  bullet('Month 3-4: Kiosk boot (Chromium fullscreen), hardware testing'),
  bullet('Month 5-6: OTA updates, installer ISO, USB boot creator'),
  bullet([{ text: 'Skills: ', bold: true }, { text: 'Linux internals, Buildroot/Yocto, systemd, hardware drivers' }]),
  spacer(),

  h2('Engineer 5: Testing, DevOps & Docs'),
  para('Owns: CI/CD, test framework, security audits, documentation, website', { italic: true }),
  bullet('Month 1-2: CI/CD pipeline, test harness, integration tests'),
  bullet('Month 3-4: Security testing, fuzzing, automated hardware matrix testing'),
  bullet('Month 5-6: Documentation, website, launch video, early adopter support'),
  bullet([{ text: 'Skills: ', bold: true }, { text: 'DevOps, technical writing, security testing, community management' }]),
  spacer(),

  h2('Claude Code as Force Multiplier'),
  para('Claude Code accelerates every engineer:'),
  bullet('Writes Rust boilerplate, eBPF programs, React components from descriptions'),
  bullet('Generates tests, documentation, config files at 5x human speed'),
  bullet('Reviews code, catches bugs, suggests optimizations'),
  bullet('Handles repetitive migration work (Node.js \u2192 Rust port)'),
  bullet([{ text: 'Net effect: ', bold: true }, { text: '5 people produce at the rate of 15-20. This is what makes 6 months realistic.' }]),
  pageBreak(),
);

// ─── 13. REVENUE MODEL ───────────────────────────────────
sections.push(
  h1('13. Revenue Model'),
  spacer(),

  h2('13.1 Open Source Core (MIT License)'),
  para('Everything in JerikoOS is open source and free:'),
  bullet('Full OS image (bootable)'),
  bullet('All 46+ CLI commands'),
  bullet('Rust daemon with eBPF integration'),
  bullet('Web dashboard'),
  bullet('Plugin system'),
  bullet('Trigger engine'),
  bullet('Multi-machine support'),
  bullet('All AI backend connectors'),
  spacer(),

  h2('13.2 Revenue Streams'),
  spacer(),
  para('Stream 1: JerikoOS Pro (Subscription)', { bold: true }),
  makeTable(
    ['Feature', 'Free', 'Pro ($19/mo)', 'Team ($49/mo)'],
    [
      ['Core OS + all commands', '\u2713', '\u2713', '\u2713'],
      ['Local AI models', '\u2713', '\u2713', '\u2713'],
      ['Plugin marketplace', '\u2713', '\u2713', '\u2713'],
      ['Cloud AI backends (Claude, GPT)', '\u2014', '\u2713', '\u2713'],
      ['Cloud trigger hosting', '\u2014', '\u2713', '\u2713'],
      ['Remote machine management', '\u2014', '\u2713', '\u2713'],
      ['Priority plugin review', '\u2014', '\u2713', '\u2713'],
      ['Team shared triggers', '\u2014', '\u2014', '\u2713'],
      ['RBAC + SSO', '\u2014', '\u2014', '\u2713'],
      ['SLA + priority support', '\u2014', '\u2014', '\u2713'],
    ]
  ),
  spacer(),
  para('Stream 2: Enterprise (Custom pricing)', { bold: true }),
  bullet('On-premise deployment with dedicated support'),
  bullet('Custom plugin development'),
  bullet('Security compliance (SOC 2, ISO 27001)'),
  bullet('Fleet management (thousands of machines)'),
  bullet('Custom AI model integration'),
  spacer(),
  para('Stream 3: Plugin Marketplace (30% commission)', { bold: true }),
  bullet('Third-party developers publish paid plugins'),
  bullet('JerikoOS takes 30% commission (standard app store model)'),
  bullet('Categories: productivity, security, DevOps, IoT, media'),
  spacer(),
  para('Stream 4: Hardware Partnerships', { bold: true }),
  bullet('Pre-installed JerikoOS on partner hardware'),
  bullet('Licensing fee per device'),
  bullet('Target: mini PCs, dev workstations, edge devices, IoT gateways'),
  pageBreak(),
);

// ─── 14. GO-TO-MARKET ────────────────────────────────────
sections.push(
  h1('14. Go-to-Market Strategy'),
  spacer(),

  h2('14.1 Phase 1: Developer Community (Month 1-6)'),
  bullet('Open source on GitHub from day one'),
  bullet('Weekly progress updates (blog + X/Twitter)'),
  bullet('Hacker News launch with live demo'),
  bullet('Dev.to / Medium technical articles'),
  bullet('YouTube: "Building an AI OS in 6 months" series'),
  bullet('Discord community for early adopters'),
  bullet('Target: 5,000 GitHub stars, 500 installs'),
  spacer(),

  h2('14.2 Phase 2: Early Adopters (Month 6-12)'),
  bullet('Public alpha release with installer'),
  bullet('Conference talks (FOSDEM, KubeCon, AI Engineer Summit)'),
  bullet('Partnership with hardware makers for pre-installed JerikoOS devices'),
  bullet('Plugin marketplace launch'),
  bullet('Target: 25,000 stars, 5,000 installs, 100 paying Pro users'),
  spacer(),

  h2('14.3 Phase 3: Growth (Month 12-24)'),
  bullet('Enterprise sales team'),
  bullet('JerikoOS certification program for IT professionals'),
  bullet('International expansion (i18n)'),
  bullet('Target: 100,000 stars, 50,000 installs, 5,000 Pro users, $1M ARR'),
  spacer(),

  h2('14.4 Positioning'),
  para([
    { text: 'Tagline: ', bold: true },
    { text: '"Your computer, controlled by AI."' },
  ]),
  spacer(),
  para([
    { text: 'One-liner: ', bold: true },
    { text: 'JerikoOS is an AI-native operating system where you talk to your computer and it does what you say \u2014 at the kernel level, with any AI model, on any hardware.' },
  ]),
  pageBreak(),
);

// ─── 15. KEY METRICS ─────────────────────────────────────
sections.push(
  h1('15. Key Metrics & Milestones'),
  spacer(),

  h2('15.1 North Star Metric'),
  para([{ text: 'AI command executions per day across all JerikoOS installations.', bold: true }]),
  para('This measures real usage \u2014 people actually using AI to control their machines.'),
  spacer(),

  h2('15.2 Milestones'),
  spacer(),
  makeTable(
    ['Month', 'Milestone', 'Success Criteria'],
    [
      ['1', 'Daemon MVP', 'Rust binary serves web UI, routes to Claude API'],
      ['2', 'Full command support', 'All 46 commands callable via daemon, eBPF monitoring live'],
      ['3', 'Bootable image', 'ISO boots into JerikoOS on 3+ test machines'],
      ['4', 'Security complete', 'Plugin sandboxing via namespaces + seccomp, full dashboard'],
      ['5', 'Hardware ready', 'OTA updates, runs on 5+ hardware configs, <2s boot to interactive'],
      ['6', 'Public alpha', 'Installer, docs, website, demo video, 500+ early adopters'],
    ]
  ),
  spacer(),

  h2('15.3 Growth Targets'),
  spacer(),
  makeTable(
    ['Metric', 'Month 6', 'Month 12', 'Month 24'],
    [
      ['GitHub stars', '5,000', '25,000', '100,000'],
      ['Installs', '500', '5,000', '50,000'],
      ['Active machines', '100', '2,000', '20,000'],
      ['Pro subscribers', '0', '100', '5,000'],
      ['Commands/day', '10,000', '500,000', '10M'],
      ['Plugins published', '5', '50', '500'],
      ['ARR', '$0', '$50K', '$1M+'],
    ]
  ),
  pageBreak(),
);

// ─── 16. RISK ANALYSIS ──────────────────────────────────
sections.push(
  h1('16. Risk Analysis'),
  spacer(),
  makeTable(
    ['Risk', 'Severity', 'Probability', 'Mitigation'],
    [
      ['Security breach via AI command execution', 'Critical', 'Medium', '5-layer defense, seccomp, namespaces, eBPF LSM, audit logging, approval gates'],
      ['Prompt injection leading to unauthorized actions', 'Critical', 'High', 'Input sanitization, command classification, execution manifests, approval gates'],
      ['Hardware compatibility issues', 'High', 'High', 'Target 5 reference machines, Buildroot config, community-contributed drivers'],
      ['Rust + eBPF learning curve slows development', 'High', 'Medium', 'Claude Code accelerates Rust development, aya crate simplifies eBPF'],
      ['Big Tech ships competing AI OS', 'High', 'Low', 'Google delayed to 2028, OpenAI to 2027. Ship first, iterate fast.'],
      ['AI model quality degrades for CLI tasks', 'Medium', 'Low', 'Model-agnostic \u2014 switch backends instantly. Local models as fallback.'],
      ['Open source adoption slower than expected', 'Medium', 'Medium', 'Developer content marketing, conference talks, partnerships. Adjust timeline.'],
      ['Funding needed before revenue', 'Medium', 'High', 'Lean team (5 people), minimal infrastructure. Seek seed funding at Month 3-4.'],
      ['Plugin ecosystem fails to develop', 'Medium', 'Medium', 'Build 10+ first-party plugins, reduce friction, provide templates and docs.'],
      ['Regulatory concerns about AI OS control', 'Low', 'Low', 'Open source, transparent security model, user always has override.'],
    ]
  ),
  pageBreak(),
);

// ─── 17. FINANCIAL PROJECTIONS ───────────────────────────
sections.push(
  h1('17. Financial Projections'),
  spacer(),

  h2('17.1 Cost Structure (6-Month Build Phase)'),
  spacer(),
  makeTable(
    ['Item', 'Monthly', '6-Month Total'],
    [
      ['5 Engineers (avg $12K/mo each)', '$60,000', '$360,000'],
      ['Claude Code (5 Pro plans)', '$500', '$3,000'],
      ['Infrastructure (CI/CD, cloud testing)', '$2,000', '$12,000'],
      ['Hardware (test machines)', '$3,000 (one-time)', '$3,000'],
      ['Legal (open source, trademark)', '$2,000', '$12,000'],
      ['Miscellaneous', '$1,000', '$6,000'],
      ['TOTAL', '$68,500', '$396,000'],
    ]
  ),
  spacer(),
  para([
    { text: 'Total seed requirement: ~$400K ', bold: true },
    { text: 'for 6 months to public alpha. This is exceptionally lean for an OS project.' },
  ]),
  spacer(),

  h2('17.2 Revenue Projections'),
  spacer(),
  makeTable(
    ['', 'Year 1', 'Year 2', 'Year 3'],
    [
      ['Pro subscriptions', '$50K', '$500K', '$2M'],
      ['Team subscriptions', '$0', '$200K', '$1M'],
      ['Enterprise', '$0', '$100K', '$1M'],
      ['Plugin marketplace', '$0', '$50K', '$500K'],
      ['Hardware licensing', '$0', '$0', '$500K'],
      ['TOTAL ARR', '$50K', '$850K', '$5M'],
    ]
  ),
  spacer(),

  h2('17.3 Path to Profitability'),
  bullet('Month 6: Public alpha (no revenue)'),
  bullet('Month 9: Pro tier launches ($19/mo)'),
  bullet('Month 12: $50K ARR from early adopters'),
  bullet('Month 18: Enterprise tier + plugin marketplace'),
  bullet('Month 24: $850K ARR, approaching profitability with lean team'),
  bullet('Month 36: $5M ARR, profitable, expanding team'),
  pageBreak(),
);

// ─── 18. TECHNICAL SPECIFICATIONS ────────────────────────
sections.push(
  h1('18. Technical Specifications'),
  spacer(),

  h2('18.1 System Requirements'),
  spacer(),
  makeTable(
    ['Component', 'Minimum', 'Recommended'],
    [
      ['CPU', 'x86_64 or ARM64, 2 cores', '4+ cores'],
      ['RAM', '2 GB', '8 GB'],
      ['Storage', '8 GB', '32 GB SSD'],
      ['Network', 'Ethernet or WiFi', 'Both'],
      ['GPU', 'Not required', 'For local AI models (CUDA/ROCm)'],
      ['Kernel', 'Linux 5.15+', 'Linux 6.1+ (eBPF improvements)'],
    ]
  ),
  spacer(),

  h2('18.2 Daemon Binary Specification'),
  spacer(),
  makeTable(
    ['Property', 'Value'],
    [
      ['Language', 'Rust (2024 edition)'],
      ['Async runtime', 'tokio'],
      ['HTTP framework', 'axum'],
      ['eBPF library', 'aya'],
      ['WebSocket', 'tungstenite'],
      ['HTTP client', 'reqwest'],
      ['Config format', 'TOML'],
      ['Binary size', '~15-25 MB (static, musl)'],
      ['Memory idle', '2-5 MB'],
      ['Startup time', '<5ms'],
      ['Cross-compilation', 'x86_64-unknown-linux-musl, aarch64-unknown-linux-musl'],
    ]
  ),
  spacer(),

  h2('18.3 Supported AI Backends'),
  spacer(),
  makeTable(
    ['Backend', 'Protocol', 'Default Model', 'Notes'],
    [
      ['Anthropic Claude', 'REST API (streaming)', 'claude-sonnet-4', 'Production recommended'],
      ['OpenAI GPT', 'REST API (streaming)', 'gpt-4o', 'Full tool/function calling'],
      ['Claude Code CLI', 'Subprocess (spawn)', 'claude-sonnet-4', 'Development mode'],
      ['Local (Ollama)', 'OpenAI-compatible REST', 'llama3.2', 'Offline capable'],
      ['Local (LM Studio)', 'OpenAI-compatible REST', 'Any GGUF model', 'GUI-based'],
      ['Local (vLLM)', 'OpenAI-compatible REST', 'Any HF model', 'Production serving'],
    ]
  ),
  spacer(),

  h2('18.4 Environment Variables'),
  spacer(),
  makeTable(
    ['Variable', 'Required', 'Description'],
    [
      ['AI_BACKEND', 'Yes', 'claude-code | claude | openai | local'],
      ['ANTHROPIC_API_KEY', 'If claude', 'Anthropic API key'],
      ['OPENAI_API_KEY', 'If openai', 'OpenAI API key'],
      ['LOCAL_MODEL_URL', 'If local', 'OpenAI-compatible endpoint URL'],
      ['LOCAL_MODEL', 'If local', 'Model name (e.g., llama3.2)'],
      ['TELEGRAM_BOT_TOKEN', 'For Telegram', 'Telegram Bot API token'],
      ['ADMIN_TELEGRAM_IDS', 'For Telegram', 'Comma-separated admin user IDs'],
      ['NODE_AUTH_SECRET', 'Yes', 'HMAC secret for auth (must be strong)'],
      ['JERIKO_PORT', 'No', 'Daemon HTTP port (default: 7741)'],
      ['STRIPE_SECRET_KEY', 'For payments', 'Stripe API secret key'],
      ['TWILIO_ACCOUNT_SID', 'For calls/SMS', 'Twilio account SID'],
      ['TWILIO_AUTH_TOKEN', 'For calls/SMS', 'Twilio auth token'],
      ['TWILIO_PHONE_NUMBER', 'For calls/SMS', 'Twilio phone number'],
      ['X_BEARER_TOKEN', 'For Twitter', 'X.com API bearer token'],
      ['GITHUB_TOKEN', 'For GitHub', 'GitHub personal access token'],
      ['VERCEL_TOKEN', 'For deploy', 'Vercel API token'],
    ]
  ),
  pageBreak(),
);

// ─── 19. APPENDIX ────────────────────────────────────────
sections.push(
  h1('19. Appendix'),
  spacer(),

  h2('A. Full Command Reference'),
  para('See docs/COMMANDS.md for complete documentation of all 46 commands with flags, examples, and output samples.'),
  spacer(),

  h2('B. Plugin Specification'),
  para('See docs/PLUGIN-SPEC.md for the formal plugin manifest schema, security model, and development guide.'),
  spacer(),

  h2('C. API Reference'),
  para('See docs/API.md for all HTTP endpoints, WebSocket protocol, and Telegram bot commands.'),
  spacer(),

  h2('D. Security Documentation'),
  para('See docs/SECURITY.md for the complete security architecture, threat model, and hardening guide.'),
  spacer(),

  h2('E. Multi-Machine Setup'),
  para('See docs/MULTI-MACHINE.md for hub/node architecture, agent deployment, and WebSocket protocol.'),
  spacer(),

  h2('F. Architecture Deep Dive'),
  para('See docs/ARCHITECTURE.md for detailed system design, data flow diagrams, and component interactions.'),
  spacer(),

  h2('G. Competitive Analysis Sources'),
  bullet('OpenAI hardware: 9to5Mac (Jan/Feb 2026)'),
  bullet('Humane shutdown: TechCrunch, Tom\'s Guide (Feb 2025)'),
  bullet('Microsoft Copilot failures: WindowsLatest, PPC Land (Jan/Feb 2026)'),
  bullet('Google Aluminium OS: Chrome Unboxed, BGR (2025-2026)'),
  bullet('CLI > MCP benchmarks: OneUptime, Jannik Reinhard (Feb 2026)'),
  bullet('AIOS: GitHub agiresearch/AIOS, ICLR 2025'),
  bullet('Market data: Grand View Research, Virtue Market Research, Crunchbase, a16z'),
  spacer(),

  h2('H. Open Source Repositories'),
  bullet('Jeriko: github.com/khaleel737/Jeriko'),
  bullet('Website: Jeriko.vercel.app'),
  spacer(),
  spacer(),
  para('\u2014 End of Document \u2014', { align: AlignmentType.CENTER, bold: true }),
);

// ── Build Document ────────────────────────────────────────
const doc = new Document({
  creator: 'Etheon',
  title: 'JerikoOS \u2014 Business & Technical Plan',
  description: "The World's First AI-Native Operating System",
  styles: {
    default: {
      document: {
        run: { font: 'Helvetica', size: 24 },
        paragraph: { spacing: { line: 276 } },
      },
      heading1: {
        run: { font: 'Helvetica', size: 36, bold: true, color: '1a1a2e' },
        paragraph: { spacing: { before: 360, after: 200 } },
      },
      heading2: {
        run: { font: 'Helvetica', size: 28, bold: true, color: '333333' },
        paragraph: { spacing: { before: 240, after: 120 } },
      },
      heading3: {
        run: { font: 'Helvetica', size: 24, bold: true, color: '555555' },
        paragraph: { spacing: { before: 200, after: 100 } },
      },
    },
  },
  sections: [{
    properties: {
      page: {
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    children: sections,
  }],
});

// ── Write to Desktop ──────────────────────────────────────
(async () => {
  const buf = await Packer.toBuffer(doc);
  const out = path.join(process.env.HOME, 'Desktop', 'JerikoOS-Business-Technical-Plan.docx');
  fs.writeFileSync(out, buf);
  console.log(`Written: ${out} (${(buf.length / 1024).toFixed(0)} KB)`);
})();
