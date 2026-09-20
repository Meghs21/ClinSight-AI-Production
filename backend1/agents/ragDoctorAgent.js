const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Groq = require('groq-sdk');
const {
  getPatientContext,
  extractLikelyPatientName,
  resolvePatientIdByName,
} = require('../rag/patientContext');
const { initIndex, semanticSearch, indexPatientBundle } = require('../rag/vectorStore');

function wantsDetailedOutput(query = '') {
  const q = String(query).toLowerCase();
  return (
    /\b(detailed|detail|elaborate|comprehensive|in[-\s]?depth|long|full)\b/.test(q) ||
    /\b(8|9|10)\s*(points?|bullets?|lines?)\b/.test(q) ||
    /\b8\s*[-to]+\s*10\b/.test(q)
  );
}

function getRequestedWordCount(query = '') {
  const q = String(query).toLowerCase();
  const match = q.match(/\b(\d{3,4})\s*words?\b/);
  if (!match) return null;
  const count = Number(match[1]);
  if (!Number.isFinite(count) || count < 120) return null;
  return Math.min(count, 1200);
}

function buildContextText(bundle, hits) {
  const p = bundle.patient || {};
  const meds = (bundle.medications || []).slice(0, 12).map((m) => `${m.drug} ${m.dose}`).join(', ');
  const lastVisit = (bundle.visits || []).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  const alerts = (bundle.alerts || []).slice(0, 6).map((a) => `${a.severity?.toUpperCase()}: ${a.message}`).join('\n');
  const labText = (bundle.labs || []).slice(0, 12).map((l) => `${l.date} ${l.test}=${l.value}${l.unit || ''} (status: ${l.status || 'NA'}, range: ${l.normal_range || l.referenceRange || 'NA'})`).join('\n');

  // Format retrieved chunks with clear clinical attribution and warnings
  const ragText = (hits || []).map((h, i) => {
    let header = `[Evidence Chunk ${i + 1}] [Section: ${h.section || 'record'}] [Date: ${h.date || 'NA'}] [Score: ${typeof h.score === 'number' ? h.score.toFixed(3) : h.score}]`;
    if (h.temporalNote) {
      header += `\n  ⚠️ TEMPORAL NOTE: ${h.temporalNote}`;
    }
    if (h.data_quality_warning) {
      header += `\n  ⚠️ DATA QUALITY WARNING: ${h.data_quality_warning}`;
    }
    return `${header}\n  Content: ${h.text}`;
  }).join('\n\n');

  return `=== PATIENT DEMOGRAPHICS ===
Patient ID: ${p.patient_id || 'UNKNOWN'}
Name: ${p.name || 'Unknown'}
Age / Gender: ${p.age || 'NA'} / ${p.gender || 'NA'}
Diagnoses: ${(p.diagnosis || []).join(', ') || 'None recorded'}
Allergies: ${(p.allergies || []).join(', ') || 'None reported'}

=== PRIMARY RETRIEVED CLINICAL EVIDENCE (USE THIS AS PRIMARY BASIS FOR DIRECT ANSWER) ===
${ragText || 'No specific semantic matches found.'}

=== BACKGROUND PATIENT RECORD ===
Current Medications: ${meds || 'None recorded'}
Active Alerts:
${alerts || 'None'}
Background Labs:
${labText || 'None'}
Last Visit: ${lastVisit?.date || 'NA'} (${lastVisit?.doctor || 'Physician'}) - ${lastVisit?.doctor_notes || ''}`;
}

function compactList(items = [], limit = 4) {
  const clean = (items || []).filter(Boolean);
  if (clean.length <= limit) return clean.join(', ');
  return `${clean.slice(0, limit).join(', ')} (+${clean.length - limit} more)`;
}

function isGroqRateLimitError(err) {
  const status = Number(err?.status || err?.code || 0);
  const message = String(err?.message || err?.error?.message || '').toLowerCase();
  return status === 429 || message.includes('rate limit') || message.includes('rate_limit_exceeded');
}

function extractRetryAfterText(err) {
  const msg = String(err?.message || err?.error?.message || '');
  const m = msg.match(/try again in\s+([^.,]+(?:\.[0-9]+s|s)?)/i);
  return m?.[1] ? String(m[1]).trim() : null;
}

function formatDateSafe(value) {
  if (!value) return 'NA';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function pickAbnormalLabs(labs = [], limit = 5) {
  return (labs || [])
    .filter((l) => {
      const s = String(l.status || '').toLowerCase();
      return s.includes('high') || s.includes('low') || s.includes('critical') || s.includes('abnormal');
    })
    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
    .slice(0, limit);
}

function buildFallbackSummaryFromBundle(bundle, reason = '') {
  const p = bundle?.patient || {};
  const visits = [...(bundle?.visits || [])].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  const lastVisit = visits[0];
  const meds = (bundle?.medications || []).slice(0, 8);
  const alerts = (bundle?.alerts || []).slice(0, 6);
  const abnormalLabs = pickAbnormalLabs(bundle?.labs || [], 5);

  const lines = [];
  lines.push(`${p.age ?? 'Unknown-age'}-year-old ${String(p.gender || 'patient').toLowerCase()} with ${(p.diagnosis || []).join(', ') || 'chronic conditions'}.`);
  lines.push(`Current medications: ${meds.length ? meds.map((m) => `${m.drug} ${m.dose || ''}`.trim()).join(', ') : 'No active medication list available'}.`);
  lines.push(`Active alerts: ${alerts.length ? alerts.map((a) => a.message).join('; ') : 'No major active alerts detected'}.`);
  lines.push(`Recent abnormal labs: ${abnormalLabs.length ? abnormalLabs.map((l) => `${l.test} ${l.status} (${l.value}${l.unit || ''})`).join('; ') : 'No clear abnormal lab trend found'}.`);
  lines.push(`Last visit: ${formatDateSafe(lastVisit?.date)}${lastVisit?.doctor ? ` with ${lastVisit.doctor}` : ''}${lastVisit?.department ? ` (${lastVisit.department})` : ''}.`);
  lines.push(`Next steps: review medication adherence, recheck key labs, and schedule follow-up with relevant specialty if worsening trend continues.`);
  if (reason) lines.push(`AI provider limit reached (${reason}). Showing database-backed fallback summary.`);
  lines.push('Physician review required.');
  return lines.slice(0, 10);
}

function buildFallbackAnswerFromBundle(bundle, query = '', reason = '') {
  const q = String(query || '').toLowerCase();
  const detailed = wantsDetailedOutput(query) || Boolean(getRequestedWordCount(query));
  const p = bundle?.patient || {};
  const visits = [...(bundle?.visits || [])].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  const lastVisit = visits[0];
  const meds = (bundle?.medications || []).slice(0, 10);
  const alerts = (bundle?.alerts || []).slice(0, 8);
  const abnormalLabs = pickAbnormalLabs(bundle?.labs || [], 8);

  const bullets = [];
  const medItems = meds.map((m) => `${m.drug} ${m.dose || ''}`.trim()).filter(Boolean);
  const issueItems = alerts.map((a) => a.message).filter(Boolean);
  const abnormalItems = abnormalLabs.map((l) => `${l.test} ${l.status} (${l.value}${l.unit || ''})`);
  const medicationIntent = q.includes('med') || q.includes('drug') || q.includes('prescription');
  const historyIntent = q.includes('history') || q.includes('visit') || q.includes('past');

  bullets.push(`**Patient:** ${p.name || 'Unknown'} (${p.patient_id || 'NA'})`);
  bullets.push(`**Diagnosis:** ${(p.diagnosis || []).join(', ') || 'Not available'}`);

  if (medicationIntent && !detailed) {
    bullets.push(`**Medications:** ${medItems.length ? compactList(medItems, 5) : 'No active medications found'}`);
    bullets.push(`**Last visit:** ${formatDateSafe(lastVisit?.date)}${lastVisit?.doctor ? ` · ${lastVisit.doctor}` : ''}`);
    if (reason) bullets.push(`**Note:** Groq limit (${reason}), showing fallback data.`);
    return bullets.map((b) => `- ${b}`).join('\n');
  }

  if (historyIntent && !detailed) {
    bullets.push(`**Last visit:** ${formatDateSafe(lastVisit?.date)}${lastVisit?.doctor ? ` · ${lastVisit.doctor}` : ''}${lastVisit?.doctor_notes ? ` · ${lastVisit.doctor_notes}` : ''}`);
    bullets.push(`**Recent issues:** ${abnormalItems.length ? compactList(abnormalItems, 3) : (issueItems.length ? compactList(issueItems, 3) : 'No major issues noted')}`);
    if (reason) bullets.push(`**Note:** Groq limit (${reason}), showing fallback data.`);
    return bullets.map((b) => `- ${b}`).join('\n');
  }

  bullets.push(`**Current medications:** ${medItems.length ? compactList(medItems, detailed ? 8 : 4) : 'No active medications found'}`);
  bullets.push(`**Abnormal labs/alerts:** ${(abnormalItems.length ? compactList(abnormalItems, detailed ? 6 : 3) : compactList(issueItems, detailed ? 6 : 3)) || 'Not available'}`);
  bullets.push(`**Last visit:** ${formatDateSafe(lastVisit?.date)}${lastVisit?.doctor ? ` · ${lastVisit.doctor}` : ''}${lastVisit?.doctor_notes ? ` · ${lastVisit.doctor_notes}` : ''}`);
  bullets.push('**Next steps:** Repeat key labs and schedule follow-up review.');

  if (detailed) {
    bullets.push('**Action plan:** Review adherence, reassess trends, and escalate specialist referral if worsening continues.');
    bullets.push('**Safety:** Urgent review if red-flag symptoms or critical values appear.');
  }

  if (reason) bullets.push(`**Note:** Groq rate limit reached (${reason}). Returned from local fallback.`);
  return bullets.slice(0, detailed ? 10 : 6).map((b) => `- ${b}`).join('\n');
}

async function ensureVectorContext(patientId, baseQuery) {
  try {
    await initIndex();
    let hits = await semanticSearch(baseQuery, patientId, 8);
    if (hits.length > 0) return { hits, bundle: null };

    const bundle = await getPatientContext(patientId);
    if (!bundle) return { hits: [], bundle: null };
    await indexPatientBundle(bundle);
    hits = await semanticSearch(baseQuery, patientId, 8);
    return { hits, bundle };
  } catch (err) {
    console.warn('ensureVectorContext fallback:', err.message);
    const bundle = await getPatientContext(patientId);
    return { hits: [], bundle };
  }
}

async function runRagPatientSummary(patientId, apiKey, model = process.env.GROQ_MODEL || 'groq/compound-mini') {
  const client = new Groq({ apiKey: apiKey || process.env.GROQ_API_KEY });
  const { hits, bundle: firstBundle } = await ensureVectorContext(
    patientId,
    'patient summary diagnoses medications alerts labs last visit recommendations'
  );

  const bundle = firstBundle || (await getPatientContext(patientId));
  if (!bundle) return { error: `Patient ${patientId} not found in Mongo/dataset.` };

  const context = buildContextText(bundle, hits);
  const prompt = `Create a physician-ready summary in 6 to 10 concise bullet points.
Requirements:
- Mention diagnosis, last visit, meds, abnormal labs, alerts, and actionable next steps.
- Keep each bullet specific and clinically useful.
- No markdown headings, only bullet points.
- End with one caution line: "Physician review required."`;

  try {
    const response = await client.chat.completions.create({
      model,
      temperature: 0.2,
      max_tokens: 700,
      messages: [
        { role: 'system', content: 'You are a clinical summarization assistant. Output concise bullets only.' },
        { role: 'user', content: `${context}\n\n${prompt}` },
      ],
    });

    const text = response.choices?.[0]?.message?.content || '';
    const summary_points = text
      .split('\n')
      .map((line) => line.replace(/^[-*•\d.\s]+/, '').trim())
      .filter(Boolean)
      .slice(0, 10);

    return {
      patientId,
      source: bundle.source,
      summary_points,
      raw: text,
      rag_hits: hits.slice(0, 5),
    };
  } catch (err) {
    if (!isGroqRateLimitError(err)) throw err;
    const retryAfter = extractRetryAfterText(err);
    return {
      patientId,
      source: 'fallback',
      fallback: true,
      summary_points: buildFallbackSummaryFromBundle(bundle, retryAfter || 'rate limit reached'),
      raw: '',
      rag_hits: hits.slice(0, 5),
    };
  }
}

function buildClinicOverviewContext() {
  const DATASET_DIR = process.env.DATASET_DIR || path.join(__dirname, '../dataset_output');
  const DATA_DIR = path.join(__dirname, '../data');

  let patients = [];
  let labs = [];
  let visits = [];
  let meds = [];
  let drugInteractions = [];

  try {
    if (fs.existsSync(path.join(DATASET_DIR, 'patients.json'))) {
      patients = JSON.parse(fs.readFileSync(path.join(DATASET_DIR, 'patients.json'), 'utf8'));
      labs = JSON.parse(fs.readFileSync(path.join(DATASET_DIR, 'labs.json'), 'utf8'));
      visits = JSON.parse(fs.readFileSync(path.join(DATASET_DIR, 'visits.json'), 'utf8'));
      meds = JSON.parse(fs.readFileSync(path.join(DATASET_DIR, 'medications.json'), 'utf8'));
    }
    const diPath = path.join(DATA_DIR, 'drug_interactions.json');
    if (fs.existsSync(diPath)) {
      drugInteractions = JSON.parse(fs.readFileSync(diPath, 'utf8'));
    }
  } catch (e) {
    console.warn('Clinic overview read warning:', e.message);
  }

  const abnormalByPatient = {};
  for (const l of labs) {
    const s = String(l.status || '').toLowerCase();
    if (s.includes('critical') || s.includes('high')) {
      if (!abnormalByPatient[l.patient_id]) abnormalByPatient[l.patient_id] = [];
      if (abnormalByPatient[l.patient_id].length < 3) abnormalByPatient[l.patient_id].push(l);
    }
  }

  const criticalSummary = Object.keys(abnormalByPatient).slice(0, 10).map((pid) => {
    const p = patients.find((x) => x.patient_id === pid);
    const issues = abnormalByPatient[pid].map((x) => `${x.test}: ${x.value}${x.unit || ''} (${x.status})`).join(', ');
    return `• Patient ${pid} (${p?.name || 'Unknown'}, Age ${p?.age || 'NA'}, ${p?.gender || ''}) - Diagnoses: ${(p?.diagnosis || []).join(', ')}. Abnormal Labs: ${issues}`;
  }).join('\n');

  const diSummary = drugInteractions.slice(0, 8).map((d) =>
    `• ${d.drug1 || d.drug_a} + ${d.drug2 || d.drug_b} [Severity: ${d.severity}]: ${d.risk || d.effect}`
  ).join('\n');

  return `Kathir Memorial Hospital Registry:
- Total Registered Patients: ${patients.length || 150}
- Patients Flagged with Critical / High Abnormal Labs: ${Object.keys(abnormalByPatient).length}

Top Critical Patient Highlights:
${criticalSummary}

Hospital Formulary Drug Interactions Flagged:
${diSummary}

Clinical Practice Targets:
- Target HbA1c in T2DM: < 7.0%
- Target Blood Pressure in HTN: < 130/80 mmHg
- Renal Monitoring: Monitor eGFR & Serum Creatinine on ACE-I/ARBs or Diuretics`;
}

async function runRagDoctorQuery(patientId, query, apiKey, model = process.env.GROQ_MODEL || 'groq/compound-mini') {
  let effectivePatientId = patientId;
  let effectiveQuery = query;

  // Handle swapped signature (query, patientId)
  if (typeof patientId === 'string' && patientId.length > 8 && typeof query === 'string' && /^P\d+/i.test(query)) {
    effectivePatientId = query;
    effectiveQuery = patientId;
  }

  const explicitNameInQuery = extractLikelyPatientName(effectiveQuery);
  const allPatientsMode = !effectivePatientId || effectivePatientId === 'all-patients' || effectivePatientId === 'ALL';

  if (allPatientsMode) {
    let resolved = null;
    if (explicitNameInQuery) {
      resolved = await resolvePatientIdByName(explicitNameInQuery);
    } else {
      const directNameTry = query?.trim();
      if (directNameTry && directNameTry.split(/\s+/).length <= 4) {
        resolved = await resolvePatientIdByName(directNameTry);
      }
    }

    if (resolved?.patient_id) {
      effectivePatientId = resolved.patient_id;
    } else {
      // No specific patient identified — handle as greeting, clinic-wide query, or general medical question
      const cleanQuery = query.trim().toLowerCase();
      const isGreeting = /^(hi|hello|hey|greetings|good morning|good afternoon|good evening|who are you|what can you do|help)\b/i.test(cleanQuery);
      if (isGreeting) {
        return {
          patientId: 'all-patients',
          source: 'assistant',
          answer: `**Hello Doctor! Welcome to MedAI Assistant at Kathir Memorial Hospital.**

I am your clinical intelligence co-pilot. Here is how I can assist you:
- **Patient Deep-Dive:** Ask about any specific patient (e.g. *"Medications for Rahul Sharma"* or select **P001** from the dropdown).
- **Critical Patient Screening:** Ask *"List all patients with critical status"* to review high-risk cases.
- **Drug Interactions:** Ask *"Check for any drug interactions in current medications"*.
- **Lab & Vital Trends:** Ask *"What are the current trends in HbA1c levels?"* or track renal/cardiovascular panels.
- **Consultation Briefs:** Select any patient from the dropdown above to generate an immediate 60-second clinical brief.

How would you like to begin?`,
          rag_hits: [],
        };
      }

      // Clinic-wide or clinical question
      const clinicContext = buildClinicOverviewContext();
      const client = new Groq({ apiKey: apiKey || process.env.GROQ_API_KEY });
      const prompt = `You are an AI Clinical Intelligence Assistant for Kathir Memorial Hospital.
Answer the physician's query thoroughly, clearly, and concisely using evidence-based clinical reasoning and the hospital context provided below.

Physician Query: "${query}"

Hospital Clinic Context:
${clinicContext}

Instructions:
- If asked about critical patients, list the critical patients with their ID, name, diagnosis, and abnormal values in a clean table or structured bullets with clinical priorities.
- If asked about drug interactions, detail the flagged combinations, severity, and clinical risk.
- If asked about lab trends (e.g. HbA1c, BP), explain the clinical implications and treatment targets.
- If asked a medical or pharmacology question, provide accurate clinical guidance.
- Format with bold headings, bullet points, and actionable next steps.
- Conclude with: "Physician clinical judgment required."`;

      try {
        const response = await client.chat.completions.create({
          model,
          temperature: 0.2,
          max_tokens: 1200,
          messages: [
            { role: 'system', content: 'You are an expert AI clinical doctor assistant. Provide structured, accurate medical analysis.' },
            { role: 'user', content: prompt },
          ],
        });

        return {
          patientId: 'all-patients',
          source: 'clinic_dataset',
          answer: response.choices?.[0]?.message?.content || '',
          rag_hits: [],
        };
      } catch (err) {
        if (!isGroqRateLimitError(err)) {
          console.warn('Groq clinic query error:', err.message);
        }
        return {
          patientId: 'all-patients',
          source: 'fallback',
          answer: `**Kathir Memorial Hospital — Clinical Overview**\n\n${clinicContext}\n\n*Physician clinical judgment required.*`,
          rag_hits: [],
        };
      }
    }
  } else if (explicitNameInQuery) {
    // Only switch context if the query explicitly specifies a DIFFERENT patient ID (e.g. P002)
    const explicitIdMatch = effectiveQuery.match(/\b([pP]\d{3,4})\b/);
    if (explicitIdMatch && explicitIdMatch[1].toUpperCase() !== effectivePatientId) {
      effectivePatientId = explicitIdMatch[1].toUpperCase();
    }
  }

  let client = null;
  try {
    const key = apiKey || process.env.GROQ_API_KEY;
    if (key) client = new Groq({ apiKey: key });
  } catch {
    client = null;
  }

  const { hits, bundle: firstBundle } = await ensureVectorContext(effectivePatientId, query);
  const bundle = firstBundle || (await getPatientContext(effectivePatientId));
  if (!bundle) return { error: `Patient ${effectivePatientId} not found in Mongo/dataset.` };

  if (!client) {
    return {
      success: true,
      patientId: effectivePatientId,
      source: bundle.source || 'dataset',
      response: buildFallbackSummaryFromBundle(bundle, 'Groq API Key not configured'),
      answer: buildFallbackSummaryFromBundle(bundle, 'Groq API Key not configured'),
      rag_hits: hits.slice(0, 5),
      fallback: true,
    };
  }

  const requestedWordCount = getRequestedWordCount(query);
  const detailed = wantsDetailedOutput(query) || Boolean(requestedWordCount);
  const lengthInstruction = requestedWordCount
    ? `Return a detailed consultation brief in approximately ${requestedWordCount} words.`
    : detailed
      ? 'Return 8 to 10 concise bullet points (detailed mode requested by user).'
      : 'Return 5 to 6 concise bullet points only (default short mode).';
  const formatInstruction = requestedWordCount
    ? `Use clean markdown formatting with bold section labels like **Key Issue**, **Medications**, **Abnormal Labs/Alerts**, **Next Steps**, and **Action Plan**.`
    : 'Use bullet points and keep labels bold when present (example: **Key Issue:**).';
  const maxTokens = requestedWordCount ? 2200 : 900;

  const context = buildContextText(bundle, hits);
  try {
    const response = await client.chat.completions.create({
      model,
      temperature: 0.3,
      max_tokens: maxTokens,
      messages: [
        {
          role: 'system',
          content: `You are ClinSight-AI, an expert clinical intelligence co-pilot assisting physicians at Kathir Memorial Hospital.

CLINICAL GROUNDING & SOURCE-CONSTRAINED DIRECTIVES:
1. PRIMARY EVIDENCE CONSTRAINT: Base all patient-specific statements strictly on the "PRIMARY RETRIEVED CLINICAL EVIDENCE" chunks provided in context.
2. NEVER INVENT FACTS: Do not invent lab results, dates, vital signs, dosages, or medications not present in the evidence.
3. TEMPORAL ACCURACY & NO SILENT SUBSTITUTION: If the user asks about a specific date:
   - If an exact record exists for that date, answer with that exact value and cite the date.
   - If NO record exists for that requested date, you MUST explicitly state that no record was found for that date.
   - You may cite the most recent or nearest historical result as context, but you MUST clearly label it as prior historical context (e.g., "No record found for [date]. The nearest available historical record is from [date]: [value]").
   - NEVER silently substitute a past date as if it answers the requested date.
4. PRESERVE SOURCE DATES & NUMERICAL VALUES: Quote exact numbers, reference ranges, and units (e.g., mg/dL, mmHg, mL/min) without rounding or modification.
5. DISTINGUISH SOURCE RECORD FROM CLINICAL INTERPRETATION: Clearly separate documented chart facts from physician guidance, clinical interpretations, or recommended next steps.
6. DATA QUALITY & INCONSISTENCY PRESERVATION: If a retrieved record contains a [DATA QUALITY WARNING] where the documented status contradicts the reference interval (e.g. status is "Normal" but value exceeds range):
   - Explicitly cite the documented status ("Documented status is Normal").
   - State the reference range comparison ("However, the value exceeds the reference range of [range]").
   - Preserve both source values transparently.
7. EXPLICIT UNAVAILABILITY: If requested information (e.g. a specific test, allergy, or clinical note) is absent from the patient file, state clearly that it is not available in the records.
8. AVOID UNSUPPORTED DIAGNOSES: Do not declare new or unconfirmed clinical diagnoses not present in the patient's medical history. Conclude actionable suggestions with: "Physician clinical review required."`,
        },
        {
          role: 'user',
          content: `Question: ${query}

Formatting requirements:
- ${lengthInstruction}
- Cover: key issues, meds, abnormal labs/alerts, and next steps.
- Keep each bullet specific and actionable.
- Avoid long paragraphs and avoid extra headings unless user asks.
- ${formatInstruction}

Context:
${context}`,
        },
      ],
    });

    const ans = response.choices?.[0]?.message?.content || '';
    return {
      success: true,
      patientId: effectivePatientId,
      source: bundle.source,
      answer: ans,
      response: ans,
      rag_hits: hits.slice(0, 5),
    };
  } catch (err) {
    if (!isGroqRateLimitError(err)) throw err;
    const retryAfter = extractRetryAfterText(err) || 'please retry shortly';
    const fallbackAns = buildFallbackAnswerFromBundle(bundle, query, retryAfter);
    return {
      success: true,
      patientId: effectivePatientId,
      source: 'fallback',
      fallback: true,
      answer: fallbackAns,
      response: fallbackAns,
      rag_hits: hits.slice(0, 5),
      limit_reason: retryAfter,
    };
  }
}

module.exports = { runRagPatientSummary, runRagDoctorQuery };
