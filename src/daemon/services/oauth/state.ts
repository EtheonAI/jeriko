// OAuth state manager — CSRF protection and PKCE verifier storage.
//
// Each /connect <name> creates a random state token tied to the provider,
// the originating chat (so we can send confirmation back), and an optional
// PKCE code verifier. Tokens auto-expire after 10 minutes.

import { randomBytes, createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PendingOAuth {
  provider: string;
  chatId: string;
  channelName: string;
  codeVerifier?: string;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// State store
// ---------------------------------------------------------------------------

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const pending = new Map<string, PendingOAuth>();

/** Prune expired entries. Called on every write/read to keep the map clean. */
function prune(): void {
  const now = Date.now();
  for (const [token, entry] of pending) {
    if (now - entry.createdAt > STATE_TTL_MS) {
      pending.delete(token);
    }
  }
}

/**
 * Generate a CSRF state token and store the pending OAuth context.
 * Returns the opaque state string to embed in the authorization URL.
 */
export function generateState(
  provider: string,
  chatId: string,
  channelName: string,
): string {
  prune();
  const token = randomBytes(32).toString("hex");
  pending.set(token, {
    provider,
    chatId,
    channelName,
    createdAt: Date.now(),
  });
  return token;
}

/**
 * Consume a state token — returns the pending entry and removes it.
 * Returns null if the token is unknown or expired (CSRF mismatch).
 */
export function consumeState(token: string): PendingOAuth | null {
  prune();
  const entry = pending.get(token);
  if (!entry) return null;
  pending.delete(token);
  return entry;
}

/**
 * Attach a PKCE code verifier to an existing state entry.
 * Called after generateState() when the provider requires PKCE.
 */
export function setCodeVerifier(token: string, verifier: string): void {
  const entry = pending.get(token);
  if (entry) {
    entry.codeVerifier = verifier;
  }
}

// ---------------------------------------------------------------------------
// PKCE helpers (RFC 7636)
// ---------------------------------------------------------------------------

/** Generate a random code verifier (43–128 chars, URL-safe). */
export function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

/** Derive the S256 code challenge from a verifier. */
export function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}
