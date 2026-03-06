#!/usr/bin/env bun
/**
 * Live production OAuth test.
 *
 * Connects to the REAL relay at bot.jeriko.ai, generates a GitHub OAuth URL,
 * and waits for you to click it. After authorization, the relay exchanges
 * the code for tokens and sends them to your daemon.
 *
 * Usage:
 *   bun test/live/oauth-production-test.ts
 *
 * Then click the URL printed and authorize with GitHub.
 */

import { loadSecrets } from "../../src/shared/secrets.js";
import { getOAuthProvider, getClientId } from "../../src/daemon/services/oauth/providers.js";
import { generateState, generateCodeVerifier, generateCodeChallenge, setCodeVerifier } from "../../src/daemon/services/oauth/state.js";
import { buildOAuthCallbackUrl } from "../../src/shared/urls.js";
import type { RelayInboundMessage, RelayOutboundMessage } from "../../src/shared/relay-protocol.js";

loadSecrets();

const RELAY_URL = process.env.JERIKO_RELAY_URL ?? "wss://bot.jeriko.ai/relay";
const AUTH_SECRET = process.env.RELAY_AUTH_SECRET ?? process.env.NODE_AUTH_SECRET;
const USER_ID = process.env.JERIKO_USER_ID;
const PROVIDER = process.argv[2] ?? "github";

if (!AUTH_SECRET || !USER_ID) {
  console.error("Missing RELAY_AUTH_SECRET or JERIKO_USER_ID in ~/.config/jeriko/.env");
  process.exit(1);
}

const provider = getOAuthProvider(PROVIDER);
if (!provider) {
  console.error(`Unknown provider: ${PROVIDER}`);
  process.exit(1);
}

const clientId = getClientId(provider);
if (!clientId) {
  console.error(`No client ID for ${PROVIDER}`);
  process.exit(1);
}

console.log(`\n=== Production OAuth Test ===`);
console.log(`Provider: ${provider.label}`);
console.log(`Relay: ${RELAY_URL}`);
console.log(`User: ${USER_ID.slice(0, 8)}...`);
console.log(`Client ID: ${clientId.slice(0, 8)}...`);

// Connect to production relay
const ws = new WebSocket(RELAY_URL);
const messages: RelayInboundMessage[] = [];

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data as string) as RelayInboundMessage;
  messages.push(msg);

  if (msg.type === "oauth_tokens") {
    const t = msg as any;
    console.log(`\n${"=".repeat(60)}`);
    console.log(`RECEIVED TOKENS FROM RELAY!`);
    console.log(`  Access Token: ${t.accessToken?.slice(0, 15)}...`);
    if (t.refreshToken) console.log(`  Refresh Token: ${t.refreshToken.slice(0, 10)}...`);
    if (t.expiresIn) console.log(`  Expires In: ${t.expiresIn}s`);
    console.log(`${"=".repeat(60)}`);

    // Save the token
    const { saveSecret } = require("../../src/shared/secrets.js");
    saveSecret(provider.tokenEnvVar, t.accessToken);
    console.log(`  Saved ${provider.tokenEnvVar} to ~/.config/jeriko/.env`);
    if (t.refreshToken && provider.refreshTokenEnvVar) {
      saveSecret(provider.refreshTokenEnvVar, t.refreshToken);
      console.log(`  Saved ${provider.refreshTokenEnvVar}`);
    }

    // Verify the token works
    if (PROVIDER === "github") {
      fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${t.accessToken}`, Accept: "application/json" },
      }).then(res => res.json()).then((user: any) => {
        console.log(`\n  GitHub user: ${user.login} (${user.name})`);
        console.log(`  TOKEN IS VALID AND WORKING!`);
        ws.close();
        process.exit(0);
      });
    } else {
      ws.close();
      process.exit(0);
    }
  }

  if (msg.type === "oauth_callback") {
    // Daemon-side fallback — relay forwarded callback to us
    const cb = msg as any;
    console.log(`\n  [daemon] Received oauth_callback (daemon-side fallback)`);
    console.log(`  Provider: ${cb.provider}`);
    console.log(`  Code: ${cb.params.code?.slice(0, 10)}...`);

    // Handle the callback
    import("../../src/daemon/api/routes/oauth.js").then(async ({ handleOAuthCallback }) => {
      const result = await handleOAuthCallback(cb.provider, cb.params, null);
      ws.send(JSON.stringify({
        type: "oauth_result",
        requestId: cb.requestId,
        statusCode: result.statusCode,
        html: result.html,
      }));

      if (result.statusCode === 200) {
        console.log(`  Token exchange succeeded! Token saved.`);

        if (PROVIDER === "github") {
          loadSecrets();
          const ghToken = process.env.GITHUB_TOKEN;
          if (ghToken) {
            const res = await fetch("https://api.github.com/user", {
              headers: { Authorization: `Bearer ${ghToken}`, Accept: "application/json" },
            });
            const user = await res.json() as any;
            console.log(`\n  GitHub user: ${user.login} (${user.name})`);
            console.log(`  TOKEN IS VALID AND WORKING!`);
          }
        }
      } else {
        console.error(`  Exchange failed: ${result.statusCode}`);
      }

      ws.close();
      process.exit(result.statusCode === 200 ? 0 : 1);
    });
  }
};

await new Promise<void>((resolve, reject) => {
  ws.onopen = () => {
    ws.send(JSON.stringify({
      type: "auth",
      userId: USER_ID,
      token: AUTH_SECRET,
    }));
    resolve();
  };
  ws.onerror = () => reject(new Error("WebSocket error"));
});

// Wait for auth_ok
const authStart = Date.now();
while (Date.now() - authStart < 10_000) {
  if (messages.some(m => m.type === "auth_ok")) break;
  if (messages.some(m => m.type === "auth_fail")) {
    console.error("Auth failed!");
    process.exit(1);
  }
  await new Promise(r => setTimeout(r, 100));
}

if (!messages.some(m => m.type === "auth_ok")) {
  console.error("Auth timeout");
  process.exit(1);
}

console.log("  Connected to production relay.");

// Generate OAuth URL
const stateToken = generateState(PROVIDER, "cli", "cli", USER_ID);
const callbackUrl = buildOAuthCallbackUrl(PROVIDER);

const authParams = new URLSearchParams({
  client_id: clientId,
  redirect_uri: callbackUrl,
  state: stateToken,
  response_type: "code",
});

if (provider.scopes.length > 0) {
  authParams.set("scope", provider.scopes.join(" "));
}

// PKCE
if (provider.usePKCE) {
  const verifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);
  setCodeVerifier(stateToken, verifier);
  authParams.set("code_challenge", challenge);
  authParams.set("code_challenge_method", "S256");
}

if (provider.extraTokenParams) {
  for (const [key, value] of Object.entries(provider.extraTokenParams)) {
    if (key === "access_type" || key === "prompt") authParams.set(key, value);
  }
}

const authUrl = `${provider.authUrl}?${authParams.toString()}`;

console.log(`\n${"=".repeat(60)}`);
console.log(`CLICK THIS URL TO AUTHORIZE ${provider.label.toUpperCase()}:\n`);
console.log(authUrl);
console.log(`\n${"=".repeat(60)}`);
console.log(`\nWaiting for callback (120s)...`);
console.log(`The relay at bot.jeriko.ai will handle the callback.`);

// Wait
setTimeout(() => {
  console.error("\nTimeout — no callback received.");
  ws.close();
  process.exit(1);
}, 120_000);
