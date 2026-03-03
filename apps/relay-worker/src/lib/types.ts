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
