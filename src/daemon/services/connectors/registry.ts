/**
 * Connector registry — single source of truth for connector instantiation.
 *
 * Both the CLI unified gateway and the channel router import from here.
 * Adding a new connector requires ONE entry in this map.
 *
 * Factory pattern: lazy dynamic imports so we only load connector code
 * when it's actually used (e.g. health check, call dispatch).
 */

import type { ConnectorInterface } from "./interface.js";

// ---------------------------------------------------------------------------
// Factory types
// ---------------------------------------------------------------------------

type ConnectorClass = { new (): ConnectorInterface };
type ConnectorFactory = () => Promise<ConnectorClass>;

// ---------------------------------------------------------------------------
// Registry — one entry per connector, dynamic imports for tree-shaking
// ---------------------------------------------------------------------------

export const CONNECTOR_FACTORIES: Record<string, ConnectorFactory> = {
  stripe: async () =>
    (await import("./stripe/connector.js")).StripeConnector,
  paypal: async () =>
    (await import("./paypal/connector.js")).PayPalConnector,
  github: async () =>
    (await import("./github/connector.js")).GitHubConnector,
  twilio: async () =>
    (await import("./twilio/connector.js")).TwilioConnector,
  vercel: async () =>
    (await import("./vercel/connector.js")).VercelConnector,
  x: async () =>
    (await import("./x/connector.js")).XConnector,
  gdrive: async () =>
    (await import("./gdrive/connector.js")).GDriveConnector,
  gmail: async () =>
    (await import("./gmail/connector.js")).GmailConnector,
  hubspot: async () =>
    (await import("./hubspot/connector.js")).HubSpotConnector,
  shopify: async () =>
    (await import("./shopify/connector.js")).ShopifyConnector,
  instagram: async () =>
    (await import("./instagram/connector.js")).InstagramConnector,
  threads: async () =>
    (await import("./threads/connector.js")).ThreadsConnector,
  slack: async () =>
    (await import("./slack/connector.js")).SlackConnector,
  discord: async () =>
    (await import("./discord/connector.js")).DiscordConnector,
  sendgrid: async () =>
    (await import("./sendgrid/connector.js")).SendGridConnector,
  square: async () =>
    (await import("./square/connector.js")).SquareConnector,
  gitlab: async () =>
    (await import("./gitlab/connector.js")).GitLabConnector,
  cloudflare: async () =>
    (await import("./cloudflare/connector.js")).CloudflareConnector,
  notion: async () =>
    (await import("./notion/connector.js")).NotionConnector,
  linear: async () =>
    (await import("./linear/connector.js")).LinearConnector,
  jira: async () =>
    (await import("./jira/connector.js")).JiraConnector,
  airtable: async () =>
    (await import("./airtable/connector.js")).AirtableConnector,
  asana: async () =>
    (await import("./asana/connector.js")).AsanaConnector,
  mailchimp: async () =>
    (await import("./mailchimp/connector.js")).MailchimpConnector,
  dropbox: async () =>
    (await import("./dropbox/connector.js")).DropboxConnector,
};

// ---------------------------------------------------------------------------
// Factory helper — instantiate and initialize a connector by name
// ---------------------------------------------------------------------------

/**
 * Load a connector by name: resolve factory, instantiate, call init().
 *
 * @throws If the connector name is unknown or init() fails.
 */
export async function loadConnector(name: string): Promise<ConnectorInterface> {
  const loader = CONNECTOR_FACTORIES[name];
  if (!loader) throw new Error(`Unknown connector: ${name}`);
  const Ctor = await loader();
  const connector = new Ctor();
  await connector.init();
  return connector;
}
