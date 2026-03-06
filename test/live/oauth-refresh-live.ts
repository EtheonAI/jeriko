#!/usr/bin/env bun
/**
 * Live OAuth token refresh test.
 *
 * Tests the shared oauth-exchange module against REAL provider endpoints
 * using real credentials from ~/.config/jeriko/.env.
 *
 * Usage:
 *   bun test/live/oauth-refresh-live.ts
 *
 * Requires: GMAIL_REFRESH_TOKEN, GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET
 * in ~/.config/jeriko/.env.
 */

import { loadSecrets } from "../../src/shared/secrets.js";
import { refreshAccessToken, TOKEN_EXCHANGE_PROVIDERS } from "../../src/shared/oauth-exchange.js";

// Load real credentials
loadSecrets();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function env(key: string): string {
  const val = process.env[key];
  if (!val) {
    console.error(`  SKIP: ${key} not set`);
    process.exit(0);
  }
  return val;
}

function redact(token: string): string {
  if (token.length <= 10) return "***";
  return token.slice(0, 6) + "..." + token.slice(-4);
}

// ---------------------------------------------------------------------------
// Test: Gmail token refresh
// ---------------------------------------------------------------------------

async function testGmailRefresh(): Promise<void> {
  console.log("\n--- Gmail Token Refresh (LIVE) ---\n");

  const refreshToken = env("GMAIL_REFRESH_TOKEN");
  const clientId = env("GMAIL_OAUTH_CLIENT_ID");
  const clientSecret = env("GMAIL_OAUTH_CLIENT_SECRET");

  const provider = TOKEN_EXCHANGE_PROVIDERS.get("gmail");
  if (!provider) {
    console.error("  FAIL: gmail not in TOKEN_EXCHANGE_PROVIDERS");
    process.exit(1);
  }

  console.log(`  Provider: gmail`);
  console.log(`  Token URL: ${provider.tokenUrl}`);
  console.log(`  Client ID: ${redact(clientId)}`);
  console.log(`  Refresh Token: ${redact(refreshToken)}`);
  console.log(`  Refreshing...`);

  try {
    const result = await refreshAccessToken({
      provider,
      refreshToken,
      clientId,
      clientSecret,
    });

    console.log(`  ✓ Access Token: ${redact(result.accessToken)}`);
    console.log(`  ✓ Expires In: ${result.expiresIn}s`);
    if (result.refreshToken) {
      console.log(`  ✓ New Refresh Token: ${redact(result.refreshToken)} (rotated)`);
    }
    console.log(`  ✓ Token Type: ${result.tokenType ?? "not specified"}`);
    console.log(`  ✓ Scope: ${result.scope ?? "not specified"}`);
    console.log(`\n  PASS: Gmail token refresh succeeded\n`);
  } catch (err) {
    console.error(`\n  FAIL: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Test: GDrive token refresh (shares Google credentials)
// ---------------------------------------------------------------------------

async function testGDriveRefresh(): Promise<void> {
  console.log("\n--- GDrive Token Refresh (LIVE) ---\n");

  const refreshToken = process.env.GDRIVE_REFRESH_TOKEN;
  if (!refreshToken) {
    console.log("  SKIP: GDRIVE_REFRESH_TOKEN not set");
    return;
  }

  const clientId = env("GDRIVE_OAUTH_CLIENT_ID");
  const clientSecret = env("GDRIVE_OAUTH_CLIENT_SECRET");

  const provider = TOKEN_EXCHANGE_PROVIDERS.get("gdrive");
  if (!provider) {
    console.error("  FAIL: gdrive not in TOKEN_EXCHANGE_PROVIDERS");
    process.exit(1);
  }

  console.log(`  Provider: gdrive`);
  console.log(`  Refreshing...`);

  try {
    const result = await refreshAccessToken({
      provider,
      refreshToken,
      clientId,
      clientSecret,
    });

    console.log(`  ✓ Access Token: ${redact(result.accessToken)}`);
    console.log(`  ✓ Expires In: ${result.expiresIn}s`);
    console.log(`\n  PASS: GDrive token refresh succeeded\n`);
  } catch (err) {
    console.error(`\n  FAIL: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Test: Verify refreshed token actually works (Gmail API call)
// ---------------------------------------------------------------------------

async function testRefreshedTokenWorks(): Promise<void> {
  console.log("\n--- Verify Refreshed Token (Gmail API) ---\n");

  const refreshToken = env("GMAIL_REFRESH_TOKEN");
  const clientId = env("GMAIL_OAUTH_CLIENT_ID");
  const clientSecret = env("GMAIL_OAUTH_CLIENT_SECRET");

  const provider = TOKEN_EXCHANGE_PROVIDERS.get("gmail")!;

  // Get a fresh token
  const result = await refreshAccessToken({
    provider,
    refreshToken,
    clientId,
    clientSecret,
  });

  // Use the token to hit Gmail API
  console.log(`  Calling Gmail API with refreshed token...`);
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${result.accessToken}` },
  });

  if (res.ok) {
    const profile = await res.json() as { emailAddress: string; messagesTotal: number };
    console.log(`  ✓ Email: ${profile.emailAddress}`);
    console.log(`  ✓ Messages: ${profile.messagesTotal}`);
    console.log(`\n  PASS: Refreshed token works against live API\n`);
  } else {
    console.error(`  FAIL: Gmail API returned ${res.status}`);
    const body = await res.text();
    console.error(`  Body: ${body.slice(0, 200)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log("=== Live OAuth Refresh Tests ===");
console.log("Using real credentials from ~/.config/jeriko/.env\n");

await testGmailRefresh();
await testGDriveRefresh();
await testRefreshedTokenWorks();

console.log("=== All live OAuth tests PASSED ===");
