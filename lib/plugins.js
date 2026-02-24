// ============================================================
// lib/plugins.js — Plugin SDK for JerikoBot
// Registry, trust, env isolation, audit, integrity, validation
// ============================================================
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const JERIKO_DIR = path.join(os.homedir(), '.jeriko');
const PLUGIN_DIR = path.join(JERIKO_DIR, 'plugins');
const REGISTRY_FILE = path.join(PLUGIN_DIR, 'registry.json');
const AUDIT_LOG = path.join(JERIKO_DIR, 'audit.log');

// Core commands — plugins cannot use these namespaces
const RESERVED = [
  'sys', 'fs', 'exec', 'browse', 'search', 'screenshot',
  'notify', 'discover', 'memory', 'server', 'install', 'uninstall', 'trust',
  'audio', 'camera', 'clipboard', 'contacts', 'calendar', 'email',
  'location', 'msg', 'music', 'net', 'notes', 'open', 'proc',
  'remind', 'window', 'stripe', 'x', 'plugin', 'init', 'dev',
];

// Safe env vars all plugins get (regardless of declaration)
const SAFE_ENV = [
  'PATH', 'HOME', 'USER', 'SHELL', 'TERM', 'NODE_ENV',
  'LANG', 'LC_ALL', 'TZ',
];

// ---- Directory management ----

function getPluginDir() {
  if (!fs.existsSync(PLUGIN_DIR)) fs.mkdirSync(PLUGIN_DIR, { recursive: true });
  return PLUGIN_DIR;
}

function getJerikoDir() {
  if (!fs.existsSync(JERIKO_DIR)) fs.mkdirSync(JERIKO_DIR, { recursive: true });
  return JERIKO_DIR;
}

// ---- Registry ----

function loadRegistry() {
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf-8'));
  } catch {
    return { plugins: {} };
  }
}

function saveRegistry(registry) {
  getPluginDir();
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2));
}

// ---- Manifest ----

function loadManifest(pluginPath) {
  const manifestPath = path.join(pluginPath, 'jeriko-plugin.json');
  if (!fs.existsSync(manifestPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  } catch {
    return null;
  }
}

function validateManifest(manifest) {
  const errors = [];
  if (!manifest) { errors.push('Manifest is null or invalid JSON'); return errors; }
  if (!manifest.name) errors.push('Missing required field: name');
  if (!manifest.namespace) errors.push('Missing required field: namespace');
  if (!manifest.version) errors.push('Missing required field: version');
  if (!manifest.commands || !Array.isArray(manifest.commands) || manifest.commands.length === 0) {
    errors.push('Missing or empty required field: commands[]');
  }
  if (manifest.commands) {
    for (const cmd of manifest.commands) {
      if (!cmd.name) errors.push('Command missing name');
      if (!cmd.bin) errors.push(`Command "${cmd.name || '?'}" missing bin`);
      if (!cmd.description) errors.push(`Command "${cmd.name || '?'}" missing description`);
    }
  }
  if (!manifest.jerikoVersion) errors.push('Missing required field: jerikoVersion');
  if (!manifest.platform || !Array.isArray(manifest.platform)) {
    errors.push('Missing or invalid required field: platform[]');
  }
  if (manifest.namespace && RESERVED.includes(manifest.namespace)) {
    errors.push(`Namespace "${manifest.namespace}" is reserved by core JerikoBot`);
  }
  if (manifest.env && Array.isArray(manifest.env)) {
    for (const e of manifest.env) {
      if (!e.key) errors.push('Env entry missing key');
      if (e.required === undefined) errors.push(`Env "${e.key || '?'}" missing required field`);
    }
  }
  if (manifest.webhooks && Array.isArray(manifest.webhooks)) {
    for (const wh of manifest.webhooks) {
      if (!wh.name) errors.push('Webhook missing name');
      if (!wh.handler) errors.push(`Webhook "${wh.name || '?'}" missing handler`);
    }
  }
  return errors;
}

// ---- Conflict detection ----

function checkConflicts(manifest, registry) {
  const conflicts = [];
  for (const [name, meta] of Object.entries(registry.plugins || {})) {
    if (name === manifest.name) continue; // skip self (for upgrades)
    if (meta.namespace === manifest.namespace) {
      conflicts.push(`Namespace "${manifest.namespace}" already used by ${name}`);
    }
    for (const cmd of manifest.commands || []) {
      if ((meta.commands || []).includes(cmd.name)) {
        conflicts.push(`Command "${cmd.name}" already registered by ${name}`);
      }
    }
  }
  return conflicts;
}

// ---- Resolution ----

function resolvePluginBin(cmdName) {
  const registry = loadRegistry();
  for (const [name, meta] of Object.entries(registry.plugins || {})) {
    if ((meta.commands || []).includes(cmdName)) {
      const manifest = loadManifest(meta.path);
      if (!manifest) continue;
      const cmdDef = manifest.commands.find(c => c.name === cmdName);
      if (!cmdDef) continue;
      const bin = path.join(meta.path, cmdDef.bin);
      if (!fs.existsSync(bin)) continue;
      return { bin, meta, manifest };
    }
  }
  return null;
}

function getPluginCommands() {
  const registry = loadRegistry();
  const commands = [];
  for (const [name, meta] of Object.entries(registry.plugins || {})) {
    const manifest = loadManifest(meta.path);
    if (!manifest) continue;
    for (const cmd of manifest.commands || []) {
      commands.push({
        name: cmd.name,
        bin: path.join(meta.path, cmd.bin),
        description: cmd.description,
        source: name,
        plugin: name,
        trusted: meta.trusted || false,
      });
    }
  }
  return commands;
}

// ---- Discovery ----

function getPluginDocs(pluginPath) {
  const docsPath = path.join(pluginPath, 'COMMANDS.md');
  if (fs.existsSync(docsPath)) return fs.readFileSync(docsPath, 'utf-8');
  // Fallback: generate from manifest
  const manifest = loadManifest(pluginPath);
  if (!manifest) return null;
  let docs = '';
  for (const cmd of manifest.commands || []) {
    docs += `### jeriko ${cmd.name}\n${cmd.description}\n\n`;
    if (cmd.usage) docs += `\`\`\`bash\n${cmd.usage}\n\`\`\`\n\n`;
  }
  return docs || null;
}

function getPluginPrompt(pluginPath) {
  const promptPath = path.join(pluginPath, 'PROMPT.md');
  if (fs.existsSync(promptPath)) return fs.readFileSync(promptPath, 'utf-8');
  return null;
}

// ---- Security ----

function isTrusted(pluginName) {
  const registry = loadRegistry();
  const meta = registry.plugins?.[pluginName];
  return meta?.trusted === true;
}

function buildPluginEnv(meta, manifest, baseEnv) {
  const safe = {};
  // Always pass safe system vars
  for (const key of SAFE_ENV) {
    if (baseEnv[key]) safe[key] = baseEnv[key];
  }
  // Jeriko infrastructure vars
  safe.JERIKO_ROOT = baseEnv.JERIKO_ROOT || '';
  safe.JERIKO_DATA_DIR = baseEnv.JERIKO_DATA_DIR || '';
  safe.JERIKO_FORMAT = baseEnv.JERIKO_FORMAT || '';
  safe.JERIKO_QUIET = baseEnv.JERIKO_QUIET || '';
  safe.JERIKO_PLUGIN = manifest.name;
  safe.JERIKO_NAMESPACE = manifest.namespace;
  // Only pass declared env vars
  for (const envDef of manifest.env || []) {
    if (baseEnv[envDef.key]) safe[envDef.key] = baseEnv[envDef.key];
  }
  return safe;
}

function computeIntegrity(pluginPath) {
  const manifestPath = path.join(pluginPath, 'jeriko-plugin.json');
  if (!fs.existsSync(manifestPath)) return null;
  const content = fs.readFileSync(manifestPath);
  return 'sha512-' + crypto.createHash('sha512').update(content).digest('base64');
}

// ---- Audit log ----

const MAX_AUDIT_ENTRIES = 10000;

function auditLog(entry) {
  getJerikoDir();
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n';
  fs.appendFileSync(AUDIT_LOG, line);
  // Rotate if too large
  try {
    const stat = fs.statSync(AUDIT_LOG);
    if (stat.size > 2 * 1024 * 1024) { // 2MB
      const lines = fs.readFileSync(AUDIT_LOG, 'utf-8').trim().split('\n');
      const keep = lines.slice(-MAX_AUDIT_ENTRIES);
      fs.writeFileSync(AUDIT_LOG, keep.join('\n') + '\n');
    }
  } catch { /* ok */ }
}

function readAuditLog(limit = 50) {
  if (!fs.existsSync(AUDIT_LOG)) return [];
  const lines = fs.readFileSync(AUDIT_LOG, 'utf-8').trim().split('\n').filter(Boolean);
  const entries = [];
  for (const line of lines.slice(-limit)) {
    try { entries.push(JSON.parse(line)); } catch { /* skip */ }
  }
  return entries;
}

module.exports = {
  JERIKO_DIR, PLUGIN_DIR, REGISTRY_FILE, AUDIT_LOG, RESERVED, SAFE_ENV,
  getPluginDir, getJerikoDir,
  loadRegistry, saveRegistry,
  loadManifest, validateManifest,
  checkConflicts,
  resolvePluginBin, getPluginCommands,
  getPluginDocs, getPluginPrompt,
  isTrusted, buildPluginEnv, computeIntegrity,
  auditLog, readAuditLog,
};
