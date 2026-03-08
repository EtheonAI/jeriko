/**
 * OAuth CLI Flow — Browser-based OAuth for CLI applications.
 *
 * Opens the user's browser to the provider's auth page, receives the
 * callback, and exchanges the auth code for an API key or access token.
 *
 * Supports:
 *   - OAuth PKCE (RFC 7636) — used by OpenRouter
 *   - Standard OAuth 2.0 Authorization Code — for other providers
 *
 * Callback routing:
 *   - Default: starts a local HTTP server on a random port.
 *   - When `callbackPort` is set and the daemon is already on that port,
 *     routes the callback through the daemon's existing HTTP server via IPC.
 *   - When `callbackPort` is set and the port is free, starts a standalone
 *     server on that port.
 */

import { createServer, type Server } from "node:net";
import { randomBytes, createHash } from "node:crypto";
import { getDaemonPort } from "../../shared/config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OAuthFlowOptions {
  /** Provider's authorization URL. */
  authUrl: string;
  /** Provider's token exchange URL. */
  tokenUrl: string;
  /** OAuth client ID. */
  clientId: string;
  /** Whether to use PKCE (code_challenge). */
  pkce: boolean;
  /** Scopes to request (space-separated). */
  scopes?: string;
  /** Extra query params for the auth URL. */
  extraAuthParams?: Record<string, string>;
  /** Field in the token response containing the key. Default: "key". */
  responseKeyField?: string;
  /** Timeout in ms for the entire flow. Default: 120_000 (2 min). */
  timeoutMs?: number;
  /**
   * Use the relay (bot.jeriko.ai) as the callback URL.
   * The relay receives the browser redirect on HTTPS port 443, forwards
   * the code to the daemon via WebSocket, and the CLI polls the daemon
   * for the result. This avoids needing any specific localhost port.
   *
   * Requires: daemon running + connected to relay.
   */
  useRelay?: boolean;
  /**
   * Provider name for relay-based OAuth (used to build the relay callback URL).
   * Required when useRelay is true.
   */
  relayProvider?: string;
  /**
   * Fixed port to use for the callback server. If set, the flow will use
   * this port instead of a random one.
   *
   * If the daemon is already running on this port, the callback is routed
   * through the daemon's HTTP server via IPC.
   */
  callbackPort?: number;
  /**
   * If true, omit `response_type=code` from the authorization URL.
   * Stripe Apps doesn't use response_type — only client_id, redirect_uri, state.
   */
  skipResponseType?: boolean;
}

export interface OAuthFlowResult {
  /** The API key or access token received from the provider. */
  key: string;
  /** Raw response data from the token exchange. */
  raw: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

/** Generate a cryptographically random code verifier (RFC 7636). */
function generateCodeVerifier(): string {
  return randomBytes(32)
    .toString("base64url")
    .replace(/[^a-zA-Z0-9\-._~]/g, "")
    .slice(0, 128);
}

/** Compute S256 code challenge from verifier (RFC 7636). */
function computeCodeChallenge(verifier: string): string {
  return createHash("sha256")
    .update(verifier)
    .digest("base64url");
}

// ---------------------------------------------------------------------------
// Port allocation
// ---------------------------------------------------------------------------

/** Find a random available port on 127.0.0.1. */
async function findAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        server.close();
        reject(new Error("Could not allocate port"));
        return;
      }
      const port = addr.port;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

/** Check if a port is currently in use. */
async function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(true));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(false));
    });
  });
}

/** Check if the Jeriko daemon is reachable via IPC socket. */
async function isDaemonReachable(): Promise<boolean> {
  try {
    const { sendRequest } = await import("../../daemon/api/socket.js");
    const resp = await sendRequest("status", undefined, 3_000);
    return resp.ok === true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main flow
// ---------------------------------------------------------------------------

/**
 * Run a full OAuth flow:
 *   1. Determine callback strategy (standalone server or daemon-routed)
 *   2. Open browser to auth URL
 *   3. Wait for callback with auth code
 *   4. Exchange code for key/token
 *   5. Return result
 *
 * @throws Error if the flow times out, is cancelled, or the exchange fails.
 */
export async function runOAuthFlow(opts: OAuthFlowOptions): Promise<OAuthFlowResult> {
  const {
    authUrl,
    tokenUrl,
    clientId,
    pkce,
    scopes,
    extraAuthParams,
    responseKeyField = "key",
    timeoutMs = 120_000,
    useRelay,
    relayProvider,
    callbackPort,
    skipResponseType,
  } = opts;

  // ---------------------------------------------------------------------------
  // Strategy 1: Relay — callback via bot.jeriko.ai (HTTPS port 443).
  // Used by providers that restrict callback ports (e.g. OpenRouter: 443/3000).
  // The relay receives the browser redirect and forwards the code to the daemon
  // via WebSocket. The CLI polls the daemon via IPC for the result.
  // ---------------------------------------------------------------------------
  if (useRelay && relayProvider) {
    return runRelayOAuthFlow({
      authUrl,
      tokenUrl,
      clientId,
      pkce,
      scopes,
      extraAuthParams,
      responseKeyField,
      timeoutMs,
      relayProvider,
      skipResponseType,
    });
  }

  // ---------------------------------------------------------------------------
  // Strategy 2 & 3: Local callback — standalone server or daemon-routed.
  // ---------------------------------------------------------------------------
  let port: number;
  let useDaemon = false;

  if (callbackPort) {
    port = callbackPort;
    const portBusy = await isPortInUse(callbackPort);
    if (portBusy) {
      // Port is occupied. If the daemon owns it (JERIKO_PORT matches),
      // route the callback through the daemon via IPC. Otherwise fail —
      // we can't bind and the occupying process won't forward the callback.
      const daemonPort = getDaemonPort();
      if (daemonPort === callbackPort && await isDaemonReachable()) {
        useDaemon = true;
      } else {
        throw new Error(
          `Port ${callbackPort} is already in use by another process. ` +
          `This port is required for OAuth callback. ` +
          `Stop the process on port ${callbackPort} and try again, ` +
          `or use API key authentication instead.`,
        );
      }
    }
  } else {
    port = await findAvailablePort();
  }

  const callbackUrl = `http://localhost:${port}/callback`;

  // PKCE: generate verifier + challenge
  let codeVerifier: string | undefined;
  let codeChallenge: string | undefined;
  if (pkce) {
    codeVerifier = generateCodeVerifier();
    codeChallenge = computeCodeChallenge(codeVerifier);
  }

  // Build auth URL
  const authParams = new URLSearchParams({ callback_url: callbackUrl });
  if (pkce) {
    authParams.set("code_challenge", codeChallenge!);
    authParams.set("code_challenge_method", "S256");
  } else {
    authParams.set("client_id", clientId);
    authParams.set("redirect_uri", callbackUrl);
    if (!skipResponseType) authParams.set("response_type", "code");
  }
  if (scopes) authParams.set("scope", scopes);
  if (extraAuthParams) {
    for (const [k, v] of Object.entries(extraAuthParams)) authParams.set(k, v);
  }

  const fullAuthUrl = `${authUrl}?${authParams.toString()}`;

  // Get auth code via appropriate strategy
  const authCode = useDaemon
    ? await waitForCallbackViaDaemon(timeoutMs, fullAuthUrl)
    : await waitForCallbackStandalone(port, timeoutMs, fullAuthUrl);

  // Exchange code for key/token
  const result = await exchangeCode({
    tokenUrl,
    code: authCode,
    clientId,
    callbackUrl,
    codeVerifier,
    responseKeyField,
  });

  return result;
}

// ---------------------------------------------------------------------------
// Strategy: Relay-based callback (via bot.jeriko.ai HTTPS port 443)
// ---------------------------------------------------------------------------

interface RelayOAuthOptions {
  authUrl: string;
  tokenUrl: string;
  clientId: string;
  pkce: boolean;
  scopes?: string;
  extraAuthParams?: Record<string, string>;
  responseKeyField: string;
  timeoutMs: number;
  relayProvider: string;
  skipResponseType?: boolean;
}

/**
 * Run OAuth flow via the relay server.
 *
 * 1. Build callback URL: https://bot.jeriko.ai/provider/:provider/callback
 * 2. Open browser with auth URL (PKCE challenge included)
 * 3. Relay receives callback → forwards code to daemon via WebSocket
 * 4. CLI polls daemon via IPC for the code
 * 5. CLI exchanges code for API key locally (no secrets needed)
 */
async function runRelayOAuthFlow(opts: RelayOAuthOptions): Promise<OAuthFlowResult> {
  const {
    authUrl, tokenUrl, clientId, pkce, scopes, extraAuthParams,
    responseKeyField, timeoutMs, relayProvider, skipResponseType,
  } = opts;

  // Verify daemon is reachable (required for relay flow)
  const daemonUp = await isDaemonReachable();
  if (!daemonUp) {
    throw new Error(
      "Daemon must be running for relay-based OAuth. " +
      "Start it with `jeriko server start`, or use API key authentication instead.",
    );
  }

  // Build the relay callback URL
  const { getUserId } = await import("../../shared/config.js");
  const { buildCompositeState } = await import("../../shared/relay-protocol.js");

  const userId = getUserId();
  if (!userId) {
    throw new Error(
      "User ID not configured. Run `jeriko init` first, " +
      "or use API key authentication instead.",
    );
  }

  const stateToken = randomBytes(16).toString("hex");
  const compositeState = buildCompositeState(userId, stateToken);
  const callbackUrl = `https://bot.jeriko.ai/provider/${relayProvider}/callback`;

  // PKCE: generate verifier + challenge
  let codeVerifier: string | undefined;
  let codeChallenge: string | undefined;
  if (pkce) {
    codeVerifier = generateCodeVerifier();
    codeChallenge = computeCodeChallenge(codeVerifier);
  }

  // Build auth URL with relay callback
  const authParams = new URLSearchParams({ callback_url: callbackUrl, state: compositeState });
  if (pkce) {
    authParams.set("code_challenge", codeChallenge!);
    authParams.set("code_challenge_method", "S256");
  } else {
    authParams.set("client_id", clientId);
    authParams.set("redirect_uri", callbackUrl);
    if (!skipResponseType) authParams.set("response_type", "code");
  }
  if (scopes) authParams.set("scope", scopes);
  if (extraAuthParams) {
    for (const [k, v] of Object.entries(extraAuthParams)) authParams.set(k, v);
  }

  const fullAuthUrl = `${authUrl}?${authParams.toString()}`;

  // Open browser and poll daemon for the auth code
  openBrowser(fullAuthUrl).catch(() => {});

  const { sendRequest } = await import("../../daemon/api/socket.js");
  const response = await sendRequest(
    "provider_auth.poll",
    { provider: relayProvider, timeout_ms: timeoutMs },
    timeoutMs + 5_000,
  );

  if (!response.ok || !response.data) {
    throw new Error(response.error ?? "Failed to receive provider auth callback");
  }

  const code = (response.data as { code: string }).code;
  if (!code) {
    throw new Error("Daemon returned empty auth code");
  }

  // Exchange code for key/token locally (PKCE — no client secret needed)
  const result = await exchangeCode({
    tokenUrl,
    code,
    clientId,
    callbackUrl,
    codeVerifier,
    responseKeyField,
  });

  return result;
}

// ---------------------------------------------------------------------------
// Strategy 1: Daemon-routed callback (port already in use by daemon)
// ---------------------------------------------------------------------------

/**
 * Wait for the OAuth callback via the daemon's HTTP server.
 * The daemon already owns the port — we tell it to expect a callback
 * via IPC, then open the browser.
 */
async function waitForCallbackViaDaemon(
  timeoutMs: number,
  authUrl: string,
): Promise<string> {
  const { sendRequest } = await import("../../daemon/api/socket.js");

  // Open browser first so the user can start authorizing
  openBrowser(authUrl).catch(() => {
    // If browser can't open, the user can still manually visit the URL
  });

  // Ask the daemon to wait for the callback on its /callback route.
  // This blocks until the callback arrives or times out.
  const response = await sendRequest(
    "oauth.await_callback",
    { timeout_ms: timeoutMs },
    timeoutMs + 5_000, // IPC timeout slightly longer than OAuth timeout
  );

  if (!response.ok || !response.data) {
    throw new Error(response.error ?? "Daemon failed to receive OAuth callback");
  }

  const code = (response.data as { code: string }).code;
  if (!code) {
    throw new Error("Daemon returned empty OAuth code");
  }

  return code;
}

// ---------------------------------------------------------------------------
// Strategy 2: Standalone callback server (port is free)
// ---------------------------------------------------------------------------

/**
 * Start a local HTTP server, open the browser, and wait for the OAuth
 * callback. Returns the authorization code from the callback.
 */
async function waitForCallbackStandalone(
  port: number,
  timeoutMs: number,
  authUrl: string,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let resolved = false;
    let httpServer: ReturnType<typeof Bun.serve> | undefined;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        httpServer?.stop();
        reject(new Error("OAuth flow timed out — no callback received within 2 minutes"));
      }
    }, timeoutMs);

    httpServer = Bun.serve({
      port,
      hostname: "127.0.0.1",
      fetch(req) {
        const url = new URL(req.url);

        if (url.pathname === "/callback") {
          const code = url.searchParams.get("code");

          if (!code) {
            const error = url.searchParams.get("error") ?? "no code received";
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              httpServer?.stop();
              reject(new Error(`OAuth callback error: ${error}`));
            }
            return new Response(errorPage(error), {
              headers: { "Content-Type": "text/html" },
            });
          }

          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            // Defer stop to allow the response to be sent
            setTimeout(() => httpServer?.stop(), 500);
            resolve(code);
          }

          return new Response(successPage(), {
            headers: { "Content-Type": "text/html" },
          });
        }

        return new Response("Not found", { status: 404 });
      },
    });

    // Open browser
    openBrowser(authUrl).catch(() => {
      // If browser can't open, the user can still manually visit the URL
    });
  });
}

// ---------------------------------------------------------------------------
// Code exchange
// ---------------------------------------------------------------------------

interface ExchangeOptions {
  tokenUrl: string;
  code: string;
  clientId: string;
  callbackUrl: string;
  codeVerifier?: string;
  responseKeyField: string;
}

async function exchangeCode(opts: ExchangeOptions): Promise<OAuthFlowResult> {
  const body: Record<string, string> = {
    code: opts.code,
  };

  // PKCE exchange (OpenRouter style — JSON body)
  if (opts.codeVerifier) {
    body.code_verifier = opts.codeVerifier;
    body.code_challenge_method = "S256";
  } else {
    // Standard OAuth exchange
    body.client_id = opts.clientId;
    body.redirect_uri = opts.callbackUrl;
    body.grant_type = "authorization_code";
  }

  const response = await fetch(opts.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `OAuth token exchange failed: HTTP ${response.status} — ${text.slice(0, 200)}`,
    );
  }

  const data = (await response.json()) as Record<string, unknown>;
  const key = data[opts.responseKeyField] as string | undefined;

  if (!key) {
    throw new Error(
      `OAuth response missing "${opts.responseKeyField}" field (got: ${Object.keys(data).join(", ")})`,
    );
  }

  return { key, raw: data };
}

// ---------------------------------------------------------------------------
// Browser
// ---------------------------------------------------------------------------

/** Open a URL in the user's default browser. */
async function openBrowser(url: string): Promise<void> {
  const { execFile } = await import("node:child_process");

  const [cmd, args] = process.platform === "darwin"
    ? ["open", [url]] as const
    : process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url]] as const
      : ["xdg-open", [url]] as const;

  return new Promise((resolve, reject) => {
    execFile(cmd, args, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// ---------------------------------------------------------------------------
// HTML pages for callback
// ---------------------------------------------------------------------------

function successPage(): string {
  return `<!DOCTYPE html>
<html><head><title>Jeriko — Connected</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; display: flex;
    justify-content: center; align-items: center; min-height: 100vh;
    background: #0a0a0a; color: #e5e5e5; margin: 0; }
  .card { text-align: center; padding: 3rem; }
  h1 { color: #22c55e; font-size: 2rem; margin-bottom: 0.5rem; }
  p { color: #a3a3a3; font-size: 1.1rem; }
</style></head>
<body><div class="card">
  <h1>Connected</h1>
  <p>You can close this tab and return to the terminal.</p>
</div></body></html>`;
}

/** Escape HTML special characters to prevent XSS. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function errorPage(error: string): string {
  return `<!DOCTYPE html>
<html><head><title>Jeriko — Error</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; display: flex;
    justify-content: center; align-items: center; min-height: 100vh;
    background: #0a0a0a; color: #e5e5e5; margin: 0; }
  .card { text-align: center; padding: 3rem; }
  h1 { color: #ef4444; font-size: 2rem; margin-bottom: 0.5rem; }
  p { color: #a3a3a3; font-size: 1.1rem; }
</style></head>
<body><div class="card">
  <h1>Authentication Failed</h1>
  <p>${escapeHtml(error)}</p>
  <p>Close this tab and try again in the terminal.</p>
</div></body></html>`;
}
