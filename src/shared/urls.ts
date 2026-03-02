// Shared — Public URL resolution for the Jeriko daemon.
// Single source of truth for all public-facing URLs (OAuth, webhooks, shares).

/** Default public base URL (Cloudflare tunnel). */
const DEFAULT_PUBLIC_URL = "https://bot.jeriko.ai";

/**
 * Get the public base URL for the Jeriko daemon.
 * Used for OAuth callbacks, webhook endpoints, and share links.
 *
 * Resolution order:
 *   1. JERIKO_PUBLIC_URL env var (explicit override)
 *   2. Default: https://bot.jeriko.ai (named Cloudflare tunnel)
 */
export function getPublicUrl(): string {
  return process.env.JERIKO_PUBLIC_URL ?? DEFAULT_PUBLIC_URL;
}

/**
 * Get the base URL for share links.
 * Allows a separate domain for public share pages (e.g. jeriko.ai vs bot.jeriko.ai).
 *
 * Resolution order:
 *   1. JERIKO_SHARE_URL env var (dedicated share domain)
 *   2. JERIKO_PUBLIC_URL env var (shared with API)
 *   3. Default: https://bot.jeriko.ai
 */
export function getShareUrl(): string {
  return process.env.JERIKO_SHARE_URL ?? getPublicUrl();
}

/**
 * Build a full share link URL from a share ID.
 */
export function buildShareLink(shareId: string): string {
  return `${getShareUrl()}/s/${shareId}`;
}
