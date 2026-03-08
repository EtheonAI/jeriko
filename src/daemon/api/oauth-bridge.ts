/**
 * OAuth Bridge — Bridges HTTP callbacks to IPC responses.
 *
 * When the CLI needs an OAuth callback on the daemon's port (e.g. OpenRouter
 * requires port 3000), it calls the `oauth.await_callback` IPC method.
 * The daemon's /callback HTTP route receives the browser redirect and
 * resolves the pending IPC request with the authorization code.
 *
 * Flow:
 *   1. CLI → IPC `oauth.await_callback` (blocks waiting)
 *   2. Daemon registers a pending callback
 *   3. Browser → GET /callback?code=... hits daemon HTTP
 *   4. HTTP route resolves the pending callback
 *   5. IPC returns code to CLI
 *   6. CLI exchanges code for API key
 */

// ---------------------------------------------------------------------------
// State — at most one pending OAuth callback at a time
// ---------------------------------------------------------------------------

interface PendingCallback {
  resolve: (code: string) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

let pending: PendingCallback | null = null;

// ---------------------------------------------------------------------------
// Called by the IPC handler — waits for a callback to arrive
// ---------------------------------------------------------------------------

/**
 * Wait for an OAuth callback to arrive on the daemon's HTTP server.
 * Returns the authorization code when `/callback?code=...` is hit.
 *
 * @throws Error if a callback is already pending or the timeout expires.
 */
export function awaitOAuthCallback(timeoutMs: number = 120_000): Promise<string> {
  if (pending) {
    return Promise.reject(new Error("Another OAuth callback is already pending"));
  }

  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (pending) {
        pending = null;
        reject(new Error("OAuth callback timed out — no callback received"));
      }
    }, timeoutMs);

    pending = { resolve, reject, timer };
  });
}

// ---------------------------------------------------------------------------
// Called by the HTTP route — delivers the code from the browser redirect
// ---------------------------------------------------------------------------

/**
 * Deliver an OAuth callback code from the HTTP route to the waiting IPC handler.
 * Returns true if a pending callback was resolved.
 */
export function deliverOAuthCallback(code: string): boolean {
  if (!pending) return false;

  clearTimeout(pending.timer);
  pending.resolve(code);
  pending = null;
  return true;
}

/**
 * Deliver an OAuth callback error from the HTTP route.
 * Returns true if a pending callback was rejected.
 */
export function deliverOAuthError(error: string): boolean {
  if (!pending) return false;

  clearTimeout(pending.timer);
  pending.reject(new Error(`OAuth callback error: ${error}`));
  pending = null;
  return true;
}

/**
 * Check if there's a pending OAuth callback waiting.
 */
export function hasOAuthPending(): boolean {
  return pending !== null;
}
