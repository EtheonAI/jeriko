// Relay Worker — HTML templates for OAuth browser responses.
//
// These are returned directly to the user's browser during OAuth flows.
// The relay receives the OAuth callback, forwards to the daemon, and
// returns HTML to show the user the result.

// ---------------------------------------------------------------------------
// HTML entity escaping
// ---------------------------------------------------------------------------

const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch]!);
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

/**
 * Error page shown when an OAuth callback fails.
 * Matches the Bun relay's error template — dark theme, minimal design.
 */
export function errorHtml(message: string): string {
  const safe = escapeHtml(message);
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Jeriko — Error</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a0a;color:#fafafa}
.card{text-align:center;padding:2rem;border:1px solid #333;border-radius:12px;max-width:400px}
h1{font-size:1.4rem;margin-bottom:.5rem;color:#f87171}p{color:#888;margin-top:.5rem}</style></head>
<body><div class="card"><h1>Connection Error</h1><p>${safe}</p></div></body></html>`;
}

/**
 * Success page shown after a successful OAuth connection.
 * Matches the daemon's success template — dark theme, minimal design.
 */
export function successHtml(label: string): string {
  const safe = escapeHtml(label);
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Jeriko — Connected</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a0a;color:#fafafa}
.card{text-align:center;padding:2rem;border:1px solid #333;border-radius:12px;max-width:400px}
h1{font-size:1.4rem;margin-bottom:.5rem}p{color:#888;margin-top:.5rem}</style></head>
<body><div class="card"><h1>${safe} connected</h1><p>You can close this tab.</p></div></body></html>`;
}
