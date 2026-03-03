# Jeriko — Monetization Strategy

## The Market Right Now

| Product | Model | Free Tier | Paid | What They Gate |
|---------|-------|-----------|------|----------------|
| **Claude Code** | Subscription | No | $20–$200/mo | Usage caps (messages/5hr window) |
| **Cursor** | Subscription | Limited | $20–$200/mo | Agent requests, fast model access |
| **Windsurf** | Subscription | Limited | $15/mo | Credits, model tier |
| **Replit** | Credits | Yes (daily caps) | $20–$100/mo | Agent credits, concurrent tasks, deploy |
| **Devin** | Usage (ACU) | No | $20/mo + $2.25/ACU | Compute units per task |
| **Manus** | Credits | No | $39–$199/mo | Credits, concurrent tasks, scheduled tasks |
| **Lovable** | Credits | 5/day | $25–$50/mo | Monthly credits, custom domains, teams |
| **Bolt.new** | Tokens | 1M tokens/mo | $25/mo | Tokens, daily limits, branding removal |
| **OpenCode** | Free (BYOK) | Unlimited | $0 | Nothing — user pays own API keys |
| **OpenClaw** | Free (BYOK) | Unlimited | $0 | Nothing — user pays own infra |
| **Aider** | Free (BYOK) | Unlimited | $0 | Nothing — user pays own API keys |

**Two camps:**
1. **Closed platforms** (Claude Code, Cursor, Replit, Devin, Manus) — control the model, charge for access
2. **Open BYOK** (OpenCode, OpenClaw, Aider) — free tool, user brings their own API keys

OpenClaw proved users will flock to free. But nobody's figured out how to monetize open BYOK tools — OpenClaw's creator literally said "it's a hobby project" and startups are scrambling to build paid wrappers around it.

---

## Jeriko's Position

Jeriko is BYOK but has something OpenCode/OpenClaw/Aider don't: **platform features** (channels, connectors, triggers, templates, skills, browser, sharing). These are the monetization surface.

**Don't gate the agent. Gate the automation.**

The agent loop (chat, tools, models, skills, channels, projects, browser, sub-agents) stays free forever. Completely free. Genuinely powerful. People will use it daily and tell others.

The automation layer — **connectors** (Stripe, GitHub, Gmail, etc.) and **triggers** (cron, webhook, file, HTTP, email) — that's where "playing with AI" becomes "running my business." That's the upgrade.

---

## Pricing Model: Two Gates

### Free (Jeriko Community)

A complete AI agent platform. No time limits. No credits. No crippling.

| Feature | Free |
|---------|------|
| AI agent (chat, all 15 tools) | **Unlimited** |
| Models (BYOK — any provider) | **Unlimited** |
| Sessions + sharing | **Unlimited** |
| Skills | **Unlimited** |
| Channels (Telegram, WhatsApp, Slack, Discord) | **All 4** |
| Web projects (create/dev/deploy) | **Unlimited** |
| Templates (all 34+) | **Unlimited** |
| Sub-agents (delegate + parallel fanOut) | **Unlimited** |
| Browser automation | **Unlimited** |
| CLI + daemon | **Full access** |
| Open source core | **Yes** |
| **Connectors** (Stripe, GitHub, Gmail, etc.) | **2 active** |
| **Triggers** (cron, webhook, file, HTTP, email) | **3 active** |

**Why this works:** The free tier is genuinely powerful — unlimited agent, unlimited skills, all 4 channels, unlimited projects, parallel sub-agents. Nobody can call this a demo. Users will adopt it, love it, and tell others.

The only limits are connectors (2 of 10) and triggers (3). A solo developer picks GitHub + Stripe, sets up 3 cron jobs, and they're productive. They hit the wall only when they want to connect Gmail + Twilio + PayPal + Vercel and set up 10 automated workflows. That's the "I'm running a business" moment. That's the upgrade.

### Pro ($19/mo)

For people who automate their life.

| Feature | Pro |
|---------|-----|
| Everything in Free | ✓ |
| **Connectors** | **All 10** |
| **Triggers** | **Unlimited** |

Two lines. That's the entire upgrade. Clean, honest, obvious.

### Team ($49/mo per seat)

For teams sharing one Jeriko instance.

| Feature | Team |
|---------|------|
| Everything in Pro | ✓ |
| Team members (up to 10) | ✓ |
| Shared sessions + connectors | ✓ |
| Role-based access (Admin, Member, Viewer) | ✓ |
| Audit log export | ✓ |
| SSO (SAML/OIDC) | ✓ |
| Priority support | ✓ |

### Enterprise (Custom)

| Feature | Enterprise |
|---------|-----------|
| Everything in Team | ✓ |
| Unlimited seats | ✓ |
| On-premise deployment | ✓ |
| Custom connectors | ✓ |
| SLA + dedicated support | ✓ |
| Container sandboxing | ✓ |
| Compliance (SOC2, HIPAA) | ✓ |

---

## Why Not Credits/Tokens

Credits (Replit, Manus, Lovable) create anxiety. Users hate unpredictable bills. Devin's ACU model caused backlash. Bolt users complain about token burn on large projects.

Jeriko is BYOK — the user already pays for API tokens directly. Adding another credit layer on top would be double-dipping and would push users to OpenCode/OpenClaw.

**Flat tiers with feature gates** is cleaner:
- Predictable monthly cost
- No surprise bills
- No "running out of credits mid-task"
- Users understand exactly what they get
- Easy to explain: "free = 2 connectors + 3 triggers, pro = all connectors + unlimited triggers"

---

## Implementation Plan

### Phase 1: License Gate (Week 1–2)

Jeriko already has a config system and Stripe connector. Build:

1. **License key system**
   - `jeriko activate <key>` — stores key in `~/.config/jeriko/.env`
   - Key validation: call `api.jeriko.ai/v1/license/verify` (or Stripe customer portal)
   - Offline grace: validate locally for 7 days, then require check-in
   - Key fields: `tier` (free/pro/team/enterprise), `seats`, `expires_at`

2. **Feature gates in kernel.ts**
   - On boot, load license → set `tier` in KernelState
   - Gate checks at:
     - `ConnectorManager.connect()` — count active connectors vs tier limit (free: 2, pro: 10)
     - `TriggerEngine.add()` — count active triggers vs tier limit (free: 3, pro: unlimited)

3. **Stripe integration**
   - Stripe Checkout for subscriptions (already have Stripe connector)
   - Customer portal for upgrades/cancellation
   - Webhook: `customer.subscription.updated` → update license
   - Products: jeriko-pro, jeriko-team (Stripe price IDs in config)

### Phase 2: Upgrade Flow (Week 2–3)

When a user hits a limit:

```
⚠ You've reached the free tier limit (2/2 connectors active).
  Upgrade to Pro for all 10 connectors: jeriko upgrade
  Or disconnect a connector: jeriko connectors disconnect <name>
```

- `jeriko upgrade` — opens Stripe Checkout in browser
- `jeriko billing` — opens Stripe customer portal
- `jeriko plan` — shows current tier + usage

Never block the user mid-task. Show the warning, let them finish, gate the next activation.

### Phase 3: Dashboard + Landing Page (Week 3–4)

- Landing page at `jeriko.ai` — pricing table, feature comparison, install CTA
- Account dashboard at `jeriko.ai/dashboard` — plan, usage, billing, team
- Build with Jeriko's own `web-static` template (dogfood)

### Phase 4: Team Features (Month 2)

- Multi-seat license keys
- Shared daemon instance (multi-user socket auth)
- Audit log export
- Role-based access in channels

---

## Revenue Projections

Conservative estimates based on comparable tools:

| Metric | Month 3 | Month 6 | Month 12 |
|--------|---------|---------|----------|
| Free users | 500 | 2,000 | 10,000 |
| Pro conversion (5%) | 25 | 100 | 500 |
| Team conversion (1%) | 5 | 20 | 100 |
| Pro MRR | $475 | $1,900 | $9,500 |
| Team MRR | $245 | $980 | $4,900 |
| **Total MRR** | **$720** | **$2,880** | **$14,400** |
| **ARR** | $8,640 | $34,560 | **$172,800** |

The 5% free-to-paid conversion is conservative (industry average for dev tools is 2–7%). The platform moat (channels, connectors, triggers) creates natural upgrade pressure that pure coding agents don't have.

---

## Competitive Advantage of This Model

| vs Competitor | Jeriko's Edge |
|--------------|---------------|
| vs Claude Code ($200/mo) | Free agent + $19/mo for platform features. 10x cheaper. |
| vs Cursor ($20–200/mo) | Not locked to one IDE. BYOK any model. |
| vs Replit ($20–100/mo) | No credit anxiety. No compute charges. |
| vs Manus ($39–199/mo) | Free tier exists. No credit burn. Open source. |
| vs Devin ($20 + ACU) | No per-task charges. Predictable monthly. |
| vs OpenCode (free) | Same BYOK model, but Jeriko has platform features worth paying for. |
| vs OpenClaw (free) | Same free core, but Jeriko has built-in monetization via platform tier. |

**The pitch:** "Free AI agent — unlimited everything. Pay $19/mo only when you need full automation: all 10 connectors + unlimited triggers."

---

## What to Build First

```
Week 1:  License key verification + tier storage in config
Week 1:  Feature gates in ConnectorManager + TriggerEngine (2 if-checks)
Week 2:  Stripe Checkout + webhook for subscription management
Week 2:  jeriko upgrade / jeriko billing / jeriko plan commands
Week 3:  Landing page with pricing at jeriko.ai
Month 2: Team features (multi-seat, shared sessions, audit export)
```

Only two gates to implement — connector count and trigger count. The Stripe connector already exists. The config system already exists. The kernel boot sequence already loads config. This is a 2–3 week project to first revenue.

---

## Sources

- [Replit Pricing](https://replit.com/pricing)
- [Manus Pricing](https://manus.im/pricing)
- [Devin Pricing — $20/mo + ACU](https://venturebeat.com/programming-development/devin-2-0-is-here-cognition-slashes-price-of-ai-software-engineer-to-20-per-month-from-500/)
- [Lovable Pricing](https://www.superblocks.com/blog/lovable-dev-pricing)
- [Bolt.new Pricing](https://www.nocode.mba/articles/bolt-vs-lovable-pricing)
- [Claude Code Pricing — $20–200/mo](https://www.heyuan110.com/posts/ai/2026-02-25-claude-code-pricing/)
- [OpenClaw Monetization Challenges](https://getlago.substack.com/p/can-anyone-actually-monetize-openclaw)
- [AI Pricing Playbook — Bessemer](https://www.bvp.com/atlas/the-ai-pricing-and-monetization-playbook)
- [2026 Guide to AI Pricing Models](https://www.getmonetizely.com/blogs/the-2026-guide-to-saas-ai-and-agentic-pricing-models)
