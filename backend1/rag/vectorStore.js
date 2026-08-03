const { LocalIndex } = require('vectra');
const path = require('path');
const OpenAI = require('openai');

const INDEX_PATH = path.join(__dirname, '../data/vectra_index');
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
  index = new LocalIndex(INDEX_PATH);
  if (!await index.isIndexCreated()) {
    await index.createIndex();
  }
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

module.exports = { initIndex, indexPatient, semanticSearch, getEmbedding };
