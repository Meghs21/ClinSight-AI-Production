const path = require('path');
const fs = require('fs');
const { processUploadedDocument } = require('../agents/ocrAgent');

async function testRxNormHallucinationGuardrail() {
  console.log('====================================================');
  console.log('🧪 TESTING RXNORM HALLUCINATION GUARDRAIL & SLE DIAGNOSIS');
  console.log('====================================================\n');

  // Test Case 1: Complex Prescription with Real Regional Brands & SLE Diagnosis
  const realRxPath = path.join(__dirname, 'sle_scleroderma_rx.txt');
  fs.writeFileSync(
    realRxPath,
    `Diagnosis: SLE with Scleroderma
Tab. HCQS 200mg one daily at night
Tab. Folitrax 15mg once per week
Tab. Folvite 5mg twice per week
Rablet-D one daily before breakfast
Cap. D-logy one every month
Tab. Wysolone 5mg once daily`
  );

  console.log('📡 Case 1: Processing Real Complex Prescription ("SLE with Scleroderma")...');
  const res1 = await processUploadedDocument(realRxPath);

  console.log('🩺 Extracted Diagnosis:', JSON.stringify(res1.structured?.diagnosis));
  console.log('💊 Extracted Medications:', JSON.stringify(res1.structured?.medications, null, 2));
  console.log('🛡️ Requires Human Review:', res1.requires_human_review);
  console.log('📊 Confidence Summary:', res1.confidence_summary);
  console.log('📋 Drug Validation:', JSON.stringify(res1.drug_validation, null, 2));

  console.log('\n----------------------------------------------------');

  // Test Case 2: Hallucinated Fake Drug Names ("Sedroclun", "Sectoseleg")
  const fakeRxPath = path.join(__dirname, 'hallucinated_rx.txt');
  fs.writeFileSync(
    fakeRxPath,
    `Diagnosis: Unknown
Tab. Sedroclun 50mg
Cap. Sectoseleg 10mg`
  );

  console.log('📡 Case 2: Processing Hallucinated Prescription ("Sedroclun", "Sectoseleg")...');
  const res2 = await processUploadedDocument(fakeRxPath);

  console.log('💊 Extracted Medications:', JSON.stringify(res2.structured?.medications));
  console.log('⚠️ Unrecognized Drug Detected:', res2.unrecognized_drug_detected, '(Expected: true)');
  console.log('🛡️ Requires Human Review:', res2.requires_human_review, '(Expected: true)');
  console.log('📊 Medication Confidence:', res2.confidence_summary?.medication_confidence, '% (Expected: 40%)');
  console.log('📋 Drug Validation Details:', JSON.stringify(res2.drug_validation, null, 2));
}

testRxNormHallucinationGuardrail();
