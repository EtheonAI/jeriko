const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

let context = null;
let page = null;

const TMP_DIR = os.tmpdir();

// Persistent profile for jeriko browser sessions
const PROFILE_DIR = path.join(__dirname, '..', 'data', 'chrome-profile');
const CHROME_DEFAULT = path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome', 'Default');

function seedProfile() {
  // Copy cookies and login data from user's real Chrome profile (one-time seed)
  const defaultDir = path.join(PROFILE_DIR, 'Default');
  fs.mkdirSync(defaultDir, { recursive: true });

  const marker = path.join(PROFILE_DIR, '.seeded');
  if (fs.existsSync(marker)) return; // Already seeded

  const filesToCopy = ['Cookies', 'Cookies-journal', 'Login Data', 'Login Data-journal', 'Web Data', 'Web Data-journal'];
  for (const file of filesToCopy) {
    const src = path.join(CHROME_DEFAULT, file);
    const dst = path.join(defaultDir, file);
    try {
      if (fs.existsSync(src)) fs.copyFileSync(src, dst);
    } catch {}
  }

  // Copy Local Storage for site sessions (Facebook, etc.)
  const lsSrc = path.join(CHROME_DEFAULT, 'Local Storage');
  const lsDst = path.join(defaultDir, 'Local Storage');
  if (fs.existsSync(lsSrc) && !fs.existsSync(lsDst)) {
    try { execSync(`cp -R "${lsSrc}" "${lsDst}"`, { timeout: 10000 }); } catch {}
  }

  // Copy IndexedDB for site data
  const idbSrc = path.join(CHROME_DEFAULT, 'IndexedDB');
  const idbDst = path.join(defaultDir, 'IndexedDB');
  if (fs.existsSync(idbSrc) && !fs.existsSync(idbDst)) {
    try { execSync(`cp -R "${idbSrc}" "${idbDst}"`, { timeout: 30000 }); } catch {}
  }

  fs.writeFileSync(marker, new Date().toISOString());
}

async function ensureBrowser() {
  if (!context) {
    seedProfile();
    context = await chromium.launchPersistentContext(PROFILE_DIR, {
      channel: 'chrome',
      headless: false,
      viewport: { width: 1280, height: 720 },
      args: ['--disable-blink-features=AutomationControlled'],
    });
    page = context.pages()[0] || await context.newPage();
  }
  if (!page || page.isClosed()) {
    page = await context.newPage();
  }
  return page;
}

async function navigate(url) {
  const p = await ensureBrowser();
  await p.goto(url, { waitUntil: 'load', timeout: 30000 });
  // Give SPAs a moment to render
  await new Promise(r => setTimeout(r, 2000));
  return { url: p.url(), title: await p.title() };
}

async function screenshot(opts = {}) {
  const p = await ensureBrowser();
  const filename = `screenshot-${Date.now()}.png`;
  const filepath = path.join(TMP_DIR, filename);
  await p.screenshot({ path: filepath, fullPage: opts.fullPage || false });
  return { path: filepath, filename };
}

async function click(selector) {
  const p = await ensureBrowser();
  await p.click(selector, { timeout: 10000 });
  return { clicked: selector };
}

async function type(selector, text) {
  const p = await ensureBrowser();
  await p.fill(selector, text);
  return { typed: text, into: selector };
}

async function getText() {
  const p = await ensureBrowser();
  const text = await p.evaluate(() => document.body.innerText);
  return text.slice(0, 8000);
}

async function evaluate(code) {
  const p = await ensureBrowser();
  const result = await p.evaluate(code);
  return result;
}

async function scrollDown() {
  const p = await ensureBrowser();
  await p.evaluate(() => window.scrollBy(0, window.innerHeight));
}

async function scrollUp() {
  const p = await ensureBrowser();
  await p.evaluate(() => window.scrollBy(0, -window.innerHeight));
}

async function getLinks() {
  const p = await ensureBrowser();
  return p.evaluate(() =>
    Array.from(document.querySelectorAll('a[href]')).slice(0, 50).map(a => ({
      text: a.innerText.trim().slice(0, 80),
      href: a.href,
    }))
  );
}

async function closeBrowser() {
  if (context) {
    await context.close();
    context = null;
    page = null;
  }
}

module.exports = {
  navigate, screenshot, click, type, getText,
  evaluate, scrollDown, scrollUp, getLinks, closeBrowser,
};
