const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

const DATASET_DIR =
  process.env.DATASET_DIR ||
  path.join(__dirname, '..', 'dataset_output');

app.use(cors());
app.use(express.json());

function safeReadJson(filename, fallback) {
  try {
    const fullPath = path.join(DATASET_DIR, filename);
    const raw = fs.readFileSync(fullPath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error(`Failed to read ${filename}:`, e.message);
    return fallback;
  }
}

const patients = safeReadJson('patients.json', []);
const visits = safeReadJson('visits.json', []);
const medications = safeReadJson('medications.json', []);
const labs = safeReadJson('labs.json', []);

// ---------- AUTH ----------

app.post('/api/auth/login', (req, res) => {
  const { email, password, role } = req.body || {};

  const doctorEmail = process.env.DOCTOR_EMAIL || 'nandakumar@kathir.in';
  const doctorPassword = process.env.DOCTOR_PASSWORD;

  if (
    email === doctorEmail &&
    doctorPassword &&
    password === doctorPassword &&
    role === 'doctor'
  ) {
    return res.json({
      user: {
        name: 'Dr. Nandakumar',
        email,
      },
      role: 'doctor',
    });
  }

  const match = patients.find(
    (p) => p.email === email && p.password === password,
  );

  if (!match) {
    return res
      .status(401)
      .json({ error: 'Invalid email or password (dummy auth).' });
  }

  return res.json({
    user: {
      name: match.name,
      email: match.email,
      patientId: match.patient_id,
    },
    role: role || 'patient',
  });
});

app.post('/api/auth/register', (req, res) => {
  const { role, name, email } = req.body || {};
  return res.json({
    user: {
      name: name || 'New User',
      email: email || 'unknown@example.com',
    },
    role: role || 'doctor',
  });
});

// ---------- HELPERS ----------

function toBasicPatient(p) {
  return {
    patient_id: p.patient_id,
    name: p.name,
    age: p.age,
    gender: p.gender,
    email: p.email,
    phone: p.phone,
    blood_group: p.blood_group || '',
    bmi: p.bmi || null,
    city: p.city || '',
    smoking: p.smoking || '',
    alcohol: p.alcohol || '',
    diagnosis: p.diagnosis || p.diagnoses || [],
    allergies: p.allergies || [],
    status: 'stable',
    lastVisit: null,
  };
}

function buildPatientRecord(id) {
  const patient = patients.find((p) => p.patient_id === id);
  if (!patient) return null;

  const patientVisits = visits.filter((v) => v.patient_id === id);
  const patientMeds = medications.filter((m) => m.patient_id === id);
  const patientLabs = labs.filter((l) => l.patient_id === id);

  return {
    patient_id: id,
    name: patient.name,
    age: patient.age,
    gender: patient.gender,
    diagnoses: patient.diagnosis || patient.diagnoses || [],
    allergies: patient.allergies || [],
    visits: patientVisits,
    prescriptions: patientMeds,
    labs: patientLabs,
  };
}

// ---------- PATIENT APIs ----------

app.get('/api/patients', (req, res) => {
  const result = patients.map((p) => toBasicPatient(p));
  res.json(result);
});

app.get('/api/patient/:id', (req, res) => {
  const id = req.params.id;
  const record = buildPatientRecord(id);
  if (!record) {
    return res.status(404).json({ error: `Patient not found: ${id}` });
  }
  return res.json(record);
});

app.get('/api/patient/:id/brief', (req, res) => {
  const id = req.params.id;
  const record = buildPatientRecord(id);
  if (!record) {
    return res.status(404).json({ error: `Patient not found: ${id}` });
  }
  const latestVisit = (record.visits || []).slice().sort((a, b) => {
    const da = new Date(a.date || a.visit_date || 0).getTime();
    const db = new Date(b.date || b.visit_date || 0).getTime();
    return db - da;
  })[0];

  return res.json({
    patient_id: id,
    name: record.name,
    diagnoses: record.diagnoses,
    lastVisit: latestVisit || null,
  });
});

app.get('/api/patient/:id/labs/:testName', (req, res) => {
  const id = req.params.id;
  const testName = (req.params.testName || '').toLowerCase();
  const filtered = labs.filter(
    (l) =>
      l.patient_id === id &&
      String(l.test || l.name || '')
        .toLowerCase()
        .includes(testName),
  );

  if (!filtered.length) {
    return res
      .status(404)
      .json({ error: `No labs for ${id} and test ${testName}` });
  }

  const trend = filtered.map((l) => Number(l.value || l.result || 0));
  return res.json({
    patient_id: id,
    test: testName,
    trend,
    raw: filtered,
  });
});

app.get('/api/patient/:id/flags', (req, res) => {
  const id = req.params.id;
  const patientLabs = labs.filter((l) => l.patient_id === id);
  const flags = patientLabs
    .filter((l) => {
      const status = String(l.status || '').toLowerCase();
      return status === 'high' || status === 'critical';
    })
    .map((l) => ({
      type: 'lab',
      test: l.test || l.name,
      message: `Abnormal ${l.test || l.name}`,
      severity: (l.status || 'medium').toString(),
    }));
  res.json(flags);
});

app.get('/api/patient/:id/overdue-tests', (req, res) => {
  const id = req.params.id;
  const patient = patients.find((p) => p.patient_id === id);
  if (!patient) {
    return res.status(404).json({ error: `Patient not found: ${id}` });
  }
  const items = (patient.diagnosis || patient.diagnoses || []).map((d) => ({
    test: 'Follow-up panel',
    reason: `Routine monitoring for ${d}`,
    priority: 'medium',
  }));
  res.json(items);
});

app.post('/api/patient/:id/search', (req, res) => {
  const id = req.params.id;
  const { query } = req.body || {};
  const q = (query || '').toString().toLowerCase();

  const patientVisits = visits.filter((v) => v.patient_id === id);
  const hitVisits = patientVisits.filter((v) =>
    JSON.stringify(v).toLowerCase().includes(q),
  );

  return res.json({
    patient_id: id,
    query,
    hits: {
      visits: hitVisits,
    },
  });
});

// ---------- RECORD APIs (mobile-friendly wrappers) ----------

app.get('/api/records/:id', (req, res) => {
  const id = req.params.id;
  const record = buildPatientRecord(id);
  if (!record) {
    return res.status(404).json({ error: `Patient not found: ${id}` });
  }
  res.json(record);
});

app.get('/api/records/:id/brief', (req, res) => {
  const id = req.params.id;
  const record = buildPatientRecord(id);
  if (!record) {
    return res.status(404).json({ error: `Patient not found: ${id}` });
  }
  const latestVisit = (record.visits || [])[0] || null;
  res.json({
    patient_id: id,
    name: record.name,
    diagnoses: record.diagnoses,
    lastVisit: latestVisit,
  });
});

app.get('/api/records/:id/labs', (req, res) => {
  const id = req.params.id;
  const patientLabs = labs.filter((l) => l.patient_id === id);
  res.json(patientLabs);
});

app.get('/api/records/:id/flags', (req, res) => {
  const id = req.params.id;
  const patientLabs = labs.filter((l) => l.patient_id === id);
  const flags = patientLabs
    .filter((l) => {
      const status = String(l.status || '').toLowerCase();
      return status === 'high' || status === 'critical';
    })
    .map((l) => ({
      type: 'lab',
      test: l.test || l.name,
      message: `Abnormal ${l.test || l.name}`,
      severity: (l.status || 'medium').toString(),
    }));
  res.json(flags);
});

app.get('/api/records/:id/overdue-tests', (req, res) => {
  const id = req.params.id;
  const patient = patients.find((p) => p.patient_id === id);
  if (!patient) {
    return res.status(404).json({ error: `Patient not found: ${id}` });
  }
  const items = (patient.diagnosis || patient.diagnoses || []).map((d) => ({
    test: 'Annual check-up',
    reason: `Routine for ${d}`,
    priority: 'low',
  }));
  res.json(items);
});

app.post('/api/records/search', (req, res) => {
  const { patientId, query } = req.body || {};
  const q = (query || '').toString().toLowerCase();
  const id = patientId;

  const record = buildPatientRecord(id);
  if (!record) {
    return res.status(404).json({ error: `Patient not found: ${id}` });
  }

  const hits = [];
  (record.visits || []).forEach((v) => {
    const text = JSON.stringify(v).toLowerCase();
    if (text.includes(q)) hits.push({ type: 'visit', item: v });
  });

  res.json({
    patient_id: id,
    query,
    hits,
  });
});

// ---------- DASHBOARD ----------

app.get('/api/dashboard/data', (req, res) => {
  const basicPatients = patients.map((p) => toBasicPatient(p));
  res.json({
    patients: basicPatients,
    visits,
    medications,
    labs,
    alerts: [],
    interactions: [],
  });
});

// ---------- DRUG & PHARMACY ----------

app.post('/api/drugs/check', (req, res) => {
  const { medications: meds, patientId } = req.body || {};
  const list = Array.isArray(meds) ? meds : [];

  if (!list.length) {
    return res.json({ interactions: [] });
  }

  const interactions = [];
  if (list.includes('Warfarin') && list.includes('Aspirin')) {
    interactions.push({
      drug1: 'Warfarin',
      drug2: 'Aspirin',
      severity: 'High',
      effect: 'Increased bleeding risk',
      recommendation: 'Avoid or monitor INR closely',
    });
  }

  res.json({ interactions, patientId: patientId || null });
});

app.get('/api/pharmacy/:medicineName', (req, res) => {
  const name = req.params.medicineName;
  res.json({
    medicine: name,
    links: [
      {
        provider: 'Dummy Pharmacy',
        url: `https://example-pharmacy.com/search?q=${encodeURIComponent(
          name,
        )}`,
      },
    ],
  });
});

// ---------- AI AGENT (dummy responses) ----------

app.post('/api/agent/query', (req, res) => {
  const { patientId, query, allPatients } = req.body || {};
  res.json({
    answer: `Dummy response for query "${query || ''}"` +
      (patientId ? ` on patient ${patientId}` : '') +
      (allPatients ? ' across all patients' : ''),
  });
});

app.post('/api/agent/rag-summary', (req, res) => {
  const { patientId } = req.body || {};
  const patient = patients.find((p) => p.patient_id === patientId);
  if (!patient) {
    return res.status(404).json({ error: `Patient not found: ${patientId}` });
  }
  res.json({
    summary: [
      `${patient.age}-year-old ${patient.gender} with diagnoses: ${(patient.diagnosis || []).join(', ')}`,
      `BMI ${patient.bmi ?? 'N/A'}`,
    ],
  });
});

app.post('/api/agent/rag-query', (req, res) => {
  const { patientId, query } = req.body || {};
  res.json({
    answer: `Dummy RAG answer for "${query || ''}" on patient ${patientId}`,
  });
});

app.post('/api/agent/second-opinion', (req, res) => {
  const { patientId, proposedDiagnosis } = req.body || {};
  res.json({
    patientId,
    proposedDiagnosis,
    opinion: 'Dummy second opinion: diagnosis seems plausible, correlate clinically.',
  });
});

app.post('/api/agent/triage', (req, res) => {
  const { patientId } = req.body || {};
  res.json({
    patientId,
    urgency: 'medium',
    recommendation: 'Schedule appointment within 1 week (dummy triage).',
  });
});

app.post('/api/agent/receptionist', (req, res) => {
  const { message } = req.body || {};
  res.json({
    reply: `Dummy receptionist reply to: "${message || ''}"`,
  });
});

app.post('/api/agent/nutrition', (req, res) => {
  const { foodDescription } = req.body || {};
  res.json({
    foodDescription,
    advice: 'Dummy nutrition advice: maintain balanced diet and portion control.',
  });
});

app.post('/api/agent/ingest', (req, res) => {
  const { patientId } = req.body || {};
  res.json({
    patientId,
    status: 'ingested (dummy, not persisted)',
  });
});

app.post('/api/agent/transfer', (req, res) => {
  const { patientId, fromDoctor, toSpecialty } = req.body || {};
  res.json({
    patientId,
    fromDoctor,
    toSpecialty,
    status: 'transfer created (dummy)',
  });
});

app.post('/api/referral', (req, res) => {
  const { patientId, fromDoctor, toSpecialty, reason } = req.body || {};
  res.json({
    patientId,
    fromDoctor,
    toSpecialty,
    reason: reason || 'Not specified',
    status: 'referral logged (dummy)',
  });
});

// ---------- FILE UPLOAD (dummy) ----------

app.post('/api/agent/ocr', (req, res) => {
  res.json({
    status: 'ok',
    message: 'OCR dummy endpoint – no real processing.',
  });
});

app.post('/api/agent/intake', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Intake dummy endpoint – no real processing.',
  });
});

// ---------- BLOCKCHAIN / AUDIT (dummy) ----------

app.get('/api/blockchain/chain', (req, res) => {
  res.json({
    chain: [],
  });
});

app.get('/api/blockchain/verify', (req, res) => {
  res.json({
    valid: true,
  });
});

app.get('/api/blockchain/export', (req, res) => {
  res.type('text/csv').send('timestamp,actor,action\n');
});

app.post('/api/emergency', (req, res) => {
  const { patientId, actorId } = req.body || {};
  res.json({
    patientId,
    actorId,
    status: 'emergency logged (dummy)',
  });
});

// ---------- WHATSAPP WEBHOOK (dummy) ----------

app.post('/api/whatsapp/incoming', (req, res) => {
  res.json({
    status: 'received (dummy)',
  });
});

// ---------- ERROR HANDLER ----------

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error (dummy backend).' });
});

app.listen(PORT, () => {
  console.log(`Dummy backend running on http://localhost:${PORT}`);
  console.log(`Using DATASET_DIR = ${DATASET_DIR}`);
});

