# ADR-004: Connector Expansion Strategy — Market-Driven Integration Roadmap

**Status:** DRAFT
**Date:** 2026-03-06
**Authors:** Khaleel Musleh (Etheon)
**Related:** ADR-001 (CLI), ADR-003 (Provider Gateway), `src/daemon/services/connectors/`

---

## 1. Context & Problem Statement

Jeriko currently ships 10 connectors:

| # | Connector | Category | Auth Type | OAuth |
|---|-----------|----------|-----------|-------|
| 1 | stripe | Payments | API Key + OAuth | Yes |
| 2 | paypal | Payments | Client Credentials | No |
| 3 | github | DevOps | PAT + OAuth | Yes |
| 4 | twilio | Communication | API Key (Basic) | No |
| 5 | vercel | Deployment | Token + OAuth | Yes |
| 6 | x | Social | Bearer + OAuth | Yes |
| 7 | gdrive | Storage | OAuth Bearer | Yes |
| 8 | onedrive | Storage | OAuth Bearer | Yes |
| 9 | gmail | Email | OAuth Bearer | Yes |
| 10 | outlook | Email | OAuth Bearer | Yes |

**Competitive gap:** AI agent platforms (Composio: 850+, n8n: 1000+, Zapier: 8000+) offer
orders of magnitude more integrations. Manus (direct competitor) is early (~5 connectors),
giving us a first-mover window. But key high-demand connectors are completely absent from
Jeriko: Slack, Notion, Shopify, Salesforce, HubSpot, Google Calendar, Jira, Linear, Discord.

**The question:** Which connectors to add, in what order, and how does each addition flow
through the system?

---

## 2. System Flow Analysis — What Connectors Touch

Adding a connector is NOT just writing a connector class. Every connector propagates through
7 layers of the system. Understanding this flow is prerequisite to any expansion.

```
                    ┌─────────────────────────────────────────────┐
                    │              ADDING A CONNECTOR              │
                    └─────────────────┬───────────────────────────┘
                                      │
    ┌─────────────────────────────────┼─────────────────────────────────┐
    │                                 │                                 │
    ▼                                 ▼                                 ▼
┌──────────┐                   ┌──────────────┐                ┌──────────────┐
│ Layer 1   │                   │ Layer 2       │                │ Layer 3       │
│ SHARED    │                   │ DAEMON        │                │ CLI           │
├──────────┤                   ├──────────────┤                ├──────────────┤
│connector │◄─────────────────►│connectors/   │                │dispatcher.ts │
│.ts       │  CONNECTOR_DEFS   │  <name>/     │                │  import +    │
│          │                   │  connector.ts│                │  register    │
│          │  If OAuth:        │              │                │              │
│          │                   │registry.ts   │                │connectors.ts │
│          │                   │  FACTORIES   │                │  gateway cmd │
└──────┬───┘                   ├──────────────┤                └──────────────┘
       │                       │oauth/        │
       │                       │  providers.ts│
       │                       │  OAUTH_PROVS │
       │                       ├──────────────┤
       │                       │channels/     │
       │                       │  router.ts   │
       │                       │  /connect    │
       │                       │  /disconnect │
       │                       │  /connectors │
       │                       ├──────────────┤
       │                       │agent/tools/  │
       │                       │  connector.ts│
       │                       │  tool descr. │
       │                       ├──────────────┤
       │                       │billing/      │
       │                       │  license.ts  │
       │                       │  tier limits │
       └──────────────────────►├──────────────┤
                               │AGENT.md      │
                               │  system      │
                               │  prompt      │
                               └──────────────┘
```

### Checklist — Files modified per new connector:

**Step 1: Core Registration (3 files modified)**

| # | File | What | Required |
|---|------|------|----------|
| 1 | `src/shared/connector.ts` | Add to `CONNECTOR_DEFS[]` array | Always |
| 2 | `src/daemon/services/connectors/registry.ts` | Add to `CONNECTOR_FACTORIES{}` | Always |
| 3 | `src/daemon/services/connectors/index.ts` | Add re-export to barrel | Always |

**Step 2: Connector Implementation (1 file created)**

| # | File | What | Required |
|---|------|------|----------|
| 4 | `src/daemon/services/connectors/<name>/connector.ts` | Extend ConnectorBase or BearerConnector | Always |

**Step 3: OAuth (1 file modified, if applicable)**

| # | File | What | Required |
|---|------|------|----------|
| 5 | `src/daemon/services/oauth/providers.ts` | Add to `OAUTH_PROVIDERS[]` | If OAuth |

**Step 4: Per-Connector CLI Command (2 files)**

| # | File | What | Required |
|---|------|------|----------|
| 6 | `src/cli/commands/integrations/<name>.ts` | Thin delegate via `connectorCommand()` factory (~20 lines) | Always |
| 7 | `src/cli/dispatcher.ts` | Import + register the new CLI command | Always |

**Step 5: Agent Prompt & Tool Description (2 files modified)**

| # | File | What | Required |
|---|------|------|----------|
| 8 | `src/daemon/agent/tools/connector.ts` | Update description string + aliases | Always |
| 9 | `AGENT.md` | Update connector list in system prompt | Always |

**Step 6: Tests (3-5 files modified)**

| # | File | What | Required |
|---|------|------|----------|
| 10 | `test/unit/connectors.test.ts` | Add fixture to connector test array | Always |
| 11 | `test/unit/gmail-outlook.test.ts` | Increment `CONNECTOR_DEFS.length` check | Always |
| 12 | `test/unit/oauth.test.ts` | Increment `CONNECTOR_DEFS.length` check | If OAuth |
| 13 | `test/integration/channel-connectors.test.ts` | Increment length check, add integration test | Always |
| 14 | `test/integration/commands.test.ts` | Add CLI integration test | Always |

**Auto-Wired (NO changes needed — data-driven from CONNECTOR_DEFS):**

| File | Why no change |
|------|--------------|
| `src/daemon/services/connectors/manager.ts` | Reads from CONNECTOR_FACTORIES dynamically |
| `src/daemon/services/channels/router.ts` | /connect, /disconnect, /connectors all data-driven |
| `src/cli/commands/integrations/connectors.ts` | Unified gateway reads CONNECTOR_DEFS |
| `src/daemon/api/routes/connector.ts` | HTTP API serves all connectors via manager |
| `src/daemon/api/routes/oauth.ts` | OAuth callback generic via OAUTH_PROVIDERS |
| `src/daemon/billing/license.ts` | Uses `getConfiguredConnectorCount()` — automatic |
| `src/daemon/services/triggers/engine.ts` | Webhook dispatch by service name — generic |

**Total: 10-14 files touched per connector** (depending on OAuth + test breadth).

**Key insight:** The architecture is well-designed for expansion. The ConnectorManager,
channel router (`/connect`, `/disconnect`, `/connectors`), unified CLI gateway, HTTP API
routes, billing gates, and trigger webhook dispatch are all **data-driven** from
`CONNECTOR_DEFS` and `CONNECTOR_FACTORIES`. The per-connector CLI command is a thin
~20-line delegate via the `connectorCommand()` factory in `_connector.ts`.

---

## 3. Market Research — Demand Analysis

### Methodology

Cross-referenced data from:
- Zapier top apps (sorted by popularity — 9,277 apps ranked)
- n8n community nodes (1,500+ nodes, download statistics)
- Composio (850+ connectors, AI-agent focused)
- Paragon (130+ connectors, enterprise focus)
- StackOne AI Agent Tools Landscape 2026
- ActivePieces (450+ connectors)

### Zapier Top 10 Most Popular (by usage):
1. Google Sheets, 2. Gmail, 3. Slack, 4. Google Calendar, 5. Google Drive,
6. Notion, 7. HubSpot, 8. Google Forms, 9. Facebook Lead Ads, 10. Mailchimp

### n8n Most Demanded Categories:
WhatsApp, Telegram, Discord (messaging); OpenAI, Gemini (AI); Google Sheets,
Airtable (data); Slack, Notion (productivity); Supabase (database)

### AI Agent Platform Priorities (Composio, StackOne, Paragon):
CRM (Salesforce, HubSpot), Communication (Slack, Discord), Project Management
(Jira, Linear, Notion), HR (Workday), Service (ServiceNow, Zendesk)

### E-commerce Demand Signal:
Shopify is consistently among the top 30 most connected apps across all platforms.
BigCommerce, Magento, WooCommerce follow at lower volume but with high enterprise value.

---

## 4. Prioritized Connector Roadmap

### Scoring Criteria

Each connector scored on 5 dimensions (1-5 scale):

| Dimension | Weight | Definition |
|-----------|--------|------------|
| **Market demand** | 30% | Cross-platform popularity, community requests |
| **Agent utility** | 25% | How useful for an AI agent's daily tasks |
| **API quality** | 20% | REST, well-documented, stable, good rate limits |
| **Auth simplicity** | 15% | API key vs OAuth complexity |
| **Ecosystem synergy** | 10% | Complements existing connectors |

### Tier 1 — Critical (Wave 1: Next Release)

These are glaring omissions. Every competitor has them. Highest market demand + agent utility.

| # | Connector | Category | Score | Auth | Rationale |
|---|-----------|----------|-------|------|-----------|
| 1 | **slack** | Communication | 4.8 | OAuth2 | #3 most popular app on Zapier. Every team uses it. Agent sends notifications, reads channels, manages threads. Direct complement to gmail/outlook. |
| 2 | **notion** | Productivity | 4.7 | OAuth2 | #6 on Zapier. Knowledge base, project docs, databases. Agent reads/writes pages, queries databases. Critical for knowledge-work agents. |
| 3 | **google-calendar** | Productivity | 4.6 | OAuth2 (Google) | #4 on Zapier. Scheduling, event management. Shares Google OAuth infra with gdrive/gmail — low marginal cost. Agent books meetings, checks availability. |
| 4 | **shopify** | E-commerce | 4.5 | OAuth2 / API Key | #1 demanded e-commerce platform. Products, orders, customers, inventory. Opens entire e-commerce agent use case. |
| 5 | **hubspot** | CRM | 4.4 | OAuth2 | #7 on Zapier. Contacts, deals, companies, tickets. Opens CRM agent use case. More accessible than Salesforce (free tier, better DX). |

### Tier 2 — High Value (Wave 2)

Strong demand, clear agent utility, expands into new verticals.

| # | Connector | Category | Score | Auth | Rationale |
|---|-----------|----------|-------|------|-----------|
| 6 | **jira** | Project Mgmt | 4.2 | OAuth2 (Atlassian) | Enterprise standard for issue tracking. Agent creates/updates issues, manages sprints. High demand in dev teams. |
| 7 | **linear** | Project Mgmt | 4.1 | OAuth2 / API Key | Modern Jira alternative. Excellent API (GraphQL). Beloved by startups. Lower complexity than Jira. |
| 8 | **discord** | Communication | 4.0 | Bot Token | Massive community platform. Agent moderates, sends messages, manages server. High demand from developer/gaming communities. |
| 9 | **salesforce** | CRM | 3.9 | OAuth2 | Enterprise CRM giant. Complex API but massive market. Agent manages leads, contacts, opportunities. Opens enterprise sales use case. |
| 10 | **sendgrid** | Email Marketing | 3.8 | API Key | Transactional email at scale. Simple API key auth. Agent sends templated emails, manages contacts. Complements gmail (personal) with sendgrid (transactional). |

### Tier 3 — Strategic (Wave 3)

Expand verticals. Each opens a distinct use case category.

| # | Connector | Category | Score | Auth | Rationale |
|---|-----------|----------|-------|------|-----------|
| 11 | **google-sheets** | Data | 3.7 | OAuth2 (Google) | #1 on Zapier. Ubiquitous data store. Agent reads/writes spreadsheet data. Shares Google OAuth with calendar/drive/gmail. |
| 12 | **airtable** | Data | 3.6 | PAT / OAuth2 | Modern database-spreadsheet hybrid. Excellent REST API. Agent queries/updates records. Popular with ops teams. |
| 13 | **dropbox** | Storage | 3.5 | OAuth2 | Third cloud storage option alongside gdrive/onedrive. Broadens file management capability. |
| 14 | **mailchimp** | Marketing | 3.5 | OAuth2 / API Key | #10 on Zapier. Email campaigns, audiences, automations. Opens marketing automation agent use case. |
| 15 | **quickbooks** | Accounting | 3.4 | OAuth2 | Dominant SMB accounting platform. Invoices, expenses, reports. Opens financial management agent use case. |

### Tier 4 — Expansion (Wave 4+)

Lower immediate demand but strategically important for specific verticals.

| # | Connector | Category | Score | Auth | Rationale |
|---|-----------|----------|-------|------|-----------|
| 16 | **asana** | Project Mgmt | 3.3 | PAT / OAuth2 | Popular PM tool. Good API. Lower priority than Jira/Linear but adds breadth. |
| 17 | **trello** | Project Mgmt | 3.2 | API Key | Kanban-style PM. Simple API. Broad adoption but declining vs Linear/Notion. |
| 18 | **supabase** | Database | 3.2 | API Key | Modern Firebase alternative. REST + Realtime. Agent manages data, auth, storage. Developer favorite. |
| 19 | **zendesk** | Support | 3.1 | OAuth2 / API Key | Customer support standard. Tickets, contacts, knowledge base. Enterprise demand. |
| 20 | **wordpress** | CMS | 3.0 | App Password / OAuth | Powers 40%+ of the web. Posts, pages, media, comments. Content management agent use case. |

### Deferred — Not Recommended Now

| Connector | Reason |
|-----------|--------|
| BigCommerce | Low volume vs Shopify. Add only if Shopify succeeds. |
| Magento | Self-hosted complexity. Low API quality. Enterprise-only. |
| WooCommerce | WordPress plugin — better served via WordPress connector. |
| Zoho CRM | Third-tier CRM. HubSpot + Salesforce cover the market. |
| Pipedrive | Niche CRM. Add after HubSpot + Salesforce prove demand. |
| BambooHR / Gusto | HR is enterprise-heavy. Low individual-agent utility. |
| Instagram / TikTok / YouTube | Social APIs are highly restricted. Read-only or limited. X already covers social. |
| AWS / GCP / Azure | Cloud APIs are enormous (100s of services each). Better as skills, not connectors. |
| MongoDB / PostgreSQL | Database access is better via `exec` tool (direct CLI). Not HTTP APIs. |
| OpenAI / Anthropic | Already handled by the provider/driver system, not connectors. |

---

## 5. Implementation Architecture — Connector Patterns

### Pattern A: API Key Connector (Simplest)

Extends `ConnectorBase` directly. API key in env var. Basic auth or Bearer token.

**Examples:** sendgrid, discord (bot token), supabase, linear (API key mode)

```
class SendGridConnector extends ConnectorBase {
  readonly name = "sendgrid";
  protected readonly baseUrl = "https://api.sendgrid.com/v3";
  protected buildAuthHeader() { return `Bearer ${this.apiKey}`; }
  protected handlers() { return { "mail.send": ..., "contacts.list": ... }; }
}
```

**Touches:** CONNECTOR_DEFS + registry + connector.ts + agent tool desc + AGENT.md + tests
**Files changed:** 4 modified, 2 created (connector + test)

### Pattern B: OAuth Bearer Connector

Extends `BearerConnector`. OAuth2 with token refresh. Highest reuse from base class.

**Examples:** slack, notion, google-calendar, hubspot, jira, shopify (OAuth mode)

```
class SlackConnector extends BearerConnector {
  readonly name = "slack";
  protected readonly auth: BearerAuthConfig = {
    baseUrl: "https://slack.com/api",
    tokenVar: "SLACK_ACCESS_TOKEN",
    refreshTokenVar: "SLACK_REFRESH_TOKEN",
    clientIdVar: "SLACK_OAUTH_CLIENT_ID",
    clientSecretVar: "SLACK_OAUTH_CLIENT_SECRET",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    healthPath: "/auth.test",
    label: "Slack",
  };
  protected handlers() { return { "chat.postMessage": ..., "conversations.list": ... }; }
}
```

**Touches:** All of Pattern A + OAUTH_PROVIDERS entry
**Files changed:** 5 modified, 2 created

### Pattern C: Google Service Connector (Lowest Marginal Cost)

Extends `BearerConnector`. Shares OAuth2 infrastructure with gdrive/gmail.
User already has Google OAuth client configured — new Google services are ~free to add.

**Examples:** google-calendar, google-sheets

```
class GoogleCalendarConnector extends BearerConnector {
  readonly name = "google-calendar";
  protected readonly auth: BearerAuthConfig = {
    baseUrl: "https://www.googleapis.com/calendar/v3",
    tokenVar: "GCAL_ACCESS_TOKEN",
    // Shares GDRIVE_OAUTH_CLIENT_ID/SECRET (same Google Cloud project)
    clientIdVar: "GDRIVE_OAUTH_CLIENT_ID",
    clientSecretVar: "GDRIVE_OAUTH_CLIENT_SECRET",
    tokenUrl: "https://oauth2.googleapis.com/token",
    healthPath: "/users/me/calendarList",
    label: "Google Calendar",
  };
}
```

**Key decision:** Google services can share a single OAuth app (same client ID/secret)
with different scopes. This means adding Google Calendar is nearly zero marginal auth cost
if the user already connected Google Drive or Gmail.

### Pattern D: Complex Auth Connector

Custom auth flow (e.g., Salesforce's SOQL, Shopify's per-store URLs, Jira's Atlassian OAuth).
Extends `ConnectorBase` with custom init() and buildAuthHeader().

**Examples:** salesforce, shopify (with shop domain), jira (with cloud ID)

---

## 6. Google OAuth Consolidation (Architectural Decision)

### Current State

Three separate Google connectors, three separate OAuth apps, three separate tokens:

```
gdrive  → GDRIVE_OAUTH_CLIENT_ID  + GDRIVE_ACCESS_TOKEN
gmail   → GMAIL_OAUTH_CLIENT_ID   + GMAIL_ACCESS_TOKEN
```

### Problem

Adding google-calendar and google-sheets creates 5 separate Google OAuth entries.
Users must authorize 5 times. This is poor UX.

### Decision: Keep Separate Tokens, Allow Shared OAuth App

**Do NOT merge connectors** — they serve different domains, have different methods,
and users may want to authorize only specific scopes.

**DO allow a single OAuth client** — All Google connectors can share the same
`GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`, each requesting only its
needed scopes. Each connector still stores its own access/refresh token.

**Implementation:**
- Add `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` as fallback env vars
- Each Google connector checks its own clientIdVar first, falls back to shared
- OAuth provider entries use their own scopes but share the same authorization endpoint

This keeps the architecture clean while reducing user friction to a single Google Cloud
project setup for all Google services.

---

## 7. Agent Prompt Impact Analysis

Adding connectors affects the AGENT.md system prompt. Currently:

```
Available connectors: gmail, outlook, stripe, paypal, github, twilio, gdrive, onedrive, vercel, x
```

With 20 connectors, this line grows but remains manageable. The connector tool description
must also be updated:

```typescript
// Current (connector.ts tool)
description: "Call a configured connector API (Gmail, Stripe, GitHub, Twilio, etc.)"
name: { description: "Connector name: gmail, stripe, github, twilio, outlook, gdrive, paypal" }

// Updated — group by category for clarity
description: "Call a configured connector API. Categories: email (gmail, outlook, sendgrid), " +
  "communication (slack, discord), crm (hubspot, salesforce), ecommerce (shopify), " +
  "payments (stripe, paypal), project (jira, linear, notion), storage (gdrive, onedrive, dropbox), " +
  "devops (github, vercel), social (x), data (google-sheets, airtable), " +
  "calendar (google-calendar), sms (twilio)"
```

**Token budget consideration:** Each connector adds ~10-15 tokens to the system prompt.
20 connectors = ~200-300 extra tokens. Negligible impact (system prompt is ~4000 tokens).

---

## 8. Billing Tier Impact

Current tiers:
- **Free:** 2 connectors
- **Pro ($19.99/mo):** 10 connectors
- **Team:** unlimited
- **Enterprise:** unlimited

With 20+ connectors available, the Pro tier limit of 10 may need revisiting in the future.
**No immediate change required** — Pro users can choose their 10 most important connectors.
The free tier of 2 remains a reasonable trial.

---

## 9. Implementation Order & Phasing

### Wave 1 (Critical — Next Release)

```
slack → notion → google-calendar → shopify → hubspot
```

**Rationale:** Maximum market coverage per connector. Slack is the #1 missing integration.
Notion + Google Calendar leverage existing patterns (BearerConnector, Google OAuth).
Shopify opens e-commerce. HubSpot opens CRM. These 5 cover the top 5 missing categories.

**Estimated effort per connector:**
- Pattern B (OAuth Bearer): ~150-250 lines connector + ~80 lines test
- Pattern C (Google service): ~100-150 lines connector (lowest, shared auth)
- Total Wave 1: ~5 connectors × ~200 lines avg = ~1000 lines of focused connector code

### Wave 2 (High Value — Following Release)

```
jira → linear → discord → salesforce → sendgrid
```

### Wave 3 (Strategic — Q3)

```
google-sheets → airtable → dropbox → mailchimp → quickbooks
```

### Wave 4 (Expansion — Q4+)

```
asana → trello → supabase → zendesk → wordpress
```

---

## 10. Quality Standards per Connector

Every connector must meet this standard before merge:

### Code

- [ ] Extends ConnectorBase or BearerConnector (never raw ConnectorInterface)
- [ ] `handlers()` covers: list, get, create, update, delete for primary resources
- [ ] `aliases()` maps bare resource names to `.list` (e.g., `channels → channels.list`)
- [ ] `webhook()` with provider-specific signature verification (HMAC-SHA256 minimum)
- [ ] `parseRateLimit()` extracts rate limit headers if the API exposes them
- [ ] `buildAuthHeader()` handles the service's auth scheme
- [ ] Error messages include the service name for clear diagnostics

### Registration

- [ ] CONNECTOR_DEFS entry with all required/optional env vars
- [ ] CONNECTOR_FACTORIES entry with lazy dynamic import
- [ ] OAUTH_PROVIDERS entry (if OAuth)
- [ ] AGENT.md updated with connector name
- [ ] Connector tool description updated

### Tests

- [ ] Unit tests for all handlers (mocked HTTP) in dedicated test file
- [ ] Auth flow tested (init, token refresh if OAuth)
- [ ] Webhook verification tested (signature valid, invalid, missing)
- [ ] Health check tested
- [ ] Alias resolution tested
- [ ] Fixture added to `test/unit/connectors.test.ts` (env vars, known method, expected error)
- [ ] `CONNECTOR_DEFS.length` checks incremented in `gmail-outlook.test.ts`, `oauth.test.ts`, `channel-connectors.test.ts`

### Documentation

- [ ] AGENT.md connector list updated
- [ ] Inline JSDoc on connector class explaining auth, scopes, rate limits

---

## 11. Decision Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Expansion order | Slack → Notion → GCal → Shopify → HubSpot first | Highest demand × agent utility |
| Architecture | Extend ConnectorBase/BearerConnector | Proven pattern, 10 connectors validate it |
| Google services | Shared OAuth app, separate tokens | Reduces user friction, clean separation |
| Connector count target | 25-30 by end of 2026 | Competitive with Manus, focused vs Zapier's breadth |
| Cloud providers | Excluded (use skills/exec) | API surface too large for connector pattern |
| Databases | Excluded (use exec tool) | Direct CLI access is more flexible |
| AI providers | Excluded (use provider/driver system) | Already handled by ADR-003 architecture |
| Quality bar | Full test suite + webhook + rate limits | No "hello world" connectors |

---

## 12. Risk Analysis

| Risk | Severity | Mitigation |
|------|----------|------------|
| OAuth complexity per provider | Medium | BearerConnector handles 90% of cases |
| API rate limits varying by provider | Low | Per-connector parseRateLimit() + middleware |
| Token refresh edge cases | Medium | Mutex-guarded refreshToken() in middleware.ts |
| System prompt bloat at 30 connectors | Low | Categorized descriptions, ~300 tokens total |
| Connector maintenance burden | Medium | ConnectorBase abstracts HTTP/auth/retry |
| Breaking API changes by providers | Low | Version pinning in extraHeaders(), monitor changelogs |

---

## 13. References

- Zapier App Directory: top apps sorted by popularity (9,277 apps)
- n8n Community Nodes: 1,500+ nodes, download statistics
- Composio: 850+ connectors for AI agent platforms
- StackOne AI Agent Tools Landscape 2026
- Paragon: 130+ pre-built connectors (enterprise focus)
- Manus OpenAPI docs: ~5 connectors (Gmail, Google Calendar, Notion, Slack, Similarweb)
- ActivePieces: 450+ connectors
