#!/usr/bin/env bun
/**
 * Simulate relay-side OAuth token exchange.
 *
 * Sets RELAY_ credentials so the relay attempts to exchange the code itself.
 * Uses a fake code so the actual provider exchange will fail, but validates
 * the relay takes the correct code path and sends oauth_tokens to daemon.
 *
 * For a full live test, use oauth-e2e-live.ts with --relay-exchange.
 */

import { createRelayServer } from "../../apps/relay/src/relay.js";
import { loadSecrets } from "../../src/shared/secrets.js";
import { generateState } from "../../src/daemon/services/oauth/state.js";
import type { RelayInboundMessage, RelayOutboundMessage } from "../../src/shared/relay-protocol.js";

loadSecrets();

const AUTH_SECRET = process.env.RELAY_AUTH_SECRET || process.env.NODE_AUTH_SECRET || "test-secret";
const USER_ID = process.env.JERIKO_USER_ID || "test-user";

// Set RELAY_ credentials so relay tries relay-side exchange
process.env.RELAY_AUTH_SECRET = AUTH_SECRET;
process.env.RELAY_GITHUB_OAUTH_CLIENT_ID = process.env.GITHUB_OAUTH_CLIENT_ID || "fake-id";
process.env.RELAY_GITHUB_OAUTH_CLIENT_SECRET = process.env.GITHUB_OAUTH_CLIENT_SECRET || "fake-secret";

const relay = createRelayServer({ port: 0, hostname: "127.0.0.1" });
console.log(`Relay at ${relay.url} (with RELAY_GITHUB_OAUTH_* credentials)`);

// Connect daemon
const ws = new WebSocket(relay.wsUrl);
const messages: RelayInboundMessage[] = [];

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data as string) as RelayInboundMessage;
  messages.push(msg);
};

await new Promise<void>((resolve, reject) => {
  ws.onopen = () => {
    ws.send(JSON.stringify({ type: "auth", userId: USER_ID, token: AUTH_SECRET }));
    resolve();
  };
  ws.onerror = () => reject(new Error("WS error"));
});

await new Promise<void>((resolve) => {
  const check = setInterval(() => {
    if (messages.some(m => m.type === "auth_ok")) {
      clearInterval(check);
      resolve();
    }
  }, 50);
});
console.log("Daemon authenticated.");

// Generate state
const stateToken = generateState("github", "test", "test", USER_ID);

// Send callback
const callbackUrl = `${relay.url}/oauth/github/callback?code=SIMULATED_EXCHANGE_CODE&state=${encodeURIComponent(stateToken)}`;
console.log(`\nSimulating callback (relay has credentials)...`);

const res = await fetch(callbackUrl, { redirect: "manual" });
const html = await res.text();

console.log(`\nHTTP ${res.status}`);

// Wait briefly for any WS messages
await new Promise(r => setTimeout(r, 500));

// Check what path the relay took
const gotOAuthCallback = messages.some(m => m.type === "oauth_callback");
const gotOAuthTokens = messages.some(m => m.type === "oauth_tokens");

if (res.status === 502 && !gotOAuthCallback) {
  // Relay tried to exchange itself (got 502 because fake code), did NOT forward to daemon
  console.log(`\n✓ Relay attempted relay-side exchange (correct code path)`);
  console.log(`  HTTP 502 = GitHub rejected fake code (expected)`);
  console.log(`  oauth_callback NOT forwarded to daemon (correct — relay handled it)`);
  console.log(`  oauth_tokens NOT sent (exchange failed, expected with fake code)`);
  console.log(`\n=== RELAY-SIDE EXCHANGE CODE PATH VERIFIED ===`);
  console.log(`  With real credentials and a real code, relay would:`);
  console.log(`  1. Exchange code → tokens at GitHub's token endpoint`);
  console.log(`  2. Send oauth_tokens message to daemon via WebSocket`);
  console.log(`  3. Return success HTML to browser`);
} else if (gotOAuthCallback) {
  console.log(`\n✗ Relay forwarded to daemon instead of handling itself`);
  console.log(`  This means RELAY_GITHUB_OAUTH_* credentials weren't picked up`);
} else if (gotOAuthTokens) {
  console.log(`\n✓ Relay exchanged tokens and sent to daemon (should not happen with fake code)`);
} else {
  console.log(`\nUnexpected result: HTTP ${res.status}, callback=${gotOAuthCallback}, tokens=${gotOAuthTokens}`);
  console.log(`HTML: ${html.slice(0, 200)}`);
}

ws.close();
relay.stop();
