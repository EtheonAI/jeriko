# Connector System Audit

Audited: 2026-03-06

## Connector Lifecycle

```
1. Registration:  CONNECTOR_FACTORIES (registry.ts) — 27 lazy factories, one per connector
2. Definition:    CONNECTOR_DEFS (shared/connector.ts) — 27 metadata entries (env vars, labels, OAuth config)
3. OAuth Config:  OAUTH_PROVIDERS (oauth/providers.ts) — 24 OAuth provider entries (auth URLs, scopes, baked IDs)
4. Baked IDs:     BAKED_OAUTH_CLIENT_IDS (shared/baked-oauth-ids.ts) — 21 build-time client IDs
5. Factory call:  ConnectorManager.get(name) or loadConnector(name) → dynamic import → new Ctor() → init()
6. Caching:       ConnectorManager caches instances in Map; subsequent get() returns cached
7. Health:        ConnectorManager.health(name) — 30s TTL cache, lazy init if needed
8. Webhook:       ConnectorManager.dispatchWebhook(name, headers, body) → connector.webhook()
9. Shutdown:      ConnectorManager.shutdownAll() — parallel shutdown of all active instances
```

## Connector Types

### API-Key Only (extend ConnectorBase directly)
| Connector    | Class               | Auth Type       | Base URL |
|-------------|---------------------|-----------------|----------|
| stripe      | StripeConnector     | Bearer (API key/OAuth) | api.stripe.com/v1 |
| paypal      | PayPalConnector     | Bearer (client_credentials) | api-m.paypal.com |
| github      | GitHubConnector     | Bearer (PAT)    | api.github.com |
| twilio      | TwilioConnector     | Basic (SID:TOKEN) | api.twilio.com |
| x           | XConnector          | Bearer + OAuth 1.0a | api.twitter.com/2 |
| vercel      | VercelConnector     | Bearer (token)  | api.vercel.com |
| sendgrid    | SendGridConnector   | Bearer (API key) | api.sendgrid.com/v3 |
| cloudflare  | CloudflareConnector | Bearer (API token) | api.cloudflare.com/client/v4 |

### OAuth2 Bearer (extend BearerConnector)
| Connector     | Class                  | Token Var                | Refresh? |
|--------------|------------------------|--------------------------|----------|
| gdrive       | GDriveConnector        | GDRIVE_ACCESS_TOKEN      | Yes |
| onedrive     | OneDriveConnector      | ONEDRIVE_ACCESS_TOKEN    | Yes |
| gmail        | GmailConnector         | GMAIL_ACCESS_TOKEN       | Yes |
| outlook      | OutlookConnector       | OUTLOOK_ACCESS_TOKEN     | Yes |
| hubspot      | HubSpotConnector       | HUBSPOT_ACCESS_TOKEN     | Yes |
| shopify      | ShopifyConnector       | SHOPIFY_ACCESS_TOKEN     | No (permanent) |
| slack        | SlackConnector         | SLACK_BOT_TOKEN          | No (permanent) |
| discord      | DiscordConnector       | DISCORD_BOT_TOKEN        | Yes |
| square       | SquareConnector        | SQUARE_ACCESS_TOKEN      | Yes |
| gitlab       | GitLabConnector        | GITLAB_ACCESS_TOKEN      | Yes |
| digitalocean | DigitalOceanConnector  | DIGITALOCEAN_ACCESS_TOKEN | Yes |
| notion       | NotionConnector        | NOTION_ACCESS_TOKEN      | No (permanent) |
| linear       | LinearConnector        | LINEAR_ACCESS_TOKEN      | No (permanent) |
| jira         | JiraConnector          | JIRA_ACCESS_TOKEN        | Yes |
| airtable     | AirtableConnector      | AIRTABLE_ACCESS_TOKEN    | Yes |
| asana        | AsanaConnector         | ASANA_ACCESS_TOKEN       | Yes |
| mailchimp    | MailchimpConnector     | MAILCHIMP_ACCESS_TOKEN   | Yes |
| dropbox      | DropboxConnector       | DROPBOX_ACCESS_TOKEN     | Yes |
| salesforce   | SalesforceConnector    | SALESFORCE_ACCESS_TOKEN  | Yes |

## Registry Entries (27 total)

All 27 connectors in CONNECTOR_FACTORIES:
stripe, paypal, github, twilio, vercel, x, gdrive, onedrive, gmail, outlook,
hubspot, shopify, slack, discord, sendgrid, square, gitlab, cloudflare,
digitalocean, notion, linear, jira, airtable, asana, mailchimp, dropbox, salesforce

## CONNECTOR_DEFS (27 entries)

All 27 match CONNECTOR_FACTORIES exactly. Each entry declares:
- name, label, description, required env vars, optional env vars
- oauth config (clientIdVar + clientSecretVar) for OAuth-capable connectors
- limitParam for pagination remapping

### OAuth-capable connectors (per CONNECTOR_DEFS.oauth): 24/27
Non-OAuth (API key only): twilio, paypal, sendgrid, cloudflare

Wait -- checking... paypal has NO oauth field in CONNECTOR_DEFS (correct, uses client_credentials grant).
sendgrid has NO oauth field (correct, API key only).
cloudflare has NO oauth field (correct, API token only).
twilio has NO oauth field (correct, SID+token only).

So 23 connectors have OAuth config in CONNECTOR_DEFS (all except twilio, paypal, sendgrid, cloudflare).

## OAUTH_PROVIDERS (24 entries)

Providers in OAUTH_PROVIDERS:
stripe, github, x, gdrive, onedrive, vercel, gmail, outlook, hubspot, shopify,
slack, discord, square, gitlab, digitalocean, notion, linear, jira, airtable,
asana, mailchimp, dropbox, salesforce

Missing from OAUTH_PROVIDERS but have oauth in CONNECTOR_DEFS: NONE
Extra in OAUTH_PROVIDERS vs CONNECTOR_DEFS oauth: stripe (has oauth in DEFS too) -- all match.

## Baked OAuth Client IDs (21 keys)

Keys in BAKED_OAUTH_CLIENT_IDS:
github, google, microsoft, x, vercel, stripe, hubspot, shopify, slack, discord,
square, gitlab, digitalocean, notion, linear, atlassian, airtable, asana,
mailchimp, dropbox, salesforce

Mapping: Multiple connectors can share a key:
- "google" -> gdrive, gmail
- "microsoft" -> onedrive, outlook
- "atlassian" -> jira

All OAUTH_PROVIDERS have a valid bakedIdKey in BAKED_OAUTH_CLIENT_IDS.

## Manager Lazy Init and Caching

- `get(name)` checks: factory exists -> isConnectorConfigured -> license gate -> init
- Deduplicates concurrent init via `initializing` Map of Promises
- Caches instances in `instances` Map
- `has(name)` is synchronous: checks factory + env config
- `require(name)` throws if unavailable

## Health Check with 30s TTL

- Default TTL: 30,000ms (configurable via constructor)
- Cache key: connector name
- Cache entry: { result: HealthResult, checkedAt: number }
- On cache miss: calls get(name) -> connector.health()
- BearerConnector overrides health() for 401-aware retry with token refresh

## Webhook Dispatch Flow

```
ConnectorManager.dispatchWebhook(name, headers, body)
  -> get(name) — lazy init if needed
  -> connector.webhook(headers, body)
  -> Returns WebhookEvent { id, source, type, data, verified, received_at }
```

ConnectorBase provides default webhook() that parses JSON and returns unverified event.
Stripe, GitHub, Vercel, Twilio, X, HubSpot, Shopify, Square override with HMAC verification.

## Tool Aliases

The `connector` agent tool (connector.ts) declares 30 aliases:
connectors, gmail, stripe, github, twilio, email_send, send_email, slack, discord,
sendgrid, square, gitlab, cloudflare, digitalocean, notion, linear, jira, airtable,
asana, mailchimp, dropbox, salesforce, hubspot, shopify, outlook, onedrive, gdrive,
vercel, paypal, x

This covers all 27 connector names plus 3 extras (connectors, email_send, send_email).

## Findings

### Consistency
1. CONNECTOR_FACTORIES, CONNECTOR_DEFS, and connector files are perfectly aligned (27 each).
2. OAUTH_PROVIDERS covers all 23 OAuth-capable connectors (matching CONNECTOR_DEFS.oauth).
3. BAKED_OAUTH_CLIENT_IDS has keys for all OAUTH_PROVIDERS (via bakedIdKey).
4. Tool aliases cover all 27 connector names.
5. All connectors declare `name`, `version = "1.0.0"`, implement `handlers()` and `buildAuthHeader()`.

### Architecture Quality
- Clean separation: ConnectorBase -> BearerConnector -> specific connectors
- BearerConnector handles 401 retry, token refresh, relay-based refresh transparently
- Middleware (retry, rate limit, timeout, idempotency, token refresh mutex) is composable
- Manager provides lazy init, deduplication, caching, license enforcement, eviction

### No Bugs Found
- All registries are aligned.
- Factory dynamic imports match actual file paths and export names.
- CONNECTOR_DEFS required env vars match what each connector's init() checks.
- OAuth provider configs match connector auth configurations.
