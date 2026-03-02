// Anti-detection stealth scripts for browser automation.
//
// Injected once via context.addInitScript() at browser launch — runs
// automatically on every new page/navigation before any site JS executes.
//
// Covers:
//   - navigator.webdriver deletion (primary bot signal)
//   - Language normalization (consistent fingerprint)
//   - Permission API patching (avoids "denied" anomalies)
//   - Shadow DOM forced open (enables element traversal)
//   - postMessage protection (preserves origin integrity)

type BrowserContext = import("playwright-core").BrowserContext;

// ---------------------------------------------------------------------------
// Init script — single string evaluated in page context before page JS runs
// ---------------------------------------------------------------------------

const STEALTH_INIT_SCRIPT = `(() => {
  // 1. Delete navigator.webdriver — most common bot detection signal
  //    Chrome automation sets this to true; deleting it makes typeof return "undefined"
  try {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
      configurable: true
    });
  } catch (e) {}

  // 2. Override navigator.languages — normalize to consistent value
  //    Headless browsers sometimes expose empty or unusual language arrays
  try {
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
      configurable: true
    });
  } catch (e) {}

  // 3. Patch Permissions API — prevent "denied" anomalies for notifications
  //    Some sites check permissions.query({name:'notifications'}) to detect bots
  try {
    const originalQuery = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = (params) => {
      if (params.name === 'notifications') {
        return Promise.resolve({ state: 'prompt', onchange: null });
      }
      return originalQuery(params);
    };
  } catch (e) {}

  // 4. Force attachShadow to mode:"open" — enables element traversal into shadow roots
  //    Closed shadow DOMs block our element indexing; open mode allows querySelectorAll
  try {
    const originalAttachShadow = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function(init) {
      return originalAttachShadow.call(this, { ...init, mode: 'open' });
    };
  } catch (e) {}

  // 5. Protect window.postMessage — store original reference and origin
  //    Some anti-bot scripts override postMessage to detect automation
  try {
    const originalPostMessage = window.postMessage.bind(window);
    window.__jerikoOriginalPostMessage = originalPostMessage;
  } catch (e) {}
})()`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Applies anti-detection stealth scripts to a browser context.
 * Call once after launching the persistent context — the init script
 * runs automatically on every subsequent page load.
 */
export async function applyStealthScripts(ctx: BrowserContext): Promise<void> {
  await ctx.addInitScript(STEALTH_INIT_SCRIPT);
}
