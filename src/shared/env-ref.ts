// Layer 0 — Environment variable reference resolver.
//
// Supports two formats:
//   "{env:VAR_NAME}" → reads process.env.VAR_NAME (throws if not set)
//   "literal-value"  → passes through unchanged
//
// Used by ProviderConfig to defer API key resolution to call-time,
// so keys are read from the environment rather than stored in config files.

const ENV_REF_PATTERN = /^\{env:([A-Za-z_][A-Za-z0-9_]*)\}$/;

/**
 * Resolve a value that may be an environment variable reference.
 *
 * @param value  Either a literal string or an env ref like "{env:MY_API_KEY}".
 * @returns      The resolved value.
 * @throws       If the value is an env ref and the variable is not set.
 */
export function resolveEnvRef(value: string): string {
  const match = value.match(ENV_REF_PATTERN);
  if (!match) return value;

  const varName = match[1]!;
  const resolved = process.env[varName];
  if (resolved === undefined || resolved === "") {
    throw new Error(
      `Environment variable ${varName} is not set (referenced as "${value}")`,
    );
  }
  return resolved;
}

/**
 * Check if a value is an environment variable reference.
 */
export function isEnvRef(value: string): boolean {
  return ENV_REF_PATTERN.test(value);
}
