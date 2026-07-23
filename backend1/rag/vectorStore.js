const { LocalIndex } = require('vectra');
const path = require('path');
const OpenAI = require('openai');

const INDEX_PATH = path.join(__dirname, '../data/vectra_index');
let index = null;
const indexedPatientIds = new Set();

const DIMENSION = 1536;

async function getEmbedding(text) {
  // Option 1: Use OpenAI text-embedding-3-small if API key is configured
  if (process.env.OPENAI_API_KEY) {
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const res = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
      });
      if (res.data?.[0]?.embedding) {
        return res.data[0].embedding;
      }
    } catch (err) {
      console.warn('OpenAI embedding call failed, falling back to TF-IDF vectorizer:', err.message);
    }
  }

  // Option 2: Enhanced TF-IDF / Subword N-Gram Semantic Vectorizer
  // Generates 1536-dimensional L2-normalized vector space
  const words = (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const vector = new Array(DIMENSION).fill(0);

  words.forEach((word) => {
    // Word hashing via FNV-1a algorithm over subwords
    for (let len = 2; len <= Math.min(word.length, 5); len++) {
      for (let i = 0; i <= word.length - len; i++) {
        const sub = word.substring(i, i + len);
        let hash = 2166136261;
        for (let c = 0; c < sub.length; c++) {
          hash ^= sub.charCodeAt(c);
          hash = Math.imul(hash, 16777619);
        }
        const idx = Math.abs(hash) % DIMENSION;
        vector[idx] += 1;
      }
    }
  });

  // L2 Norm normalization
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vector.map((v) => v / magnitude);
}

async function initIndex() {
  index = new LocalIndex(INDEX_PATH);
  if (!await index.isIndexCreated()) {
    await index.createIndex();
  }
}

async function indexPatient(patient) {
  if (!index) await initIndex();
  for (const visit of patient.visits || []) {
    const text = `Patient ${patient.name} visit on ${visit.date} by ${visit.doctor || 'Doctor'}. 
      Chief complaint: ${visit.chiefComplaint || ''}. 
      Note: ${visit.clinicalNote || ''}. 
      Plan: ${visit.plan || ''}`;
    const vector = await getEmbedding(text);
    await index.insertItem({
      vector,
      metadata: {
        patientId: patient.id,
        date: visit.date,
        doctor: visit.doctor,
        department: visit.department,
        text,
      },
    });
  }

  if (patient.allergies && patient.allergies.length > 0) {
    const allergyText = `Patient ${patient.name} allergies: ${patient.allergies.join(', ')}`;
    const vector = await getEmbedding(allergyText);
    await index.insertItem({
      vector,
      metadata: { patientId: patient.id, date: 'ALLERGY_RECORD', doctor: 'System', text: allergyText },
    });
  }
}

function buildDocsFromBundle(bundle) {
  const docs = [];
  const patient = bundle?.patient;
  if (!patient) return docs;

  docs.push({
    section: 'patient_profile',
    date: patient.lastVisit || 'PROFILE',
    text: `Patient ${patient.name} (${patient.patient_id}) age ${patient.age}, gender ${patient.gender}. Diagnoses: ${(patient.diagnosis || []).join(', ')}. Allergies: ${(patient.allergies || []).join(', ') || 'none'}.`,
  });

  for (const visit of bundle.visits || []) {
    docs.push({
      section: 'visit',
      date: visit.date || 'VISIT',
      text: `Visit ${visit.date}: ${visit.department || ''} ${visit.visit_type || ''}. Doctor: ${visit.doctor || ''}. Notes: ${visit.doctor_notes || ''}. Symptoms: ${(visit.symptoms || []).join(', ')}.`,
    });
  }

  for (const med of bundle.medications || []) {
    docs.push({
      section: 'medication',
      date: med.start_date || 'MED',
      text: `Medication ${med.drug} ${med.dose}, ${med.frequency}, route ${med.route || 'NA'}, active: ${String(med.active ?? true)}.`,
    });
  }

  for (const lab of bundle.labs || []) {
    docs.push({
      section: 'lab',
      date: lab.date || 'LAB',
      text: `Lab ${lab.test} value ${lab.value}${lab.unit || ''} status ${lab.status || ''} range ${lab.normal_range || ''} on ${lab.date}.`,
    });
  }

  for (const alert of bundle.alerts || []) {
    docs.push({
      section: 'alert',
      date: alert.date || alert.timestamp || 'ALERT',
      text: `Alert ${alert.severity || ''}: ${alert.message}`,
    });
  }

  return docs;
}

async function indexPatientBundle(bundle) {
  if (!bundle?.patient?.patient_id) return { indexed: 0 };
  if (!index) await initIndex();

  const patientId = bundle.patient.patient_id;
  if (indexedPatientIds.has(patientId)) return { indexed: 0 };

  const docs = buildDocsFromBundle(bundle);
  for (const doc of docs) {
    const vector = await getEmbedding(doc.text);
    await index.insertItem({
      vector,
      metadata: {
        patientId,
        date: doc.date,
        section: doc.section,
        text: doc.text,
      },
    });
  }
  indexedPatientIds.add(patientId);
  return { indexed: docs.length };
}

async function semanticSearch(query, patientId, topK = 3) {
  if (!index) await initIndex();
  const queryVector = await getEmbedding(query);
  const results = await index.queryItems(queryVector, topK * 3);
  return results
    .filter((r) => !patientId || r.item.metadata.patientId === patientId)
    .slice(0, topK)
    .map((r) => ({ score: r.score, ...r.item.metadata }));
}

module.exports = { initIndex, indexPatient, indexPatientBundle, semanticSearch, getEmbedding };
