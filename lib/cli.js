const path = require('path');
const fs = require('fs');

// Load .env from project root — skip for plugins (they get filtered env from dispatcher)
if (!process.env.JERIKO_PLUGIN) {
  const envPath = process.env.JERIKO_ROOT
    ? path.join(process.env.JERIKO_ROOT, '.env')
    : path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
  }
}

// Exit codes
const EXIT = { OK: 0, GENERAL: 1, NETWORK: 2, AUTH: 3, NOT_FOUND: 5, TIMEOUT: 7 };

// Output format: env var (set by dispatcher) or --format flag
function getFormat() {
  return process.env.JERIKO_FORMAT || 'json';
}

// Parse argv into { flags: { key: value|true }, positional: [...] }
function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const next = args[i + 1];
      if (!next || next.startsWith('--')) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
    } else {
      positional.push(args[i]);
    }
  }
  // --format flag overrides env
  if (flags.format) {
    process.env.JERIKO_FORMAT = flags.format;
    delete flags.format;
  }
  return { flags, positional };
}

// ========== FORMATTERS ==========

// JSON: machine-parseable, for piping between commands
function formatJSON(data) {
  return JSON.stringify({ ok: true, data });
}

// Text: AI-optimized, minimal tokens, instant comprehension
function formatText(data) {
  if (data === null || data === undefined) return 'ok';
  if (typeof data === 'string') return `ok ${data}`;
  if (Array.isArray(data)) return formatTextArray(data);
  if (typeof data === 'object') return formatTextObject(data);
  return `ok ${data}`;
}

function formatTextObject(obj, prefix) {
  const parts = [];
  for (const [key, val] of Object.entries(obj)) {
    const k = prefix ? `${prefix}.${key}` : key;
    if (val === null || val === undefined) continue;
    if (typeof val === 'object' && !Array.isArray(val)) {
      parts.push(formatTextObject(val, k));
    } else if (Array.isArray(val)) {
      if (val.length === 0) {
        parts.push(`${k}=[]`);
      } else if (typeof val[0] !== 'object') {
        parts.push(`${k}=${val.join(',')}`);
      } else {
        parts.push(`${k}=[${val.length}]`);
        val.forEach((item, i) => {
          parts.push(`  ${i + 1}. ${formatTextItem(item)}`);
        });
      }
    } else {
      const v = String(val);
      parts.push(v.includes(' ') ? `${k}="${v}"` : `${k}=${v}`);
    }
  }
  return parts.join(' ');
}

function formatTextArray(arr) {
  if (arr.length === 0) return 'ok (empty)';
  if (typeof arr[0] !== 'object') {
    return `ok ${arr.length}\n${arr.map((v, i) => `${i + 1}. ${v}`).join('\n')}`;
  }
  return `ok ${arr.length}\n${arr.map((item, i) => `${i + 1}. ${formatTextItem(item)}`).join('\n')}`;
}

function formatTextItem(obj) {
  if (typeof obj !== 'object' || obj === null) return String(obj);
  return Object.entries(obj)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => {
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return s.includes(' ') ? `${k}="${s}"` : `${k}=${s}`;
    })
    .join(' ');
}

// Logfmt: structured key=value, one line, greppable
function formatLogfmt(data) {
  if (data === null || data === undefined) return 'ok=true';
  if (typeof data === 'string') return `ok=true msg="${data.replace(/"/g, '\\"')}"`;
  if (Array.isArray(data)) return `ok=true count=${data.length}\n` + data.map(item => flattenLogfmt(item)).join('\n');
  if (typeof data === 'object') return 'ok=true ' + flattenLogfmt(data);
  return `ok=true value=${data}`;
}

function flattenLogfmt(obj, prefix) {
  if (typeof obj !== 'object' || obj === null) return String(obj);
  const parts = [];
  for (const [key, val] of Object.entries(obj)) {
    const k = prefix ? `${prefix}.${key}` : key;
    if (val === null || val === undefined) continue;
    if (Array.isArray(val)) {
      if (val.length === 0) { parts.push(`${k}=[]`); continue; }
      if (typeof val[0] !== 'object') { parts.push(`${k}="${val.join(',')}"`); continue; }
      parts.push(`${k}.count=${val.length}`);
      val.forEach((item, i) => parts.push(flattenLogfmt(item, `${k}.${i}`)));
    } else if (typeof val === 'object') {
      parts.push(flattenLogfmt(val, k));
    } else {
      const v = String(val);
      parts.push(v.includes(' ') || v.includes('"') ? `${k}="${v.replace(/"/g, '\\"')}"` : `${k}=${v}`);
    }
  }
  return parts.join(' ');
}

// ========== OUTPUT ==========

// Success output to stdout
function ok(data) {
  const fmt = getFormat();
  if (fmt === 'text') console.log(formatText(data));
  else if (fmt === 'logfmt') console.log(formatLogfmt(data));
  else console.log(formatJSON(data));
  process.exit(EXIT.OK);
}

// Error output to stderr
function fail(error, code = EXIT.GENERAL) {
  const fmt = getFormat();
  const msg = String(error);
  if (fmt === 'text') console.error(`error ${msg}`);
  else if (fmt === 'logfmt') console.error(`ok=false error="${msg.replace(/"/g, '\\"')}"`);
  else console.error(JSON.stringify({ ok: false, error: msg }));
  process.exit(code);
}

// Read stdin if piped (non-TTY), returns null if TTY
function readStdin(timeoutMs = 100) {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve(null);
    const chunks = [];
    const timer = setTimeout(() => {
      process.stdin.destroy();
      resolve(chunks.length ? chunks.join('') : null);
    }, timeoutMs);
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => {
      clearTimeout(timer);
      resolve(chunks.length ? chunks.join('') : null);
    });
    process.stdin.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
    process.stdin.resume();
  });
}

// Wrap an async main function with error handling
function run(fn) {
  fn().catch((err) => {
    const msg = err.message || String(err);
    if (msg.includes('ENOENT') || msg.includes('no such file')) fail(msg, EXIT.NOT_FOUND);
    else if (msg.includes('ETIMEDOUT') || msg.includes('timeout') || msg.includes('Timeout')) fail(msg, EXIT.TIMEOUT);
    else if (msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND') || msg.includes('fetch failed')) fail(msg, EXIT.NETWORK);
    else if (msg.includes('401') || msg.includes('403') || msg.includes('unauthorized')) fail(msg, EXIT.AUTH);
    else fail(msg, EXIT.GENERAL);
  });
}

// Sanitize strings for AppleScript interpolation (prevent injection)
function escapeAppleScript(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

module.exports = { parseArgs, ok, fail, readStdin, run, EXIT, escapeAppleScript };
