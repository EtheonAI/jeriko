# OAuth System Audit

Audit date: 2026-03-06
Scope: Full OAuth flow across daemon, shared exchange, baked IDs, and relay worker.

---

## 1. Architecture Overview

The OAuth system spans four layers:

- **Daemon OAuth** (`src/daemon/services/oauth/`) -- Provider registry, CSRF state management, PKCE helpers
- **Daemon routes** (`src/daemon/api/routes/oauth.ts`) -- HTTP endpoints for `/start` and `/callback`
- **Shared exchange** (`src/shared/oauth-exchange.ts`) -- Token exchange + refresh logic (runtime-agnostic)
- **Baked IDs** (`src/shared/baked-oauth-ids.ts`) -- Build-time client IDs injected via Bun `define`
- **Relay worker** (`apps/relay-worker/src/routes/oauth.ts`) -- Proxy + relay-side exchange
- **Relay secrets** (`apps/relay-worker/src/lib/oauth-secrets.ts`) -- CF Worker credential lookup

## 2. Provider Coverage (23 providers)

| Provider | PKCE | Refresh Token | Auth Method | Baked ID Key | Extra Params |
|----------|------|---------------|-------------|--------------|--------------|
| stripe | No | Yes | basic | stripe | - |
| github | No | No | body | github | - |
| x | Yes | Yes | body | x | - |
| gdrive | No | Yes | body | google | access_type=offline, prompt=consent |
| onedrive | No | Yes | body | microsoft | - |
| vercel | Yes | Yes | body | vercel | - |
| gmail | No | Yes | body | google | access_type=offline, prompt=consent |
| outlook | No | Yes | body | microsoft | - |
| hubspot | No | Yes | body | hubspot | - |
| shopify | No | No (permanent) | body | shopify | - |
| slack | No | No (permanent) | body | slack | - |
| discord | No | Yes | body | discord | - |
| square | No | Yes | body | square | - |
| gitlab | No | Yes | body | gitlab | - |
| digitalocean | No | Yes | body | digitalocean | - |
| notion | No | No (permanent) | basic | notion | - |
| linear | No | No (permanent) | body | linear | - |
| jira | No | Yes | body | atlassian | audience=api.atlassian.com, prompt=consent |
| airtable | Yes | Yes | body | airtable | - |
| asana | No | Yes | body | asana | - |
| mailchimp | No | Yes | body | mailchimp | - |
| dropbox | No | Yes | body | dropbox | token_access_type=offline |
| salesforce | No | Yes | body | salesforce | - |

Shared baked ID keys: `google` (gmail + gdrive), `microsoft` (outlook + onedrive), `atlassian` (jira).

## 3. Full OAuth Flow Trace

### 3.1 User clicks "connect" (e.g. `/connect github`)

1. Channel router calls `generateState(providerName, chatId, channelName, userId)` in `state.ts`
2. Random 32-byte hex token generated, stored in in-memory Map with 10-minute TTL
3. If userId provided, composite state `userId.token` is built via `buildCompositeState()`
4. OAuth start URL constructed: `https://bot.jeriko.ai/oauth/github/start?state=<compositeState>`
5. URL sent to user as clickable link

### 3.2 Start endpoint (relay or direct)

**Via relay** (`GET /oauth/:provider/start?state=userId.token`):
1. Relay extracts userId from composite state
2. Looks up daemon WebSocket connection
3. Forwards `oauth_start` message to daemon via WebSocket
4. Daemon calls `handleOAuthStart()` -- resolves client ID, builds auth URL, generates PKCE if needed
5. Daemon responds with `oauth_result` containing `redirectUrl` (and `codeVerifier` for PKCE providers)
6. Relay stores PKCE verifier keyed by state token
7. Relay issues 302 redirect to provider's consent page

**Direct** (self-hosted, `GET /oauth/:provider/start?state=token`):
1. Daemon's Hono route calls `handleOAuthStart()` directly
2. Returns 302 redirect to provider

### 3.3 Provider redirects back (callback)

**Via relay** (`GET /oauth/:provider/callback?code=...&state=userId.token`):
1. Relay extracts userId from composite state
2. Checks for OAuth error (`error` query param)
3. Attempts relay-side exchange if credentials exist (`getRelayOAuthCredentials`)
4. If relay has credentials: calls `exchangeCodeForTokens()`, sends `oauth_tokens` to daemon via WS
5. If relay lacks credentials: forwards raw `oauth_callback` to daemon, waits for `oauth_result`

**Direct** (daemon handles exchange):
1. `handleOAuthCallback()` validates state (consumes single-use token)
2. Verifies provider matches state entry
3. Resolves client ID + client secret
4. Calls provider's token URL with `grant_type=authorization_code`
5. Saves access_token via `saveSecret()` to `~/.config/jeriko/.env`
6. Saves refresh_token if present
7. Notifies user on originating channel

### 3.4 Token exchange details

Two authentication methods for the exchange POST:

- **"body"** (most providers): `client_id` + `client_secret` in POST body
- **"basic"** (Stripe, Notion): HTTP Basic auth header with `client_secret` as username, empty password

PKCE providers (X, Vercel, Airtable) include `code_verifier` in the exchange.

### 3.5 Token refresh

`refreshAccessToken()` in `oauth-exchange.ts`:
- Uses `grant_type=refresh_token`
- Same auth method logic (body vs basic)
- Optional `scope` parameter
- Available via relay endpoint `POST /oauth/:provider/refresh` (bearer auth with relay secret)

## 4. Security Analysis

### 4.1 State parameter (CSRF protection)
- 256-bit random tokens (32 bytes, hex-encoded)
- Single-use: consumed on first use, replay returns null
- 10-minute TTL with automatic pruning on every read/write
- Composite state embeds userId for relay routing without path exposure
- Provider mismatch check prevents cross-provider state reuse

### 4.2 PKCE (RFC 7636)
- Implemented for X/Twitter, Vercel, and Airtable
- S256 challenge method (SHA-256 of verifier, base64url encoded)
- Verifier stored in daemon's state map (keyed by state token)
- For relay-side exchange: daemon sends verifier in `oauth_result`, relay stores in `pendingPKCE` map
- Both maps have TTL-based expiry

### 4.3 XSS prevention
- All user-facing HTML escaped via `escapeHtml()` (5 characters: `& < > " '`)
- Provider names from URL paths go through Hono's router (rejects injection attempts)
- Error descriptions from providers are escaped before rendering

### 4.4 Secret handling
- Tokens saved via `saveSecret()` to `.env` file, injected into `process.env`
- Token values never logged (only env var names)
- Error bodies are redacted before logging
- Relay secrets use `RELAY_AUTH_SECRET` for bearer auth on refresh endpoint

### 4.5 Credential isolation
- Daemon credentials: per-provider env vars (e.g. `GITHUB_OAUTH_CLIENT_SECRET`)
- Relay credentials: CF Worker secrets (e.g. `GITHUB_OAUTH_CLIENT_SECRET` in Env bindings)
- Bun relay (dev): `RELAY_*` prefixed env vars
- Client secrets never leave their respective runtime

## 5. Baked Client IDs

Build-time injection via Bun's `define`:
- 21 unique baked ID keys matching all 23 providers (google/microsoft/atlassian are shared)
- At dev time: `__BAKED_*` globals are undefined, users provide via env vars
- Resolution order: env var override > baked ID > undefined
- Public values only (client IDs, not secrets) -- safe to embed in binary

All baked ID keys in `BAKED_OAUTH_CLIENT_IDS` match the `bakedIdKey` fields in `OAUTH_PROVIDERS`.

## 6. Relay OAuth Callback Forwarding

The relay worker (`apps/relay-worker/src/routes/oauth.ts`) implements:

1. **Legacy redirects**: `/oauth/:userId/:provider/*` -> `/oauth/:provider/*` (301)
2. **Start proxy**: Forwards to daemon via WS, stores PKCE verifier, returns 302
3. **Callback with relay exchange**: Uses `getRelayOAuthCredentials()` + `exchangeCodeForTokens()`, sends tokens via `oauth_tokens` WS message
4. **Callback with daemon fallback**: Forwards via `oauth_callback` WS message, waits for `oauth_result`
5. **Refresh endpoint**: `POST /oauth/:provider/refresh` with bearer auth

Timeout: 30 seconds for daemon response. Max pending: `RELAY_MAX_PENDING_OAUTH` (from protocol).

## 7. Error Handling

| Scenario | Code | Handler |
|----------|------|---------|
| Missing state | 400 | Both relay + daemon |
| Invalid/expired state | 400 | Daemon (consumeState returns null) |
| Provider mismatch | 400 | Daemon |
| Unknown provider | 404 | Both |
| No client ID configured | 503 | Daemon |
| No client secret (self-hosted) | 503 | Daemon |
| Daemon offline (relay) | 503 | Relay |
| Daemon timeout (relay) | 504 | Relay |
| Token exchange HTTP error | 502 | Both |
| No access_token in response | 502 | Both |
| Provider denies access | 400 | Both (error query param) |
| Too many pending requests | 429 | Relay |
| Network failure | throws Error | Caught, returns 502 |

## 8. Potential Issues Found

### 8.1 Jira `extraTokenParams` not forwarded to exchange provider (Low severity)
The `OAUTH_PROVIDERS` jira entry has `extraTokenParams: { audience: "api.atlassian.com", prompt: "consent" }`, but the `TOKEN_EXCHANGE_PROVIDERS` jira entry has no `extraTokenParams`. The exchange function in `oauth-exchange.ts` doesn't even use `extraTokenParams` -- they are only used in the authorization URL construction (`handleOAuthStart`). The `audience` param for Jira is needed in the auth URL, not the token exchange, so this is architecturally correct despite the apparent asymmetry.

### 8.2 Dropbox `extraTokenParams` not in exchange provider (Low severity)
Same pattern: `dropbox` has `extraTokenParams: { token_access_type: "offline" }` in `OAUTH_PROVIDERS` but not in `TOKEN_EXCHANGE_PROVIDERS`. The `token_access_type` parameter is an authorization URL parameter for Dropbox, not a token exchange parameter. However, the `handleOAuthStart` function only forwards `access_type` and `prompt` keys from `extraTokenParams` -- it does NOT forward `token_access_type`. This means Dropbox's `token_access_type=offline` is never sent. This is a **bug** that would cause Dropbox to return short-lived tokens instead of long-lived ones with a refresh token.

### 8.3 `exchangeCodeForTokens` ignores `extraTokenParams` (Design note)
The shared exchange function does not use `extraTokenParams` at all. This is correct for most cases since extra params are typically auth-URL params, but it means the exchange module has a field that's never consumed.

### 8.4 Relay refresh endpoint uses simple string comparison for auth (Low severity)
The refresh endpoint at `POST /oauth/:provider/refresh` compares the bearer token with `env.RELAY_AUTH_SECRET` using `!==` (not timing-safe). This contrasts with the WebSocket auth which uses HMAC timing-safe comparison. A timing attack on this comparison is impractical over HTTP but inconsistent with the security model.

### 8.5 Hardcoded redirect URI in relay exchange (Design note)
`handleRelayExchange` hardcodes `https://bot.jeriko.ai/oauth/${provider}/callback` as the redirect URI. This works for production but would break if the relay were deployed to a different domain without updating this value.

### 8.6 Composite state parsing edge case
`parseCompositeState` splits on first `.`. If a userId contains `.`, the split would be incorrect. However, `getUserId()` generates UUID v4 values which use `-` not `.`, so this is safe in practice.

## 9. Test Coverage Assessment

Existing tests are thorough:
- `test/unit/oauth.test.ts` -- 40+ tests covering providers, state, PKCE, routes, XSS
- `test/unit/oauth-exchange.test.ts` -- 20+ tests covering exchange, refresh, helpers
- `test/integration/relay-oauth-exchange.test.ts` -- 15+ E2E tests with real WS connections

Key areas covered: state CSRF, single-use tokens, PKCE, body vs basic auth, error handling, XSS prevention, relay fallback, credential isolation.

---

**Summary**: The OAuth system is well-architected with proper separation of concerns, strong CSRF protection, PKCE support where required, and comprehensive error handling. The one functional bug identified is the Dropbox `token_access_type` parameter not being forwarded to the authorization URL due to a whitelist filter in `handleOAuthStart`.
