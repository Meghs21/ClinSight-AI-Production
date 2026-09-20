'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');

const routes      = require('./routes/index');
const whatsappRoute = require('./routes/whatsapp');
const sarvamRoute   = require('./routes/sarvam');
const { authenticateToken } = require('./middleware/authMiddleware');

// ─── Rate limiters ────────────────────────────────────────────────────────────

/** Strict limiter for auth endpoints — prevents brute-force login attacks. */
const authLimiter = rateLimit({
  windowMs:         60 * 1000,   // 1 minute
  max:              10,
  standardHeaders:  true,
  legacyHeaders:    false,
  message:          { error: 'Too many authentication attempts. Please wait 1 minute and try again.' },
});

/** Conservative limiter for AI agent endpoints — each call hits paid LLM APIs. */
const agentLimiter = rateLimit({
  windowMs:         60 * 1000,   // 1 minute
  max:              30,
  standardHeaders:  true,
  legacyHeaders:    false,
  message:          { error: 'AI agent rate limit reached. Max 30 requests per minute.' },
});

/** General API limiter — broad protection against abuse. */
const generalLimiter = rateLimit({
  windowMs:         60 * 1000,
  max:              200,
  standardHeaders:  true,
  legacyHeaders:    false,
  message:          { error: 'Too many requests. Please slow down.' },
});

// ─── CORS ─────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = process.env.NODE_ENV === 'production'
  ? (process.env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean)
  : true; // Allow all in development

const corsOptions = {
  origin:         ALLOWED_ORIGINS,
  methods:        ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token', 'x-actor-id'],
  credentials:    true,
};

// ─── App factory ──────────────────────────────────────────────────────────────

function createApp(io) {
  const app = express();

  // Security headers
  app.use(helmet({ contentSecurityPolicy: false }));

  // CORS — must come before rate limiters so preflight OPTIONS requests are handled
  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Attach Socket.IO instance to every request for real-time blockchain events
  app.use((req, res, next) => {
    req.io = io || null;
    next();
  });

  // ── Rate limiting (applied before auth so even rejected requests count) ──────
  app.use('/api/auth',  authLimiter);
  app.use('/api/agent', agentLimiter);
  app.use('/api',       generalLimiter);

  // ── Routes ────────────────────────────────────────────────────────────────────
  app.use('/api',            authenticateToken, routes);
  app.use('/api/whatsapp',   whatsappRoute);
  app.use('/api/sarvam',     sarvamRoute);

  // Root health — unauthenticated, useful for uptime monitors
  app.get('/', (req, res) =>
    res.json({
      status:   'ok',
      service:  'ClinSight-AI Patient Intelligence Backend',
      hospital: 'Kathir Memorial Hospital, Chennai',
      version:  process.env.npm_package_version || '1.0.0',
    })
  );

  // 404 fallback for unmatched API routes
  app.use('/api', (req, res) =>
    res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` })
  );

  return app;
}

module.exports = { createApp };
