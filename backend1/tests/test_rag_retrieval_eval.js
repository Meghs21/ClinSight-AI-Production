'use strict';

/**
 * test_rag_retrieval_eval.js
 * Comprehensive evaluation test suite for clinical RAG retrieval across:
 *   1. Exact match
 *   2. Missing date
 *   3. Similar historical record
 *   4. Lab query
 *   5. Medication query
 *   6. Visit query
 *   7. Patient profile query
 *   8. Cross-date trend query
 *   9. Data-quality inconsistency detection
 */

const { semanticSearch } = require('../rag/vectorStore');

async function runEvaluation() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║        CLINICAL RAG RETRIEVAL EVALUATION TEST SUITE                ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  const testCases = [
    {
      category: '1. Exact Date Match',
      description: 'Query for clinical findings on a specific recorded date',
      query: 'What were the findings on 2026-02-08?',
      patientId: 'P001',
      expectedSection: 'visit or lab',
      expectedDate: '2026-02-08',
      validate: (hits) => {
        const top = hits[0];
        return top && top.date === '2026-02-08';
      },
    },
    {
      category: '2. Missing Date Handling',
      description: 'Query for a date with no records (must not silently substitute)',
      query: 'What happened during the visit on 2024-05-29?',
      patientId: 'P001',
      expectedSection: 'visit',
      expectedDate: '2025-02-10 (nearest available labeled)',
      validate: (hits) => {
        const top = hits[0];
        return top && top.exactDateMatch === false && top.temporalNote && top.temporalNote.includes('2024-05-29');
      },
    },
    {
      category: '3. Historical Search',
      description: 'Query asking for records nearest to an unrecorded date',
      query: 'Show past records nearest to 2024-05-29',
      patientId: 'P001',
      expectedSection: 'visit',
      expectedDate: 'Sensible chronological proximity',
      validate: (hits) => {
        const top = hits[0];
        return top && top.temporalNote && top.date === '2025-02-10';
      },
    },
    {
      category: '4. Lab Query',
      description: 'Query for patient creatinine level without date',
      query: "What was the patient's creatinine level?",
      patientId: 'P001',
      expectedSection: 'lab',
      expectedDate: 'ANY',
      validate: (hits) => {
        const top = hits[0];
        return top && top.section === 'lab' && top.text.toLowerCase().includes('creatinine');
      },
    },
    {
      category: '5. Medication Query',
      description: 'Query for active medications filtering out OCR transcription chatter',
      query: 'What medications is the patient taking?',
      patientId: 'P001',
      expectedSection: 'medication',
      expectedDate: 'ANY',
      validate: (hits) => {
        const medHits = hits.filter((h) => h.section === 'medication');
        const hasValidMed = medHits.some((m) => m.text.toLowerCase().includes('metformin') || m.text.toLowerCase().includes('amlodipine'));
        const hasOcrChatter = medHits.some((m) => /your corrections are accurate/i.test(m.text));
        return medHits.length > 0 && hasValidMed && !hasOcrChatter;
      },
    },
    {
      category: '6. Visit Query',
      description: 'Query for clinical encounter notes, complaints, and physician observations',
      query: 'Why did the patient come in for their consultation?',
      patientId: 'P001',
      expectedSection: 'visit',
      expectedDate: 'ANY',
      validate: (hits) => {
        const visitHit = hits.find((h) => h.section === 'visit');
        return visitHit && (visitHit.text.includes('Symptoms') || visitHit.text.includes('Notes'));
      },
    },
    {
      category: '7. Patient Profile',
      description: "Query for patient's age, gender, diagnoses, and medical history",
      query: "What is the patient's age, gender, and medical history?",
      patientId: 'P001',
      expectedSection: 'patient_profile',
      expectedDate: 'PROFILE',
      validate: (hits) => {
        const top = hits[0];
        return top && top.section === 'patient_profile' && top.text.includes('age 58') && top.text.includes('Male');
      },
    },
    {
      category: '8. Trend Query',
      description: 'Longitudinal trend query requesting blood pressure and creatinine over time',
      query: 'Show the trend of blood pressure and creatinine over time',
      patientId: 'P001',
      expectedSection: 'lab',
      expectedDate: 'Multi-date chronological sequence',
      validate: (hits) => {
        const labHits = hits.filter((h) => h.section === 'lab');
        const dates = labHits.map((h) => h.date);
        const isSorted = dates.every((d, i) => i === 0 || new Date(d) >= new Date(dates[i - 1]));
        return labHits.length >= 3 && isSorted;
      },
    },
    {
      category: '9. Data Inconsistency',
      description: 'P051 Creatinine 1.69 mg/dL outside 0.7-1.3 ref range with status "Normal"',
      query: 'What was the creatinine level for patient P051 on 2024-05-29?',
      patientId: 'P051',
      expectedSection: 'lab',
      expectedDate: '2024-05-29',
      validate: (hits) => {
        const top = hits[0];
        return (
          top &&
          top.date === '2024-05-29' &&
          top.text.includes('1.69') &&
          top.data_quality_warning &&
          top.data_quality_warning.includes('above the recorded reference range')
        );
      },
    },
  ];

  let passedCount = 0;

  for (const tc of testCases) {
    console.log(`────────────────────────────────────────────────────────────────────`);
    console.log(`▶ TEST CASE: ${tc.category}`);
    console.log(`  Description : ${tc.description}`);
    console.log(`  Query       : "${tc.query}"`);
    console.log(`  Patient ID  : ${tc.patientId}`);

    const hits = await semanticSearch(tc.query, tc.patientId, 5);
    const passed = tc.validate(hits);

    if (passed) passedCount++;

    console.log(`  Status      : ${passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`  Top Chunks Retrieved (${hits.length} total):`);

    hits.slice(0, 3).forEach((h, i) => {
      console.log(`    [#${i + 1}] Section: ${h.section} | Date: ${h.date} | Score: ${h.score.toFixed(3)}`);
      console.log(`        Content: ${(h.text || '').replace(/\s+/g, ' ').substring(0, 100)}...`);
      if (h.temporalNote) {
        console.log(`        ⚠️ Temporal Note: ${h.temporalNote}`);
      }
      if (h.data_quality_warning) {
        console.log(`        ⚠️ Data Quality Warning: ${h.data_quality_warning}`);
      }
    });
    console.log('');
  }

  console.log('════════════════════════════════════════════════════════════════════');
  console.log(`EVALUATION SUMMARY: ${passedCount} / ${testCases.length} TESTS PASSED`);
  console.log('════════════════════════════════════════════════════════════════════\n');

  return { passedCount, total: testCases.length };
}

if (require.main === module) {
  runEvaluation().then((res) => {
    process.exit(res.passedCount === res.total ? 0 : 1);
  });
}

module.exports = { runEvaluation };
