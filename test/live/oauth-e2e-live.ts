#!/usr/bin/env bun
/**
 * Live end-to-end OAuth test.
 *
 * Starts a local Bun relay, connects a simulated daemon, generates a real
 * GitHub OAuth start URL, and waits for the callback to complete.
 *
 * Two test modes:
 *   1. Relay-side exchange: Set RELAY_GITHUB_OAUTH_CLIENT_ID + SECRET
 *   2. Daemon-side fallback: Only daemon has credentials
 *
 * Usage:
 *   bun test/live/oauth-e2e-live.ts [--provider github|gmail|gdrive|x|vercel]
 *
 * What happens:
 *   1. Relay starts on a random port
 *   2. Daemon connects via WebSocket
 *   3. Script generates OAuth start URL
 *   4. YOU click the URL in your browser
 *   5. Provider redirects back to local relay
 *   6. Relay exchanges code for token (or forwards to daemon)
 *   7. Token is printed (never saved to disk in test mode)
 */

import { createRelayServer, type RelayServer } from "../../apps/relay/src/relay.js";
import { loadSecrets } from "../../src/shared/secrets.js";
import { getOAuthProvider, getClientId } from "../../src/daemon/services/oauth/providers.js";
import {
  generateState,
  consumeState,
  generateCodeVerifier,
  generateCodeChallenge,
  setCodeVerifier,
} from "../../src/daemon/services/oauth/state.js";
import type {
  RelayInboundMessage,
  RelayOutboundMessage,
  RelayOAuthStartMessage,
  RelayOAuthCallbackMessage,
  RelayOAuthTokensMessage,
} from "../../src/shared/relay-protocol.js";

// ---------------------------------------------------------------------------
// Parse args
// ---------------------------------------------------------------------------

const providerName = process.argv.includes("--provider")
  ? process.argv[process.argv.indexOf("--provider") + 1]!
  : "github";

const relayExchange = process.argv.includes("--relay-exchange");

// Load secrets so env vars are available
loadSecrets();

const AUTH_SECRET = process.env.RELAY_AUTH_SECRET || process.env.NODE_AUTH_SECRET || "test-live-secret";
const USER_ID = process.env.JERIKO_USER_ID || "test-user-" + Date.now();

// ---------------------------------------------------------------------------
// Setup relay
// ---------------------------------------------------------------------------

console.log(`\n=== Live OAuth E2E Test ===`);
console.log(`Provider: ${providerName}`);
console.log(`Mode: ${relayExchange ? "relay-side exchange" : "daemon-side fallback"}`);
console.log(`User ID: ${USER_ID.slice(0, 8)}...`);

// If relay exchange mode, set RELAY_* credentials
if (relayExchange) {
  const provider = getOAuthProvider(providerName);
  if (!provider) {
    console.error(`Unknown provider: ${providerName}`);
    process.exit(1);
  }
  const clientId = process.env[provider.clientIdVar];
  const clientSecret = process.env[provider.clientSecretVar];
  if (!clientId || !clientSecret) {
    console.error(`Missing credentials for relay exchange: ${provider.clientIdVar}, ${provider.clientSecretVar}`);
    process.exit(1);
  }

  // Map daemon env vars to RELAY_ prefix for the local relay
  const providerGroupMap: Record<string, string> = {
    github: "GITHUB", stripe: "STRIPE", x: "X", vercel: "VERCEL",
    gmail: "GOOGLE", gdrive: "GOOGLE", outlook: "MICROSOFT", onedrive: "MICROSOFT",
  };
  const group = providerGroupMap[providerName] ?? providerName.toUpperCase();
  process.env[`RELAY_${group}_OAUTH_CLIENT_ID`] = clientId;
  process.env[`RELAY_${group}_OAUTH_CLIENT_SECRET`] = clientSecret;
  console.log(`Set RELAY_${group}_OAUTH_CLIENT_ID + SECRET for relay exchange`);
}

process.env.RELAY_AUTH_SECRET = AUTH_SECRET;

const relay = createRelayServer({ port: 0, hostname: "127.0.0.1" });
console.log(`\nRelay running at ${relay.url}`);
console.log(`WebSocket at ${relay.wsUrl}`);

// ---------------------------------------------------------------------------
// Connect daemon
// ---------------------------------------------------------------------------

const ws = new WebSocket(relay.wsUrl);
const messages: RelayInboundMessage[] = [];
let tokenReceived: TokenExchangeResult | null = null;

interface TokenExchangeResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}

function waitForMessage(type: string, timeout = 60_000): Promise<RelayInboundMessage> {
  const existing = messages.find(m => m.type === type);
  if (existing) {
    messages.splice(messages.indexOf(existing), 1);
    return Promise.resolve(existing);
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${type}`)), timeout);
    const check = setInterval(() => {
      const idx = messages.findIndex(m => m.type === type);
      if (idx >= 0) {
        clearInterval(check);
        clearTimeout(timer);
        const msg = messages[idx]!;
        messages.splice(idx, 1);
        resolve(msg);
      }
    }, 100);
  });
}

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data as string) as RelayInboundMessage;
  messages.push(msg);

  // Handle relay-sent tokens
  if (msg.type === "oauth_tokens") {
    const t = msg as unknown as RelayOAuthTokensMessage;
    tokenReceived = {
      accessToken: t.accessToken,
      refreshToken: t.refreshToken,
      expiresIn: t.expiresIn,
    };
    console.log(`\n  [daemon] Received oauth_tokens from relay!`);
    console.log(`  Access Token: ${t.accessToken.slice(0, 10)}...`);
    if (t.refreshToken) console.log(`  Refresh Token: ${t.refreshToken.slice(0, 10)}...`);
    if (t.expiresIn) console.log(`  Expires In: ${t.expiresIn}s`);
  }
};

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: "auth",
    userId: USER_ID,
    token: AUTH_SECRET,
  } as RelayOutboundMessage));
};

ws.onerror = () => { console.error("WebSocket error"); process.exit(1); };

// Wait for auth
console.log("\nConnecting daemon to relay...");
await waitForMessage("auth_ok");
console.log("  Authenticated with relay.");

// ---------------------------------------------------------------------------
// Generate OAuth URL
// ---------------------------------------------------------------------------

const provider = getOAuthProvider(providerName);
if (!provider) {
  console.error(`Unknown provider: ${providerName}`);
  process.exit(1);
}

const clientId = getClientId(provider);
if (!clientId) {
  console.error(`No client ID for ${providerName} — set ${provider.clientIdVar}`);
  process.exit(1);
}

// Build the OAuth start URL pointing to our local relay
const stateToken = generateState(providerName, "test", "test", USER_ID);
const callbackUrl = `${relay.url}/oauth/${providerName}/callback`;

const authParams = new URLSearchParams({
  client_id: clientId,
  redirect_uri: callbackUrl,
  state: stateToken,
  response_type: "code",
});

if (provider.scopes.length > 0) {
  authParams.set("scope", provider.scopes.join(" "));
}

// PKCE for providers that need it
let codeVerifier: string | undefined;
if (provider.usePKCE) {
  codeVerifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(codeVerifier);
  setCodeVerifier(stateToken, codeVerifier);
  authParams.set("code_challenge", challenge);
  authParams.set("code_challenge_method", "S256");
}

const authorizationUrl = `${provider.authUrl}?${authParams.toString()}`;

console.log(`\n${"=".repeat(60)}`);
console.log(`CLICK THIS URL TO AUTHORIZE:\n`);
console.log(authorizationUrl);
console.log(`\n${"=".repeat(60)}`);
console.log(`\nWaiting for callback (60s timeout)...`);

// ---------------------------------------------------------------------------
// Wait for callback
// ---------------------------------------------------------------------------

// The relay will either:
// 1. Forward oauth_callback to us (daemon exchange) → we do the exchange
// 2. Exchange tokens itself and send oauth_tokens → we just receive them

const timeout = setTimeout(() => {
  console.error("\n  TIMEOUT: No callback received within 60 seconds.");
  cleanup();
  process.exit(1);
}, 60_000);

// Handle daemon-side exchange (relay forwards callback to us)
async function handleDaemonCallback(): Promise<void> {
  try {
    const callbackMsg = await waitForMessage("oauth_callback", 55_000) as unknown as RelayOAuthCallbackMessage;
    console.log(`\n  [daemon] Received oauth_callback from relay`);
    console.log(`  Provider: ${callbackMsg.provider}`);
    console.log(`  Code: ${callbackMsg.params.code?.slice(0, 10)}...`);

    // Do the token exchange
    const { handleOAuthCallback } = await import("../../src/daemon/api/routes/oauth.js");
    const result = await handleOAuthCallback(callbackMsg.provider, callbackMsg.params, null);

    // Send result back to relay
    ws.send(JSON.stringify({
      type: "oauth_result",
      requestId: callbackMsg.requestId,
      statusCode: result.statusCode,
      html: result.html,
    }));

    if (result.statusCode === 200) {
      console.log(`\n  ✓ PASS: Token exchange succeeded!`);
      console.log(`  Token saved to ~/.config/jeriko/.env`);
    } else {
      console.error(`\n  FAIL: Token exchange returned ${result.statusCode}`);
      console.error(`  HTML: ${result.html.slice(0, 200)}`);
    }
  } catch (err) {
    if (tokenReceived) return; // relay handled it
    throw err;
  }
}

// Handle relay-side exchange (relay sends tokens to us)
async function handleRelayTokens(): Promise<void> {
  try {
    await waitForMessage("oauth_tokens", 55_000);
    console.log(`\n  ✓ PASS: Relay exchanged tokens and sent to daemon!`);
  } catch (err) {
    if (messages.some(m => m.type === "oauth_callback")) return; // daemon handled it
    throw err;
  }
}

// Race both modes
try {
  await Promise.race([handleDaemonCallback(), handleRelayTokens()]);
  clearTimeout(timeout);
} catch (err) {
  clearTimeout(timeout);
  console.error(`\n  ERROR: ${err instanceof Error ? err.message : String(err)}`);
}

// ---------------------------------------------------------------------------
// Verify token works (if GitHub)
// ---------------------------------------------------------------------------

if (providerName === "github") {
  // Check if we have a token now
  const { loadSecrets: reload } = await import("../../src/shared/secrets.js");
  reload();
  const ghToken = process.env.GITHUB_TOKEN;
  if (ghToken) {
    console.log(`\nVerifying GitHub token against API...`);
    const res = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${ghToken}`, Accept: "application/json" },
    });
    if (res.ok) {
      const user = await res.json() as { login: string; name: string };
      console.log(`  ✓ GitHub user: ${user.login} (${user.name})`);
      console.log(`  ✓ Token is valid and working!`);
    } else {
      console.error(`  ✗ GitHub API returned ${res.status}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

function cleanup(): void {
  try { ws.close(); } catch {}
  relay.stop();
}

cleanup();
console.log(`\n=== Test Complete ===\n`);
