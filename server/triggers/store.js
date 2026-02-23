const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STORE_PATH = path.join(__dirname, '..', '..', 'data', 'triggers.json');
const LOG_PATH = path.join(__dirname, '..', '..', 'data', 'trigger-log.json');

// Ensure data directory exists
const dataDir = path.dirname(STORE_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

function load() {
  if (!fs.existsSync(STORE_PATH)) return [];
  return JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'));
}

function save(triggers) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(triggers, null, 2));
}

function add(trigger) {
  const triggers = load();
  trigger.id = crypto.randomBytes(4).toString('hex');
  trigger.enabled = true;
  trigger.createdAt = new Date().toISOString();
  trigger.runCount = 0;
  trigger.lastRunAt = null;
  trigger.lastStatus = null;
  trigger.consecutiveErrors = 0;
  triggers.push(trigger);
  save(triggers);
  return trigger;
}

function remove(id) {
  const triggers = load();
  const filtered = triggers.filter(t => t.id !== id);
  if (filtered.length === triggers.length) return false;
  save(filtered);
  return true;
}

function update(id, updates) {
  const triggers = load();
  const idx = triggers.findIndex(t => t.id === id);
  if (idx === -1) return null;
  Object.assign(triggers[idx], updates);
  save(triggers);
  return triggers[idx];
}

function get(id) {
  return load().find(t => t.id === id) || null;
}

function getEnabled() {
  return load().filter(t => t.enabled);
}

function getByType(type) {
  return load().filter(t => t.type === type && t.enabled);
}

function logExecution(triggerId, result) {
  const log = fs.existsSync(LOG_PATH) ? JSON.parse(fs.readFileSync(LOG_PATH, 'utf-8')) : [];
  log.push({
    triggerId,
    timestamp: new Date().toISOString(),
    status: result.status,
    summary: (result.output || result.error || '').slice(0, 500),
    durationMs: result.durationMs,
  });
  // Keep last 500 entries
  if (log.length > 500) log.splice(0, log.length - 500);
  fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
}

module.exports = { load, save, add, remove, update, get, getEnabled, getByType, logExecution };
