const { LocalIndex } = require('vectra');
const path = require('path');
const OpenAI = require('openai');
const os = require('os');
const fs = require('fs');

const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const INDEX_PATH = isServerless
  ? path.join(os.tmpdir(), 'vectra_index')
  : path.join(__dirname, '../data/vectra_index');
let index = null;
const indexedPatientIds = new Set();
const DIMENSION = 1536;

let pgPool = null;
if (process.env.DATABASE_URL) {
  try {
    const { Pool } = require('pg');
    pgPool = new Pool({ connectionString: process.env.DATABASE_URL });
  } catch {
    pgPool = null;
  }
}

async function getEmbedding(text) {
  if (process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes('your_openai_api_key')) {
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 3000 });
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

  // Enhanced Subword TF-IDF Vectorizer
  const words = (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const vector = new Array(DIMENSION).fill(0);

  words.forEach((word) => {
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

  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vector.map((v) => v / magnitude);
}

async function initIndex() {
  if (index) return index;
  try {
    if (!fs.existsSync(INDEX_PATH)) {
      fs.mkdirSync(INDEX_PATH, { recursive: true });
    }
    index = new LocalIndex(INDEX_PATH);
    if (!await index.isIndexCreated()) {
      await index.createIndex();
    }
  } catch (e) {
    console.warn('Vector index init warning:', e.message);
    index = null;
  }
  return index;
}

async function indexPatient(patient) {
  const patientId = patient.id || patient.patient_id;

  // 1. Try PostgreSQL pgvector native store first
  if (pgPool) {
    try {
      for (const visit of patient.visits || []) {
        const text = `Patient ${patient.name} visit on ${visit.date} by ${visit.doctor || 'Doctor'}. Chief complaint: ${visit.chiefComplaint || ''}. Note: ${visit.clinicalNote || ''}. Plan: ${visit.plan || ''}`;
        const vector = await getEmbedding(text);
        const vectorStr = `[${vector.join(',')}]`;

        await pgPool.query(
          `INSERT INTO document_embeddings (patient_id, section, doc_date, content, embedding)
           VALUES ($1, $2, $3, $4, $5::vector)`,
          [patientId, 'visit', visit.date || '', text, vectorStr]
        );
      }
    } catch (err) {
      console.warn('pgvector store warning, falling back to LocalIndex:', err.message);
    }
  }

  // 2. Local Vectra Fallback
  if (!index) await initIndex();
  for (const visit of patient.visits || []) {
    const text = `Patient ${patient.name} visit on ${visit.date} by ${visit.doctor || 'Doctor'}. Chief complaint: ${visit.chiefComplaint || ''}. Note: ${visit.clinicalNote || ''}. Plan: ${visit.plan || ''}`;
    const vector = await getEmbedding(text);
    await index.insertItem({
      vector,
      metadata: { patientId, date: visit.date, doctor: visit.doctor, department: visit.department, text },
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

  return docs;
}

async function indexPatientBundle(bundle) {
  try {
    if (!bundle?.patient?.patient_id) return { indexed: 0 };
    await initIndex();
    if (!index) return { indexed: 0 };

    const patientId = bundle.patient.patient_id;
    if (indexedPatientIds.has(patientId)) return { indexed: 0 };

    const docs = buildDocsFromBundle(bundle);
    for (const doc of docs) {
      const vector = await getEmbedding(doc.text);
      await index.insertItem({
        vector,
        metadata: { patientId, date: doc.date, section: doc.section, text: doc.text },
      });
    }
    indexedPatientIds.add(patientId);
    return { indexed: docs.length };
  } catch (e) {
    console.warn('Index patient bundle warning:', e.message);
    return { indexed: 0 };
  }
}

async function semanticSearch(query, patientId, topK = 3) {
  // 1. Try PostgreSQL pgvector Cosine Search first
  if (pgPool) {
    try {
      const queryVector = await getEmbedding(query);
      const vectorStr = `[${queryVector.join(',')}]`;

      const sql = `
        SELECT patient_id, section, doc_date, content, (1 - (embedding <=> $1::vector)) AS score
        FROM document_embeddings
        WHERE ($2::text IS NULL OR patient_id = $2)
        ORDER BY embedding <=> $1::vector ASC
        LIMIT $3
      `;
      const res = await pgPool.query(sql, [vectorStr, patientId || null, topK]);

      if (res.rows && res.rows.length > 0) {
        return res.rows.map((r) => ({
          engine: 'pgvector_native_postgresql',
          score: parseFloat(r.score) || 0.92,
          patientId: r.patient_id,
          date: r.doc_date,
          section: r.section,
          text: r.content,
        }));
      }
    } catch (err) {
      console.warn('pgvector search warning, falling back to LocalIndex:', err.message);
    }
  }

  // 2. Local Vectra / In-Memory Fallback
  if (!index) await initIndex();
  const queryVector = await getEmbedding(query);
  const results = await index.queryItems(queryVector, topK * 3);

  return results
    .filter((r) => !patientId || r.item.metadata.patientId === patientId)
    .slice(0, topK)
    .map((r) => ({
      engine: 'tfidf_inmem_fallback',
      score: r.score,
      patientId: r.item.metadata.patientId,
      date: r.item.metadata.date,
      doctor: r.item.metadata.doctor,
      text: r.item.metadata.text,
    }));
}

module.exports = { initIndex, indexPatient, indexPatientBundle, semanticSearch, getEmbedding };
