// Relay Worker — Type definitions.
//
// Env bindings from wrangler.toml and WebSocket attachment shape
// for Durable Object hibernation survival.

// ---------------------------------------------------------------------------
// Worker environment bindings
// ---------------------------------------------------------------------------

export interface Env {
  /** Durable Object namespace binding for the relay DO. */
  RELAY_DO: DurableObjectNamespace;

  /** Shared secret for daemon WebSocket authentication. */
  RELAY_AUTH_SECRET: string;

  /** Stripe webhook signing secret for billing events. */
  STRIPE_BILLING_WEBHOOK_SECRET: string;

  /** Stripe API secret key for creating checkout/portal sessions. */
  STRIPE_BILLING_SECRET_KEY: string;

  /** Stripe Price ID for the Pro plan subscription. */
  STRIPE_BILLING_PRICE_ID: string;

  /** Base URL for billing pages (success, cancel, portal return). */
  JERIKO_BILLING_URL: string;

  /** Deployment environment identifier. */
  ENVIRONMENT: string;

  // -------------------------------------------------------------------------
  // OAuth provider client secrets — for relay-side code→token exchange.
  //
  // These are set via `wrangler secret put`. The matching client IDs are
  // baked into the daemon binary (public values). The secrets never leave
  // the relay — tokens are sent to the daemon via WebSocket.
  // -------------------------------------------------------------------------

  /** GitHub OAuth app client ID. */
  GITHUB_OAUTH_CLIENT_ID?: string;
  /** GitHub OAuth app client secret. */
  GITHUB_OAUTH_CLIENT_SECRET?: string;

  /** Google OAuth client ID (shared by Gmail + GDrive). */
  GOOGLE_OAUTH_CLIENT_ID?: string;
  /** Google OAuth client secret (shared by Gmail + GDrive). */
  GOOGLE_OAUTH_CLIENT_SECRET?: string;

  /** Microsoft OAuth client ID (shared by OneDrive + Outlook). */
  MICROSOFT_OAUTH_CLIENT_ID?: string;
  /** Microsoft OAuth client secret (shared by OneDrive + Outlook). */
  MICROSOFT_OAUTH_CLIENT_SECRET?: string;

  /** X (Twitter) OAuth client ID. */
  X_OAUTH_CLIENT_ID?: string;
  /** X (Twitter) OAuth client secret. */
  X_OAUTH_CLIENT_SECRET?: string;

  /** Vercel OAuth integration client ID. */
  VERCEL_OAUTH_CLIENT_ID?: string;
  /** Vercel OAuth integration client secret. */
  VERCEL_OAUTH_CLIENT_SECRET?: string;

  /** Stripe OAuth platform client ID. */
  STRIPE_OAUTH_CLIENT_ID?: string;
  /** Stripe OAuth platform client secret. */
  STRIPE_OAUTH_CLIENT_SECRET?: string;

  /** HubSpot OAuth client ID. */
  HUBSPOT_OAUTH_CLIENT_ID?: string;
  /** HubSpot OAuth client secret. */
  HUBSPOT_OAUTH_CLIENT_SECRET?: string;

  /** Shopify OAuth client ID. */
  SHOPIFY_OAUTH_CLIENT_ID?: string;
  /** Shopify OAuth client secret. */
  SHOPIFY_OAUTH_CLIENT_SECRET?: string;


  /** Square OAuth client ID. */
  SQUARE_OAUTH_CLIENT_ID?: string;
  /** Square OAuth client secret. */
  SQUARE_OAUTH_CLIENT_SECRET?: string;

  /** GitLab OAuth client ID. */
  GITLAB_OAUTH_CLIENT_ID?: string;
  /** GitLab OAuth client secret. */
  GITLAB_OAUTH_CLIENT_SECRET?: string;

  /** DigitalOcean OAuth client ID. */
  DIGITALOCEAN_OAUTH_CLIENT_ID?: string;
  /** DigitalOcean OAuth client secret. */
  DIGITALOCEAN_OAUTH_CLIENT_SECRET?: string;

  /** Notion OAuth client ID (public integration). */
  NOTION_OAUTH_CLIENT_ID?: string;
  /** Notion OAuth client secret (public integration). */
  NOTION_OAUTH_CLIENT_SECRET?: string;

  /** Linear OAuth client ID. */
  LINEAR_OAUTH_CLIENT_ID?: string;
  /** Linear OAuth client secret. */
  LINEAR_OAUTH_CLIENT_SECRET?: string;

  /** Atlassian OAuth client ID (Jira). */
  ATLASSIAN_OAUTH_CLIENT_ID?: string;
  /** Atlassian OAuth client secret (Jira). */
  ATLASSIAN_OAUTH_CLIENT_SECRET?: string;

  /** Airtable OAuth client ID. */
  AIRTABLE_OAUTH_CLIENT_ID?: string;
  /** Airtable OAuth client secret. */
  AIRTABLE_OAUTH_CLIENT_SECRET?: string;

  /** Asana OAuth client ID. */
  ASANA_OAUTH_CLIENT_ID?: string;
  /** Asana OAuth client secret. */
  ASANA_OAUTH_CLIENT_SECRET?: string;

  /** Mailchimp OAuth client ID. */
  MAILCHIMP_OAUTH_CLIENT_ID?: string;
  /** Mailchimp OAuth client secret. */
  MAILCHIMP_OAUTH_CLIENT_SECRET?: string;

  /** Dropbox OAuth client ID. */
  DROPBOX_OAUTH_CLIENT_ID?: string;
  /** Dropbox OAuth client secret. */
  DROPBOX_OAUTH_CLIENT_SECRET?: string;

  /** Salesforce OAuth client ID. */
  SALESFORCE_OAUTH_CLIENT_ID?: string;
  /** Salesforce OAuth client secret. */
  SALESFORCE_OAUTH_CLIENT_SECRET?: string;
}

// ---------------------------------------------------------------------------
// WebSocket attachment (survives DO hibernation)
// ---------------------------------------------------------------------------

/**
 * Data stored on each WebSocket via `ws.serializeAttachment()`.
 *
 * When the Durable Object hibernates and wakes up, the class is
 * re-instantiated with empty in-memory state. WebSocket attachments
 * survive hibernation and are used to reconstruct the connection map
 * via `ConnectionManager.restore()`.
 */
export interface WebSocketAttachment {
  userId?: string;
  authenticated: boolean;
  connectedAt?: string;
  lastPing?: string;
  version?: string;
  /** Trigger IDs serialized from Set<string> for JSON compatibility. */
  triggerIds?: string[];
}
