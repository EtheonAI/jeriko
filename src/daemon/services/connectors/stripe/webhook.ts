/**
 * Stripe webhook signature verification.
 *
 * Stripe signs webhooks with HMAC-SHA256. The `Stripe-Signature` header
 * contains a timestamp (`t`) and one or more signatures (`v1`).
 *
 *   Stripe-Signature: t=1614556800,v1=abc123...,v1=def456...
 *
 * The signed payload is: `${timestamp}.${rawBody}`
 *
 * We verify by computing HMAC-SHA256(secret, signedPayload) and comparing
 * against each `v1` signature using timing-safe equality.
 *
 * Reference: https://stripe.com/docs/webhooks/signatures
 */

import { createHmac, timingSafeEqual } from "crypto";

/** Maximum allowed clock skew between Stripe's timestamp and our server (5 min). */
const MAX_TIMESTAMP_DRIFT_SEC = 300;

/**
 * Verify a Stripe webhook signature.
 *
 * @param rawBody       The raw request body (must be the exact bytes, not re-serialised JSON)
 * @param signatureHeader  Value of the `Stripe-Signature` HTTP header
 * @param secret        Webhook signing secret (`whsec_...`)
 * @returns `true` if the signature is valid and the timestamp is within tolerance
 */
export function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
): boolean {
  if (!signatureHeader || !secret) return false;

  // 1. Parse the header into key-value pairs.
  const parts = parseSignatureHeader(signatureHeader);
  const timestamp = parts.get("t");
  const signatures = parts.getAll("v1");

  if (!timestamp || signatures.length === 0) return false;

  // 2. Reject replays: check that the timestamp is within tolerance.
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > MAX_TIMESTAMP_DRIFT_SEC) return false;

  // 3. Compute expected signature.
  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", secret).update(signedPayload).digest("hex");

  // 4. Compare against every v1 signature (Stripe may include multiple).
  for (const sig of signatures) {
    if (secureCompare(expected, sig)) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse the Stripe-Signature header into a multi-value map.
 *
 *   "t=123,v1=abc,v1=def" → Map { t: [123], v1: [abc, def] }
 */
function parseSignatureHeader(header: string): MultiMap {
  const map = new MultiMap();
  const pairs = header.split(",");
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    map.add(key, value);
  }
  return map;
}

class MultiMap {
  private data = new Map<string, string[]>();

  add(key: string, value: string): void {
    const existing = this.data.get(key);
    if (existing) {
      existing.push(value);
    } else {
      this.data.set(key, [value]);
    }
  }

  get(key: string): string | undefined {
    return this.data.get(key)?.[0];
  }

  getAll(key: string): string[] {
    return this.data.get(key) ?? [];
  }
}

/**
 * Timing-safe string comparison.
 * Returns `false` for mismatched lengths (without leaking which byte differed).
 */
function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  return timingSafeEqual(bufA, bufB);
}
