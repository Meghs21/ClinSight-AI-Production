const { semanticSearch } = require('../rag/vectorStore');

async function testCurrent() {
  const queries = [
    { q: "What was the patient's creatinine level?", pid: "P001" },
    { q: "What was the patient's creatinine level on 2024-05-29?", pid: "P001" },
    { q: "What was the patient's creatinine level on February 8 2026?", pid: "P001" }
  ];

  for (const { q, pid } of queries) {
    console.log('==================================================');
    console.log('QUERY:', q);
    console.log('PATIENT_ID:', pid);
    const hits = await semanticSearch(q, pid, 3);
    console.log('HITS RETURNED:', hits.length);
    hits.forEach((h, i) => {
      console.log(`  [Hit ${i + 1}]`);
      console.log(`    Section : ${h.section || 'visit (implicit)'}`);
      console.log(`    Date    : ${h.date}`);
      console.log(`    Patient : ${h.patientId}`);
      console.log(`    Score   : ${typeof h.score === 'number' ? h.score.toFixed(4) : h.score}`);
      console.log(`    Content : ${(h.text || '').replace(/\s+/g, ' ').substring(0, 140)}...`);
    });
  }
}

testCurrent();
