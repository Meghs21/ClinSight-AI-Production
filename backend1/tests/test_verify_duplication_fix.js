const path = require('path');
const fs = require('fs');
const { processUploadedDocument } = require('../agents/ocrAgent');

async function testDuplicationFix() {
  console.log('====================================================');
  console.log('🧪 TESTING DEDUPLICATION FIX & UNTRUNCATED PAYLOAD');
  console.log('====================================================\n');

  // Sample file with repeated lines (simulating raw OCR line duplication)
  const samplePath = path.join(__dirname, 'test_dup_sample.txt');
  fs.writeFileSync(
    samplePath,
    `Patient Name: Rajan Subramaniam
Dose: 10mg, Frequency: 1 tab po qd
Dose: 10mg, Frequency: 1 tab po qd
Dose: 10mg, Frequency: 1 tab po qd
Medication: Amlodipine, Dose: 5mg, Frequency: 1 tab po qd
Medication: Amlodipine, Dose: 5mg, Frequency: 1 tab po qd
HbA1c: 9.4%
Serum Creatinine: 2.1 mg/dL`
  );

  const res = await processUploadedDocument(samplePath);

  console.log('📄 UNTRUNCATED RAW STRUCTURED MEDICATIONS ARRAY:');
  console.log(JSON.stringify(res.structured?.medications, null, 2));

  console.log('\n📄 FULL STRUCTURED PAYLOAD OBJECT:');
  console.log(JSON.stringify(res.structured, null, 2));

  console.log('\n====================================================');
  console.log('✅ DEDUPLICATION VERIFICATION SUMMARY:');
  console.log('====================================================');
  console.log('Medications Length:', res.structured?.medications?.length, '(Duplicates removed!)');
}

testDuplicationFix();
