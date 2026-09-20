'use strict';
const http = require('http');

function postQuery(query) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ patientId: 'P001', query });
    const req = http.request({
      hostname: 'localhost',
      port: 4000,
      path: '/api/agent/query',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve({ raw: data }); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function run() {
  console.log('================================================================');
  console.log('DEMO 1: What was the patient creatinine level on February 8 2026?');
  console.log('================================================================');
  const q1 = await postQuery("What was the patient's creatinine level on February 8 2026?");
  console.log('\n[ANSWER]');
  console.log(q1.answer);
  console.log('\n[SOURCES / RETRIEVED EVIDENCE]');
  (q1.rag_hits || []).forEach((h, i) => {
    console.log('  Hit [' + (i+1) + '] ' + h.section.toUpperCase() + ' - ' + h.date + ' (Score: ' + (h.score * 100).toFixed(1) + '%)');
    console.log('    Excerpt: ' + h.text.replace(/\s+/g, ' ').slice(0, 100) + '...');
  });

  console.log('\n================================================================');
  console.log('DEMO 2: What was the patient creatinine level on 2024-05-29?');
  console.log('================================================================');
  const q2 = await postQuery("What was the patient's creatinine level on 2024-05-29?");
  console.log('\n[ANSWER]');
  console.log(q2.answer);
  console.log('\n[SOURCES / RETRIEVED EVIDENCE]');
  (q2.rag_hits || []).forEach((h, i) => {
    console.log('  Hit [' + (i+1) + '] ' + h.section.toUpperCase() + ' - ' + h.date + ' (Score: ' + (h.score * 100).toFixed(1) + '%)');
    if (h.data_quality_warning) {
      console.log('    WARNING: ' + h.data_quality_warning);
    }
    console.log('    Excerpt: ' + h.text.replace(/\s+/g, ' ').slice(0, 100) + '...');
  });
}

run().catch(console.error);
