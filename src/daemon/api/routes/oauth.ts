// OAuth 2.0 redirect flow routes.
//
// Two unauthenticated endpoints:
//   GET /oauth/:provider/start?state=<token>  — redirects to provider consent page
//   GET /oauth/:provider/callback?code=...    — exchanges code, saves token, notifies user
//
// The state token ties the browser redirect back to the originating Telegram chat.
// Tokens are saved via saveSecret() — same .env file, same process.env injection.
// Connectors don't need any changes; they already read from process.env.
//
// Security:
//   - All user-facing HTML output is escaped to prevent XSS
//   - Token values are never logged (only env var names)
//   - State tokens are single-use, 256-bit random, 10-minute expiry
//   - CSRF protection via state token binding to provider + chat
//   - PKCE for providers that require it (X/Twitter)
//   - Token exchange errors are logged without leaking secrets

import { Hono } from "hono";
import { getLogger } from "../../../shared/logger.js";
import { saveSecret } from "../../../shared/secrets.js";
import { redact } from "../../security/redaction.js";
import { getOAuthProvider } from "../../services/oauth/providers.js";
import {
  consumeState,
  setCodeVerifier,
  generateCodeVerifier,
  generateCodeChallenge,
} from "../../services/oauth/state.js";
import type { ChannelRegistry } from "../../services/channels/index.js";

const log = getLogger();

// ---------------------------------------------------------------------------
// Security: HTML entity escaping — prevents XSS in rendered HTML
// ---------------------------------------------------------------------------

const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
};

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch]!);
}

// ---------------------------------------------------------------------------
// Callback URL base — derived from JERIKO_PUBLIC_URL or defaults to tunnel
// ---------------------------------------------------------------------------

function getCallbackBase(): string {
  return process.env.JERIKO_PUBLIC_URL ?? "https://bot.jeriko.ai";
}

// ---------------------------------------------------------------------------
// HTML response for the browser after callback
// ---------------------------------------------------------------------------

function successHtml(label: string): string {
  const safe = escapeHtml(label);
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Jeriko — Connected</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a0a;color:#fafafa}
.card{text-align:center;padding:2rem;border:1px solid #333;border-radius:12px;max-width:400px}
h1{font-size:1.4rem;margin-bottom:.5rem}p{color:#888;margin-top:.5rem}</style></head>
<body><div class="card"><h1>${safe} connected</h1><p>You can close this tab and return to Telegram.</p></div></body></html>`;
}

function errorHtml(message: string): string {
  const safe = escapeHtml(message);
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Jeriko — Error</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a0a;color:#fafafa}
.card{text-align:center;padding:2rem;border:1px solid #333;border-radius:12px;max-width:400px}
h1{font-size:1.4rem;margin-bottom:.5rem;color:#f87171}p{color:#888;margin-top:.5rem}</style></head>
<body><div class="card"><h1>Connection failed</h1><p>${safe}</p></div></body></html>`;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function oauthRoutes(): Hono {
  const router = new Hono();

  // ── Start: redirect user to provider consent page ──────────────────

  router.get("/:provider/start", (c) => {
    const providerName = c.req.param("provider");
    const stateToken = c.req.query("state");

    if (!stateToken) {
      return c.html(errorHtml("Missing state parameter. Use /connect from Telegram."), 400);
    }

    const provider = getOAuthProvider(providerName);
    if (!provider) {
      return c.html(errorHtml(`Unknown provider: ${providerName}`), 404);
    }

    const clientId = process.env[provider.clientIdVar];
    if (!clientId) {
      return c.html(errorHtml(`${provider.label} OAuth is not configured on the server.`), 503);
    }

    const redirectUri = `${getCallbackBase()}/oauth/${provider.name}/callback`;

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      state: stateToken,
      response_type: "code",
    });

    if (provider.scopes.length > 0) {
      params.set("scope", provider.scopes.join(" "));
    }

    // PKCE for providers that require it (e.g. X/Twitter)
    if (provider.usePKCE) {
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier);
      setCodeVerifier(stateToken, verifier);
      params.set("code_challenge", challenge);
      params.set("code_challenge_method", "S256");
    }

    // Extra auth params (e.g. Google's access_type=offline)
    if (provider.extraTokenParams) {
      for (const [key, value] of Object.entries(provider.extraTokenParams)) {
        if (key === "access_type" || key === "prompt") {
          params.set(key, value);
        }
      }
    }

    const authorizationUrl = `${provider.authUrl}?${params.toString()}`;
    log.info(`OAuth start: redirecting to ${provider.label}`);
    return c.redirect(authorizationUrl, 302);
  });

  // ── Callback: exchange code for token ──────────────────────────────

  router.get("/:provider/callback", async (c) => {
    const providerName = c.req.param("provider");
    const code = c.req.query("code");
    const stateToken = c.req.query("state");
    const error = c.req.query("error");

    // Provider returned an error (user denied, etc.)
    if (error) {
      const desc = c.req.query("error_description") ?? error;
      log.warn(`OAuth callback error from ${providerName}: ${desc}`);
      return c.html(errorHtml(desc), 400);
    }

    if (!code || !stateToken) {
      return c.html(errorHtml("Missing code or state parameter."), 400);
    }

    // Validate and consume state (CSRF protection)
    const pending = consumeState(stateToken);
    if (!pending) {
      return c.html(errorHtml("Invalid or expired state. Please try /connect again."), 400);
    }

    if (pending.provider !== providerName) {
      return c.html(errorHtml("State/provider mismatch."), 400);
    }

    const provider = getOAuthProvider(providerName);
    if (!provider) {
      return c.html(errorHtml(`Unknown provider: ${providerName}`), 404);
    }

    const clientId = process.env[provider.clientIdVar];
    const clientSecret = process.env[provider.clientSecretVar];
    if (!clientId || !clientSecret) {
      return c.html(errorHtml(`${provider.label} OAuth credentials are not configured.`), 503);
    }

    const redirectUri = `${getCallbackBase()}/oauth/${provider.name}/callback`;

    // Exchange authorization code for access token.
    //
    // Two auth modes for token exchange:
    // - "body" (default): client_id + client_secret in the POST body.
    // - "basic": HTTP Basic auth (Stripe uses secret API key as username).
    const useBasicAuth = provider.tokenExchangeAuth === "basic";

    const tokenParams: Record<string, string> = {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    };

    if (!useBasicAuth) {
      tokenParams.client_id = clientId;
      tokenParams.client_secret = clientSecret;
    }

    // Include PKCE code_verifier if applicable
    if (pending.codeVerifier) {
      tokenParams.code_verifier = pending.codeVerifier;
    }

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      };

      if (useBasicAuth) {
        // Stripe-style: secret key as Basic auth username, empty password
        headers.Authorization = `Basic ${Buffer.from(clientSecret + ":").toString("base64")}`;
      }

      const tokenResponse = await fetch(provider.tokenUrl, {
        method: "POST",
        headers,
        body: new URLSearchParams(tokenParams).toString(),
      });

      if (!tokenResponse.ok) {
        // Log status + redacted body — never log raw token exchange responses
        const body = await tokenResponse.text();
        log.error(`OAuth token exchange failed for ${provider.label}: ${tokenResponse.status} ${redact(body)}`);
        return c.html(errorHtml(`Token exchange failed (${tokenResponse.status}). Please try again.`), 502);
      }

      const tokenData = (await tokenResponse.json()) as Record<string, unknown>;
      const accessToken = tokenData.access_token as string | undefined;

      if (!accessToken) {
        // Log only the keys present, never the values
        const keys = Object.keys(tokenData).join(", ");
        log.error(`OAuth token exchange returned no access_token for ${provider.label} (keys: ${keys})`);
        return c.html(errorHtml("No access token returned. Please try again."), 502);
      }

      // Save access token
      saveSecret(provider.tokenEnvVar, accessToken);
      log.info(`OAuth: saved ${provider.tokenEnvVar} for ${provider.label}`);

      // Save refresh token if provided
      if (provider.refreshTokenEnvVar && tokenData.refresh_token) {
        saveSecret(provider.refreshTokenEnvVar, tokenData.refresh_token as string);
        log.info(`OAuth: saved ${provider.refreshTokenEnvVar} for ${provider.label}`);
      }

      // Notify user via their originating channel
      try {
        const channels = c.get("channels" as never) as ChannelRegistry | undefined;
        if (channels) {
          await channels.send(
            pending.channelName,
            pending.chatId,
            `${provider.label} connected. Use /health ${provider.name} to verify.`,
          );
        }
      } catch (err) {
        log.warn(`OAuth: failed to send confirmation to ${pending.channelName}: ${err}`);
      }

      return c.html(successHtml(provider.label), 200);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`OAuth token exchange error for ${provider.label}: ${redact(message)}`);
      return c.html(errorHtml("Token exchange failed. Check server logs."), 502);
    }
  });

  return router;
}
