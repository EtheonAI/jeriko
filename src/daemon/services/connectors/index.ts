// Connectors barrel — re-exports the interface, registry, middleware, and all connectors.

// Core types
export type {
  ConnectorInterface,
  ConnectorResult,
  WebhookEvent,
  ConnectorConfig,
  HealthResult,
  RateLimitConfig,
} from "./interface.js";

// Base classes
export { ConnectorBase, BearerConnector } from "./base.js";
export type { BearerAuthConfig } from "./base.js";

// Registry — single source of truth for connector factories
export { CONNECTOR_FACTORIES, loadConnector } from "./registry.js";

// Middleware
export {
  withRetry,
  withRateLimit,
  withTimeout,
  withIdempotency,
  refreshToken,
} from "./middleware.js";

// Individual connectors
export { StripeConnector } from "./stripe/connector.js";
export { verifyStripeSignature } from "./stripe/webhook.js";
export { GitHubConnector } from "./github/connector.js";
export { PayPalConnector } from "./paypal/connector.js";
export { VercelConnector } from "./vercel/connector.js";
export { TwilioConnector } from "./twilio/connector.js";
export { XConnector } from "./x/connector.js";
export { GDriveConnector } from "./gdrive/connector.js";
export { OneDriveConnector } from "./onedrive/connector.js";
export { GmailConnector } from "./gmail/connector.js";
export { OutlookConnector } from "./outlook/connector.js";
