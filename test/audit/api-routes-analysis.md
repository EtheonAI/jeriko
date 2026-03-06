# API Routes Audit Analysis

Audited: 2026-03-06
Codebase: src/daemon/api/

---

## Architecture Overview

The daemon HTTP API is built on **Hono** and created via `createApp()` in `src/daemon/api/app.ts`. It uses Bun's native `Bun.serve()` for the HTTP server and binds to `127.0.0.1:3000` by default (localhost-only).

### Middleware Stack (applied in order)

1. **CORS** -- allows `tauri://localhost` and `http://localhost:*`
2. **Security headers** -- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`
3. **Body limit** -- 10MB max (`hono/body-limit`)
4. **Rate limiting** -- 100 requests/minute per IP (token bucket, `rateLimitMiddleware`)
5. **Auth** -- Bearer token via `NODE_AUTH_SECRET` with timing-safe comparison. Skips specific paths.
6. **Context injection** -- sets `channels`, `triggers`, `connectors` on Hono context

### Auth Bypass Paths

The following paths skip `authMiddleware`:
- `/health` -- health check
- `/hooks/*` -- webhook endpoints (auth via signature verification in trigger engine)
- `/oauth/*` -- OAuth flow (browser redirect, state token CSRF protection)
- `/s/*` -- public share pages
- `/billing/webhook` -- Stripe webhook (signature-verified)

---

## Route Inventory

### /health (health.ts) -- NO AUTH

| Method | Path | Auth | Validation | Response |
|--------|------|------|------------|----------|
| GET | `/health` | None | None | `{ ok, data: { status, version, runtime, uptime_seconds, uptime_human, memory, timestamp } }` |

### /agent (agent.ts) -- AUTH REQUIRED

| Method | Path | Auth | Validation | Response |
|--------|------|------|------------|----------|
| POST | `/agent/chat` | Bearer | `message` required, trimmed | `{ ok, data: { response, tokensIn, tokensOut, sessionId } }` |
| POST | `/agent/stream` | Bearer | `message` required, trimmed | SSE stream |
| GET | `/agent/list` | Bearer | None | `{ ok, data: AgentSession[] }` |
| POST | `/agent/spawn` | Bearer | `prompt` required, trimmed | `{ ok, data: { session_id } }` |

### /session (session.ts) -- AUTH REQUIRED

| Method | Path | Auth | Validation | Response |
|--------|------|------|------------|----------|
| GET | `/session` | Bearer | `limit` capped at 200, `offset` | `{ ok, data: Session[] }` |
| GET | `/session/:id` | Bearer | None | `{ ok, data: { session, messages } }` |
| POST | `/session/:id/resume` | Bearer | Session must exist | `{ ok, data: { session_id, status } }` |
| DELETE | `/session/:id` | Bearer | Session must exist | `{ ok, data: { session_id, status } }` |

### /hooks (webhook.ts) -- NO AUTH (signature-verified)

| Method | Path | Auth | Validation | Response |
|--------|------|------|------------|----------|
| POST | `/hooks/:triggerId` | None | Trigger engine validates signature | `{ ok, data: { trigger_id } }` |

### /channel (channel.ts) -- AUTH REQUIRED

| Method | Path | Auth | Validation | Response |
|--------|------|------|------------|----------|
| GET | `/channel` | Bearer | None | `{ ok, data: ChannelStatus[] }` |
| POST | `/channel/:name/connect` | Bearer | Channel must be registered | `{ ok, data: ChannelStatus }` |
| POST | `/channel/:name/disconnect` | Bearer | Channel must be registered | `{ ok, data: ChannelStatus }` |

### /connector (connector.ts) -- AUTH REQUIRED

| Method | Path | Auth | Validation | Response |
|--------|------|------|------------|----------|
| GET | `/connector` | Bearer | None | `{ ok, data: ConnectorStatus[] }` |
| GET | `/connector/:name` | Bearer | Name must be known | `{ ok, data: ConnectorStatus }` |
| POST | `/connector/:name/call` | Bearer | `method` required | `{ ok/!ok, data/error }` |

### /triggers (trigger.ts) -- AUTH REQUIRED

| Method | Path | Auth | Validation | Response |
|--------|------|------|------------|----------|
| GET | `/triggers` | Bearer | Optional `type`, `enabled` filters | `{ ok, data: TriggerView[] }` |
| GET | `/triggers/:id` | Bearer | Trigger must exist | `{ ok, data: TriggerView }` |
| POST | `/triggers` | Bearer | `type`, `config`, `action` validated | `{ ok, data: TriggerView }` (201) |
| PUT | `/triggers/:id` | Bearer | Trigger must exist, partial validation | `{ ok, data: TriggerView }` |
| DELETE | `/triggers/:id` | Bearer | Trigger must exist | `{ ok, data: { id, status } }` |
| POST | `/triggers/:id/toggle` | Bearer | Trigger must exist | `{ ok, data: TriggerView }` |
| POST | `/triggers/:id/fire` | Bearer | Trigger must exist | `{ ok, data: TriggerView }` |

### /oauth (oauth.ts) -- NO AUTH (browser redirect flow)

| Method | Path | Auth | Validation | Response |
|--------|------|------|------------|----------|
| GET | `/oauth/:provider/start` | None | State token, provider, client ID | 302 redirect or HTML error |
| GET | `/oauth/:provider/callback` | None | Code, state (CSRF), provider match | HTML success/error page |

### /share (share.ts) -- AUTH REQUIRED

| Method | Path | Auth | Validation | Response |
|--------|------|------|------------|----------|
| POST | `/share` | Bearer | `session_id` required, session must exist | `{ ok, data: ShareInfo }` |
| GET | `/share` | Bearer | Optional `session_id`, `limit` | `{ ok, data: ShareInfo[] }` |
| GET | `/share/:id` | Bearer | Share must exist | `{ ok, data: ShareInfo }` |
| DELETE | `/share/:id` | Bearer | Share must exist | `{ ok, data: { share_id, status } }` |

### /s (share.ts -- public) -- NO AUTH

| Method | Path | Auth | Validation | Response |
|--------|------|------|------------|----------|
| GET | `/s/:id` | None | Share must exist and not be revoked/expired | HTML page with CSP header |

### /billing (billing.ts) -- AUTH REQUIRED (except webhook)

| Method | Path | Auth | Validation | Response |
|--------|------|------|------------|----------|
| GET | `/billing/plan` | Bearer | None | `{ ok, data: PlanInfo }` |
| POST | `/billing/checkout` | Bearer | `email` required | `{ ok, data: { url, session_id } }` |
| POST | `/billing/portal` | Bearer | Customer ID from body or subscription | `{ ok, data: { url } }` |
| GET | `/billing/events` | Bearer | `limit` capped at 200 | `{ ok, data: BillingEvent[] }` |
| POST | `/billing/webhook` | None | Stripe signature required | `{ ok, data: { received } }` |

---

## Auth Middleware Analysis

**File:** `src/daemon/api/middleware/auth.ts`

- Uses `NODE_AUTH_SECRET` environment variable
- Timing-safe comparison via `timingSafeEqual` from `node:crypto`
- Handles length-mismatch with dummy comparison to prevent timing leaks
- Supports `Bearer <token>` format and raw token
- Returns 503 if secret not configured (not 401 -- server misconfiguration, not client error)
- Returns 401 for missing header or empty token
- Returns 403 for invalid token
- All rejections are audit-logged

**Auth bypass logic (app.ts line 81-88):**
```
path === "/health"
path.startsWith("/hooks/")
path.startsWith("/oauth/")
path.startsWith("/s/")
path === "/billing/webhook"
```

---

## Findings

### Security Observations

1. **Auth is solid.** Timing-safe comparison, no fallback when secret is missing, audit logging on all failures.

2. **Rate limiting applied globally** before auth -- good, prevents brute-force against auth.

3. **CORS is restrictive** -- only localhost HTTP and Tauri app allowed.

4. **Security headers present** -- X-Frame-Options DENY, nosniff, no-referrer.

5. **Body limit** -- 10MB max prevents memory exhaustion.

6. **WebSocket auth** -- The `/ws` upgrade path in `startServer()` checks that `NODE_AUTH_SECRET` exists but does NOT validate the client token before upgrade. Auth is done post-connection via the `"auth"` message type in `websocket.ts`. This is an acceptable pattern (WebSocket auth after connect) but the upgrade itself is unauthenticated.

7. **WebSocket brute-force protection** -- Max 3 failed auth attempts per connection, then close with 1008.

### Potential Issues

1. **WebSocket upgrade without auth check**: The `startServer()` `fetch` handler checks that `NODE_AUTH_SECRET` is set (returns 503 if not) but does not validate any client token before calling `bunServer.upgrade(req)`. This means anyone can open a WebSocket connection. However, post-connect auth is required for any action beyond `ping`, and 3 failed attempts close the connection. This is a design choice, not a bug.

2. **JSON parse errors in agent/billing routes**: Routes like `POST /agent/chat` call `c.req.json()` without try/catch. If the body is not valid JSON, Hono's built-in error handler catches it and returns 500. This is functional but could return a more specific 400 error.

3. **Connector call response format**: `POST /connector/:name/call` returns `connector.call()` result directly with `result.ok ? 200 : 502`. The response shape depends on the connector implementation, which may not always follow `{ ok, data }` format.

### Response Format Consistency

All routes follow the `{ ok: true, data: ... }` / `{ ok: false, error: "..." }` contract except:
- OAuth routes return HTML (by design -- browser flow)
- Public share routes return HTML (by design -- rendered page)
- Agent stream returns SSE (by design -- event stream)
- 404 fallback and global error handler correctly return the contract format

---

## Unprotected Routes Summary

| Path Pattern | Reason |
|-------------|--------|
| `GET /health` | Monitoring, no sensitive data |
| `POST /hooks/:triggerId` | Webhook signature verification in trigger engine |
| `GET /oauth/:provider/start` | Browser redirect, state token CSRF |
| `GET /oauth/:provider/callback` | Browser redirect, state token validated |
| `GET /s/:id` | Public share page, read-only |
| `POST /billing/webhook` | Stripe signature verification |

All unprotected routes have alternative authentication mechanisms (signatures, state tokens) or expose no sensitive data.
