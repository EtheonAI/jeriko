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

// Registry
export { ConnectorRegistry } from "./registry.js";
export type { ConnectorFactory } from "./registry.js";

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
