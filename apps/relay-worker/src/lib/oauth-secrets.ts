// Relay Worker — OAuth credential lookup from Env bindings.
//
// Maps provider names to the corresponding Cloudflare Worker secret bindings.
// The relay uses these to perform code→token exchange on behalf of daemons
// that don't have local OAuth client secrets.

import type { Env } from "./types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RelayOAuthCredentials {
  clientId: string;
  clientSecret: string;
}

// ---------------------------------------------------------------------------
// Provider → Env mapping
// ---------------------------------------------------------------------------

/**
 * Provider credential mapping — maps provider names to Env binding keys.
 *
 * Multiple providers can share the same credential pair:
 *   - gmail + gdrive → GOOGLE_OAUTH_*
 *   - outlook + onedrive → MICROSOFT_OAUTH_*
 */
const PROVIDER_CREDENTIAL_MAP: ReadonlyMap<string, { clientIdKey: keyof Env; clientSecretKey: keyof Env }> = new Map([
  ["stripe",       { clientIdKey: "STRIPE_OAUTH_CLIENT_ID",       clientSecretKey: "STRIPE_OAUTH_CLIENT_SECRET" }],
  ["github",       { clientIdKey: "GITHUB_OAUTH_CLIENT_ID",       clientSecretKey: "GITHUB_OAUTH_CLIENT_SECRET" }],
  ["x",            { clientIdKey: "X_OAUTH_CLIENT_ID",            clientSecretKey: "X_OAUTH_CLIENT_SECRET" }],
  ["gdrive",       { clientIdKey: "GOOGLE_OAUTH_CLIENT_ID",       clientSecretKey: "GOOGLE_OAUTH_CLIENT_SECRET" }],
  ["gmail",        { clientIdKey: "GOOGLE_OAUTH_CLIENT_ID",       clientSecretKey: "GOOGLE_OAUTH_CLIENT_SECRET" }],
  ["onedrive",     { clientIdKey: "MICROSOFT_OAUTH_CLIENT_ID",    clientSecretKey: "MICROSOFT_OAUTH_CLIENT_SECRET" }],
  ["outlook",      { clientIdKey: "MICROSOFT_OAUTH_CLIENT_ID",    clientSecretKey: "MICROSOFT_OAUTH_CLIENT_SECRET" }],
  ["vercel",       { clientIdKey: "VERCEL_OAUTH_CLIENT_ID",       clientSecretKey: "VERCEL_OAUTH_CLIENT_SECRET" }],
  ["hubspot",      { clientIdKey: "HUBSPOT_OAUTH_CLIENT_ID",      clientSecretKey: "HUBSPOT_OAUTH_CLIENT_SECRET" }],
  ["shopify",      { clientIdKey: "SHOPIFY_OAUTH_CLIENT_ID",      clientSecretKey: "SHOPIFY_OAUTH_CLIENT_SECRET" }],
  ["square",       { clientIdKey: "SQUARE_OAUTH_CLIENT_ID",       clientSecretKey: "SQUARE_OAUTH_CLIENT_SECRET" }],
  ["gitlab",       { clientIdKey: "GITLAB_OAUTH_CLIENT_ID",       clientSecretKey: "GITLAB_OAUTH_CLIENT_SECRET" }],
  ["notion",       { clientIdKey: "NOTION_OAUTH_CLIENT_ID",       clientSecretKey: "NOTION_OAUTH_CLIENT_SECRET" }],
  ["linear",       { clientIdKey: "LINEAR_OAUTH_CLIENT_ID",       clientSecretKey: "LINEAR_OAUTH_CLIENT_SECRET" }],
  ["jira",         { clientIdKey: "ATLASSIAN_OAUTH_CLIENT_ID",    clientSecretKey: "ATLASSIAN_OAUTH_CLIENT_SECRET" }],
  ["airtable",     { clientIdKey: "AIRTABLE_OAUTH_CLIENT_ID",     clientSecretKey: "AIRTABLE_OAUTH_CLIENT_SECRET" }],
  ["asana",        { clientIdKey: "ASANA_OAUTH_CLIENT_ID",        clientSecretKey: "ASANA_OAUTH_CLIENT_SECRET" }],
  ["mailchimp",    { clientIdKey: "MAILCHIMP_OAUTH_CLIENT_ID",    clientSecretKey: "MAILCHIMP_OAUTH_CLIENT_SECRET" }],
  ["dropbox",      { clientIdKey: "DROPBOX_OAUTH_CLIENT_ID",      clientSecretKey: "DROPBOX_OAUTH_CLIENT_SECRET" }],
  ["discord",      { clientIdKey: "DISCORD_OAUTH_CLIENT_ID",      clientSecretKey: "DISCORD_OAUTH_CLIENT_SECRET" }],
  ["instagram",    { clientIdKey: "INSTAGRAM_OAUTH_CLIENT_ID",    clientSecretKey: "INSTAGRAM_OAUTH_CLIENT_SECRET" }],
  ["threads",      { clientIdKey: "THREADS_OAUTH_CLIENT_ID",      clientSecretKey: "THREADS_OAUTH_CLIENT_SECRET" }],
]);

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/**
 * Look up OAuth client credentials for a provider from the Worker environment.
 *
 * Returns undefined if the provider is unknown or the secrets aren't configured.
 * Both clientId AND clientSecret must be present — partial config is treated as missing.
 */
export function getRelayOAuthCredentials(provider: string, env: Env): RelayOAuthCredentials | undefined {
  const mapping = PROVIDER_CREDENTIAL_MAP.get(provider);
  if (!mapping) return undefined;

  const clientId = env[mapping.clientIdKey] as string | undefined;
  const clientSecret = env[mapping.clientSecretKey] as string | undefined;

  if (!clientId || !clientSecret) return undefined;

  return { clientId, clientSecret };
}

/**
 * Check whether the relay has OAuth credentials for a given provider.
 */
export function hasRelayOAuthCredentials(provider: string, env: Env): boolean {
  return getRelayOAuthCredentials(provider, env) !== undefined;
}
