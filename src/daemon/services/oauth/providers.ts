// OAuth 2.0 provider configurations.
//
// Defines authorization endpoints, token endpoints, scopes, and env var mappings
// for each connector that supports OAuth. API-key-only connectors (Twilio, PayPal)
// are not listed here — they continue using /auth.
//
// Baked-in client IDs:
//   Each provider has a `bakedIdKey` that maps to a build-time constant in
//   `src/shared/baked-oauth-ids.ts`. At compile time, Bun's `define` injects
//   the real OAuth app client IDs. At dev time, they're undefined and users
//   must provide client IDs via env vars.

import { BAKED_OAUTH_CLIENT_IDS } from "../../../shared/baked-oauth-ids.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OAuthProvider {
  /** Internal name matching ConnectorDef.name (e.g. "github", "x"). */
  name: string;
  /** Human-readable label (e.g. "GitHub"). */
  label: string;
  /** OAuth 2.0 authorization endpoint. */
  authUrl: string;
  /** OAuth 2.0 token exchange endpoint. */
  tokenUrl: string;
  /** Scopes to request. */
  scopes: string[];
  /**
   * Separator for joining scopes. Most providers use " " (space, per RFC 6749).
   * Meta APIs (Instagram, Threads) use "," (comma). Default: " ".
   */
  scopeSeparator?: string;
  /**
   * Key into BAKED_OAUTH_CLIENT_IDS for the build-time client ID.
   * Multiple providers can share the same key (e.g. gmail + gdrive → "google").
   */
  bakedIdKey: string;
  /** Env var for OAuth client ID (e.g. "GITHUB_OAUTH_CLIENT_ID"). */
  clientIdVar: string;
  /**
   * Env var for OAuth client secret.
   * For providers using Basic auth exchange (e.g. Stripe), this holds the
   * API secret key used as the Basic auth username.
   */
  clientSecretVar: string;
  /** Env var where the access token is saved (e.g. "GITHUB_TOKEN"). */
  tokenEnvVar: string;
  /** Env var for refresh token (services that issue them). */
  refreshTokenEnvVar?: string;
  /** Use PKCE (Proof Key for Code Exchange). Required by X/Twitter. */
  usePKCE?: boolean;
  /** Extra params to include in the token exchange POST. */
  extraTokenParams?: Record<string, string>;
  /**
   * How to authenticate the token exchange request.
   * - "body" (default): Send client_id + client_secret in the POST body.
   * - "basic": Standard Basic auth — base64(client_id:client_secret) per RFC 7617.
   * - "basic-apikey": API-key Basic auth — base64(client_secret:).
   *   Stripe uses this — the API secret key is the username, password is empty.
   */
  tokenExchangeAuth?: "body" | "basic" | "basic-apikey";
  /**
   * If true, omit `response_type=code` from the authorization URL.
   * Stripe Apps doesn't use response_type — only client_id, redirect_uri, state.
   */
  skipResponseType?: boolean;
}

// ---------------------------------------------------------------------------
// Provider registry
// ---------------------------------------------------------------------------

export const OAUTH_PROVIDERS: readonly OAuthProvider[] = [
  {
    name: "stripe",
    label: "Stripe",
    authUrl: "https://connect.stripe.com/oauth/authorize",
    tokenUrl: "https://connect.stripe.com/oauth/token",
    scopes: ["read_write"],
    bakedIdKey: "stripe",
    clientIdVar: "STRIPE_OAUTH_CLIENT_ID",
    clientSecretVar: "STRIPE_SECRET_KEY",
    tokenEnvVar: "STRIPE_ACCESS_TOKEN",
    refreshTokenEnvVar: "STRIPE_REFRESH_TOKEN",
    tokenExchangeAuth: "basic-apikey",
  },
  {
    name: "github",
    label: "GitHub",
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scopes: ["repo", "read:user", "read:org"],
    bakedIdKey: "github",
    clientIdVar: "GITHUB_OAUTH_CLIENT_ID",
    clientSecretVar: "GITHUB_OAUTH_CLIENT_SECRET",
    tokenEnvVar: "GITHUB_TOKEN",
  },
  {
    name: "x",
    label: "X (Twitter)",
    authUrl: "https://twitter.com/i/oauth2/authorize",
    tokenUrl: "https://api.x.com/2/oauth2/token",
    scopes: ["tweet.read", "tweet.write", "users.read", "dm.read", "dm.write", "offline.access"],
    bakedIdKey: "x",
    clientIdVar: "X_OAUTH_CLIENT_ID",
    clientSecretVar: "X_OAUTH_CLIENT_SECRET",
    tokenEnvVar: "X_BEARER_TOKEN",
    refreshTokenEnvVar: "X_REFRESH_TOKEN",
    usePKCE: true,
    tokenExchangeAuth: "basic",
  },
  {
    name: "gdrive",
    label: "Google Drive",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: ["https://www.googleapis.com/auth/drive"],
    bakedIdKey: "google",
    clientIdVar: "GDRIVE_OAUTH_CLIENT_ID",
    clientSecretVar: "GDRIVE_OAUTH_CLIENT_SECRET",
    tokenEnvVar: "GDRIVE_ACCESS_TOKEN",
    refreshTokenEnvVar: "GDRIVE_REFRESH_TOKEN",
    extraTokenParams: { access_type: "offline", prompt: "consent" },
  },
  {
    name: "vercel",
    label: "Vercel",
    authUrl: "https://vercel.com/oauth/authorize",
    tokenUrl: "https://api.vercel.com/v2/oauth/access_token",
    scopes: [],
    bakedIdKey: "vercel",
    clientIdVar: "VERCEL_OAUTH_CLIENT_ID",
    clientSecretVar: "VERCEL_OAUTH_CLIENT_SECRET",
    tokenEnvVar: "VERCEL_TOKEN",
    refreshTokenEnvVar: "VERCEL_REFRESH_TOKEN",
    usePKCE: true,
  },
  {
    name: "gmail",
    label: "Gmail",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: ["https://www.googleapis.com/auth/gmail.modify", "https://www.googleapis.com/auth/gmail.send"],
    bakedIdKey: "google",
    clientIdVar: "GMAIL_OAUTH_CLIENT_ID",
    clientSecretVar: "GMAIL_OAUTH_CLIENT_SECRET",
    tokenEnvVar: "GMAIL_ACCESS_TOKEN",
    refreshTokenEnvVar: "GMAIL_REFRESH_TOKEN",
    extraTokenParams: { access_type: "offline", prompt: "consent" },
  },
  {
    name: "hubspot",
    label: "HubSpot",
    authUrl: "https://app.hubspot.com/oauth/authorize",
    tokenUrl: "https://api.hubapi.com/oauth/v1/token",
    scopes: [
      // Core CRM objects
      "crm.objects.contacts.read", "crm.objects.contacts.write",
      "crm.objects.companies.read", "crm.objects.companies.write",
      "crm.objects.deals.read", "crm.objects.deals.write",
      "crm.objects.owners.read",
      "crm.objects.quotes.read", "crm.objects.quotes.write",
      "crm.objects.products.read", "crm.objects.products.write",
      "crm.objects.invoices.read", "crm.objects.invoices.write",
      "crm.objects.orders.read", "crm.objects.orders.write",
      "crm.objects.line_items.read", "crm.objects.line_items.write",
      "crm.objects.subscriptions.read", "crm.objects.subscriptions.write",
      "crm.objects.commercepayments.read", "crm.objects.commercepayments.write",
      "crm.objects.goals.read", "crm.objects.goals.write",
      "crm.objects.projects.read", "crm.objects.projects.write",
      "crm.objects.leads.read", "crm.objects.leads.write",
      "crm.objects.users.read", "crm.objects.users.write",
      "crm.objects.forecasts.read",
      "crm.objects.feedback_submissions.read",
      "crm.objects.marketing_events.read", "crm.objects.marketing_events.write",
      "crm.objects.custom.read", "crm.objects.custom.write",
      "crm.objects.carts.read", "crm.objects.carts.write",
      "crm.objects.partner-services.read", "crm.objects.partner-services.write",
      "crm.objects.partner-clients.read", "crm.objects.partner-clients.write",
      "crm.objects.courses.read", "crm.objects.courses.write",
      "crm.objects.listings.read", "crm.objects.listings.write",
      "crm.objects.services.read", "crm.objects.services.write",
      "crm.objects.appointments.read", "crm.objects.appointments.write",
      // CRM schemas
      "crm.schemas.contacts.read", "crm.schemas.contacts.write",
      "crm.schemas.companies.read", "crm.schemas.companies.write",
      "crm.schemas.deals.read", "crm.schemas.deals.write",
      "crm.schemas.quotes.read", "crm.schemas.quotes.write",
      "crm.schemas.invoices.read", "crm.schemas.invoices.write",
      "crm.schemas.orders.read", "crm.schemas.orders.write",
      "crm.schemas.line_items.read",
      "crm.schemas.subscriptions.read", "crm.schemas.subscriptions.write",
      "crm.schemas.commercepayments.read", "crm.schemas.commercepayments.write",
      "crm.schemas.projects.read", "crm.schemas.projects.write",
      "crm.schemas.forecasts.read",
      "crm.schemas.custom.read",
      "crm.schemas.carts.read", "crm.schemas.carts.write",
      "crm.schemas.services.read", "crm.schemas.services.write",
      "crm.schemas.courses.read", "crm.schemas.courses.write",
      "crm.schemas.listings.read", "crm.schemas.listings.write",
      "crm.schemas.appointments.read", "crm.schemas.appointments.write",
      // CRM pipelines & misc
      "crm.pipelines.orders.read", "crm.pipelines.orders.write",
      "crm.lists.read", "crm.lists.write",
      "crm.import", "crm.export",
      "crm.dealsplits.read_write",
      "crm.extensions_calling_transcripts.read", "crm.extensions_calling_transcripts.write",
      // Conversations
      "conversations.read", "conversations.write",
      "conversations.visitor_identification.tokens.create",
      "conversations.custom_channels.read", "conversations.custom_channels.write",
      // Communication preferences
      "communication_preferences.read", "communication_preferences.write",
      "communication_preferences.read_write",
      "communication_preferences.statuses.batch.read", "communication_preferences.statuses.batch.write",
      // Automation & marketing
      "automation",
      "automation.sequences.read", "automation.sequences.enrollments.write",
      "marketing.campaigns.read", "marketing.campaigns.write", "marketing.campaigns.revenue.read",
      // OAuth
      "oauth",
    ],
    bakedIdKey: "hubspot",
    clientIdVar: "HUBSPOT_OAUTH_CLIENT_ID",
    clientSecretVar: "HUBSPOT_OAUTH_CLIENT_SECRET",
    tokenEnvVar: "HUBSPOT_ACCESS_TOKEN",
    refreshTokenEnvVar: "HUBSPOT_REFRESH_TOKEN",
  },
  {
    name: "shopify",
    label: "Shopify",
    authUrl: "https://{shop}.myshopify.com/admin/oauth/authorize",
    tokenUrl: "https://{shop}.myshopify.com/admin/oauth/access_token",
    scopes: [
      "read_products",
      "write_products",
      "read_orders",
      "write_orders",
      "read_customers",
      "write_customers",
      "read_inventory",
      "write_inventory",
    ],
    bakedIdKey: "shopify",
    clientIdVar: "SHOPIFY_OAUTH_CLIENT_ID",
    clientSecretVar: "SHOPIFY_OAUTH_CLIENT_SECRET",
    tokenEnvVar: "SHOPIFY_ACCESS_TOKEN",
    // Shopify tokens are permanent — no refresh token.
    // Shopify's authorize endpoint doesn't use response_type=code.
    skipResponseType: true,
  },
  {
    name: "instagram",
    label: "Instagram",
    authUrl: "https://www.instagram.com/oauth/authorize",
    tokenUrl: "https://api.instagram.com/oauth/access_token",
    scopes: ["instagram_business_basic", "instagram_business_manage_messages", "instagram_business_manage_comments", "instagram_business_content_publish"],
    scopeSeparator: ",",
    bakedIdKey: "instagram",
    clientIdVar: "INSTAGRAM_OAUTH_CLIENT_ID",
    clientSecretVar: "INSTAGRAM_OAUTH_CLIENT_SECRET",
    tokenEnvVar: "INSTAGRAM_ACCESS_TOKEN",
  },
  {
    name: "threads",
    label: "Threads",
    authUrl: "https://threads.net/oauth/authorize",
    tokenUrl: "https://graph.threads.net/oauth/access_token",
    scopes: ["threads_basic", "threads_content_publish", "threads_manage_insights", "threads_manage_replies", "threads_read_replies"],
    scopeSeparator: ",",
    bakedIdKey: "threads",
    clientIdVar: "THREADS_OAUTH_CLIENT_ID",
    clientSecretVar: "THREADS_OAUTH_CLIENT_SECRET",
    tokenEnvVar: "THREADS_ACCESS_TOKEN",
  },
  {
    name: "square",
    label: "Square",
    authUrl: "https://connect.squareup.com/oauth2/authorize",
    tokenUrl: "https://connect.squareup.com/oauth2/token",
    scopes: ["PAYMENTS_READ", "PAYMENTS_WRITE", "ORDERS_READ", "ORDERS_WRITE", "CUSTOMERS_READ", "CUSTOMERS_WRITE", "ITEMS_READ", "ITEMS_WRITE", "INVENTORY_READ", "INVENTORY_WRITE", "MERCHANT_PROFILE_READ"],
    bakedIdKey: "square",
    clientIdVar: "SQUARE_OAUTH_CLIENT_ID",
    clientSecretVar: "SQUARE_OAUTH_CLIENT_SECRET",
    tokenEnvVar: "SQUARE_ACCESS_TOKEN",
    refreshTokenEnvVar: "SQUARE_REFRESH_TOKEN",
  },
  {
    name: "gitlab",
    label: "GitLab",
    authUrl: "https://gitlab.com/oauth/authorize",
    tokenUrl: "https://gitlab.com/oauth/token",
    scopes: ["api", "read_user", "read_repository"],
    bakedIdKey: "gitlab",
    clientIdVar: "GITLAB_OAUTH_CLIENT_ID",
    clientSecretVar: "GITLAB_OAUTH_CLIENT_SECRET",
    tokenEnvVar: "GITLAB_ACCESS_TOKEN",
    refreshTokenEnvVar: "GITLAB_REFRESH_TOKEN",
  },
  {
    name: "notion",
    label: "Notion",
    authUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    scopes: [],
    bakedIdKey: "notion",
    clientIdVar: "NOTION_OAUTH_CLIENT_ID",
    clientSecretVar: "NOTION_OAUTH_CLIENT_SECRET",
    tokenEnvVar: "NOTION_ACCESS_TOKEN",
    tokenExchangeAuth: "basic",
    // Notion tokens are permanent — no refresh
  },
  {
    name: "linear",
    label: "Linear",
    authUrl: "https://linear.app/oauth/authorize",
    tokenUrl: "https://api.linear.app/oauth/token",
    scopes: ["read", "write", "issues:create", "comments:create"],
    bakedIdKey: "linear",
    clientIdVar: "LINEAR_OAUTH_CLIENT_ID",
    clientSecretVar: "LINEAR_OAUTH_CLIENT_SECRET",
    tokenEnvVar: "LINEAR_ACCESS_TOKEN",
    // Linear tokens are permanent — no refresh
  },
  {
    name: "jira",
    label: "Jira",
    authUrl: "https://auth.atlassian.com/authorize",
    tokenUrl: "https://auth.atlassian.com/oauth/token",
    scopes: [
      // Platform REST API
      "read:jira-work", "write:jira-work", "read:jira-user",
      "manage:jira-project", "manage:jira-configuration",
      "manage:jira-webhook", "manage:jira-data-provider",
      // Service Management API
      "read:servicedesk-request", "manage:servicedesk-customer",
      "write:servicedesk-request", "read:servicemanagement-insight-objects",
      // Offline access (refresh tokens)
      "offline_access",
    ],
    bakedIdKey: "atlassian",
    clientIdVar: "JIRA_OAUTH_CLIENT_ID",
    clientSecretVar: "JIRA_OAUTH_CLIENT_SECRET",
    tokenEnvVar: "JIRA_ACCESS_TOKEN",
    refreshTokenEnvVar: "JIRA_REFRESH_TOKEN",
    extraTokenParams: { audience: "api.atlassian.com", prompt: "consent" },
  },
  {
    name: "airtable",
    label: "Airtable",
    authUrl: "https://airtable.com/oauth2/v1/authorize",
    tokenUrl: "https://airtable.com/oauth2/v1/token",
    scopes: ["data.records:read", "data.records:write", "schema.bases:read", "schema.bases:write"],
    bakedIdKey: "airtable",
    clientIdVar: "AIRTABLE_OAUTH_CLIENT_ID",
    clientSecretVar: "AIRTABLE_OAUTH_CLIENT_SECRET",
    tokenEnvVar: "AIRTABLE_ACCESS_TOKEN",
    refreshTokenEnvVar: "AIRTABLE_REFRESH_TOKEN",
    usePKCE: true,
  },
  {
    name: "asana",
    label: "Asana",
    authUrl: "https://app.asana.com/-/oauth_authorize",
    tokenUrl: "https://app.asana.com/-/oauth_token",
    scopes: ["default"],
    bakedIdKey: "asana",
    clientIdVar: "ASANA_OAUTH_CLIENT_ID",
    clientSecretVar: "ASANA_OAUTH_CLIENT_SECRET",
    tokenEnvVar: "ASANA_ACCESS_TOKEN",
    refreshTokenEnvVar: "ASANA_REFRESH_TOKEN",
  },
  {
    name: "mailchimp",
    label: "Mailchimp",
    authUrl: "https://login.mailchimp.com/oauth2/authorize",
    tokenUrl: "https://login.mailchimp.com/oauth2/token",
    scopes: [],
    bakedIdKey: "mailchimp",
    clientIdVar: "MAILCHIMP_OAUTH_CLIENT_ID",
    clientSecretVar: "MAILCHIMP_OAUTH_CLIENT_SECRET",
    tokenEnvVar: "MAILCHIMP_ACCESS_TOKEN",
    refreshTokenEnvVar: "MAILCHIMP_REFRESH_TOKEN",
  },
  {
    name: "dropbox",
    label: "Dropbox",
    authUrl: "https://www.dropbox.com/oauth2/authorize",
    tokenUrl: "https://api.dropboxapi.com/oauth2/token",
    scopes: ["files.metadata.read", "files.metadata.write", "files.content.read", "files.content.write", "sharing.read", "sharing.write", "account_info.read"],
    bakedIdKey: "dropbox",
    clientIdVar: "DROPBOX_OAUTH_CLIENT_ID",
    clientSecretVar: "DROPBOX_OAUTH_CLIENT_SECRET",
    tokenEnvVar: "DROPBOX_ACCESS_TOKEN",
    refreshTokenEnvVar: "DROPBOX_REFRESH_TOKEN",
    extraTokenParams: { token_access_type: "offline" },
  },
  {
    name: "discord",
    label: "Discord",
    authUrl: "https://discord.com/oauth2/authorize",
    tokenUrl: "https://discord.com/api/oauth2/token",
    scopes: ["bot", "guilds", "guilds.members.read", "messages.read"],
    bakedIdKey: "discord",
    clientIdVar: "DISCORD_OAUTH_CLIENT_ID",
    clientSecretVar: "DISCORD_OAUTH_CLIENT_SECRET",
    tokenEnvVar: "DISCORD_BOT_TOKEN",
    refreshTokenEnvVar: "DISCORD_REFRESH_TOKEN",
  },
  {
    name: "slack",
    label: "Slack",
    authUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    scopes: ["app_mentions:read", "assistant:write", "calls:write", "channels:history", "chat:write", "users:write"],
    bakedIdKey: "slack",
    clientIdVar: "SLACK_OAUTH_CLIENT_ID",
    clientSecretVar: "SLACK_OAUTH_CLIENT_SECRET",
    tokenEnvVar: "SLACK_BOT_TOKEN",
    // Slack bot tokens are permanent — no refresh token.
  },
  {
    name: "paypal",
    label: "PayPal",
    authUrl: "https://www.paypal.com/connect",
    tokenUrl: "https://api-m.paypal.com/v1/oauth2/token",
    scopes: ["openid", "profile", "email"],
    bakedIdKey: "paypal",
    clientIdVar: "PAYPAL_OAUTH_CLIENT_ID",
    clientSecretVar: "PAYPAL_OAUTH_CLIENT_SECRET",
    tokenEnvVar: "PAYPAL_ACCESS_TOKEN",
    refreshTokenEnvVar: "PAYPAL_REFRESH_TOKEN",
    tokenExchangeAuth: "basic",
  },
] as const;

/** Look up an OAuth provider by connector name. */
export function getOAuthProvider(name: string): OAuthProvider | undefined {
  return OAUTH_PROVIDERS.find((p) => p.name === name);
}

/** Check whether a connector supports OAuth (vs API-key-only). */
export function isOAuthCapable(name: string): boolean {
  return OAUTH_PROVIDERS.some((p) => p.name === name);
}

/**
 * Resolve the OAuth client ID for a provider.
 *
 * Resolution order:
 *   1. Env var override (e.g. GITHUB_OAUTH_CLIENT_ID) — user-provided credentials
 *   2. Baked-in client ID from build-time constants — Jeriko's registered OAuth apps
 *   3. undefined — provider not configured
 */
export function getClientId(provider: OAuthProvider): string | undefined {
  return process.env[provider.clientIdVar]
    || BAKED_OAUTH_CLIENT_IDS[provider.bakedIdKey]
    || undefined;
}

/**
 * Check whether the daemon has local OAuth client credentials for token exchange.
 * When false, the relay server handles the code→token exchange using its secrets.
 */
export function hasLocalSecret(provider: OAuthProvider): boolean {
  return !!process.env[provider.clientSecretVar];
}

/**
 * Resolve provider-specific context from CLI args or env vars.
 *
 * Some providers have placeholder tokens in their authUrl (e.g. Shopify's
 * `{shop}` in `https://{shop}.myshopify.com/admin/oauth/authorize`).
 * This function extracts placeholder names from the URL, then resolves
 * each from the provided args or from environment variables.
 *
 * Returns a context record on success, or an Error if a required
 * placeholder couldn't be resolved.
 */
export function resolveOAuthContext(
  provider: OAuthProvider,
  args: string[],
): Record<string, string> | Error {
  const placeholders = provider.authUrl.match(/\{(\w+)\}/g);
  if (!placeholders || placeholders.length === 0) return {};

  const context: Record<string, string> = {};

  for (let i = 0; i < placeholders.length; i++) {
    const key = placeholders[i]!.slice(1, -1); // strip { }
    const envKey = `${provider.name.toUpperCase()}_${key.toUpperCase()}`;

    // Try: 1) positional arg, 2) env var
    const value = args[i] || process.env[envKey];
    if (!value) {
      return new Error(
        `${provider.label} requires a ${key} name.\n` +
        `Usage: /connectors connect ${provider.name} <${key}>\n` +
        `Example: /connectors connect ${provider.name} my-${key}\n` +
        `Or set ${envKey} in your .env.`,
      );
    }
    context[key] = value;
  }

  return context;
}
