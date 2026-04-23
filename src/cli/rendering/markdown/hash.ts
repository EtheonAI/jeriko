/**
 * Fast deterministic string hash (FNV-1a 32-bit).
 *
 * Used as part of the markdown-cache key. Not cryptographic — just a small
 * well-known hash that avoids an expensive `JSON.stringify` or Map-over-
 * string-keys when cache entries grow. Collisions across 32-bit space are
 * astronomical for the input sizes we deal with (markdown turns).
 */

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * FNV-1a 32-bit hash. Returns a non-negative unsigned 32-bit integer
 * encoded as its hex string so cache keys stay short.
 */
export function fnv1a(str: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    // Multiply + mask to 32 bits (JS bitwise ops are 32-bit already).
    hash = (hash * FNV_PRIME) >>> 0;
  }
  return hash.toString(16);
}
