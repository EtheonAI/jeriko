/**
 * Unified connector interface for third-party API integrations.
 *
 * Every connector (Stripe, GitHub, PayPal, etc.) implements ConnectorInterface
 * so the registry can manage lifecycle, health, and routing uniformly.
 */

// ---------------------------------------------------------------------------
// Core result / event types
// ---------------------------------------------------------------------------

export interface ConnectorResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  /** HTTP status code (present on error results for programmatic detection). */
  status?: number;
  rate_limit?: { remaining: number; reset_at: string };
}

export interface WebhookEvent {
  /** Unique event id (usually from the provider, or a generated UUID) */
  id: string;
  /** Connector name that produced this event */
  source: string;
  /** Dot-delimited event type, e.g. "payment.completed" */
  type: string;
  /** Raw event payload */
  data: unknown;
  /** Whether the webhook signature was cryptographically verified */
  verified: boolean;
  /** ISO-8601 timestamp of when the event was received */
  received_at: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface RateLimitConfig {
  max_requests: number;
  window_ms: number;
}

export interface ConnectorConfig {
  enabled: boolean;
  credentials: Record<string, string>;
  webhook_secret?: string;
  base_url?: string;
  rate_limit?: RateLimitConfig;
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

export interface HealthResult {
  healthy: boolean;
  latency_ms: number;
  error?: string;
  /** HTTP status code (present when health check got a response). */
  status?: number;
}

// ---------------------------------------------------------------------------
// Connector interface
// ---------------------------------------------------------------------------

export interface ConnectorInterface {
  /** Machine-readable connector name (e.g. "stripe", "github") */
  readonly name: string;
  /** SemVer version string */
  readonly version: string;

  /**
   * Initialize connector: validate credentials, test connection.
   * Throws if required env vars / credentials are missing.
   */
  init(): Promise<void>;

  /**
   * Health check -- returns latency and error info.
   * Must not throw; errors are reported in the return value.
   */
  health(): Promise<HealthResult>;

  /**
   * Execute an API call against the third-party service.
   *
   * @param method  Dot-delimited method name, e.g. "charges.create"
   * @param params  Method-specific parameters
   */
  call(method: string, params: Record<string, unknown>): Promise<ConnectorResult>;

  /**
   * Handle an incoming webhook request.
   *
   * @param headers  Lowercased HTTP headers
   * @param body     Raw request body (string)
   */
  webhook(headers: Record<string, string>, body: string): Promise<WebhookEvent>;

  /**
   * Optional: pull the latest state of a remote resource.
   */
  sync?(resource: string): Promise<unknown>;

  /**
   * Graceful shutdown -- close connections, flush buffers.
   */
  shutdown(): Promise<void>;
}
