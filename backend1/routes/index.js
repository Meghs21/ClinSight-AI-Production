const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const patientController = require('../controllers/patientController');
const agentController = require('../controllers/agentController');
const documentController = require('../controllers/documentController');
const authController = require('../controllers/authController');
const blockchain = require('../blockchain/logger');

const UPLOAD_DIR = process.env.VERCEL
  ? '/tmp'
  : path.join(__dirname, '../uploads/');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const upload = multer({ storage });

// Custom Multer Middleware Wrapper to handle any field name safely and return JSON errors
function handleFileUpload(req, res, next) {
  const uploadHandler = upload.any();
  uploadHandler(req, res, (err) => {
    if (err) {
      console.warn('Multer upload warning:', err.message);
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: `File Upload Error: ${err.message}` });
      }
      return res.status(500).json({ error: err.message });
    }
    if (req.files && req.files.length > 0) {
      req.file = req.files[0];
    }
    next();
  });
}

// ─── AUTH ROUTES ────────────────────────────────────────────────────────────
router.post('/auth/login', authController.login);
router.post('/auth/register', authController.register);

// ─── PATIENT ROUTES ─────────────────────────────────────────────────────────
router.get('/patients', patientController.getPatients);
router.get('/patients/:id', patientController.getPatientById);
router.get('/patient/:id', patientController.getPatientById);
router.get('/patient/:id/brief', patientController.getConsultationBrief);
router.get('/patient/:id/labs', patientController.getPatientLabs);
router.get('/patient/:id/trend', patientController.getLabTrends);
router.get('/records/search', patientController.searchPatientHistory);
router.get('/records/:id/labs', patientController.getPatientLabs);
router.get('/records/:id', patientController.getPatientById);

router.get('/consultation-brief/:id?', patientController.getConsultationBrief);
router.get('/consultation-brief', patientController.getConsultationBrief);
router.get('/lab-trends/:id?/:testName?', patientController.getLabTrends);
router.post('/drug-interactions', patientController.checkDrugInteractions);
router.get('/summary', patientController.getPatients);

// ─── AGENT ROUTES ───────────────────────────────────────────────────────────
router.post('/orchestrate', agentController.runOrchestrator);
router.post('/agent/query', agentController.queryAgent);
router.post('/triage', agentController.runTriage);
router.post('/second-opinion', agentController.runSecondOpinion);
router.get('/rag/query', agentController.runRagDoctor);
router.post('/rag/query', agentController.runRagDoctor);
router.post('/voice', agentController.runVoice);

// ─── DOCUMENT & INGESTION ROUTES ─────────────────────────────────────────────
router.post('/upload', handleFileUpload, documentController.uploadDocument);
router.post('/ingest', documentController.ingestDocument);

// ─── BLOCKCHAIN / AUDIT ROUTES ──────────────────────────────────────────────
router.get('/blockchain/chain', (req, res) => {
  res.json({ chain: blockchain.getChain(), verification: blockchain.verifyChain() });
});

router.get('/blockchain/export', (req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="audit_ledger.csv"');
  res.send(blockchain.exportCSV());
});

// ─── HEALTH CHECK ───────────────────────────────────────────────────────────
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
