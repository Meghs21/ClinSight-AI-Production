const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'clinsight_default_secure_secret_key_2026';

function signToken(payload, expiresInSeconds = 86400) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const fullPayload = { ...payload, exp };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');

  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function verifyTokenString(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, signature] = parts;
  const expectedSignature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  if (signature !== expectedSignature) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
      return null; // Expired token
    }
    return payload;
  } catch {
    return null;
  }
}

function authenticateToken(req, res, next) {
  const currentPath = (req.path || '').toLowerCase();
  const fullUrl = (req.originalUrl || '').toLowerCase();

  // Allow public authentication & health endpoints without token
  const isPublic =
    currentPath === '/' ||
    currentPath === '/health' ||
    currentPath === '/auth/login' ||
    currentPath === '/auth/register' ||
    currentPath === '/login' ||
    currentPath === '/register' ||
    fullUrl.endsWith('/health') ||
    fullUrl.includes('/auth/login') ||
    fullUrl.includes('/auth/register') ||
    fullUrl.includes('/login') ||
    fullUrl.includes('/register');

  if (isPublic) {
    return next();
  }

  const authHeader = req.headers['authorization'] || req.headers['x-auth-token'];
  let token = null;

  if (authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else {
      token = authHeader.trim();
    }
  }

  if (!token && req.cookies && req.cookies.medai_auth) {
    token = req.cookies.medai_auth;
  }

  if (!token) {
    // If no token provided, allow request in dev mode if explicitly configured, else 401
    if (process.env.ALLOW_ANONYMOUS === 'true') {
      return next();
    }
    return res.status(401).json({ error: 'Unauthorized: Missing authentication token' });
  }

  const decoded = verifyTokenString(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }

  req.user = decoded;
  next();
}

module.exports = {
  signToken,
  verifyTokenString,
  authenticateToken,
};
