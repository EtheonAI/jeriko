# Relay Infrastructure Audit

## Architecture Overview

The relay infrastructure allows external services (Stripe, GitHub, PayPal, etc.) to reach user daemons running behind NAT/firewall. Two implementations share the same wire protocol:

- **Bun Relay** (`apps/relay/src/`) -- Local dev and test suite. Module-level Maps, `node:crypto`, `createRelayServer()` factory.
- **CF Worker Relay** (`apps/relay-worker/src/`) -- Production at `bot.jeriko.ai`. Durable Object with Hibernatable WebSockets, Web Crypto API, class-scoped state.

Both relay implementations are transparent forwarders. Webhook signature verification and OAuth token exchange happen on the user's daemon (secrets never leave the user's machine), except for relay-side OAuth exchange where the relay holds provider client secrets.

### Request Flow

```
External Service
  -> POST https://bot.jeriko.ai/hooks/:userId/:triggerId
  -> CF Worker entry (index.ts) routes to global Durable Object
  -> RelayDO.fetch() delegates to Hono router
  -> webhook route validates userId + triggerId registration
  -> ConnectionManager.sendTo() forwards via WebSocket
  -> Daemon receives RelayWebhookMessage, processes locally
  -> Daemon sends webhook_ack back (informational only)
```

## Wire Protocol (`src/shared/relay-protocol.ts`)

Single source of truth for all message types. Two directions:

### Outbound (Daemon -> Relay)

| Type                 | Purpose                                        | Key Fields                                      |
|----------------------|------------------------------------------------|-------------------------------------------------|
| `auth`               | First message after connect                    | `userId`, `token`, `version?`                   |
| `register_triggers`  | Register trigger IDs for webhook routing       | `triggerIds: string[]`                           |
| `unregister_triggers`| Remove trigger IDs                             | `triggerIds: string[]`                           |
| `webhook_ack`        | Acknowledge received webhook                   | `requestId`, `status`                            |
| `oauth_result`       | Return OAuth result to relay                   | `requestId`, `statusCode`, `html`, `redirectUrl?`, `codeVerifier?` |
| `share_response`     | Return rendered share page                     | `requestId`, `statusCode`, `html`                |
| `ping`               | Client heartbeat                               | (none)                                           |

### Inbound (Relay -> Daemon)

| Type              | Purpose                                       | Key Fields                                       |
|-------------------|-----------------------------------------------|--------------------------------------------------|
| `auth_ok`         | Authentication succeeded                      | (none)                                            |
| `auth_fail`       | Authentication failed                         | `error`                                           |
| `webhook`         | Forwarded external webhook                    | `requestId`, `triggerId`, `headers`, `body`       |
| `oauth_callback`  | Forwarded OAuth callback (daemon-side exchange)| `requestId`, `provider`, `params`                |
| `oauth_start`     | Forwarded OAuth start request                 | `requestId`, `provider`, `params`                |
| `oauth_tokens`    | Relay-exchanged tokens sent to daemon         | `requestId`, `provider`, `accessToken`, `refreshToken?`, `expiresIn?`, `scope?`, `tokenType?` |
| `share_request`   | Forwarded share page visitor request          | `requestId`, `shareId`                           |
| `pong`            | Server heartbeat response                     | (none)                                            |
| `error`           | Server-initiated error                        | `message`                                         |

### Constants

| Constant                          | Value    | Purpose                                   |
|-----------------------------------|----------|-------------------------------------------|
| `DEFAULT_RELAY_URL`               | `wss://bot.jeriko.ai/relay` | Default WebSocket endpoint   |
| `RELAY_URL_ENV`                   | `JERIKO_RELAY_URL` | Env var override                  |
| `RELAY_HEARTBEAT_INTERVAL_MS`     | 30000    | Ping interval                             |
| `RELAY_HEARTBEAT_TIMEOUT_MS`      | 10000    | Max time without pong                     |
| `RELAY_MAX_BACKOFF_MS`            | 60000    | Max reconnection delay                    |
| `RELAY_INITIAL_BACKOFF_MS`        | 1000     | Initial reconnection delay                |
| `RELAY_BACKOFF_MULTIPLIER`        | 2        | Exponential backoff factor                |
| `RELAY_AUTH_TIMEOUT_MS`           | 15000    | Auth response timeout                     |
| `RELAY_MAX_PENDING_OAUTH`         | 10       | Max concurrent OAuth callbacks            |
| `RELAY_MAX_TRIGGERS_PER_CONNECTION`| 10000   | Per-connection trigger limit              |

### Composite State

OAuth state parameter encodes userId: `buildCompositeState(userId, token)` -> `"userId.token"`. Parsed by `parseCompositeState()` using first `.` as delimiter.

## Auth Flow (HMAC Timing-Safe)

1. Daemon connects to `wss://bot.jeriko.ai/relay`
2. Daemon sends `{ type: "auth", userId, token, version? }`
3. Relay compares `token` against `RELAY_AUTH_SECRET` using timing-safe comparison:
   - **Bun**: HMAC both values with fixed key `"relay-auth-compare"`, then `timingSafeEqual` on 32-byte digests
   - **CF Worker**: Same HMAC approach, but async via Web Crypto + XOR accumulate
4. On success: relay sends `{ type: "auth_ok" }`, stores connection
5. On failure: relay sends `{ type: "auth_fail", error: "..." }`
6. After 3 failures (`MAX_AUTH_FAILURES`), connection is closed with code 1008
7. Previous connection for same userId is evicted (single connection per user)

## Webhook Routing

**Primary route**: `POST /hooks/:userId/:triggerId`
1. Look up connection by `userId`
2. Verify `triggerId` is registered for that user (prevents injection)
3. Extract raw body + lowercase headers + generate `requestId` (UUID)
4. Build `RelayWebhookMessage` and send via WebSocket
5. Return 200 immediately to external service

**Legacy route**: `POST /hooks/:triggerId`
1. Linear scan all connections to find owner of `triggerId`
2. Forward same as above (backward compatibility)

## OAuth Callback Forwarding

Two modes for `/callback`:

**Relay-side exchange** (default when relay has provider credentials):
1. Browser redirects to `/oauth/:provider/callback?code=...&state=userId.token`
2. Relay extracts userId from composite state
3. Relay looks up PKCE verifier stored during `/start`
4. Relay calls provider's token endpoint with code + client secret
5. Relay sends `oauth_tokens` message to daemon via WebSocket
6. Relay returns success HTML to browser

**Daemon-side exchange** (fallback):
1. Relay forwards `oauth_callback` message to daemon via WebSocket
2. Daemon exchanges code for tokens locally
3. Daemon sends `oauth_result` back
4. Relay returns daemon's HTML to browser

**OAuth start flow**:
1. Browser visits `/oauth/:provider/start?state=userId.token`
2. Relay forwards `oauth_start` to daemon
3. Daemon builds auth URL (with PKCE), returns redirect URL + optional codeVerifier
4. Relay stores codeVerifier in `pendingPKCE` map keyed by state token
5. Relay 302-redirects browser to provider consent page

## Reconnection Logic (Exponential Backoff)

Client: `src/daemon/services/relay/client.ts`

- Initial backoff: 1s
- Multiplier: 2x each failure
- Maximum: 60s
- Sequence: 1s, 2s, 4s, 8s, 16s, 32s, 60s, 60s, ...
- Reset to 1s on successful auth (`auth_ok`)
- **Auth failure stops reconnection** (`intentionalClose = true`)
- **Error events** are followed by close events; reconnect only in `handleClose`

## Heartbeat (Ping/Pong)

- Client sends `ping` every 30s after successful auth
- Relay responds with `pong`
- If no pong within 10s, client closes connection ("Heartbeat timeout")
- Relay updates `lastPing` timestamp on each ping

## URL Builders (`src/shared/urls.ts`)

Three modes:

| Mode        | Condition                   | Webhook URL                                      | OAuth Callback URL                               |
|-------------|-----------------------------|-------------------------------------------------|--------------------------------------------------|
| Relay       | Default (no env overrides)  | `https://bot.jeriko.ai/hooks/:userId/:triggerId` | `https://bot.jeriko.ai/oauth/:provider/callback` |
| Self-hosted | `JERIKO_PUBLIC_URL` set     | `${publicUrl}/hooks/:triggerId`                  | `${publicUrl}/oauth/:provider/callback`           |
| Local dev   | No userId, no public URL    | `http://127.0.0.1:3000/hooks/:triggerId`         | `http://127.0.0.1:3000/oauth/:provider/callback` |

- `getPublicUrl()`: `JERIKO_PUBLIC_URL` or `https://bot.jeriko.ai`
- `getRelayApiUrl()`: derives HTTP URL from WebSocket URL (ws->http, strips /relay)
- `isSelfHosted()`: `!!process.env.JERIKO_PUBLIC_URL`
- `buildOAuthStartUrl()`: includes state in query string, URL-encoded

## CF Worker Durable Object Hibernation

The CF Worker uses a single global Durable Object (`idFromName("global")`).

**Hibernation survival**:
- WebSocket connections survive DO hibernation via `state.acceptWebSocket()`
- Connection state (userId, triggerIds, version) stored in WebSocket attachments via `serializeAttachment()`
- On wake: constructor iterates `state.getWebSockets()`, calls `deserializeAttachment()` to reconstruct the `ConnectionManager`
- `syncAttachment()` called after every mutation (auth, trigger register/unregister, ping)

**WebSocketAttachment shape**:
```typescript
interface WebSocketAttachment {
  userId?: string;
  authenticated: boolean;
  connectedAt?: string;
  lastPing?: string;
  version?: string;
  triggerIds?: string[];  // serialized from Set<string>
}
```

## Bugs and Observations

### 1. Bun relay refresh endpoint: non-timing-safe auth comparison
In `apps/relay/src/routes/oauth.ts` line 392, the `/refresh` endpoint compares the auth token using `token !== relaySecret` (plain string comparison). The CF Worker version at `apps/relay-worker/src/routes/billing.ts` line 352 has a similar issue: `token !== env.RELAY_AUTH_SECRET`. Both should use timing-safe comparison to prevent timing attacks. The billing `authenticateRequest` helper in the CF Worker *does* use `safeCompare`, but the OAuth `/refresh` route in the Bun relay does not.

### 2. Legacy triggerId route is O(n) scan
`findByTriggerId()` in both implementations does a linear scan over all connections. With 10k+ connections this becomes a bottleneck. A reverse index (triggerId -> userId) would be O(1).

### 3. Share route does not validate shareId format
The `/s/:userId/:shareId` route forwards any string as a shareId without validation. While the daemon handles validation, passing through arbitrary strings increases attack surface.

### 4. No rate limiting on webhook route
The webhook route returns 200 immediately but has no rate limiting per userId or per triggerId. An attacker knowing a userId + triggerId could flood the daemon's WebSocket.

### 5. Hardcoded redirect URI in CF Worker OAuth
In `apps/relay-worker/src/routes/oauth.ts` line 435, the redirect URI is hardcoded to `https://bot.jeriko.ai/oauth/${provider}/callback`. If the relay URL changes, this breaks. The Bun relay correctly derives it from `RELAY_PUBLIC_URL`.
