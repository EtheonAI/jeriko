// Typed environment-variable parsing.
//
// Replaces bare `parseInt(process.env.X ?? "default", 10)` patterns that
// silently resolve to `NaN` on malformed input. Every parse is bounded
// and returns a documented fallback.
//
// Usage:
//   const port = parseEnvInt("IMAP_PORT", 993, { min: 1, max: 65535 });

export interface IntOptions {
  /** Inclusive lower bound. Values below clamp to `fallback`. */
  readonly min?: number;
  /** Inclusive upper bound. Values above clamp to `fallback`. */
  readonly max?: number;
  /** Source env map — default `process.env`. Override for tests. */
  readonly env?: Readonly<Record<string, string | undefined>>;
}

export interface BoolOptions {
  /** Source env map — default `process.env`. Override for tests. */
  readonly env?: Readonly<Record<string, string | undefined>>;
}

export interface StringOptions {
  /** Source env map — default `process.env`. Override for tests. */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /**
   * Set of accepted values; any other is treated as missing. Useful for
   * closed enums (e.g. `"stable" | "latest"`).
   */
  readonly oneOf?: readonly string[];
}

/**
 * Parse an integer env var, returning `fallback` when missing, non-numeric,
 * or out of bounds. Never throws.
 */
export function parseEnvInt(name: string, fallback: number, options: IntOptions = {}): number {
  const env = options.env ?? process.env;
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;

  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;

  if (options.min !== undefined && n < options.min) return fallback;
  if (options.max !== undefined && n > options.max) return fallback;

  return n;
}

/**
 * Parse a boolean env var. Treats the common truthy strings as `true`
 * ("1", "true", "yes", "on") and common falsy as `false` ("0", "false",
 * "no", "off"). Unknown strings fall back to `fallback`.
 */
export function parseEnvBool(name: string, fallback: boolean, options: BoolOptions = {}): boolean {
  const env = options.env ?? process.env;
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;

  const lower = raw.trim().toLowerCase();
  if (TRUTHY.has(lower)) return true;
  if (FALSY.has(lower)) return false;
  return fallback;
}

const TRUTHY: ReadonlySet<string> = new Set(["1", "true", "yes", "on", "t", "y"]);
const FALSY: ReadonlySet<string> = new Set(["0", "false", "no", "off", "f", "n"]);

/**
 * Read a string env var with optional enum restriction.
 */
export function parseEnvString(name: string, fallback: string, options: StringOptions = {}): string {
  const env = options.env ?? process.env;
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;

  if (options.oneOf && !options.oneOf.includes(raw)) return fallback;
  return raw;
}
