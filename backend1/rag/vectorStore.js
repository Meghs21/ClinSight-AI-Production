'use strict';

const { LocalIndex, ItemSelector } = require('vectra');
const path = require('path');
const OpenAI = require('openai');
const os = require('os');
const fs = require('fs');
const { parseClinicalQuery } = require('./queryParser');

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

// ─── Data Quality Evaluator (Preserves source values while flagging inconsistencies) ──
function evaluateLabConsistency(lab) {
  const val = parseFloat(lab.value);
  const status = String(lab.status || '').trim();
  const statusLower = status.toLowerCase();
  const rangeStr = String(lab.normal_range || lab.referenceRange || '').trim();

  let rangeMin = null;
  let rangeMax = null;

  const minMaxMatch = rangeStr.match(/^([0-9.]+)\s*-\s*([0-9.]+)$/);
  if (minMaxMatch) {
    rangeMin = parseFloat(minMaxMatch[1]);
    rangeMax = parseFloat(minMaxMatch[2]);
  } else {
    const ltMatch = rangeStr.match(/^<\s*([0-9.]+)$/);
    if (ltMatch) rangeMax = parseFloat(ltMatch[1]);
    const gtMatch = rangeStr.match(/^>\s*([0-9.]+)$/);
    if (gtMatch) rangeMin = parseFloat(gtMatch[1]);
  }

  let warning = null;
  if (!isNaN(val)) {
    if (rangeMax !== null && val > rangeMax && (statusLower === 'normal' || statusLower === '')) {
      warning = `Dataset-provided status is "${status || 'Normal'}", but value ${val} ${lab.unit || ''} is above the recorded reference range of ${rangeStr}.`;
    } else if (rangeMin !== null && val < rangeMin && (statusLower === 'normal' || statusLower === '')) {
      warning = `Dataset-provided status is "${status || 'Normal'}", but value ${val} ${lab.unit || ''} is below the recorded reference range of ${rangeStr}.`;
    }
  }

  return {
    rawStatus: status || 'Normal',
    dataQualityWarning: warning,
  };
}

// ─── Embedding Generator ──────────────────────────────────────────────────────
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

// ─── Vector Index Initialization ─────────────────────────────────────────────
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

// ─── Document Chunk Builder (All 4 Clinical Sections) ─────────────────────────
function buildDocsFromBundle(bundle) {
  const docs = [];
  const patient = bundle?.patient;
  if (!patient) return docs;
  const patientId = String(patient.patient_id || patient.id).toUpperCase();

  // 1. Patient Profile
  docs.push({
    patientId,
    section: 'patient_profile',
    date: patient.lastVisit || 'PROFILE',
    text: `Patient ${patient.name} (${patientId}) age ${patient.age}, gender ${patient.gender}. Diagnoses: ${(patient.diagnosis || []).join(', ')}. Allergies: ${(patient.allergies || []).join(', ') || 'none'}.`,
    metadata: {
      patientId,
      section: 'patient_profile',
      name: patient.name,
      age: patient.age,
      gender: patient.gender,
      allergies: (patient.allergies || []).join(', '),
      diagnoses: (patient.diagnosis || []).join(', '),
      date: patient.lastVisit || 'PROFILE',
    },
  });

  // 2. Clinical Visits
  for (const visit of bundle.visits || []) {
    const vDate = visit.date || 'VISIT';
    docs.push({
      patientId,
      section: 'visit',
      date: vDate,
      text: `Visit ${vDate}: ${visit.department || 'General Medicine'} ${visit.visit_type || 'Consultation'}. Doctor: ${visit.doctor || 'On File'}. Notes: ${visit.doctor_notes || ''}. Symptoms: ${(visit.symptoms || []).join(', ')}. Plan: ${visit.plan || ''}`,
      metadata: {
        patientId,
        section: 'visit',
        date: vDate,
        doctor: visit.doctor || 'On File',
        department: visit.department || 'General Medicine',
        symptoms: (visit.symptoms || []).join(', '),
      },
    });
  }

  // 3. Medications
  for (const med of bundle.medications || []) {
    const mDate = med.start_date || med.since || 'MED';
    const drugName = String(med.drug || med.name || '').trim();
    
    // Filter out non-medication strings and OCR transcription artifacts
    if (!drugName || drugName.length < 3 || drugName.length > 60) continue;
    if (/^(plan:|and |months |monitor |phone |office |etc\.|your corrections|- serum|serum creatinine)/i.test(drugName)) {
      continue;
    }

    docs.push({
      patientId,
      section: 'medication',
      date: mDate,
      text: `Medication ${drugName} ${med.dose || ''}, ${med.frequency || ''}, route ${med.route || 'Oral'}, active: ${String(med.active ?? true)}. Prescribed: ${mDate}.`,
      metadata: {
        patientId,
        section: 'medication',
        drug: drugName.toLowerCase(),
        dose: med.dose || '',
        frequency: med.frequency || '',
        active: med.active ?? true,
        date: mDate,
      },
    });
  }

  // 4. Lab Results (with Data Quality Check)
  for (const lab of bundle.labs || []) {
    const consistency = evaluateLabConsistency(lab);
    const testName = lab.test || lab.test_name || 'Lab Test';
    const lDate = lab.date || lab.lab_date || 'LAB';
    const normalRange = lab.normal_range || lab.referenceRange || '';
    
    let labText = `Lab ${testName} value ${lab.value}${lab.unit || ''} status ${lab.status || 'Normal'} range ${normalRange} on ${lDate}.`;
    if (consistency.dataQualityWarning) {
      labText += ` [Data Quality Note: ${consistency.dataQualityWarning}]`;
    }

    docs.push({
      patientId,
      section: 'lab',
      date: lDate,
      text: labText,
      metadata: {
        patientId,
        section: 'lab',
        test: testName.toLowerCase(),
        value: lab.value,
        unit: lab.unit || '',
        status: lab.status || 'Normal',
        normal_range: normalRange,
        date: lDate,
        data_quality_warning: consistency.dataQualityWarning || null,
      },
    });
  }

  return docs;
}

// ─── Deduplicated Document Ingestion ──────────────────────────────────────────
async function insertDocsDeduplicated(docs) {
  if (!docs || docs.length === 0) return 0;
  await initIndex();
  if (!index) return 0;

  await index.loadIndexData();
  const existingItems = index._data.items || [];
  const existingKeys = new Set(
    existingItems.map((i) => {
      const m = i.metadata || {};
      return `${m.patientId}_${m.section}_${m.date}_${(m.text || '').substring(0, 50)}`;
    })
  );

  let insertedCount = 0;
  for (const doc of docs) {
    const key = `${doc.patientId}_${doc.section}_${doc.date}_${(doc.text || '').substring(0, 50)}`;
    if (!existingKeys.has(key)) {
      const vector = await getEmbedding(doc.text);
      await index.insertItem({
        vector,
        metadata: {
          ...doc.metadata,
          text: doc.text,
        },
      });
      existingKeys.add(key);
      insertedCount++;

      // Also persist to PostgreSQL pgvector if pool is active
      if (pgPool) {
        try {
          const vectorStr = `[${vector.join(',')}]`;
          await pgPool.query(
            `INSERT INTO document_embeddings (patient_id, section, doc_date, content, embedding)
             VALUES ($1, $2, $3, $4, $5::vector)`,
            [doc.patientId, doc.section, doc.date || '', doc.text, vectorStr]
          );
        } catch (err) {
          // Warning logged silently to not interrupt local indexing
        }
      }
    }
  }

  return insertedCount;
}

async function indexPatient(patient) {
  if (!patient) return { indexed: 0 };
  const patientId = String(patient.id || patient.patient_id).toUpperCase();

  // Convert raw patient format to standardized bundle
  const visits = (patient.visits || []).map((v) => ({
    date: v.date,
    doctor: v.doctor || 'Doctor',
    department: v.department || 'General Medicine',
    doctor_notes: v.clinicalNote || v.plan || '',
    symptoms: String(v.chiefComplaint || '').split(',').map((s) => s.trim()),
    plan: v.plan || '',
  }));

  const medications = (patient.medications || []).map((m) => ({
    drug: m.name || m.drug,
    dose: m.dose || '',
    frequency: m.frequency || '',
    start_date: m.since || m.start_date || null,
    active: true,
  }));

  const labs = [];
  if (patient.labResults) {
    Object.entries(patient.labResults).forEach(([test, rows]) => {
      (rows || []).forEach((r) => {
        labs.push({
          test,
          value: r.value !== undefined ? r.value : r.systolic,
          unit: r.unit || '',
          status: r.status || '',
          normal_range: r.referenceRange || r.normal_range || '',
          date: r.date,
        });
      });
    });
  }

  const bundle = {
    patient: {
      patient_id: patientId,
      name: patient.name,
      age: patient.age,
      gender: patient.gender,
      diagnosis: patient.primaryDiagnosis || patient.diagnosis || [],
      allergies: patient.allergies || [],
      lastVisit: visits[0]?.date || null,
    },
    visits,
    medications,
    labs,
  };

  const docs = buildDocsFromBundle(bundle);
  const count = await insertDocsDeduplicated(docs);
  indexedPatientIds.add(patientId);
  return { indexed: count };
}

async function indexPatientBundle(bundle) {
  if (!bundle?.patient?.patient_id) return { indexed: 0 };
  const patientId = String(bundle.patient.patient_id).toUpperCase();
  const docs = buildDocsFromBundle(bundle);
  const count = await insertDocsDeduplicated(docs);
  indexedPatientIds.add(patientId);
  return { indexed: count };
}

// ─── Hybrid Semantic Search (Structured Constraints + Vector Similarity) ──────
async function semanticSearch(query, patientId, topK = 5) {
  // Resilient parameter handling: support both (query, patientId, topK) and (patientId, query, topK)
  if (typeof query === 'string' && /^P\d+/i.test(query) && typeof patientId === 'string' && !/^P\d+/i.test(patientId)) {
    const temp = query;
    query = patientId;
    patientId = temp;
  }

  const parsed = parseClinicalQuery(query);

  if (!index) await initIndex();
  await index.loadIndexData();
  const allItems = index._data.items || [];

  // 1. Mandatory Patient Isolation: Never leak chunks across patients
  let candidateItems = allItems;
  if (patientId && patientId !== 'all-patients' && patientId !== 'ALL') {
    const normPid = String(patientId).toUpperCase();
    candidateItems = allItems.filter((item) => {
      const p = String(item.metadata?.patientId || '').toUpperCase();
      return p === normPid;
    });
  }

  if (candidateItems.length === 0) return [];

  // 2. Compute query embedding & base vector cosine similarity
  const queryVector = await getEmbedding(query);
  const norm = ItemSelector.normalize(queryVector);

  let scored = candidateItems.map((item) => {
    const meta = item.metadata || {};
    const textLower = (meta.text || '').toLowerCase();
    const baseSim = ItemSelector.normalizedCosineSimilarity(queryVector, norm, item.vector, item.norm);
    let finalScore = baseSim;

    // Entity Match Boost
    if (parsed.biomarker) {
      const matchesBiomarker = (meta.test && meta.test.includes(parsed.biomarker)) ||
        textLower.includes(parsed.biomarker);
      if (matchesBiomarker) {
        finalScore += 0.35;
        if (meta.section === 'lab') finalScore += 0.15;
      } else if (meta.section === 'visit' && parsed.section === 'lab') {
        finalScore -= 0.20;
      }
    } else if (parsed.medication) {
      const matchesMed = (meta.drug && meta.drug.includes(parsed.medication)) ||
        textLower.includes(parsed.medication);
      if (matchesMed) {
        finalScore += 0.35;
        if (meta.section === 'medication') finalScore += 0.15;
      }
    } else if (parsed.section) {
      if (meta.section === parsed.section) finalScore += 0.25;
    }

    // Temporal Match Boost
    if (parsed.exactDate) {
      if (meta.date === parsed.exactDate) {
        finalScore += 0.45;
      } else {
        finalScore -= 0.15;
      }
    } else if (parsed.monthYear) {
      if (meta.date && meta.date.startsWith(parsed.monthYear)) {
        finalScore += 0.25;
      }
    }

    return {
      item,
      baseScore: baseSim,
      finalScore,
      date: meta.date,
      section: meta.section,
    };
  });

  // 3. Cross-Date / Trend Query Handler (returns chronological progression)
  if (parsed.isTrendQuery && (parsed.biomarker || parsed.medication)) {
    const matchingEntityItems = scored
      .filter((s) => {
        const t = (s.item.metadata?.text || '').toLowerCase();
        const entityMatch = parsed.biomarker ? t.includes(parsed.biomarker) : t.includes(parsed.medication);
        const sectionMatch = parsed.section ? s.section === parsed.section : true;
        return entityMatch && sectionMatch;
      })
      .sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());

    if (matchingEntityItems.length > 0) {
      const seenDates = new Set();
      const uniqueTrend = [];
      for (const entry of matchingEntityItems) {
        if (!seenDates.has(entry.date) && entry.date !== 'PROFILE' && entry.date !== 'MED' && entry.date !== 'LAB') {
          seenDates.add(entry.date);
          uniqueTrend.push(entry);
        }
      }
      return uniqueTrend.slice(0, topK).map((s) => ({
        engine: 'hybrid_trend_chronological',
        score: Math.min(1.0, Math.max(0, s.finalScore)),
        baseScore: Number(s.baseScore.toFixed(3)),
        rerankBoost: Number((s.finalScore - s.baseScore).toFixed(3)),
        patientId: s.item.metadata.patientId,
        section: s.item.metadata.section,
        date: s.item.metadata.date,
        text: s.item.metadata.text,
        data_quality_warning: s.item.metadata.data_quality_warning || null,
        isTrendItem: true,
      }));
    }
  }

  // 4. Exact Date Query with Missing Record Handler (covers any query specifying a missing date)
  if (parsed.exactDate) {
    const exactMatches = scored.filter((s) => {
      const t = (s.item.metadata?.text || '').toLowerCase();
      const entityMatch = parsed.biomarker
        ? ((s.item.metadata?.test && s.item.metadata.test.includes(parsed.biomarker)) || t.includes(parsed.biomarker))
        : parsed.medication
        ? ((s.item.metadata?.drug && s.item.metadata.drug.includes(parsed.medication)) || t.includes(parsed.medication))
        : true;
      const sectionMatch = parsed.section ? s.section === parsed.section : true;
      return entityMatch && sectionMatch && s.date === parsed.exactDate;
    });

    if (exactMatches.length === 0) {
      // Requested date does not exist for this entity/section query: find closest historical records
      const historical = scored
        .filter((s) => {
          const t = (s.item.metadata?.text || '').toLowerCase();
          const entityMatch = parsed.biomarker
            ? ((s.item.metadata?.test && s.item.metadata.test.includes(parsed.biomarker)) || t.includes(parsed.biomarker))
            : parsed.medication
            ? ((s.item.metadata?.drug && s.item.metadata.drug.includes(parsed.medication)) || t.includes(parsed.medication))
            : true;
          const sectionMatch = parsed.section ? s.section === parsed.section : true;
          return entityMatch && sectionMatch && s.date && !['PROFILE', 'VISIT', 'LAB', 'MED'].includes(s.date);
        })
        .sort((a, b) => {
          const targetTime = new Date(parsed.exactDate).getTime();
          const diffA = Math.abs(new Date(a.date).getTime() - targetTime);
          const diffB = Math.abs(new Date(b.date).getTime() - targetTime);
          if (diffA !== diffB) return diffA - diffB;
          return b.finalScore - a.finalScore;
        });

      const nearest = historical[0];
      const results = [];

      if (nearest) {
        const entityLabel = (parsed.biomarker ? parsed.biomarker + ' ' : (parsed.medication ? parsed.medication + ' ' : (parsed.section ? parsed.section + ' ' : '')));
        results.push({
          engine: 'hybrid_nearest_historical',
          score: 0.85,
          baseScore: Number(nearest.baseScore.toFixed(3)),
          rerankBoost: Number((nearest.finalScore - nearest.baseScore).toFixed(3)),
          patientId: nearest.item.metadata.patientId,
          section: nearest.item.metadata.section,
          date: nearest.item.metadata.date,
          text: nearest.item.metadata.text,
          data_quality_warning: nearest.item.metadata.data_quality_warning || null,
          exactDateMatch: false,
          requestedDate: parsed.exactDate,
          temporalNote: `No ${entityLabel}record was found for ${parsed.exactDate}. The closest available historical record is from ${nearest.date}.`,
        });
      }

      // Add remaining relevant context
      const others = scored
        .filter((s) => s.item.id !== nearest?.item?.id)
        .sort((a, b) => b.finalScore - a.finalScore)
        .slice(0, topK - 1);

      return results.concat(
        others.map((s) => ({
          engine: 'hybrid_vectra_ranked',
          score: Math.min(1.0, Math.max(0, s.finalScore)),
          baseScore: Number(s.baseScore.toFixed(3)),
          rerankBoost: Number((s.finalScore - s.baseScore).toFixed(3)),
          patientId: s.item.metadata.patientId,
          section: s.item.metadata.section,
          date: s.item.metadata.date,
          text: s.item.metadata.text,
          data_quality_warning: s.item.metadata.data_quality_warning || null,
        }))
      );
    }
  }

  // 5. Standard Ranked Sort & Deduplication
  scored.sort((a, b) => b.finalScore - a.finalScore);

  const seenKeys = new Set();
  const seenDrugs = new Set();
  const deduped = [];

  for (const s of scored) {
    if (s.section === 'medication' && s.item.metadata?.drug) {
      let drugNorm = s.item.metadata.drug.replace(/[^a-z]/g, '').substring(0, 6);
      if (drugNorm.includes('lipit') || drugNorm.includes('atorv')) drugNorm = 'atorva';
      if (drugNorm && seenDrugs.has(drugNorm)) continue;
      if (drugNorm) seenDrugs.add(drugNorm);
    }

    const key = `${s.item.metadata.patientId}_${s.date}_${(s.item.metadata.text || '').substring(0, 60)}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      deduped.push(s);
    }
    if (deduped.length >= topK) break;
  }

  return deduped.map((s) => ({
    engine: 'hybrid_vectra_ranked',
    score: Math.min(1.0, Math.max(0, s.finalScore)),
    baseScore: Number(s.baseScore.toFixed(3)),
    rerankBoost: Number((s.finalScore - s.baseScore).toFixed(3)),
    patientId: s.item.metadata.patientId,
    section: s.item.metadata.section,
    date: s.item.metadata.date,
    text: s.item.metadata.text,
    data_quality_warning: s.item.metadata.data_quality_warning || null,
  }));
}

module.exports = {
  initIndex,
  indexPatient,
  indexPatientBundle,
  semanticSearch,
  getEmbedding,
  buildDocsFromBundle,
  evaluateLabConsistency,
};
