'use strict';

const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

// ─── Controllers ─────────────────────────────────────────────────────────────
const patientController  = require('../controllers/patientController');
const documentController = require('../controllers/documentController');
const authController     = require('../controllers/authController');

// ─── Tools & Repository ───────────────────────────────────────────────────────
const tools       = require('../tools/patientTools');
const patientRepo = require('../repositories/patientRepository');

// ─── Agents ───────────────────────────────────────────────────────────────────
const { runOrchestratorAgent }                   = require('../agents/orchestratorAgent');
const { runAnalysisAgent }                       = require('../agents/analysisAgent');
const { runTriageAgent }                         = require('../agents/triageAgent');
const { runTransferAgent }                       = require('../agents/transferAgent');
const { runSecondOpinionAgent }                  = require('../agents/secondOpinionAgent');
const { runIngestionAgent }                      = require('../agents/ingestionAgent');
const { runReceptionist }                        = require('../agents/receptionistAgent');
const { runNutritionAgent }                      = require('../agents/nutritionAgent');
const { runRagDoctorQuery, runRagPatientSummary } = require('../agents/ragDoctorAgent');

// ─── Blockchain audit ledger ──────────────────────────────────────────────────
const blockchain = require('../blockchain/logger');

// ─── File upload ──────────────────────────────────────────────────────────────
const UPLOAD_DIR = process.env.VERCEL
  ? '/tmp'
  : path.join(__dirname, '../uploads/');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const upload    = multer({ storage });
const uploadAny = multer({ storage });

// Wraps multer so any field-name upload returns a clean JSON error on failure
function handleFileUpload(req, res, next) {
  upload.any()(req, res, (err) => {
    if (err) {
      console.warn('Multer upload warning:', err.message);
      return err instanceof multer.MulterError
        ? res.status(400).json({ error: `File Upload Error: ${err.message}` })
        : res.status(500).json({ error: err.message });
    }
    if (req.files && req.files.length > 0) req.file = req.files[0];
    next();
  });
}

// ─── Inline helpers ───────────────────────────────────────────────────────────

/** Maps raw flag type strings to normalised severity labels for the frontend. */
function normalizeSeverity(type = '') {
  const t = String(type).toUpperCase();
  if (t === 'CRITICAL') return 'critical';
  if (t === 'HIGH')     return 'high';
  if (t === 'MEDIUM')   return 'medium';
  return 'low';
}

/** Flattens a labResults map ({TestName: [{date, value, ...}]}) into a flat array. */
function flattenLabResults(patient) {
  const results = patient.labResults || {};
  return Object.entries(results).flatMap(([test, entries]) =>
    (Array.isArray(entries) ? entries : [entries]).map((e) => ({ test, ...e }))
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// AUTH
// ═════════════════════════════════════════════════════════════════════════════

router.post('/auth/login',    authController.login);
router.post('/auth/register', authController.register);

/** Validate a stored token and return the current user profile. Used on app resume. */
router.get('/auth/me', (req, res) => {
  // req.user is populated by authenticateToken middleware — if we reach here, token is valid
  return res.json({ user: req.user });
});

// ═════════════════════════════════════════════════════════════════════════════
// PATIENT — list & detail
// ═════════════════════════════════════════════════════════════════════════════

router.get('/patients',      patientController.getPatients);
router.get('/patients/:id',  patientController.getPatientById);
router.get('/patient/:id',   patientController.getPatientById);
router.get('/summary',       patientController.getPatients);           // alias

// ─── Patient sub-resources ────────────────────────────────────────────────────

router.get('/patient/:id/brief', patientController.getConsultationBrief);
router.get('/patient/:id/labs',  patientController.getPatientLabs);
router.get('/patient/:id/trend', patientController.getLabTrends);

/** Lab trend for a single named test with optional date-range filter + trend direction. */
router.get('/patient/:id/labs/:testName', (req, res) => {
  try {
    const result = tools.extract_lab_trends(req.params.id, req.params.testName, req.query);
    blockchain.addBlock(
      'QUERY_LAB_TREND',
      req.headers['x-actor-id'] || 'UNKNOWN',
      req.params.id,
      `Lab trend queried: ${req.params.testName}`
    );
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ error: `Failed to load lab trend: ${e.message}` });
  }
});

/** Clinical flags, optionally filtered by ?type=CRITICAL|HIGH|MEDIUM|LOW. */
router.get('/patient/:id/flags', (req, res) => {
  try {
    const flags = tools.flag_clinical_pattern(req.params.id, req.query.type);
    return res.json(flags);
  } catch (e) {
    return res.status(500).json({ error: `Failed to load flags: ${e.message}` });
  }
});

/** Guideline-based overdue lab test recommendations for a patient. */
router.get('/patient/:id/overdue-tests', (req, res) => {
  try {
    const tests = tools.recommend_lab_tests(req.params.id);
    blockchain.addBlock('LAB_RECOMMENDATION', 'SYSTEM', req.params.id, 'Overdue lab tests surfaced');
    return res.json(tests);
  } catch (e) {
    return res.status(500).json({ error: `Failed to load overdue tests: ${e.message}` });
  }
});

router.post('/patient/:id/search', (req, res) => {
  const { query } = req.body;
  const result = tools.search_patient_history(req.params.id, query);
  blockchain.addBlock(
    'HISTORY_SEARCH',
    req.headers['x-actor-id'] || 'UNKNOWN',
    req.params.id,
    `History searched: "${query}"`
  );
  return res.json(result);
});

// ─── Legacy /records/* aliases (frontend compatibility) ──────────────────────

router.get('/records/search', patientController.searchPatientHistory);

router.get('/records/:id', (req, res) => {
  const patient = tools.get_patient_case_sheet(req.params.id);
  if (patient.error) return res.status(404).json(patient);
  return res.json({
    patient_id:    patient.id,
    name:          patient.name,
    age:           patient.age,
    gender:        patient.gender,
    diagnoses:     [...(patient.primaryDiagnosis || []), ...(patient.secondaryDiagnosis || [])],
    allergies:     patient.allergies || [],
    prescriptions: (patient.medications || []).map((m) => ({
      drug:       m.name,
      dose:       m.dose,
      frequency:  m.frequency,
      start_date: m.since || null,
    })),
    visits: patient.visits || [],
  });
});

router.get('/records/:id/brief', (req, res) => {
  const brief = tools.generate_consultation_brief(req.params.id);
  if (brief.error) return res.status(404).json(brief);
  return res.json(brief);
});

router.get('/records/:id/labs', (req, res) => {
  const patient = tools.get_patient_case_sheet(req.params.id);
  if (patient.error) return res.status(404).json(patient);
  return res.json(flattenLabResults(patient));
});

router.get('/records/:id/labs', patientController.getPatientLabs);   // controller alias

router.get('/records/:id/flags', (req, res) => {
  const flags = tools.flag_clinical_pattern(req.params.id, req.query.type);
  if (flags.error) return res.status(404).json(flags);
  const payload = (Array.isArray(flags) ? flags : []).map((f, idx) => ({
    id:             `${req.params.id}-F${idx + 1}`,
    severity:       normalizeSeverity(f.type),
    message:        f.flag,
    evidence:       f.evidence,
    recommendation: f.recommendation,
  }));
  return res.json(payload);
});

router.get('/records/:id/overdue-tests', (req, res) => {
  const tests = tools.recommend_lab_tests(req.params.id);
  if (tests.error) return res.status(404).json(tests);
  return res.json(
    (tests || []).map((t) => ({
      test:       t.test,
      priority:   t.overdueDays > 20 ? 'high' : t.overdueDays > 7 ? 'medium' : 'low',
      reason:     t.reason || 'Follow-up suggested',
      overdueDays: t.overdueDays ?? null,
      labUrl:     t.labUrl || null,
    }))
  );
});

router.post('/records/search', (req, res) => {
  const { query, patientId } = req.body || {};
  if (!patientId) return res.status(400).json({ error: 'patientId required' });
  const result = tools.search_patient_history(patientId, query || '');
  if (result.error) return res.status(404).json(result);
  const normalized = (result.results || []).map((r) => ({
    type:  r.department || 'Record',
    value: `${r.date}: ${r.snippet}`,
  }));
  return res.json(normalized);
});

// ─── Consultation brief & lab-trend convenience aliases ───────────────────────

router.get('/consultation-brief/:id?', patientController.getConsultationBrief);
router.get('/consultation-brief',      patientController.getConsultationBrief);
router.get('/lab-trends/:id?/:testName?', patientController.getLabTrends);

// ─── Drug interactions & pharmacy ────────────────────────────────────────────

router.post('/drug-interactions', patientController.checkDrugInteractions);

router.post('/drugs/check', (req, res) => {
  const { medications } = req.body;
  if (!Array.isArray(medications) || medications.length === 0) {
    return res.status(400).json({ error: 'medications array required' });
  }
  const result = tools.check_drug_interactions(medications);
  blockchain.addBlock(
    'CHECK_DRUG_INTERACTION',
    req.headers['x-actor-id'] || 'SYSTEM',
    req.body.patientId || 'UNKNOWN',
    `Drug interactions checked: ${medications.join(', ')}`
  );
  return res.json(result);
});

router.get('/pharmacy/:medicineName', (req, res) => {
  const links = tools.get_pharmacy_link(req.params.medicineName);
  blockchain.addBlock(
    'PHARMACY_LINK_ACCESS',
    req.headers['x-actor-id'] || 'UNKNOWN',
    null,
    `Pharmacy links accessed: ${req.params.medicineName}`
  );
  return res.json(links);
});

// ═════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═════════════════════════════════════════════════════════════════════════════

router.get('/dashboard/data', async (req, res) => {
  try {
    const patients = await patientRepo.getAllPatients();
    const critical = patients.filter((p) => p.status === 'critical').length;
    const warning  = patients.filter((p) => p.status === 'warning').length;
    const stable   = patients.length - critical - warning;
    return res.json({
      patients,
      stats: { total: patients.length, critical, warning, stable },
    });
  } catch (e) {
    return res.status(500).json({ error: `Failed to build dashboard data: ${e.message}` });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// AGENT — full pipeline endpoints
// ═════════════════════════════════════════════════════════════════════════════

/** Full document intake pipeline: file → OCR → Ingest → Analyse → Triage. */
router.post('/orchestrate', async (req, res) => {
  try {
    const { patientId, filePath, query, fromDoctor, toSpecialty, reason, apiKey, model } = req.body || {};
    if (!patientId) return res.status(400).json({ error: 'patientId is required' });
    const result = await runOrchestratorAgent({ patientId, filePath, query, fromDoctor, toSpecialty, reason, apiKey, model });
    blockchain.addBlock('AGENT_ORCHESTRATION', 'SYSTEM', String(patientId), `Orchestration completed`);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Natural-language query against a patient (or all patients).
 * Strategy: RAG-first → analysis-agent fallback.
 * Supports { allPatients: true } for cross-patient queries.
 */
router.post('/agent/query', async (req, res) => {
  const { patientId, query, prompt, apiKey, model, allPatients } = req.body;
  const normalizedQuery    = query || prompt;
  const effectivePatientId = allPatients ? 'all-patients' : patientId;

  if (!normalizedQuery) return res.status(400).json({ error: 'query/prompt required' });

  blockchain.addBlock(
    'NL_QUERY',
    req.headers['x-actor-id'] || 'UNKNOWN',
    effectivePatientId || 'UNKNOWN',
    `NL Query: "${normalizedQuery.substring(0, 80)}"`
  );

  const traces = [];
  try {
    const ragResult = await runRagDoctorQuery(effectivePatientId, normalizedQuery, apiKey, model);

    if (!ragResult.error && ragResult.answer) {
      return res.json({
        response: ragResult.answer,
        answer:   ragResult.answer,
        source:   ragResult.source,
        rag_hits: ragResult.rag_hits,
        traces,
      });
    }

    if (ragResult.error) {
      return res.json({ response: ragResult.error, error: ragResult.error, source: 'rag', traces });
    }

    if (!patientId) {
      return res.json({
        response: 'Patient not found. Please select a patient or mention their full name in the query.',
        source: 'rag',
        traces,
      });
    }

    // Fallback: direct analysis agent
    const result = await runAnalysisAgent(normalizedQuery, patientId, apiKey, model, (t) => traces.push(t));
    return res.json({ ...result, traces, fallback: 'analysis-agent' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

/** RAG semantic summary bullet-points for a patient. Falls back to deterministic summary on LLM failure. */
router.post('/agent/rag-summary', async (req, res) => {
  const { patientId, apiKey, model } = req.body || {};
  if (!patientId) return res.status(400).json({ error: 'patientId required' });

  function buildFallbackSummaryPoints(patientCase, brief, reason = '') {
    const diagnoses  = [...(patientCase?.primaryDiagnosis || []), ...(patientCase?.secondaryDiagnosis || [])].filter(Boolean);
    const meds       = (patientCase?.medications || []).slice(0, 6);
    const flags      = (patientCase?.clinicalFlags || brief?.redFlags || []).slice(0, 4);
    const visits     = patientCase?.visits || [];
    const lastVisit  = visits.length ? visits[visits.length - 1] : brief?.lastVisitSummary || null;
    const overdue    = (patientCase?.overdueTests || brief?.overdueTests || []).slice(0, 3);
    const points     = [];

    points.push(`${patientCase?.age ?? brief?.age ?? 'Unknown-age'}-year-old ${String(patientCase?.gender || 'patient').toLowerCase()} with ${diagnoses.join(', ') || 'ongoing chronic conditions'}.`);
    points.push(`Current medications: ${meds.length ? meds.map((m) => `${m.name || m.drug} ${m.dose || ''}`.trim()).join(', ') : 'No active medication list available'}.`);
    points.push(`Active alerts/issues: ${flags.length ? flags.map((f) => f.flag || f.message || 'clinical flag').join('; ') : 'No major critical flags recorded'}.`);
    points.push(`Last visit: ${lastVisit?.date || 'date unavailable'}${lastVisit?.clinicalNote ? ` — ${lastVisit.clinicalNote}` : ''}`);
    points.push(`Symptoms tracked: ${lastVisit?.symptoms?.length ? lastVisit.symptoms.join(', ') : (lastVisit?.chiefComplaint || 'not clearly documented')}.`);
    points.push(`Recommended next steps: ${overdue.length ? overdue.map((t) => `${t.test || t.name || 'follow-up test'}${t.reason ? ` (${t.reason})` : ''}`).join(', ') : 'continue treatment and monitor trends closely'}.`);
    if (reason) points.push(`Note: ${reason}.`);
    return points;
  }

  async function loadFallback() {
    const toolCase = tools.get_patient_case_sheet(patientId);
    if (toolCase && !toolCase.error) {
      return { patientCase: toolCase, brief: tools.generate_consultation_brief(patientId) };
    }
    return { patientCase: null, brief: null };
  }

  try {
    const result = await runRagPatientSummary(patientId, apiKey, model);

    if (result.error) {
      const { patientCase, brief } = await loadFallback();
      if (!patientCase && !brief) return res.status(404).json(result);
      return res.json({
        patientId, source: 'fallback', fallback: true,
        summary_points: buildFallbackSummaryPoints(patientCase, brief, result.error),
        raw: '', rag_hits: [],
      });
    }

    if (!Array.isArray(result.summary_points) || result.summary_points.length === 0) {
      const { patientCase, brief } = await loadFallback();
      return res.json({
        ...result, source: 'fallback', fallback: true,
        summary_points: buildFallbackSummaryPoints(patientCase, brief, 'RAG returned empty summary'),
      });
    }

    return res.json(result);
  } catch (e) {
    const { patientCase, brief } = await loadFallback();
    if (!patientCase && !brief) return res.status(500).json({ error: e.message });
    return res.json({
      patientId, source: 'fallback', fallback: true,
      summary_points: buildFallbackSummaryPoints(patientCase, brief, e.message),
      raw: '', rag_hits: [],
    });
  }
});

/** Direct RAG semantic search for a patient. */
router.post('/agent/rag-query', async (req, res) => {
  const { patientId, query, apiKey, model } = req.body || {};
  if (!patientId || !query) return res.status(400).json({ error: 'patientId and query required' });
  try {
    const result = await runRagDoctorQuery(patientId, query, apiKey, model);
    if (result.error) return res.status(404).json(result);
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// RAG aliases (GET for curl / Postman convenience)
router.get('/rag/query',  async (req, res) => {
  const { query, patientId } = req.query;
  try {
    return res.json(await runRagDoctorQuery(patientId, query));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});
router.post('/rag/query', async (req, res) => {
  const { query, patientId, apiKey, model } = req.body || {};
  try {
    return res.json(await runRagDoctorQuery(patientId, query, apiKey, model));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

/** AI triage — assigns priority, recommends specialties, auto-raises ticket if needed. */
router.post('/triage',        async (req, res) => {
  const { patientId, apiKey } = req.body || {};
  if (!patientId) return res.status(400).json({ error: 'patientId required' });
  try {
    const result = await runTriageAgent(String(patientId), apiKey);
    if (result.needs_consultation) {
      blockchain.addBlock('TICKET_RAISED', 'SYSTEM', patientId, `Consultation ticket raised — ${result.priority} priority`);
    }
    return res.json(result);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});
router.post('/agent/triage', async (req, res) => {
  const { patientId, apiKey } = req.body;
  if (!patientId) return res.status(400).json({ error: 'patientId required' });
  blockchain.addBlock('TRIAGE_INITIATED', 'SYSTEM', patientId, 'Triage agent invoked');
  try {
    const result = await runTriageAgent(patientId, apiKey);
    if (result.needs_consultation) {
      blockchain.addBlock('TICKET_RAISED', 'SYSTEM', patientId, `Consultation ticket raised — ${result.priority} priority`);
    }
    return res.json(result);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

/** Second opinion — validates a proposed diagnosis against the full patient history. */
router.post('/second-opinion', async (req, res) => {
  const { patientId, proposedDiagnosis, query, apiKey, model } = req.body || {};
  const diagnosis = proposedDiagnosis || query || 'Assess treatment plan';
  try {
    return res.json(await runSecondOpinionAgent(String(patientId || 'P001'), diagnosis, apiKey, model));
  } catch (e) { return res.status(500).json({ error: e.message }); }
});
router.post('/agent/second-opinion', async (req, res) => {
  const { patientId, proposedDiagnosis, apiKey, model } = req.body;
  if (!patientId || !proposedDiagnosis) return res.status(400).json({ error: 'patientId and proposedDiagnosis required' });
  blockchain.addBlock('SECOND_OPINION_REQUEST', req.headers['x-actor-id'] || 'UNKNOWN', patientId, `Second opinion: "${proposedDiagnosis}"`);
  try {
    return res.json(await runSecondOpinionAgent(patientId, proposedDiagnosis, apiKey, model));
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

/** AI receptionist — answers hospital queries, never gives medical advice. */
router.post('/agent/receptionist', async (req, res) => {
  const { message, history, apiKey } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });
  try {
    const response = await runReceptionist(message, history || [], apiKey);
    return res.json({ response });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

/** Nutrition analysis — personalised to patient conditions. */
router.post('/agent/nutrition', async (req, res) => {
  const { foodDescription, patientId, apiKey } = req.body;
  let conditions = [];
  if (patientId) {
    const patient = tools.get_patient_case_sheet(patientId);
    if (!patient.error) conditions = [...(patient.primaryDiagnosis || []), ...(patient.secondaryDiagnosis || [])];
  }
  const description = foodDescription ||
    (conditions.length
      ? `Give nutrition advice for conditions: ${conditions.join(', ')}`
      : 'Give a balanced diet recommendation for a general adult patient.');
  try {
    return res.json(await runNutritionAgent(description, conditions, apiKey));
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// ─── Document pipeline ────────────────────────────────────────────────────────

/** Upload + OCR a document. Set autoIngest=true to immediately update patient record. */
router.post('/upload', handleFileUpload, documentController.uploadDocument);
router.post('/ingest', documentController.ingestDocument);

/** OCR a document (accepts any field name). Optionally auto-ingests into patient record. */
router.post('/agent/ocr', uploadAny.any(), async (req, res) => {
  const uploaded = (req.files || []).find((f) => f.fieldname === 'document' || f.fieldname === 'file');
  if (!uploaded) return res.status(400).json({ error: 'No file uploaded. Use field name "document" or "file".' });

  blockchain.addBlock('DOCUMENT_UPLOAD', req.headers['x-actor-id'] || 'PATIENT', req.body.patientId || 'UNKNOWN', `Document uploaded: ${uploaded.originalname}`);

  try {
    const { processUploadedDocument } = require('../agents/ocrAgent');
    const result = await processUploadedDocument(uploaded.path, req.body.apiKey, req.body.model);
    blockchain.addBlock('OCR_PROCESSING', 'SYSTEM', req.body.patientId || 'UNKNOWN', `OCR complete — ${result.success ? 'success' : 'failed'}`);

    if (result.success && req.body.patientId && req.body.autoIngest === 'true') {
      const ingestion = await runIngestionAgent(req.body.patientId, result.structured);
      result.ingestion = ingestion;
      blockchain.addBlock('INGESTION_PROCESSING', 'SYSTEM', req.body.patientId, `Ingestion complete — ${ingestion.success ? 'success' : 'failed'}`);
    }

    fs.unlink(uploaded.path, () => {});
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

/** Manually ingest pre-structured OCR data into a patient record. */
router.post('/agent/ingest', async (req, res) => {
  const { patientId, structuredOCRData } = req.body;
  if (!patientId || !structuredOCRData) return res.status(400).json({ error: 'patientId and structuredOCRData required' });
  try {
    const result = await runIngestionAgent(patientId, structuredOCRData);
    blockchain.addBlock('INGESTION_PROCESSING', req.headers['x-actor-id'] || 'SYSTEM', patientId, `Manual ingestion — ${result.success ? 'success' : 'failed'}`);
    return res.json(result);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

/** Full intake pipeline via file upload: OCR → Ingest → Analyse → Triage. */
router.post('/agent/intake', upload.single('document'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const { patientId, query, fromDoctor, toSpecialty, reason, apiKey, model } = req.body;
  if (!patientId) return res.status(400).json({ error: 'patientId required' });
  try {
    const result = await runOrchestratorAgent({ patientId, filePath: req.file.path, query, fromDoctor, toSpecialty, reason, apiKey, model });
    blockchain.addBlock('ORCHESTRATOR_RUN', req.headers['x-actor-id'] || 'SYSTEM', patientId, `Intake pipeline — ${result.success ? 'success' : 'failed'}`);
    fs.unlink(req.file.path, () => {});
    return res.json(result);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

/** Generate a specialist transfer packet for a patient. */
router.post('/agent/transfer', async (req, res) => {
  const { patientId, fromDoctor, toSpecialty, reason, includeAnalysis, analysisQuery, apiKey, model } = req.body;
  if (!patientId || !fromDoctor || !toSpecialty) return res.status(400).json({ error: 'patientId, fromDoctor, toSpecialty required' });
  try {
    const result = await runTransferAgent({ patientId, fromDoctor, toSpecialty, reason, includeAnalysis: includeAnalysis !== false, analysisQuery, apiKey, model });
    blockchain.addBlock('TRANSFER_PACKET_GENERATED', fromDoctor, patientId, `Transfer packet generated for ${toSpecialty}`);
    return res.json(result);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

/** Specialist referral (alias for /agent/transfer with analysis always included). */
router.post('/referral', async (req, res) => {
  const { patientId, fromDoctor, toSpecialty, reason, apiKey, model } = req.body;
  if (!patientId || !fromDoctor || !toSpecialty) return res.status(400).json({ error: 'Missing required fields' });
  try {
    const transfer = await runTransferAgent({ patientId, fromDoctor, toSpecialty, reason, includeAnalysis: true, apiKey, model });
    blockchain.addBlock('SPECIALIST_REFERRAL', fromDoctor, patientId, `Referred to ${toSpecialty} — ${reason || 'No reason provided'}`);
    return res.json(transfer);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// ═════════════════════════════════════════════════════════════════════════════
// BLOCKCHAIN / AUDIT LEDGER
// ═════════════════════════════════════════════════════════════════════════════

router.get('/blockchain/chain',  (req, res) => res.json({ chain: blockchain.getChain(), verification: blockchain.verifyChain() }));
router.get('/blockchain/verify', (req, res) => res.json(blockchain.verifyChain()));
router.get('/blockchain/export', (req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="audit_ledger.csv"');
  res.send(blockchain.exportCSV());
});

// ═════════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═════════════════════════════════════════════════════════════════════════════

router.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

module.exports = router;
