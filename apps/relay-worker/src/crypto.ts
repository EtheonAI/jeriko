// Relay Worker — Web Crypto API helpers.
//
// Replaces node:crypto functions used in the Bun relay with the Web Crypto
// API available in Cloudflare Workers. All operations are async because
// Web Crypto is promise-based.
//
// Equivalences:
//   node:crypto createHmac()       → hmacSHA256() / hmacSHA256Hex()
//   node:crypto timingSafeEqual()  → safeCompare() (HMAC + XOR accumulate)
//   node:crypto randomUUID()       → crypto.randomUUID() (native in Workers)

const encoder = new TextEncoder();

// ---------------------------------------------------------------------------
// HMAC-SHA256
// ---------------------------------------------------------------------------

/**
 * Import a raw string key as a CryptoKey for HMAC-SHA256 signing.
 */
async function importHmacKey(rawKey: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(rawKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

/**
 * Compute HMAC-SHA256 of data using a string key.
 * Returns raw bytes as ArrayBuffer.
 */
export async function hmacSHA256(key: string, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await importHmacKey(key);
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
}

/**
 * Compute HMAC-SHA256 of data using a string key.
 * Returns hex-encoded string.
 */
export async function hmacSHA256Hex(key: string, data: string): Promise<string> {
  const buffer = await hmacSHA256(key, data);
  return bufferToHex(buffer);
}

// ---------------------------------------------------------------------------
// Timing-safe comparison
// ---------------------------------------------------------------------------

/**
 * Timing-safe string comparison.
 *
 * HMAC both inputs with a fixed key to normalize length, then XOR-accumulate
 * the resulting bytes. This prevents:
 *   1. Length oracle attacks (inputs are hashed to fixed 32 bytes)
 *   2. Timing attacks (XOR all bytes unconditionally, no early return)
 *
 * Equivalent to the Bun relay's `safeCompare()` using node:crypto's
 * `createHmac` + `timingSafeEqual`, adapted for Web Crypto.
 */
export async function safeCompare(a: string, b: string): Promise<boolean> {
  const fixedKey = "relay-auth-compare";
  const [hashA, hashB] = await Promise.all([
    hmacSHA256(fixedKey, a),
    hmacSHA256(fixedKey, b),
  ]);

  const bytesA = new Uint8Array(hashA);
  const bytesB = new Uint8Array(hashB);

  // HMAC output is always 32 bytes, but guard against implementation quirks.
  if (bytesA.length !== bytesB.length) return false;

  let result = 0;
  for (let i = 0; i < bytesA.length; i++) {
    result |= bytesA[i]! ^ bytesB[i]!;
  }
  return result === 0;
}

// ---------------------------------------------------------------------------
// Stripe signature verification
// ---------------------------------------------------------------------------

/** Maximum allowed clock skew between Stripe's timestamp and our server (5 min). */
const MAX_TIMESTAMP_DRIFT_SEC = 300;

/**
 * Verify Stripe webhook signature using HMAC-SHA256.
 *
 * Parses the `Stripe-Signature` header format: `t=timestamp,v1=sig[,v1=sig2]`
 * Supports multiple v1 signatures (Stripe sends these during key rotation).
 * Rejects timestamps older than 5 minutes (replay protection).
 *
 * Uses `indexOf("=")` + `slice` for parsing — same approach as the daemon's
 * proven implementation — to correctly extract the full value after the first `=`.
 *
 * Equivalent to `src/daemon/services/connectors/stripe/webhook.ts`, adapted
 * for async Web Crypto operations.
 */
export async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
): Promise<boolean> {
  if (!signatureHeader || !secret) return false;

  try {
    // Parse the header using indexOf + slice (handles any value content safely).
    let timestamp: string | undefined;
    const v1Signatures: string[] = [];

    for (const item of signatureHeader.split(",")) {
      const idx = item.indexOf("=");
      if (idx === -1) continue;
      const key = item.slice(0, idx).trim();
      const value = item.slice(idx + 1).trim();
      if (key === "t") timestamp = value;
      else if (key === "v1") v1Signatures.push(value);
    }

    if (!timestamp || v1Signatures.length === 0) return false;

    // Replay protection: reject timestamps outside tolerance.
    const ts = parseInt(timestamp, 10);
    if (isNaN(ts)) return false;
    if (Math.abs(Date.now() / 1000 - ts) > MAX_TIMESTAMP_DRIFT_SEC) return false;

    // Compute expected signature.
    const signedPayload = `${timestamp}.${rawBody}`;
    const computedSig = await hmacSHA256Hex(secret, signedPayload);

    // Compare against every v1 signature (Stripe may include multiple).
    for (const sig of v1Signatures) {
      if (await safeCompare(computedSig, sig)) return true;
    }

    return false;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bufferToHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
