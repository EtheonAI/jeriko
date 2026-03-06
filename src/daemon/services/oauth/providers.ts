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
   * - "basic": Send clientSecretVar as HTTP Basic auth (username:password format).
   *   Stripe uses this — the secret API key is the username, password is empty.
   */
  tokenExchangeAuth?: "body" | "basic";
}

// ---------------------------------------------------------------------------
// Provider registry
// ---------------------------------------------------------------------------

export const OAUTH_PROVIDERS: readonly OAuthProvider[] = [
  {
    name: "stripe",
    label: "Stripe",
    authUrl: "https://marketplace.stripe.com/oauth/v2/authorize",
    tokenUrl: "https://api.stripe.com/v1/oauth/token",
    scopes: [],
    bakedIdKey: "stripe",
    clientIdVar: "STRIPE_OAUTH_CLIENT_ID",
    clientSecretVar: "STRIPE_SECRET_KEY",
    tokenEnvVar: "STRIPE_ACCESS_TOKEN",
    refreshTokenEnvVar: "STRIPE_REFRESH_TOKEN",
    tokenExchangeAuth: "basic",
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
    tokenUrl: "https://api.twitter.com/2/oauth2/token",
    scopes: ["tweet.read", "tweet.write", "users.read", "dm.read", "dm.write", "offline.access"],
    bakedIdKey: "x",
    clientIdVar: "X_OAUTH_CLIENT_ID",
    clientSecretVar: "X_OAUTH_CLIENT_SECRET",
    tokenEnvVar: "X_BEARER_TOKEN",
    refreshTokenEnvVar: "X_REFRESH_TOKEN",
    usePKCE: true,
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
    name: "onedrive",
    label: "OneDrive",
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scopes: ["Files.ReadWrite.All", "offline_access"],
    bakedIdKey: "microsoft",
    clientIdVar: "ONEDRIVE_OAUTH_CLIENT_ID",
    clientSecretVar: "ONEDRIVE_OAUTH_CLIENT_SECRET",
    tokenEnvVar: "ONEDRIVE_ACCESS_TOKEN",
    refreshTokenEnvVar: "ONEDRIVE_REFRESH_TOKEN",
  },
  {
    name: "vercel",
    label: "Vercel",
    authUrl: "https://vercel.com/oauth/authorize",
    tokenUrl: "https://api.vercel.com/login/oauth/token",
    scopes: ["openid", "email", "profile", "offline_access"],
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
    name: "outlook",
    label: "Outlook",
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scopes: ["Mail.ReadWrite", "Mail.Send", "offline_access"],
    bakedIdKey: "microsoft",
    clientIdVar: "OUTLOOK_OAUTH_CLIENT_ID",
    clientSecretVar: "OUTLOOK_OAUTH_CLIENT_SECRET",
    tokenEnvVar: "OUTLOOK_ACCESS_TOKEN",
    refreshTokenEnvVar: "OUTLOOK_REFRESH_TOKEN",
  },
  {
    name: "hubspot",
    label: "HubSpot",
    authUrl: "https://app.hubspot.com/oauth/authorize",
    tokenUrl: "https://api.hubapi.com/oauth/v1/token",
    scopes: [
      "crm.objects.contacts.read",
      "crm.objects.contacts.write",
      "crm.objects.companies.read",
      "crm.objects.companies.write",
      "crm.objects.deals.read",
      "crm.objects.deals.write",
      "crm.objects.owners.read",
      "tickets",
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
    // Shopify tokens are permanent — no refresh token
  },
  {
    name: "slack",
    label: "Slack",
    authUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    scopes: ["chat:write", "channels:read", "channels:history", "users:read", "files:read", "reactions:read", "reactions:write", "search:read"],
    bakedIdKey: "slack",
    clientIdVar: "SLACK_OAUTH_CLIENT_ID",
    clientSecretVar: "SLACK_OAUTH_CLIENT_SECRET",
    tokenEnvVar: "SLACK_BOT_TOKEN",
    // Slack bot tokens are permanent — no refresh
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
    name: "digitalocean",
    label: "DigitalOcean",
    authUrl: "https://cloud.digitalocean.com/v1/oauth/authorize",
    tokenUrl: "https://cloud.digitalocean.com/v1/oauth/token",
    scopes: ["read", "write"],
    bakedIdKey: "digitalocean",
    clientIdVar: "DIGITALOCEAN_OAUTH_CLIENT_ID",
    clientSecretVar: "DIGITALOCEAN_OAUTH_CLIENT_SECRET",
    tokenEnvVar: "DIGITALOCEAN_ACCESS_TOKEN",
    refreshTokenEnvVar: "DIGITALOCEAN_REFRESH_TOKEN",
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
    scopes: ["read:jira-work", "write:jira-work", "read:jira-user", "offline_access"],
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
    name: "salesforce",
    label: "Salesforce",
    authUrl: "https://login.salesforce.com/services/oauth2/authorize",
    tokenUrl: "https://login.salesforce.com/services/oauth2/token",
    scopes: ["api", "refresh_token", "offline_access"],
    bakedIdKey: "salesforce",
    clientIdVar: "SALESFORCE_OAUTH_CLIENT_ID",
    clientSecretVar: "SALESFORCE_OAUTH_CLIENT_SECRET",
    tokenEnvVar: "SALESFORCE_ACCESS_TOKEN",
    refreshTokenEnvVar: "SALESFORCE_REFRESH_TOKEN",
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
