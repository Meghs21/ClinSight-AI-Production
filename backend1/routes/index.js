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
const uploadAny = multer({ storage }); // alias used by OCR and agent routes
const DATA_DIR = path.join(__dirname, '../data');
const DRUG_INTERACTIONS_FILE = path.join(DATA_DIR, 'drug_interactions.json');
const defaultDatasetDir = path.join(__dirname, '../dataset_output');
const DATASET_DIR = (process.env.DATASET_DIR && fs.existsSync(path.resolve(process.env.DATASET_DIR)))
  ? path.resolve(process.env.DATASET_DIR)
  : (fs.existsSync(defaultDatasetDir) ? defaultDatasetDir : null);

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


router.post('/auth/register', (req, res) => {
  const { role, email, password, name } = req.body || {};
  if (!role || !email || !password || !name) {
    return res.status(400).json({ error: 'role, name, email and password are required' });
  }
  if (!['doctor', 'patient'].includes(role)) {
    return res.status(400).json({ error: 'role must be doctor or patient' });
  }

  const key = role === 'doctor' ? 'doctors' : 'patients';
  const list = users[key];
  const existing = list.find((u) => u.email.toLowerCase() === String(email).toLowerCase());
  if (existing) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  const id = nextUserId(role, list);
  const user = { id, name, email, password };
  list.push(user);
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');

  const { password: _, ...safeUser } = user;
  return res.status(201).json({ user: safeUser, role });
});

router.get('/patients', async (req, res) => {
  try {
    if (process.env.MONGO_URI) {
      try {
        const mongoPatients = await getAllPatientsLiteFromMongo();
        if (mongoPatients && mongoPatients.length > 0) {
          const normalized = (Array.isArray(mongoPatients) ? mongoPatients : []).map((p) => ({
            _id: p._id || null,
            patient_id: p.patient_id,
            name: p.name,
            age: p.age ?? null,
            gender: p.gender ?? 'Unknown',
            email: p.email || `${String(p.name || 'patient').toLowerCase().replace(/\s+/g, '.')}@patient.local`,
            phone: p.phone || null,
            blood_group: p.blood_group || null,
            bmi: p.bmi ?? null,
            city: p.city || null,
            smoking: p.smoking || null,
            alcohol: p.alcohol || null,
            diagnosis: p.diagnosis || [],
            allergies: p.allergies || [],
            status: p.status || 'stable',
            lastVisit: p.lastVisit || null,
          }));
          return res.json(normalized);
        }
      } catch (mongoErr) {
        console.warn('Mongo load patients failed, falling back to local files:', mongoErr.message);
      }
    }
    return res.json(listPatientsFromData());
  } catch (e) {
    return res.status(500).json({ error: `Failed to load patients: ${e.message}` });
  }
});

router.get('/dashboard/data', async (req, res) => {
  try {
    if (process.env.MONGO_URI) {
      try {
        const data = await dashboardDataFromMongo();
        if (data && data.patients && data.patients.length > 0) {
          return res.json(data);
        }
      } catch (mongoErr) {
        console.warn('Mongo dashboard data failed, falling back to local files:', mongoErr.message);
      }
    }
    const data = dashboardDataFromFiles();
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ error: `Failed to build dashboard data: ${e.message}` });
  }
});

router.get('/patient/:id', async (req, res) => {
  try {
    const mongoPatient = await getPatientCaseFromMongo(req.params.id).catch(() => null);
    const patient = mongoPatient || tools.get_patient_case_sheet(req.params.id);
    if (!patient || patient.error) return res.status(404).json(patient || { error: 'Patient not found' });
    blockchain.addBlock('VIEW_PATIENT_RECORD', req.headers['x-actor-id'] || 'UNKNOWN', req.params.id, 'Patient record accessed');
    return res.json(patient);
  } catch (e) {
    return res.status(500).json({ error: `Failed to load patient: ${e.message}` });
  }
});

router.get('/patient/:id/brief', async (req, res) => {
  try {
    const mongoPatient = await getPatientCaseFromMongo(req.params.id).catch(() => null);
    const brief = mongoPatient
      ? buildBriefFromCase(mongoPatient, req.params.id)
      : tools.generate_consultation_brief(req.params.id);
    if (!brief || brief.error) return res.status(404).json(brief || { error: 'Patient not found' });
    blockchain.addBlock('GENERATE_BRIEF', req.headers['x-actor-id'] || 'SYSTEM', req.params.id, '60-second consultation brief generated');
    return res.json(brief);
  } catch (e) {
    return res.status(500).json({ error: `Failed to generate brief: ${e.message}` });
  }
});

router.get('/patient/:id/labs/:testName', async (req, res) => {
  try {
    const mongoPatient = await getPatientCaseFromMongo(req.params.id).catch(() => null);
    if (mongoPatient && mongoPatient.labResults) {
      const testName = req.params.testName;
      const aliasMap = {
        SerumCreatinine: 'Creatinine',
        BloodPressure: 'Blood Pressure',
        Cholesterol: 'Total Cholesterol',
        Haemoglobin: 'Hemoglobin',
      };
      const normalizedTestName = mongoPatient.labResults[testName]
        ? testName
        : aliasMap[testName] || testName;
      const allRows = mongoPatient.labResults[normalizedTestName] || [];
      const from = req.query?.from ? new Date(req.query.from) : null;
      const to = req.query?.to ? new Date(req.query.to) : null;
      const data = allRows.filter((r) => {
        const d = new Date(r.date || 0);
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      });
      const values = data.map((r) => Number(r.value)).filter((v) => Number.isFinite(v));
      const trend =
        values.length > 1
          ? values[values.length - 1] > values[0]
            ? 'WORSENING'
            : values[values.length - 1] < values[0]
            ? 'IMPROVING'
            : 'STABLE'
          : 'INSUFFICIENT_DATA';
      const result = { test_name: normalizedTestName, data, trend, count: data.length };
      blockchain.addBlock('QUERY_LAB_TREND', req.headers['x-actor-id'] || 'UNKNOWN', req.params.id, `Lab trend queried: ${req.params.testName}`);
      return res.json(result);
    }

    const result = tools.extract_lab_trends(req.params.id, req.params.testName, req.query);
    blockchain.addBlock('QUERY_LAB_TREND', req.headers['x-actor-id'] || 'UNKNOWN', req.params.id, `Lab trend queried: ${req.params.testName}`);
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ error: `Failed to load lab trend: ${e.message}` });
  }
});

router.get('/patient/:id/flags', async (req, res) => {
  try {
    const mongoPatient = await getPatientCaseFromMongo(req.params.id).catch(() => null);
    if (mongoPatient) {
      const typeFilter = String(req.query?.type || '').toUpperCase();
      const flags = (mongoPatient.clinicalFlags || []).filter((f) =>
        !typeFilter ? true : String(f.type || '').toUpperCase().includes(typeFilter)
      );
      return res.json(flags);
    }
    const flags = tools.flag_clinical_pattern(req.params.id, req.query.type);
    return res.json(flags);
  } catch (e) {
    return res.status(500).json({ error: `Failed to load flags: ${e.message}` });
  }
});

router.get('/patient/:id/overdue-tests', async (req, res) => {
  try {
    const mongoPatient = await getPatientCaseFromMongo(req.params.id).catch(() => null);
    const tests = mongoPatient ? mongoPatient.overdueTests || [] : tools.recommend_lab_tests(req.params.id);
    blockchain.addBlock('LAB_RECOMMENDATION', 'SYSTEM', req.params.id, 'Overdue lab tests surfaced');
    return res.json(tests);
  } catch (e) {
    return res.status(500).json({ error: `Failed to load overdue tests: ${e.message}` });
  }
});

// Frontend compatibility: /records/* aliases
router.get('/records/:id', (req, res) => {
  const patient = tools.get_patient_case_sheet(req.params.id);
  if (patient.error) return res.status(404).json(patient);

  return res.json({
    patient_id: patient.id,
    name: patient.name,
    age: patient.age,
    gender: patient.gender,
    diagnoses: [...(patient.primaryDiagnosis || []), ...(patient.secondaryDiagnosis || [])],
    allergies: patient.allergies || [],
    prescriptions: (patient.medications || []).map((m) => ({
      drug: m.name,
      dose: m.dose,
      frequency: m.frequency,
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

router.get('/records/:id/flags', (req, res) => {
  const flags = tools.flag_clinical_pattern(req.params.id, req.query.type);
  if (flags.error) return res.status(404).json(flags);
  const payload = (Array.isArray(flags) ? flags : []).map((f, idx) => ({
    id: `${req.params.id}-F${idx + 1}`,
    severity: normalizeSeverity(f.type),
    message: f.flag,
    evidence: f.evidence,
    recommendation: f.recommendation,
  }));
  return res.json(payload);
});

router.get('/records/:id/overdue-tests', (req, res) => {
  const tests = tools.recommend_lab_tests(req.params.id);
  if (tests.error) return res.status(404).json(tests);
  return res.json(
    (tests || []).map((t) => ({
      test: t.test,
      priority: t.overdueDays > 20 ? 'high' : t.overdueDays > 7 ? 'medium' : 'low',
      reason: t.reason || 'Follow-up suggested',
      overdueDays: t.overdueDays ?? null,
      labUrl: t.labUrl || null,
    }))
  );
});

router.post('/records/search', (req, res) => {
  const { query, patientId } = req.body || {};
  if (!patientId) return res.status(400).json({ error: 'patientId required' });
  const result = tools.search_patient_history(patientId, query || '');
  if (result.error) return res.status(404).json(result);
  const normalized = (result.results || []).map((r) => ({
    type: r.department || 'Record',
    value: `${r.date}: ${r.snippet}`,
  }));
  return res.json(normalized);
});

router.post('/patient/:id/search', (req, res) => {
  const { query } = req.body;
  const result = tools.search_patient_history(req.params.id, query);
  blockchain.addBlock('HISTORY_SEARCH', req.headers['x-actor-id'] || 'UNKNOWN', req.params.id, `History searched: "${query}"`);
  return res.json(result);
});

router.post('/drugs/check', (req, res) => {
  const { medications } = req.body;
  if (!Array.isArray(medications) || medications.length === 0) {
    return res.status(400).json({ error: 'medications array required' });
  }
  const result = tools.check_drug_interactions(medications);
  blockchain.addBlock('CHECK_DRUG_INTERACTION', req.headers['x-actor-id'] || 'SYSTEM', req.body.patientId || 'UNKNOWN', `Drug interactions checked: ${medications.join(', ')}`);
  return res.json(result);
});

router.get('/pharmacy/:medicineName', (req, res) => {
  const links = tools.get_pharmacy_link(req.params.medicineName);
  blockchain.addBlock('PHARMACY_LINK_ACCESS', req.headers['x-actor-id'] || 'UNKNOWN', null, `Pharmacy links accessed: ${req.params.medicineName}`);
  return res.json(links);
});

router.post('/agent/query', async (req, res) => {
  const { patientId, query, prompt, apiKey, model, allPatients } = req.body;
  const normalizedQuery = query || prompt;
  if (!normalizedQuery) return res.status(400).json({ error: 'query/prompt required' });
  const effectivePatientId = allPatients ? 'all-patients' : patientId;

  blockchain.addBlock('NL_QUERY', req.headers['x-actor-id'] || 'UNKNOWN', effectivePatientId || 'UNKNOWN', `NL Query: "${normalizedQuery.substring(0, 80)}"`);

  const traces = [];
  try {
    const ragResult = await runRagDoctorQuery(effectivePatientId, normalizedQuery, apiKey, model);
    if (!ragResult.error && ragResult.answer) {
      return res.json({
        response: ragResult.answer,
        answer: ragResult.answer,
        source: ragResult.source,
        rag_hits: ragResult.rag_hits,
        traces,
      });
    }
    if (ragResult.error) {
      return res.json({
        response: ragResult.error,
        error: ragResult.error,
        source: 'rag',
        traces,
      });
    }
    if (!patientId) {
      return res.json({
        response: 'Patient not found. Please select a patient or mention full patient name in query.',
        source: 'rag',
        traces,
      });
    }
    const result = await runAnalysisAgent(normalizedQuery, patientId, apiKey, model, (trace) => traces.push(trace));
    return res.json({ ...result, traces, fallback: 'analysis-agent' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/agent/rag-summary', async (req, res) => {
  const { patientId, apiKey, model } = req.body || {};
  if (!patientId) return res.status(400).json({ error: 'patientId required' });

  const buildFallbackSummaryPoints = (patientCase, brief, reason = '') => {
    const diagnoses = [
      ...((patientCase?.primaryDiagnosis || [])),
      ...((patientCase?.secondaryDiagnosis || [])),
    ].filter(Boolean);
    const meds = (patientCase?.medications || []).slice(0, 6);
    const flags = (patientCase?.clinicalFlags || brief?.redFlags || []).slice(0, 4);
    const visits = patientCase?.visits || [];
    const lastVisit = visits.length ? visits[visits.length - 1] : brief?.lastVisitSummary || null;
    const overdue = (patientCase?.overdueTests || brief?.overdueTests || []).slice(0, 3);

    const points = [];
    points.push(
      `${patientCase?.age ?? brief?.age ?? 'Unknown-age'}-year-old ${String(patientCase?.gender || 'patient').toLowerCase()} with ${diagnoses.join(', ') || 'ongoing chronic conditions'}.`
    );
    points.push(
      `Current medications: ${meds.length ? meds.map((m) => `${m.name || m.drug} ${m.dose || ''}`.trim()).join(', ') : 'No active medication list available'}.`
    );
    points.push(
      `Active alerts/issues: ${flags.length ? flags.map((f) => f.flag || f.message || 'clinical flag').join('; ') : 'No major critical flags recorded'}.`
    );
    points.push(
      `Last visit: ${lastVisit?.date || 'date unavailable'}${lastVisit?.clinicalNote ? ` - ${lastVisit.clinicalNote}` : ''}`
    );
    points.push(
      `Symptoms tracked: ${lastVisit?.symptoms?.length ? lastVisit.symptoms.join(', ') : (lastVisit?.chiefComplaint || 'not clearly documented')}.`
    );
    points.push(
      `Recommended next steps: ${overdue.length ? overdue.map((t) => `${t.test || t.name || 'follow-up test'}${t.reason ? ` (${t.reason})` : ''}`).join(', ') : 'continue treatment and monitor trends closely'}.`
    );
    if (reason) {
      points.push(`RAG fallback note: ${reason}.`);
    }
    return points;
  };

  const loadFallbackData = async () => {
    const mongoCase = await getPatientCaseFromMongo(patientId).catch(() => null);
    if (mongoCase) {
      return {
        patientCase: mongoCase,
        brief: buildBriefFromCase(mongoCase, patientId),
      };
    }
    const toolCase = tools.get_patient_case_sheet(patientId);
    if (toolCase && !toolCase.error) {
      return {
        patientCase: toolCase,
        brief: tools.generate_consultation_brief(patientId),
      };
    }
    return { patientCase: null, brief: null };
  };

  try {
    const result = await runRagPatientSummary(patientId, apiKey, model);
    if (result.error) {
      const { patientCase, brief } = await loadFallbackData();
      if (!patientCase && !brief) return res.status(404).json(result);
      return res.json({
        patientId,
        source: 'fallback',
        fallback: true,
        summary_points: buildFallbackSummaryPoints(patientCase, brief, result.error),
        raw: '',
        rag_hits: [],
      });
    }
    if (!Array.isArray(result.summary_points) || result.summary_points.length === 0) {
      const { patientCase, brief } = await loadFallbackData();
      return res.json({
        ...result,
        source: 'fallback',
        fallback: true,
        summary_points: buildFallbackSummaryPoints(patientCase, brief, 'RAG returned empty summary'),
      });
    }
    return res.json(result);
  } catch (e) {
    const { patientCase, brief } = await loadFallbackData();
    if (!patientCase && !brief) return res.status(500).json({ error: e.message });
    return res.json({
      patientId,
      source: 'fallback',
      fallback: true,
      summary_points: buildFallbackSummaryPoints(patientCase, brief, e.message),
      raw: '',
      rag_hits: [],
    });
  }
});

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

router.post('/agent/second-opinion', async (req, res) => {
  const { patientId, proposedDiagnosis, apiKey, model } = req.body;
  if (!patientId || !proposedDiagnosis) return res.status(400).json({ error: 'patientId and proposedDiagnosis required' });

  blockchain.addBlock('SECOND_OPINION_REQUEST', req.headers['x-actor-id'] || 'UNKNOWN', patientId, `Second opinion: "${proposedDiagnosis}"`);

  try {
    const result = await runSecondOpinionAgent(patientId, proposedDiagnosis, apiKey, model);
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/agent/triage', async (req, res) => {
  const { patientId, apiKey } = req.body;
  if (!patientId) return res.status(400).json({ error: 'patientId required' });

  blockchain.addBlock('TRIAGE_INITIATED', 'SYSTEM', patientId, 'Triage agent invoked');

  try {
    const result = await runTriageAgent(patientId, apiKey);
    if (result.needs_consultation) {
      blockchain.addBlock('TICKET_RAISED', 'SYSTEM', patientId, `Consultation ticket raised - ${result.priority} priority`);
    }
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/agent/receptionist', async (req, res) => {
  const { message, history, apiKey } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  try {
    const response = await runReceptionist(message, history || [], apiKey);
    return res.json({ response });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/agent/nutrition', async (req, res) => {
  const { foodDescription, patientId, apiKey } = req.body;

  let conditions = [];
  if (patientId) {
    const patient = tools.get_patient_case_sheet(patientId);
    if (!patient.error) conditions = [...(patient.primaryDiagnosis || []), ...(patient.secondaryDiagnosis || [])];
  }
  const description =
    foodDescription ||
    (conditions.length
      ? `Give nutrition advice for conditions: ${conditions.join(', ')}`
      : 'Give a balanced diet recommendation for a general adult patient.');

  try {
    const result = await runNutritionAgent(description, conditions, apiKey);
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/agent/ocr', uploadAny.any(), async (req, res) => {
  const uploaded = (req.files || []).find((f) => f.fieldname === 'document' || f.fieldname === 'file');
  if (!uploaded) return res.status(400).json({ error: 'No file uploaded' });

  blockchain.addBlock('DOCUMENT_UPLOAD', req.headers['x-actor-id'] || 'PATIENT', req.body.patientId || 'UNKNOWN', `Document uploaded: ${uploaded.originalname}`);

  try {
    const { processUploadedDocument } = require('../agents/ocrAgent');
    const result = await processUploadedDocument(uploaded.path, req.body.apiKey, req.body.model);
    blockchain.addBlock('OCR_PROCESSING', 'SYSTEM', req.body.patientId || 'UNKNOWN', `OCR processing complete - ${result.success ? 'success' : 'failed'}`);

    if (result.success && req.body.patientId && req.body.autoIngest === 'true') {
      const ingestion = await runIngestionAgent(req.body.patientId, result.structured);
      result.ingestion = ingestion;
      blockchain.addBlock('INGESTION_PROCESSING', 'SYSTEM', req.body.patientId, `Ingestion complete - ${ingestion.success ? 'success' : 'failed'}`);
    }

    fs.unlink(uploaded.path, () => {});
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/agent/ingest', async (req, res) => {
  const { patientId, structuredOCRData } = req.body;
  if (!patientId || !structuredOCRData) {
    return res.status(400).json({ error: 'patientId and structuredOCRData required' });
  }

  try {
    const result = await runIngestionAgent(patientId, structuredOCRData);
    blockchain.addBlock('INGESTION_PROCESSING', req.headers['x-actor-id'] || 'SYSTEM', patientId, `Manual ingestion - ${result.success ? 'success' : 'failed'}`);
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/agent/intake', upload.single('document'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const { patientId, query, fromDoctor, toSpecialty, reason, apiKey, model } = req.body;
  if (!patientId) return res.status(400).json({ error: 'patientId required' });

  try {
    const { runOrchestratorAgent } = require('../agents/orchestratorAgent');
    const result = await runOrchestratorAgent({
      patientId,
      filePath: req.file.path,
      query,
      fromDoctor,
      toSpecialty,
      reason,
      apiKey,
      model,
    });

    blockchain.addBlock('ORCHESTRATOR_RUN', req.headers['x-actor-id'] || 'SYSTEM', patientId, `Intake pipeline run - ${result.success ? 'success' : 'failed'}`);
    fs.unlink(req.file.path, () => {});
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/agent/transfer', async (req, res) => {
  const { patientId, fromDoctor, toSpecialty, reason, includeAnalysis, analysisQuery, apiKey, model } = req.body;
  if (!patientId || !fromDoctor || !toSpecialty) {
    return res.status(400).json({ error: 'patientId, fromDoctor, toSpecialty required' });
  }

  try {
    const result = await runTransferAgent({
      patientId,
      fromDoctor,
      toSpecialty,
      reason,
      includeAnalysis: includeAnalysis !== false,
      analysisQuery,
      apiKey,
      model,
    });

    blockchain.addBlock('TRANSFER_PACKET_GENERATED', fromDoctor, patientId, `Transfer packet generated for ${toSpecialty}`);
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/referral', async (req, res) => {
  const { patientId, fromDoctor, toSpecialty, reason, apiKey, model } = req.body;
  if (!patientId || !fromDoctor || !toSpecialty) return res.status(400).json({ error: 'Missing required fields' });

  try {
    const transfer = await runTransferAgent({
      patientId,
      fromDoctor,
      toSpecialty,
      reason,
      includeAnalysis: true,
      apiKey,
      model,
    });

    blockchain.addBlock('SPECIALIST_REFERRAL', fromDoctor, patientId, `Referred to ${toSpecialty} - ${reason || 'No reason provided'}`);
    return res.json(transfer);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.get('/blockchain/chain', (req, res) => res.json(blockchain.getChain()));
router.get('/blockchain/verify', (req, res) => res.json(blockchain.verifyChain()));

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
