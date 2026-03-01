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
  onedrive: async () =>
    (await import("./onedrive/connector.js")).OneDriveConnector,
  gmail: async () =>
    (await import("./gmail/connector.js")).GmailConnector,
  outlook: async () =>
    (await import("./outlook/connector.js")).OutlookConnector,
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
