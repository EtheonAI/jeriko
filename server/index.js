require('dotenv').config();

const fs = require('fs');
const express = require('express');
const http = require('http');
const rateLimit = require('express-rate-limit');
const websocket = require('./websocket');
const telegram = require('./telegram');
const whatsapp = require('./whatsapp');
const qr = require('../web/qr');
const { setup: setupWebhooks, verifySignature } = require('./triggers/webhooks');
const triggerStore = require('./triggers/store');
const triggerEngine = require('./triggers/engine');
const { generateToken, requireAuth } = require('./auth');

const PORT = process.env.PROXY_PORT || 3000;

const app = express();
// Capture raw body buffer for webhook signature verification
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

// Rate limiting
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'Too many requests' },
}));

// Health check
app.get('/', (req, res) => {
  const triggers = triggerStore.getEnabled();
  res.json({
    name: 'jerikobot',
    status: 'running',
    uptime: process.uptime(),
    nodes: websocket.getConnectedNodes().length,
    activeTriggers: triggers.length,
  });
});

// Node list API (authenticated)
app.get('/api/nodes', requireAuth, (req, res) => {
  res.json(websocket.getConnectedNodes());
});

// Generate token for a node (authenticated)
app.get('/api/token/:name', requireAuth, (req, res) => {
  const token = generateToken(req.params.name);
  res.json({ name: req.params.name, token });
});

// Triggers API (authenticated)
app.get('/api/triggers', requireAuth, (req, res) => {
  res.json(triggerStore.load());
});

// Webhook receiver routes
setupWebhooks(app);

// Plugin webhook routes (trusted only)
try {
  const plugins = require('../lib/plugins');
  const pluginPath = require('path');
  const { execSync } = require('child_process');

  // Detect interpreter from shebang (supports any-language plugins)
  function detectInterpreter(filePath) {
    try {
      const head = fs.readFileSync(filePath, { encoding: 'utf-8', flag: 'r' }).slice(0, 256);
      if (head.startsWith('#!/usr/bin/env node') || head.startsWith('#!/usr/bin/node')) return process.execPath;
      if (head.startsWith('#!')) return null; // has shebang — run directly
      return process.execPath; // no shebang — default to node
    } catch { return process.execPath; }
  }

  function setupPluginWebhooks() {
    const registry = plugins.loadRegistry();
    for (const [name, meta] of Object.entries(registry.plugins || {})) {
      if (!meta.trusted) continue;
      const manifest = plugins.loadManifest(meta.path);
      if (!manifest || !manifest.webhooks) continue;

      for (const wh of manifest.webhooks) {
        const route = `/hooks/plugin/${manifest.namespace}/${wh.name}`;
        const handlerBin = pluginPath.join(meta.path, wh.handler);

        app.post(route, async (req, res) => {
          // Signature verification (fail-closed: reject if configured but missing/invalid)
          if (wh.verify && wh.verify !== 'none') {
            const secret = process.env[wh.secretEnv];
            if (!secret) {
              plugins.auditLog({ action: 'webhook', plugin: name, endpoint: wh.name, status: 500, error: 'missing_secret' });
              return res.status(500).json({ error: 'Webhook secret not configured' });
            }
            const sig = req.headers['x-webhook-signature'] || req.headers['x-hub-signature-256'] || req.headers['stripe-signature'];
            if (!sig) {
              plugins.auditLog({ action: 'webhook', plugin: name, endpoint: wh.name, status: 401, error: 'missing_signature' });
              return res.status(401).json({ error: 'Missing signature header' });
            }
            // Actually verify the HMAC signature against the raw body
            const raw = req.rawBody || req.body;
            if (!verifySignature(raw, secret, sig)) {
              plugins.auditLog({ action: 'webhook', plugin: name, endpoint: wh.name, status: 401, error: 'invalid_signature' });
              return res.status(401).json({ error: 'Invalid signature' });
            }
          }

          // Respond 202 immediately
          res.status(202).json({ status: 'accepted', plugin: name, endpoint: wh.name });
          plugins.auditLog({ action: 'webhook', plugin: name, endpoint: wh.name, status: 202 });

          // Async: spawn handler with restricted env
          try {
            const bodyStr = req.rawBody ? req.rawBody.toString('utf-8')
              : (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
            const pluginEnv = plugins.buildPluginEnv(meta, manifest, process.env);
            pluginEnv.TRIGGER_EVENT = JSON.stringify({
              type: 'webhook', source: manifest.namespace,
              body: bodyStr,
              receivedAt: new Date().toISOString(),
            });
            const start = Date.now();
            // Respect handler shebang instead of hardcoding node
            const interp = detectInterpreter(handlerBin);
            const cmd = interp ? `"${interp}" "${handlerBin}"` : `"${handlerBin}"`;
            execSync(cmd, {
              env: pluginEnv, timeout: 60000, encoding: 'utf-8',
              input: bodyStr,
            });
            plugins.auditLog({ action: 'webhook_handler', plugin: name, handler: wh.name, exitCode: 0, durationMs: Date.now() - start });
          } catch (err) {
            plugins.auditLog({ action: 'webhook_handler', plugin: name, handler: wh.name, exitCode: err.status || 1, error: err.message });
          }
        });

        console.log(`[plugins] Webhook route: POST ${route} → ${wh.handler}`);
      }
    }
  }
  setupPluginWebhooks();
} catch { /* plugins not available */ }

// QR routes
qr.setup(app);

// Create HTTP server
const server = http.createServer(app);

// Attach WebSocket
websocket.setup(server);

// Start Telegram bot (also inits trigger engine internally)
telegram.setup();

// Start WhatsApp
whatsapp.setup();

server.listen(PORT, () => {
  console.log(`[server] JerikoBot proxy running on port ${PORT}`);
  console.log(`[server] Health: http://localhost:${PORT}/`);
  console.log(`[server] Webhooks: http://localhost:${PORT}/hooks`);
  console.log(`[server] Triggers: http://localhost:${PORT}/api/triggers`);
});

// Graceful shutdown
process.once('SIGINT', () => {
  console.log('\n[server] Shutting down...');
  triggerEngine.stopAll();
  const bot = telegram.getBot();
  if (bot) bot.stop('SIGINT');
  server.close();
  process.exit(0);
});

process.once('SIGTERM', () => {
  triggerEngine.stopAll();
  const bot = telegram.getBot();
  if (bot) bot.stop('SIGTERM');
  server.close();
  process.exit(0);
});

// Prevent crashes from unhandled errors
process.on('uncaughtException', (err) => {
  console.error('[server] Uncaught exception:', err.message);
  console.error(err.stack);
});

process.on('unhandledRejection', (reason) => {
  console.error('[server] Unhandled rejection:', reason);
});
