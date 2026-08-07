const path = require('path');
const fs = require('fs');
const { processUploadedDocument } = require('../agents/ocrAgent');

async function testUnseenHandwrittenRx() {
  console.log('====================================================');
  console.log('🧪 TESTING GENERALIZED OCR EXTRACTION ON BRAND NEW UNSEEN RX');
  console.log('====================================================\n');

  // Test Case: Completely new handwritten doctor note text
  const unseenRxPath = path.join(__dirname, 'unseen_rx_sample.txt');
  fs.writeFileSync(
    unseenRxPath,
    `Diagnosis: Rheumatoid Arthritis
Tab. Methotrexate 10mg once per week (Monday)
Tab. Ecosprin 75mg once daily at night
Tab. Pantocid 40mg once daily before breakfast
Tab. Dolo 650mg as needed for fever`
  );

  console.log('📡 Processing unseen handwritten prescription...');
  const res = await processUploadedDocument(unseenRxPath);

  console.log('\n📄 UNTRUNCATED EXTRACTED STRUCTURED PAYLOAD:');
  console.log(JSON.stringify(res.structured, null, 2));

  console.log('\n====================================================');
  console.log('🔍 GENERALIZATION VERIFICATION CHECKS:');
  console.log('====================================================');
  console.log('🩺 Extracted Diagnosis:', JSON.stringify(res.structured?.diagnosis));
  console.log('💊 Extracted Medications:', JSON.stringify(res.structured?.medications, null, 2));
  console.log('🛡️ Requires Human Review:', res.requires_human_review);
  console.log('📊 Confidence Summary:', res.confidence_summary);
  console.log('⚠️ Weekly Dosing Violation Detected:', res.weekly_dosing_violation, '(Expected: false)');
  console.log('📋 Drug Validation:', JSON.stringify(res.drug_validation, null, 2));
}

testUnseenHandwrittenRx();
