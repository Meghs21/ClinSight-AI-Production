const path = require('path');
const fs = require('fs');
const { processUploadedDocument } = require('../agents/ocrAgent');

async function testPipeline() {
  console.log('====================================================');
  console.log('🧪 TEST CASE 1: VALID CLINICAL REPORT');
  console.log('====================================================\n');

  const file1 = path.join(__dirname, '../uploads/test_valid.txt');
  fs.writeFileSync(
    file1,
    `Kathir Memorial Hospital - Clinical Evaluation
    Date: 2026-02-12
    Patient: Rajan Subramaniam
    Rx: Metformin 1000mg BD, Amlodipine 5mg OD
    Lab Results:
    HbA1c: 9.4%
    Serum Creatinine: 2.1 mg/dL
    Diagnosis: Type II Diabetes Mellitus`
  );

  const res1 = await processUploadedDocument(file1);
  console.log(`✅ Document Category: ${res1.document_category}`);
  console.log(`✅ Extracted HbA1c: ${res1.structured.lab_results.HbA1c}%`);
  console.log(`✅ Extracted Creatinine: ${res1.structured.lab_results.SerumCreatinine} mg/dL`);
  console.log(`✅ Range Violations Count: ${res1.validation_violations.length}`);
  console.log(`✅ Requires Human Review: ${res1.requires_human_review}\n`);

  console.log('====================================================');
  console.log('🧪 TEST CASE 2: OUT-OF-RANGE IMPOSSIBLE VALUE ALERT');
  console.log('====================================================\n');

  const file2 = path.join(__dirname, '../uploads/test_invalid.txt');
  fs.writeFileSync(
    file2,
    `Kathir Memorial Hospital - Clinical Evaluation
    Date: 2026-02-12
    Patient: Rajan Subramaniam
    Lab Results:
    HbA1c: 94%
    Serum Creatinine: 45 mg/dL`
  );

  const res2 = await processUploadedDocument(file2);
  console.log(`⚠️ Document Category: ${res2.document_category}`);
  console.log(`⚠️ Extracted HbA1c: ${res2.structured.lab_results.HbA1c}%`);
  console.log(`⚠️ Range Violations Found:`, res2.validation_violations);
  console.log(`⚠️ Requires Human Review Triggered: ${res2.requires_human_review}\n`);

  // Cleanup
  if (fs.existsSync(file1)) fs.unlinkSync(file1);
  if (fs.existsSync(file2)) fs.unlinkSync(file2);
}

testPipeline();
