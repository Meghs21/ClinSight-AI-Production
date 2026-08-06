const path = require('path');
const fs = require('fs');
const { processUploadedDocument } = require('../agents/ocrAgent');
const { wrapDocumentPayloadWithProvenance } = require('../ocr/provenanceEngine');

async function runTests() {
  console.log('====================================================');
  console.log('🧪 TEST 1: COMMENTARY GUARDRAIL 3-CASE TEST');
  console.log('====================================================\n');

  // Case (a): Real LLM commentary leak
  const leakPayload = wrapDocumentPayloadWithProvenance({
    patient_name: 'Test Patient',
    medications: 'Lipitor 20mg. Your corrections are accurate and clean medical text provided is clear.',
    diagnosis: 'Diabetes Mellitus'
  });
  console.log('📌 Case (a) [Real LLM Commentary Leak]:');
  console.log('   Input:', 'Lipitor 20mg. Your corrections are accurate...');
  console.log('   Requires Human Review:', leakPayload.requires_human_review, '(Expected: true)');
  console.log('   Overall Confidence:', leakPayload.confidence_summary.overall_confidence, '% (Expected: 40%)\n');

  // Case (b): Legitimate clinical note with "recommend"
  const recommendPayload = wrapDocumentPayloadWithProvenance({
    patient_name: 'Test Patient',
    medications: 'Metformin 1000mg',
    diagnosis: 'Diabetic Nephropathy. Recommend follow-up in 3 months.'
  });
  console.log('📌 Case (b) [Legitimate note with "recommend"]');
  console.log('   Input:', 'Diabetic Nephropathy. Recommend follow-up in 3 months.');
  console.log('   Requires Human Review:', recommendPayload.requires_human_review, '(Expected: false)');
  console.log('   Overall Confidence:', recommendPayload.confidence_summary.overall_confidence, '% (Expected: 95%)\n');

  // Case (c): Legitimate note mentioning "transcription"
  const transcriptionPayload = wrapDocumentPayloadWithProvenance({
    patient_name: 'Test Patient',
    medications: 'Amlodipine 5mg',
    diagnosis: 'Voice transcription of patient medical history on file'
  });
  console.log('📌 Case (c) [Legitimate note with "transcription"]');
  console.log('   Input:', 'Voice transcription of patient medical history on file');
  console.log('   Requires Human Review:', transcriptionPayload.requires_human_review, '(Expected: false)');
  console.log('   Overall Confidence:', transcriptionPayload.confidence_summary.overall_confidence, '% (Expected: 95%)\n');

  console.log('====================================================');
  console.log('🧪 TEST 2: FULL RAW STRUCTURED OUTPUT & LAB SEPARATION');
  console.log('====================================================\n');

  const testFile = path.join(__dirname, 'test_sample.txt');
  fs.writeFileSync(
    testFile,
    `Patient Name: Rajan Subramaniam
Rx: Lipitor 20mg PO QD
HbA1c: 9.4%
Serum Creatinine: 2.1 mg/dL`
  );

  const docResult = await processUploadedDocument(testFile);

  console.log('📄 FULL RAW STRUCTURED PAYLOAD OBJECT:');
  console.log(JSON.stringify(docResult, null, 2));

  console.log('\n====================================================');
  console.log('🔍 LAB VS MEDICATION FIELD SEPARATION VERIFICATION:');
  console.log('====================================================');
  console.log('💊 Medications Array:', JSON.stringify(docResult.structured?.medications));
  console.log('🧪 Lab Results Object:', JSON.stringify(docResult.structured?.lab_results));
}

runTests();
