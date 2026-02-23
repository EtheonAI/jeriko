const crypto = require('crypto');
const { fireTrigger, getWebhookHandler } = require('./engine');
const store = require('./store');

function setup(app) {
  // Receive webhooks: POST /hooks/:triggerId
  app.post('/hooks/:triggerId', async (req, res) => {
    const { triggerId } = req.params;
    const trigger = store.get(triggerId);

    if (!trigger || trigger.type !== 'webhook') {
      return res.status(404).json({ error: 'Trigger not found' });
    }

    if (!trigger.enabled) {
      return res.status(200).json({ status: 'ignored', reason: 'disabled' });
    }

    // Verify webhook signature (fail-closed: reject if secret set but sig missing)
    if (trigger.config?.secret) {
      const signature = req.headers['x-webhook-signature']
        || req.headers['x-hub-signature-256']
        || req.headers['stripe-signature'];

      if (!signature) {
        return res.status(401).json({ error: 'Missing signature header' });
      }

      const raw = req.rawBody || req.body;
      if (!verifySignature(raw, trigger.config.secret, signature)) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    // Respond immediately
    res.json({ status: 'received', triggerId });

    // Process async
    const eventData = {
      type: 'webhook',
      source: trigger.config?.source || 'unknown',
      headers: sanitizeHeaders(req.headers),
      body: req.body,
      receivedAt: new Date().toISOString(),
    };

    fireTrigger(trigger, eventData).catch(err => {
      console.error(`[webhook] Error processing ${triggerId}:`, err.message);
    });
  });

  // List webhook URLs for reference
  app.get('/hooks', (req, res) => {
    const webhooks = store.getByType('webhook');
    res.json(webhooks.map(w => ({
      id: w.id,
      name: w.name,
      url: `/hooks/${w.id}`,
      source: w.config?.source,
      enabled: w.enabled,
    })));
  });
}

function verifySignature(body, secret, signature) {
  // Prefer raw Buffer from middleware; fall back to string/re-serialize
  const raw = Buffer.isBuffer(body) ? body.toString('utf-8')
    : typeof body === 'string' ? body : JSON.stringify(body);

  // GitHub style: sha256=<hex>
  if (signature.startsWith('sha256=')) {
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }

  // Stripe style: t=<timestamp>,v1=<signature>
  if (signature.includes('v1=')) {
    // Simplified Stripe verification
    const parts = signature.split(',');
    const ts = parts.find(p => p.startsWith('t='))?.slice(2);
    const sig = parts.find(p => p.startsWith('v1='))?.slice(3);
    if (!ts || !sig) return false;
    const payload = `${ts}.${raw}`;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  }

  // Simple HMAC comparison
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

function sanitizeHeaders(headers) {
  const safe = {};
  const keep = ['content-type', 'x-github-event', 'x-github-delivery', 'stripe-signature', 'user-agent'];
  for (const key of keep) {
    if (headers[key]) safe[key] = headers[key];
  }
  return safe;
}

module.exports = { setup, verifySignature };
