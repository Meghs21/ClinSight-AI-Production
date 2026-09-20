'use strict';

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs   = require('fs');

const { createApp } = require('./app');
const blockchain    = require('./blockchain/logger');
const { initIndex, indexPatient } = require('./rag/vectorStore');

// ─── Socket.IO CORS ───────────────────────────────────────────────────────────

const ioCors = {
  origin:  process.env.FRONTEND_URL || 'http://localhost:5173',
  methods: ['GET', 'POST'],
};

// ─── Uploads directory ────────────────────────────────────────────────────────

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

// ─── Bootstrap ────────────────────────────────────────────────────────────────

async function init() {
  const app    = createApp();
  const server = http.createServer(app);
  const io     = new Server(server, { cors: ioCors });

  // Real-time blockchain audit feed
  io.on('connection', (socket) => {
    console.log(`[WS] Client connected: ${socket.id}`);
    socket.emit('chain_snapshot', blockchain.getChain());
    socket.on('disconnect', () => console.log(`[WS] Client disconnected: ${socket.id}`));
  });

  // Attach io to every request so controllers can emit events
  app.use((req, _res, next) => { req.io = io; next(); });

  blockchain.init(io);
  console.log('✅ Blockchain initialized');

  // Index all patient JSON files for RAG on startup
  try {
    await initIndex();
    const dataDir      = path.join(__dirname, 'data');
    const patientFiles = fs.readdirSync(dataDir).filter((f) => /^patient_.*\.json$/i.test(f));

    for (const file of patientFiles) {
      try {
        const patient = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
        await indexPatient(patient);
        console.log(`  Indexed patient: ${patient.name || patient.id}`);
      } catch (e) {
        console.warn(`  Skipped ${file}: ${e.message}`);
      }
    }
    console.log('✅ RAG index ready');
  } catch (e) {
    console.warn(`⚠️  RAG init warning: ${e.message}`);
  }

  // ─── Listen ────────────────────────────────────────────────────────────────

  const PORT = parseInt(process.env.PORT, 10) || 4000;

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      const fallback = PORT === 4000 ? 5001 : PORT + 1;
      console.warn(`⚠️  Port ${PORT} in use — trying ${fallback}`);
      server.listen(fallback);
    } else {
      console.error('Server error:', err);
      process.exit(1);
    }
  });

  server.listen(PORT, () => {
    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log('║   ClinSight-AI — Patient Intelligence Backend   ║');
    console.log('╠══════════════════════════════════════════════════╣');
    console.log(`║  Port     : ${String(server.address().port).padEnd(37)}║`);
    console.log(`║  Env      : ${String(process.env.NODE_ENV || 'development').padEnd(37)}║`);
    console.log(`║  Frontend : ${String(process.env.FRONTEND_URL || 'http://localhost:3000').padEnd(37)}║`);
    console.log('╚══════════════════════════════════════════════════╝\n');
  });

  // ─── Graceful shutdown ─────────────────────────────────────────────────────

  function shutdown(signal) {
    console.log(`\n[${signal}] Shutting down gracefully…`);
    server.close(() => {
      console.log('HTTP server closed. Goodbye.');
      process.exit(0);
    });
    // Force exit after 10 seconds if connections don't drain
    setTimeout(() => {
      console.error('Graceful shutdown timed out. Forcing exit.');
      process.exit(1);
    }, 10_000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
    // Log but don't crash — agents sometimes reject on LLM failures
  });
}

init();
