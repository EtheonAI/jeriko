const crypto = require('crypto');

const NODE_AUTH_SECRET = process.env.NODE_AUTH_SECRET;

function generateToken(nodeName) {
  if (!NODE_AUTH_SECRET) {
    throw new Error('NODE_AUTH_SECRET not set in .env — refusing to generate insecure token');
  }
  const hmac = crypto.createHmac('sha256', NODE_AUTH_SECRET);
  hmac.update(nodeName);
  return hmac.digest('hex');
}

function validateToken(nodeName, token) {
  if (!NODE_AUTH_SECRET) return false;
  const expected = generateToken(nodeName);
  // Timing-safe comparison to prevent timing attacks
  if (expected.length !== token.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}

function isAdminTelegramId(userId) {
  const ids = (process.env.ADMIN_TELEGRAM_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (ids.length === 0) return false; // deny all if not configured
  return ids.includes(String(userId));
}

// Express middleware: require Bearer <NODE_AUTH_SECRET> for admin endpoints
function requireAuth(req, res, next) {
  if (!NODE_AUTH_SECRET) {
    return res.status(500).json({ error: 'NODE_AUTH_SECRET not configured' });
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization required' });
  }
  const token = authHeader.slice(7);
  const tokenBuf = Buffer.from(token);
  const secretBuf = Buffer.from(NODE_AUTH_SECRET);
  if (tokenBuf.length !== secretBuf.length || !crypto.timingSafeEqual(tokenBuf, secretBuf)) {
    return res.status(403).json({ error: 'Invalid credentials' });
  }
  next();
}

module.exports = { generateToken, validateToken, isAdminTelegramId, requireAuth };
