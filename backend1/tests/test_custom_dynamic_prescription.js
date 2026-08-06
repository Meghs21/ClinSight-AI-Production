const path = require('path');
const fs = require('fs');
const { processUploadedDocument } = require('../agents/ocrAgent');

async function testCustomDynamicPrescription() {
  console.log('====================================================');
  console.log('🧪 TESTING DYNAMIC OCR EXTRACTION FOR "AZITHROMYCIN"');
  console.log('====================================================\n');

  // Create a completely new, unique prescription file
  const customFilePath = path.join(__dirname, 'custom_rx_test.txt');
  fs.writeFileSync(
    customFilePath,
    `Patient Name: Meenakshi Pillai
Rx: Tab. Azithromycin 250mg OD x 5 days
Diagnosis: Community Acquired Pneumonia`
  );

  const res = await processUploadedDocument(customFilePath);

  console.log('📄 RAW UNTRUNCATED EXTRACTED OUTPUT:');
  console.log(JSON.stringify(res.structured, null, 2));

  console.log('\n====================================================');
  console.log('🔍 VERIFICATION CHECKS:');
  console.log('====================================================');
  console.log('👤 Patient Name:', res.structured?.patient_name);
  console.log('💊 Medications:', JSON.stringify(res.structured?.medications));
  console.log('🩺 Diagnosis:', JSON.stringify(res.structured?.diagnosis));
  console.log('====================================================');
}

testCustomDynamicPrescription();
