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

/**
 * Verify Stripe webhook signature using HMAC-SHA256.
 *
 * Parses the `Stripe-Signature` header format: `t=timestamp,v1=signature`
 * Rejects timestamps older than 5 minutes (replay protection).
 *
 * Equivalent to the Bun relay's `verifyStripeSignature()`, adapted for
 * async Web Crypto operations.
 */
export async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
): Promise<boolean> {
  try {
    const parts: Record<string, string> = {};

    for (const item of signatureHeader.split(",")) {
      const [key, value] = item.split("=", 2);
      if (key && value) parts[key.trim()] = value.trim();
    }

    const timestamp = parts.t;
    const expectedSig = parts.v1;
    if (!timestamp || !expectedSig) return false;

    // Replay protection: reject timestamps older than 5 minutes
    const ts = parseInt(timestamp, 10);
    if (isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

    const signedPayload = `${timestamp}.${rawBody}`;
    const computedSig = await hmacSHA256Hex(secret, signedPayload);

    return safeCompare(computedSig, expectedSig);
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
