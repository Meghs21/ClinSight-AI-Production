'use strict';

/**
 * authMiddleware.js
 *
 * Hand-rolled HS256 JWT — no external jwt library dependency.
 * Enforces:
 *   - JWT_SECRET must be set in environment (startup crash if missing in production)
 *   - Signature verification
 *   - Expiry check
 *   - Public route allowlist
 */

const crypto = require('crypto');

// Crash fast if the secret is the insecure default in production
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ FATAL: JWT_SECRET environment variable is not set. Refusing to start in production without a secret.');
    process.exit(1);
  }
  // Development fallback — loud warning so it is never missed
  console.warn('⚠️  WARNING: JWT_SECRET not set. Using insecure development default. Set JWT_SECRET before deploying.');
}

const SECRET = JWT_SECRET || 'clinsight_dev_only_secret_do_not_use_in_production';

// ─── Token signing ────────────────────────────────────────────────────────────

function signToken(payload, expiresInSeconds = 86400) {
  const header       = { alg: 'HS256', typ: 'JWT' };
  const exp          = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const fullPayload  = { ...payload, exp };

  const encodedHeader  = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');

  const signature = crypto
    .createHmac('sha256', SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

// ─── Token verification ───────────────────────────────────────────────────────

function verifyTokenString(token) {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, signature] = parts;

  // Constant-time comparison to prevent timing attacks
  const expectedSig = crypto
    .createHmac('sha256', SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  const sigBuf      = Buffer.from(signature,    'base64url');
  const expectedBuf = Buffer.from(expectedSig,  'base64url');

  if (
    sigBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(sigBuf, expectedBuf)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
      return null; // Expired
    }
    return payload;
  } catch {
    return null;
  }
}

// ─── Route allowlist (no token required) ─────────────────────────────────────

const PUBLIC_PATHS = new Set([
  '/',
  '/health',
  '/auth/login',
  '/auth/register',
]);

function isPublicRoute(req) {
  const path = (req.path || '').toLowerCase();
  const url  = (req.originalUrl || '').toLowerCase();
  return (
    PUBLIC_PATHS.has(path) ||
    url.endsWith('/health') ||
    url.includes('/auth/login') ||
    url.includes('/auth/register')
  );
}

// ─── Middleware ───────────────────────────────────────────────────────────────

function authenticateToken(req, res, next) {
  if (isPublicRoute(req)) return next();

  const authHeader = req.headers['authorization'] || req.headers['x-auth-token'];
  let token = null;

  if (authHeader) {
    token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : authHeader.trim();
  }

  if (!token && req.cookies?.medai_auth) {
    token = req.cookies.medai_auth;
  }

  if (!token) {
    // In development or when ALLOW_ANONYMOUS is enabled, attach a demo doctor user
    if (process.env.ALLOW_ANONYMOUS === 'true' || process.env.NODE_ENV === 'development') {
      req.user = { id: 'dev-demo-doctor', role: 'doctor', name: 'Dr. Demo' };
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

module.exports = { signToken, verifyTokenString, authenticateToken };
