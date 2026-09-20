'use strict';
const http = require('http');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { signToken } = require('../middleware/authMiddleware');

const authToken = signToken({ id: 'test-doctor', role: 'doctor', name: 'Dr. Test' });

function postQuery(payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request('http://localhost:4000/api/agent/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Authorization': `Bearer ${authToken}`,
      },
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve({ raw: body, error: e.message });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('TEST 1: Exact Date Query (February 8 2026)');
  console.log('================================================================');
  const t1 = await postQuery({
    patientId: 'P001',
    query: "What was the patient's creatinine level on February 8 2026?",
  });
  console.log('Answer:\n' + t1.answer);
  console.log('\nSource:', t1.source);
  console.log('RAG Hits Count:', t1.rag_hits ? t1.rag_hits.length : 0);
  (t1.rag_hits || []).forEach((h, i) => {
    console.log(`  [#${i + 1}] Section: ${h.section} | Date: ${h.date} | Score: ${h.score}`);
    console.log(`      Text: ${h.text}`);
  });

  console.log('\n================================================================');
  console.log('TEST 2: Missing Date Query (2024-05-29)');
  console.log('================================================================');
  const t2 = await postQuery({
    patientId: 'P001',
    query: "What was the patient's creatinine level on 2024-05-29?",
  });
  console.log('Answer:\n' + t2.answer);
  console.log('\nSource:', t2.source);
  console.log('RAG Hits Count:', t2.rag_hits ? t2.rag_hits.length : 0);
  (t2.rag_hits || []).forEach((h, i) => {
    console.log(`  [#${i + 1}] Section: ${h.section} | Date: ${h.date} | Score: ${h.score}`);
    console.log(`      Text: ${h.text}`);
    if (h.temporalNote) console.log(`      ⚠️ Temporal Note: ${h.temporalNote}`);
  });

  console.log('\n================================================================');
  console.log('TEST 3: Medication & Drug Interaction Query');
  console.log('================================================================');
  const t3 = await postQuery({
    patientId: 'P001',
    query: "What medications is the patient currently taking?",
  });
  console.log('Answer:\n' + t3.answer);
  console.log('Top RAG Hits:');
  (t3.rag_hits || []).slice(0, 2).forEach((h, i) => {
    console.log(`  [#${i + 1}] Section: ${h.section} | Date: ${h.date} | Score: ${h.score} | Text: ${h.text}`);
  });

  console.log('\n================================================================');
  console.log('TEST 4: Longitudinal Trend Query (HbA1c & Creatinine)');
  console.log('================================================================');
  const t4 = await postQuery({
    patientId: 'P001',
    query: "Show the trend of blood pressure and creatinine over time",
  });
  console.log('Answer:\n' + t4.answer);
  console.log('Chronological RAG Sequence:');
  (t4.rag_hits || []).forEach((h, i) => {
    console.log(`  [#${i + 1}] Date: ${h.date} | Score: ${h.score} | Text: ${h.text}`);
  });

  console.log('\n================================================================');
  console.log('TEST 5: Clinical Encounter & Assessment on 2026-02-08');
  console.log('================================================================');
  const t5 = await postQuery({
    patientId: 'P001',
    query: "What were the doctor's assessment and plan on 2026-02-08?",
  });
  console.log('Answer:\n' + t5.answer);
  console.log('Top RAG Hit:');
  if (t5.rag_hits?.[0]) {
    console.log(`  Section: ${t5.rag_hits[0].section} | Date: ${t5.rag_hits[0].date} | Score: ${t5.rag_hits[0].score}`);
    console.log(`  Text: ${t5.rag_hits[0].text}`);
  }

  console.log('\n================================================================');
  console.log('TEST 6: Allergy & Demographics Safety Query');
  console.log('================================================================');
  const t6 = await postQuery({
    patientId: 'P001',
    query: "Does the patient have any recorded allergies before prescribing antibiotics?",
  });
  console.log('Answer:\n' + t6.answer);

  console.log('\n================================================================');
  console.log('TEST 7: Data Inconsistency Handling (Patient P051)');
  console.log('================================================================');
  const t7 = await postQuery({
    patientId: 'P051',
    query: "What was the creatinine result for patient P051 on 2024-05-29?",
  });
  console.log('Answer:\n' + t7.answer);
  if (t7.rag_hits?.[0]) {
    console.log(`  Top Hit Section: ${t7.rag_hits[0].section} | Date: ${t7.rag_hits[0].date}`);
    console.log(`  Top Hit Warning: ${t7.rag_hits[0].data_quality_warning}`);
  }
}

runTests().catch(console.error);
