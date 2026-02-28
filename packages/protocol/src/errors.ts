// Error types for the Jeriko protocol.
// Maps to the semantic exit codes defined in lib/cli.js.

// ---------------------------------------------------------------------------
// Error codes — mirrors ExitCode enum for error-specific use
// ---------------------------------------------------------------------------

/** Semantic error codes matching Jeriko's exit code convention. */
export const ErrorCode = {
  GENERAL:   1,
  NETWORK:   2,
  AUTH:       3,
  NOT_FOUND: 5,
  TIMEOUT:   7,
  POLICY:    8,
  RATE_LIMIT: 9,
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

// ---------------------------------------------------------------------------
// Base error
// ---------------------------------------------------------------------------

/**
 * Base error class for all Jeriko errors.
 * Carries a machine-readable `code` and an HTTP-compatible `status_code`.
 */
export class JerikoError extends Error {
  /** Machine-readable semantic error code. */
  readonly code: ErrorCodeValue;
  /** HTTP status code for API responses. */
  readonly status_code: number;

  constructor(message: string, code: ErrorCodeValue, status_code: number) {
    super(message);
    this.name = "JerikoError";
    this.code = code;
    this.status_code = status_code;
    // Fix prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /** Serialize to the standard Jeriko error envelope. */
  toJSON(): { ok: false; error: string; code: ErrorCodeValue } {
    return { ok: false, error: this.message, code: this.code };
  }
}

// ---------------------------------------------------------------------------
// Specific error types
// ---------------------------------------------------------------------------

/** Resource not found (exit code 5, HTTP 404). */
export class NotFoundError extends JerikoError {
  constructor(message = "Not found") {
    super(message, ErrorCode.NOT_FOUND, 404);
    this.name = "NotFoundError";
  }
}

/** Authentication or authorization failure (exit code 3, HTTP 401). */
export class AuthError extends JerikoError {
  constructor(message = "Authentication required") {
    super(message, ErrorCode.AUTH, 401);
    this.name = "AuthError";
  }
}

/** Operation timed out (exit code 7, HTTP 504). */
export class TimeoutError extends JerikoError {
  constructor(message = "Operation timed out") {
    super(message, ErrorCode.TIMEOUT, 504);
    this.name = "TimeoutError";
  }
}

/** Command or action denied by security policy (HTTP 403). */
export class PolicyDeniedError extends JerikoError {
  /** The policy rule that caused the denial. */
  readonly reason: string;

  constructor(message = "Denied by policy", reason = "") {
    super(message, ErrorCode.POLICY, 403);
    this.name = "PolicyDeniedError";
    this.reason = reason;
  }

  override toJSON() {
    return { ...super.toJSON(), reason: this.reason };
  }
}

/** Rate limit exceeded (HTTP 429). */
export class RateLimitError extends JerikoError {
  /** Milliseconds until the rate limit resets. */
  readonly retry_after_ms: number;

  constructor(message = "Rate limit exceeded", retry_after_ms = 0) {
    super(message, ErrorCode.RATE_LIMIT, 429);
    this.name = "RateLimitError";
    this.retry_after_ms = retry_after_ms;
  }

  override toJSON() {
    return { ...super.toJSON(), retry_after_ms: this.retry_after_ms };
  }
}

/** Network error — connection refused, DNS failure, etc. (exit code 2, HTTP 502). */
export class NetworkError extends JerikoError {
  constructor(message = "Network error") {
    super(message, ErrorCode.NETWORK, 502);
    this.name = "NetworkError";
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * Reconstruct a typed JerikoError from a JSON error envelope.
 * Useful when parsing API responses on the client side.
 */
export function fromErrorJSON(json: { error: string; code: number }): JerikoError {
  switch (json.code) {
    case ErrorCode.NOT_FOUND:
      return new NotFoundError(json.error);
    case ErrorCode.AUTH:
      return new AuthError(json.error);
    case ErrorCode.TIMEOUT:
      return new TimeoutError(json.error);
    case ErrorCode.POLICY:
      return new PolicyDeniedError(json.error);
    case ErrorCode.RATE_LIMIT:
      return new RateLimitError(json.error);
    case ErrorCode.NETWORK:
      return new NetworkError(json.error);
    default:
      return new JerikoError(json.error, ErrorCode.GENERAL, 500);
  }
}
