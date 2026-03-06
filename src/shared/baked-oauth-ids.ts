// Build-time OAuth client IDs — injected via `define` in scripts/build.ts.
//
// These are PUBLIC values (OAuth client IDs, not secrets). They're safe to embed
// in the binary so new users get zero-config OAuth. The matching client secrets
// live on the relay server as Cloudflare Worker secrets.
//
// At compile time, Bun's `define` replaces the __BAKED_* globals with string
// literals from the build environment. At dev time (no bundler), they resolve
// to empty strings and users provide client IDs via env vars instead.
//
// Resolution order (in providers.ts getClientId()):
//   1. Env var override (e.g. GITHUB_OAUTH_CLIENT_ID) — user-provided
//   2. Baked-in value from this module — Jeriko's registered OAuth apps
//   3. undefined — not configured

// Declared so TypeScript doesn't error on unbundled references.
// Bun's `define` replaces these at build time; at dev time they're undefined.
declare const __BAKED_GITHUB_CLIENT_ID__: string | undefined;
declare const __BAKED_GOOGLE_CLIENT_ID__: string | undefined;
declare const __BAKED_MICROSOFT_CLIENT_ID__: string | undefined;
declare const __BAKED_X_CLIENT_ID__: string | undefined;
declare const __BAKED_VERCEL_CLIENT_ID__: string | undefined;
declare const __BAKED_STRIPE_CLIENT_ID__: string | undefined;
declare const __BAKED_HUBSPOT_CLIENT_ID__: string | undefined;
declare const __BAKED_SHOPIFY_CLIENT_ID__: string | undefined;

/**
 * Baked-in OAuth client IDs, keyed by a logical group name.
 * Multiple providers can share the same client ID (e.g. gmail + gdrive share Google's).
 */
export const BAKED_OAUTH_CLIENT_IDS: Readonly<Record<string, string | undefined>> = {
  github:    typeof __BAKED_GITHUB_CLIENT_ID__    !== "undefined" ? __BAKED_GITHUB_CLIENT_ID__    : undefined,
  google:    typeof __BAKED_GOOGLE_CLIENT_ID__    !== "undefined" ? __BAKED_GOOGLE_CLIENT_ID__    : undefined,
  microsoft: typeof __BAKED_MICROSOFT_CLIENT_ID__ !== "undefined" ? __BAKED_MICROSOFT_CLIENT_ID__ : undefined,
  x:         typeof __BAKED_X_CLIENT_ID__         !== "undefined" ? __BAKED_X_CLIENT_ID__         : undefined,
  vercel:    typeof __BAKED_VERCEL_CLIENT_ID__    !== "undefined" ? __BAKED_VERCEL_CLIENT_ID__    : undefined,
  stripe:    typeof __BAKED_STRIPE_CLIENT_ID__    !== "undefined" ? __BAKED_STRIPE_CLIENT_ID__    : undefined,
  hubspot:   typeof __BAKED_HUBSPOT_CLIENT_ID__   !== "undefined" ? __BAKED_HUBSPOT_CLIENT_ID__   : undefined,
  shopify:   typeof __BAKED_SHOPIFY_CLIENT_ID__   !== "undefined" ? __BAKED_SHOPIFY_CLIENT_ID__   : undefined,
};
