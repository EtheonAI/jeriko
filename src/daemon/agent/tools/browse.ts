// Tool — Browser automation via Playwright.
//
// Provides a single "browser" tool with an action parameter for navigate,
// screenshot, click, type, scroll, evaluate, text/markdown extraction,
// and element indexing. Uses the system Chrome with persistent profile
// so the agent inherits real user sessions (cookies, logins).
//
// Architecture:
//   - playwright-core (no bundled browsers) connects to system Chrome
//   - Persistent context preserves cookies/sessions across invocations
//   - Element indexing (Manus-parity) assigns numbered IDs to clickable elements
//   - Markdown extraction converts page to LLM-friendly text
//
// Gracefully degrades if Playwright is not installed.

import { registerTool } from "./registry.js";
import type { ToolDefinition } from "./registry.js";
import { join } from "node:path";
import { tmpdir, homedir, platform } from "node:os";
import { mkdirSync, existsSync, copyFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Lazy Playwright import — avoids crash if not installed
// ---------------------------------------------------------------------------

type PlaywrightCore = typeof import("playwright-core");
type BrowserContext = import("playwright-core").BrowserContext;
type Page = import("playwright-core").Page;

let pw: PlaywrightCore | null = null;

async function getPlaywright(): Promise<PlaywrightCore> {
  if (pw) return pw;
  try {
    pw = await import("playwright-core");
    return pw;
  } catch {
    throw new Error(
      "Playwright not installed. Run: bun add playwright-core",
    );
  }
}

// ---------------------------------------------------------------------------
// Browser state — singleton persistent context
// ---------------------------------------------------------------------------

let context: BrowserContext | null = null;
let page: Page | null = null;

const DATA_DIR = join(homedir(), ".jeriko", "chrome-profile");
const SCREENSHOTS_DIR = join(tmpdir(), "jeriko-screenshots");

// ---------------------------------------------------------------------------
// Chrome profile seeding (macOS) — copies cookies/sessions from real Chrome
// ---------------------------------------------------------------------------

function seedProfile(): void {
  mkdirSync(join(DATA_DIR, "Default"), { recursive: true });
  const marker = join(DATA_DIR, ".seeded");
  if (existsSync(marker)) return;

  if (platform() !== "darwin") {
    writeFileSync(marker, new Date().toISOString());
    return;
  }

  const chromeDefault = join(
    homedir(),
    "Library",
    "Application Support",
    "Google",
    "Chrome",
    "Default",
  );

  if (!existsSync(chromeDefault)) {
    writeFileSync(marker, new Date().toISOString());
    return;
  }

  // Copy cookies and login data from user's real Chrome
  const files = [
    "Cookies",
    "Cookies-journal",
    "Login Data",
    "Login Data-journal",
    "Web Data",
    "Web Data-journal",
  ];

  for (const file of files) {
    const src = join(chromeDefault, file);
    const dst = join(DATA_DIR, "Default", file);
    try {
      if (existsSync(src)) copyFileSync(src, dst);
    } catch {
      // Ignore — file may be locked
    }
  }

  // Copy Local Storage for site sessions
  const lsSrc = join(chromeDefault, "Local Storage");
  const lsDst = join(DATA_DIR, "Default", "Local Storage");
  if (existsSync(lsSrc) && !existsSync(lsDst)) {
    try {
      execSync(`cp -R "${lsSrc}" "${lsDst}"`, { timeout: 10_000 });
    } catch {
      // Ignore
    }
  }

  writeFileSync(marker, new Date().toISOString());
}

// ---------------------------------------------------------------------------
// Browser lifecycle
// ---------------------------------------------------------------------------

function findChromeChannel(): string | undefined {
  // On macOS, use the real Chrome if available
  if (platform() === "darwin") {
    const chromePaths = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ];
    for (const p of chromePaths) {
      if (existsSync(p)) return "chrome";
    }
  }
  return undefined;
}

async function ensureBrowser(): Promise<Page> {
  if (page) {
    try {
      await page.title(); // Verify still alive
      return page;
    } catch {
      page = null;
      context = null;
    }
  }

  const playwright = await getPlaywright();
  seedProfile();

  const channel = findChromeChannel();

  context = await playwright.chromium.launchPersistentContext(DATA_DIR, {
    channel,
    headless: false,
    viewport: { width: 1280, height: 720 },
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });

  page = context.pages()[0] ?? (await context.newPage());
  return page;
}

async function closeBrowser(): Promise<string> {
  if (context) {
    try {
      await context.close();
    } catch {
      // Ignore
    }
    context = null;
    page = null;
  }
  return JSON.stringify({ ok: true, message: "Browser closed" });
}

// ---------------------------------------------------------------------------
// Element indexing — Manus-parity JS (assigns data-jeriko-id to clickables)
// ---------------------------------------------------------------------------

const COLLECT_ELEMENTS_JS = `(args) => {
  const startIndex = args.startIndex || 1;
  const attr = args.clickIdAttr || 'data-jeriko-id';
  const elements = [];
  let index = startIndex;
  const interactiveTags = new Set(['a','button','input','select','textarea','summary','option']);
  const interactiveRoles = new Set(['button','tab','link','checkbox','menuitem','menuitemcheckbox','menuitemradio','radio']);

  const normalize = (v, lim = 120) => {
    if (!v) return '';
    const t = v.replace(/\\s+/g,' ').trim();
    return t.length > lim ? t.slice(0,lim)+'...' : t;
  };

  const desc = (el, tag, text, inputType) => {
    const h = [];
    const id = normalize(el.id, 60);
    if (id) h.push('id:"'+id+'"');
    const aria = normalize(el.getAttribute('aria-label')||el.title||'', 80);
    if (aria) h.push('hint:"'+aria+'"');
    const ph = normalize(el.getAttribute('placeholder')||'', 80);
    if (ph) h.push('placeholder:"'+ph+'"');
    const role = normalize(el.getAttribute('role')||'', 40);
    if (role) h.push('role:"'+role+'"');
    if (inputType) h.push('type:"'+inputType+'"');
    const hText = h.length ? '{'+h.join(',')+'}' : '{}';
    return text ? tag+' '+hText+' '+text : tag+' '+hText;
  };

  const getText = (el, tag, inputType) => {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      if (el.value) return normalize(el.value);
      if (el.placeholder) return normalize(el.placeholder);
    }
    if (tag === 'select' && el instanceof HTMLSelectElement) {
      return Array.from(el.options).slice(0,5).map((o,i) => {
        const v = normalize(o.textContent||'');
        return v ? 'option#'+i+':'+v : null;
      }).filter(Boolean).join(', ');
    }
    const t = normalize(el.innerText || el.textContent || '');
    if (t) return t;
    if (inputType==='submit'||inputType==='button') return normalize(el.value||'submit');
    return '';
  };

  const isClickable = (el, tag) => {
    if (interactiveTags.has(tag)) return true;
    const roles = (el.getAttribute('role')||'').split(' ').map(r=>r.trim().toLowerCase());
    if (roles.some(r=>interactiveRoles.has(r))) return true;
    const ce = el.getAttribute('contenteditable');
    if (ce && ce.toLowerCase()!=='false') return true;
    return false;
  };

  const isVisible = (el, rect) => {
    if (!rect || rect.width<=1 || rect.height<=1) return false;
    const s = window.getComputedStyle(el);
    if (s.display==='none'||s.visibility==='hidden'||s.pointerEvents==='none') return false;
    const op = parseFloat(s.opacity||'1');
    if (!isNaN(op) && op<=0) return false;
    return true;
  };

  const seen = new Set();
  const traverse = (root) => {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let n = w.nextNode();
    while (n) {
      if (n instanceof HTMLElement && !seen.has(n)) {
        seen.add(n);
        const tag = n.tagName.toLowerCase();
        if (isClickable(n, tag)) {
          const rect = n.getBoundingClientRect();
          if (isVisible(n, rect)) {
            const iType = tag==='input' ? (n.getAttribute('type')||'text').toLowerCase() : null;
            const text = getText(n, tag, iType);
            n.setAttribute(attr, String(index));
            elements.push({
              index, x:rect.x, y:rect.y, width:rect.width, height:rect.height,
              tag, inputType:iType, description:desc(n,tag,text,iType)
            });
            index++;
          }
        }
        if (n.shadowRoot) traverse(n.shadowRoot);
      }
      n = w.nextNode();
    }
  };
  traverse(document);

  return {
    elements,
    nextIndex: index,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1
    }
  };
}`;

const FIND_ELEMENT_JS = `(index) => {
  const attr = 'data-jeriko-id';
  const target = String(index);
  const walk = (root, depth) => {
    if (!root || depth > 10) return null;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let n = w.nextNode();
    while (n) {
      if (n instanceof Element && n.getAttribute(attr) === target) {
        const r = n.getBoundingClientRect();
        return { x: r.x + r.width/2, y: r.y + r.height/2, tag: n.tagName.toLowerCase() };
      }
      if (n instanceof Element && n.shadowRoot) {
        const f = walk(n.shadowRoot, depth+1);
        if (f) return f;
      }
      n = w.nextNode();
    }
    return null;
  };
  return walk(document, 0);
}`;

const EXTRACT_MARKDOWN_JS = `(() => {
  const body = document.body;
  if (!body) return '';
  const walk = (node) => {
    if (!node) return '';
    if (node.nodeType === Node.TEXT_NODE) return node.textContent.replace(/\\s+/g, ' ');
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const tag = node.tagName.toLowerCase();
    const style = window.getComputedStyle(node);
    if (style.display==='none'||style.visibility==='hidden') return '';
    if (['script','style','noscript','svg','path'].includes(tag)) return '';
    let children = '';
    for (const c of node.childNodes) children += walk(c);
    children = children.trim();
    if (!children && !['img','br','hr','input'].includes(tag)) return '';
    switch (tag) {
      case 'h1': return '\\n# '+children+'\\n';
      case 'h2': return '\\n## '+children+'\\n';
      case 'h3': return '\\n### '+children+'\\n';
      case 'h4': return '\\n#### '+children+'\\n';
      case 'p': return '\\n'+children+'\\n';
      case 'br': return '\\n';
      case 'hr': return '\\n---\\n';
      case 'a': {
        const href = node.getAttribute('href')||'';
        return href && !href.startsWith('javascript:') ? '['+children+']('+href+')' : children;
      }
      case 'strong': case 'b': return '**'+children+'**';
      case 'em': case 'i': return '*'+children+'*';
      case 'code': return '\\x60'+children+'\\x60';
      case 'pre': return '\\n\\x60\\x60\\x60\\n'+children+'\\n\\x60\\x60\\x60\\n';
      case 'li': return '- '+children+'\\n';
      case 'ul': case 'ol': return '\\n'+children;
      case 'div': case 'section': case 'article': case 'main': return '\\n'+children+'\\n';
      default: return children;
    }
  };
  let md = walk(body);
  md = md.replace(/\\n{3,}/g, '\\n\\n').trim();
  return md.length > 15000 ? md.slice(0,15000)+'\\n...(truncated)' : md;
})()`;

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function actionNavigate(args: Record<string, unknown>): Promise<string> {
  const url = args.url as string;
  if (!url) return JSON.stringify({ ok: false, error: "url is required" });

  const p = await ensureBrowser();
  try {
    await p.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    // Give SPAs time to render
    await new Promise((r) => setTimeout(r, 1500));
    return await buildPageSnapshot(p);
  } catch (err) {
    return JSON.stringify({
      ok: false,
      error: `Navigation failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

async function actionView(): Promise<string> {
  const p = await ensureBrowser();
  return await buildPageSnapshot(p);
}

async function actionScreenshot(): Promise<string> {
  const p = await ensureBrowser();
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  const filename = `screenshot-${Date.now()}.png`;
  const filepath = join(SCREENSHOTS_DIR, filename);

  try {
    await p.screenshot({ path: filepath, fullPage: false });
    return JSON.stringify({
      ok: true,
      path: filepath,
      url: p.url(),
      title: await p.title(),
    });
  } catch (err) {
    return JSON.stringify({
      ok: false,
      error: `Screenshot failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

async function actionClick(args: Record<string, unknown>): Promise<string> {
  const p = await ensureBrowser();
  const index = args.index as number | undefined;
  const selector = args.selector as string | undefined;

  try {
    if (index !== undefined) {
      // Resolve element index to coordinates
      const found = await p.evaluate(`(${FIND_ELEMENT_JS})(${index})`);
      if (!found) {
        return JSON.stringify({ ok: false, error: `Element [${index}] not found` });
      }
      const { x, y } = found as { x: number; y: number };
      await p.mouse.click(x, y);
    } else if (selector) {
      await p.click(selector, { timeout: 10_000 });
    } else {
      return JSON.stringify({ ok: false, error: "index or selector is required" });
    }
    await new Promise((r) => setTimeout(r, 500));
    return await buildPageSnapshot(p);
  } catch (err) {
    return JSON.stringify({
      ok: false,
      error: `Click failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

async function actionType(args: Record<string, unknown>): Promise<string> {
  const p = await ensureBrowser();
  const text = args.text as string;
  const index = args.index as number | undefined;
  const selector = args.selector as string | undefined;
  const pressEnter = args.press_enter as boolean | undefined;

  if (!text && text !== "") {
    return JSON.stringify({ ok: false, error: "text is required" });
  }

  try {
    // Focus the target element
    if (index !== undefined) {
      const found = await p.evaluate(`(${FIND_ELEMENT_JS})(${index})`);
      if (!found) {
        return JSON.stringify({ ok: false, error: `Element [${index}] not found` });
      }
      const { x, y } = found as { x: number; y: number };
      await p.mouse.click(x, y);
      await new Promise((r) => setTimeout(r, 200));
    } else if (selector) {
      await p.click(selector, { timeout: 5_000 });
      await new Promise((r) => setTimeout(r, 200));
    }

    // Clear existing text and type new
    await p.keyboard.press("Meta+a"); // macOS
    await p.keyboard.type(text);

    if (pressEnter) {
      await p.keyboard.press("Enter");
    }

    await new Promise((r) => setTimeout(r, 300));

    mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    const filepath = join(SCREENSHOTS_DIR, `type-${Date.now()}.png`);
    await p.screenshot({ path: filepath });

    return JSON.stringify({ ok: true, typed: text, screenshot: filepath });
  } catch (err) {
    return JSON.stringify({
      ok: false,
      error: `Type failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

async function actionScroll(args: Record<string, unknown>): Promise<string> {
  const p = await ensureBrowser();
  const direction = (args.direction as string) ?? "down";
  const amount = (args.amount as number) ?? 3;

  try {
    const px = amount * 300;
    if (direction === "up") {
      await p.evaluate(`window.scrollBy(0, -${px})`);
    } else {
      await p.evaluate(`window.scrollBy(0, ${px})`);
    }
    await new Promise((r) => setTimeout(r, 300));
    return await buildPageSnapshot(p);
  } catch (err) {
    return JSON.stringify({
      ok: false,
      error: `Scroll failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

async function actionEvaluate(args: Record<string, unknown>): Promise<string> {
  const p = await ensureBrowser();
  const script = args.script as string;
  if (!script) return JSON.stringify({ ok: false, error: "script is required" });

  try {
    const result = await p.evaluate(script);
    return JSON.stringify({ ok: true, result });
  } catch (err) {
    return JSON.stringify({
      ok: false,
      error: `Evaluate failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

async function actionGetText(): Promise<string> {
  const p = await ensureBrowser();
  try {
    const markdown = await p.evaluate(EXTRACT_MARKDOWN_JS);
    return JSON.stringify({
      ok: true,
      url: p.url(),
      title: await p.title(),
      content: markdown,
    });
  } catch (err) {
    return JSON.stringify({
      ok: false,
      error: `Get text failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

async function actionGetLinks(): Promise<string> {
  const p = await ensureBrowser();
  try {
    const links = await p.evaluate(`
      Array.from(document.querySelectorAll("a[href]"))
        .slice(0, 50)
        .map(a => ({
          text: a.innerText.trim().slice(0, 80),
          href: a.href,
        }))
    `);
    return JSON.stringify({ ok: true, url: p.url(), links });
  } catch (err) {
    return JSON.stringify({
      ok: false,
      error: `Get links failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

async function actionKeyPress(args: Record<string, unknown>): Promise<string> {
  const p = await ensureBrowser();
  const key = args.key as string;
  if (!key) return JSON.stringify({ ok: false, error: "key is required" });

  try {
    await p.keyboard.press(key);
    await new Promise((r) => setTimeout(r, 300));
    return JSON.stringify({ ok: true, key });
  } catch (err) {
    return JSON.stringify({
      ok: false,
      error: `Key press failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

async function actionBack(): Promise<string> {
  const p = await ensureBrowser();
  try {
    await p.goBack({ timeout: 10_000 });
    await new Promise((r) => setTimeout(r, 1000));
    return await buildPageSnapshot(p);
  } catch (err) {
    return JSON.stringify({
      ok: false,
      error: `Back failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

async function actionForward(): Promise<string> {
  const p = await ensureBrowser();
  try {
    await p.goForward({ timeout: 10_000 });
    await new Promise((r) => setTimeout(r, 1000));
    return await buildPageSnapshot(p);
  } catch (err) {
    return JSON.stringify({
      ok: false,
      error: `Forward failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

// ---------------------------------------------------------------------------
// Page snapshot — elements + markdown + metadata
// ---------------------------------------------------------------------------

async function buildPageSnapshot(p: Page): Promise<string> {
  const [title, url] = await Promise.all([p.title(), Promise.resolve(p.url())]);

  // Collect clickable elements with indices.
  // Wrap as IIFE since Playwright string evaluate doesn't pass args.
  let elements: Array<{ index: number; description: string }> = [];
  try {
    const collectArgs = JSON.stringify({ startIndex: 1, clickIdAttr: "data-jeriko-id" });
    const result = (await p.evaluate(
      `(${COLLECT_ELEMENTS_JS})(${collectArgs})`,
    )) as { elements: Array<{ index: number; description: string }> };
    elements = result.elements ?? [];
  } catch {
    // Element collection may fail on some pages
  }

  // Extract markdown
  let markdown = "";
  try {
    markdown = (await p.evaluate(EXTRACT_MARKDOWN_JS)) as string;
  } catch {
    try {
      markdown = (await p.evaluate(
        "document.body?.innerText?.slice(0, 10000) || ''",
      )) as string;
    } catch {
      // Ignore
    }
  }

  // Take screenshot
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  const filepath = join(SCREENSHOTS_DIR, `page-${Date.now()}.png`);
  try {
    await p.screenshot({ path: filepath });
  } catch {
    // Screenshot may fail
  }

  // Format elements as compact text for LLM
  const elementList = elements
    .slice(0, 100)
    .map((e) => `[${e.index}] ${e.description}`)
    .join("\n");

  return JSON.stringify({
    ok: true,
    title,
    url,
    screenshot: filepath,
    element_count: elements.length,
    elements: elementList || "(no interactive elements found)",
    content: markdown.slice(0, 10_000),
  });
}

// ---------------------------------------------------------------------------
// Main execute — routes action to handler
// ---------------------------------------------------------------------------

async function execute(args: Record<string, unknown>): Promise<string> {
  const action = args.action as string;

  if (!action) {
    return JSON.stringify({
      ok: false,
      error:
        "action is required. Supported: navigate, view, screenshot, click, type, scroll, evaluate, get_text, get_links, key_press, back, forward, close",
    });
  }

  switch (action) {
    case "navigate":
      return actionNavigate(args);
    case "view":
      return actionView();
    case "screenshot":
      return actionScreenshot();
    case "click":
      return actionClick(args);
    case "type":
    case "input":
      return actionType(args);
    case "scroll":
    case "scroll_up":
    case "scroll_down":
      if (action === "scroll_up") args.direction = "up";
      if (action === "scroll_down") args.direction = "down";
      return actionScroll(args);
    case "evaluate":
    case "console_exec":
      return actionEvaluate(args);
    case "get_text":
    case "text":
      return actionGetText();
    case "get_links":
    case "links":
      return actionGetLinks();
    case "key_press":
      return actionKeyPress(args);
    case "back":
      return actionBack();
    case "forward":
      return actionForward();
    case "close":
      return closeBrowser();
    default:
      return JSON.stringify({ ok: false, error: `Unknown action: "${action}"` });
  }
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export const browserTool: ToolDefinition = {
  id: "browser",
  name: "browser",
  aliases: ["browse", "web_browser", "open_browser"],
  description: `Control a real Chrome browser via Playwright. Navigate web pages, interact with elements, take screenshots, and extract content.

Actions:
  navigate  — Go to a URL. Returns page content, clickable elements with [index] numbers, and a screenshot.
  view      — Get current page state (elements, content, screenshot) without navigating.
  screenshot — Take a screenshot of the current page.
  click     — Click an element by index (from navigate/view) or CSS selector.
  type      — Type text into a field. Use index or selector to target. Set press_enter:true to submit.
  scroll    — Scroll the page. direction: "up" or "down", amount: number of screens.
  evaluate  — Execute JavaScript on the page and return the result.
  get_text  — Extract page content as markdown.
  get_links — Get all links on the page (up to 50).
  key_press — Press a keyboard key (e.g. "Enter", "Escape", "Tab").
  back      — Go back in browser history.
  forward   — Go forward in browser history.
  close     — Close the browser.

Element indexing: navigate and view return numbered elements like [1] button "Submit", [2] input {placeholder:"Search"}. Use these indices with click and type to interact with specific elements.`,
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        description:
          "The browser action to perform: navigate, view, screenshot, click, type, scroll, evaluate, get_text, get_links, key_press, back, forward, close",
        enum: [
          "navigate",
          "view",
          "screenshot",
          "click",
          "type",
          "scroll",
          "evaluate",
          "get_text",
          "get_links",
          "key_press",
          "back",
          "forward",
          "close",
        ],
      },
      url: {
        type: "string",
        description: "URL to navigate to (for navigate action)",
      },
      index: {
        type: "number",
        description:
          "Element index from page snapshot (for click/type actions)",
      },
      selector: {
        type: "string",
        description: "CSS selector (for click/type actions, alternative to index)",
      },
      text: {
        type: "string",
        description: "Text to type (for type action)",
      },
      press_enter: {
        type: "boolean",
        description: "Press Enter after typing (for type action)",
      },
      direction: {
        type: "string",
        description: "Scroll direction: 'up' or 'down' (for scroll action)",
        enum: ["up", "down"],
      },
      amount: {
        type: "number",
        description: "Number of screens to scroll (for scroll action, default: 3)",
      },
      script: {
        type: "string",
        description: "JavaScript to evaluate on the page (for evaluate action)",
      },
      key: {
        type: "string",
        description: "Key to press (for key_press action, e.g. 'Enter', 'Escape', 'Tab')",
      },
    },
    required: ["action"],
  },
  execute,
};

registerTool(browserTool);
