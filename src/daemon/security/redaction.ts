// Layer 0 — Secret scrubbing.

// ---------------------------------------------------------------------------
// Redaction patterns
// ---------------------------------------------------------------------------

/** Each entry: [pattern, label for debugging]. Labels are not exposed. */
const PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  // Stripe
  { pattern: /sk_live_[0-9a-zA-Z]{24,}/g,  label: "stripe-live-key" },
  { pattern: /sk_test_[0-9a-zA-Z]{24,}/g,  label: "stripe-test-key" },
  { pattern: /rk_live_[0-9a-zA-Z]{24,}/g,  label: "stripe-restricted-key" },
  { pattern: /rk_test_[0-9a-zA-Z]{24,}/g,  label: "stripe-restricted-test-key" },
  { pattern: /whsec_[0-9a-zA-Z]{24,}/g,    label: "stripe-webhook-secret" },

  // GitHub
  { pattern: /ghp_[0-9a-zA-Z]{36,}/g,      label: "github-pat" },
  { pattern: /gho_[0-9a-zA-Z]{36,}/g,      label: "github-oauth" },
  { pattern: /ghu_[0-9a-zA-Z]{36,}/g,      label: "github-user-token" },
  { pattern: /ghs_[0-9a-zA-Z]{36,}/g,      label: "github-server-token" },
  { pattern: /ghr_[0-9a-zA-Z]{36,}/g,      label: "github-refresh-token" },
  { pattern: /github_pat_[0-9a-zA-Z_]{22,}/g, label: "github-fine-grained-pat" },

  // Google Service Account (private key ID)
  { pattern: /-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA )?PRIVATE KEY-----/g, label: "private-key-pem" },

  // AWS
  { pattern: /AKIA[0-9A-Z]{16}/g,           label: "aws-access-key" },

  // Bearer tokens in headers
  { pattern: /Bearer\s+[0-9a-zA-Z\-_.~+/]+=*/g, label: "bearer-token" },

  // Generic key=value patterns (query strings, env vars, config)
  { pattern: /password=[^\s&"']+/gi,         label: "password-value" },
  { pattern: /secret=[^\s&"']+/gi,           label: "secret-value" },
  { pattern: /token=[^\s&"']+/gi,            label: "token-value" },
  { pattern: /api_key=[^\s&"']+/gi,          label: "api-key-value" },
  { pattern: /apikey=[^\s&"']+/gi,           label: "apikey-value" },
  { pattern: /access_token=[^\s&"']+/gi,     label: "access-token-value" },
  { pattern: /client_secret=[^\s&"']+/gi,    label: "client-secret-value" },

  // Anthropic / OpenAI
  { pattern: /sk-ant-[0-9a-zA-Z\-]{20,}/g,  label: "anthropic-key" },
  { pattern: /sk-[0-9a-zA-Z]{20,}/g,        label: "openai-key" },

  // Telegram bot token
  { pattern: /\b[0-9]{8,10}:[0-9a-zA-Z_-]{35}\b/g, label: "telegram-bot-token" },

  // Generic hex secrets (32+ chars, likely API keys)
  { pattern: /(?<![0-9a-fA-F])[0-9a-f]{40,}(?![0-9a-fA-F])/g, label: "hex-secret-40+" },
];

/**
 * Exported for inspection/testing. Returns a copy of the regex array.
 */
export const REDACTION_PATTERNS: RegExp[] = PATTERNS.map((p) => new RegExp(p.pattern.source, p.pattern.flags));

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const PLACEHOLDER = "[REDACTED]";

/**
 * Replace all detected secrets in `text` with `[REDACTED]`.
 * Returns the scrubbed string (original is not mutated).
 */
export function redact(text: string): string {
  let result = text;
  for (const { pattern } of PATTERNS) {
    // Reset lastIndex in case a pattern was used before (global flag)
    pattern.lastIndex = 0;
    result = result.replace(pattern, PLACEHOLDER);
  }
  return result;
}

/**
 * Check whether `text` contains any detectable secrets.
 * Does not modify the string.
 */
export function containsSecrets(text: string): boolean {
  for (const { pattern } of PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) return true;
  }
  return false;
}
