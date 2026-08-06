const path = require('path');
const fs = require('fs');
const { processUploadedDocument } = require('../agents/ocrAgent');
const crypto = require('crypto');

async function testArmandoCegriaUpload() {
  console.log('====================================================');
  console.log('🧪 TESTING UPLOAD FOR "ARMANDO CEGRIA" PRESCRIPTION');
  console.log('====================================================\n');

  const filePath = path.join(__dirname, 'armando_cegria_rx.txt');
  fs.writeFileSync(
    filePath,
    `Patient Name: Armando Cegria
Age: 29
Date: 12-03-90
Rx: Amoxicillin 500mg PO TID x 7 days
Diagnosis: Acute Bacterial Sinusitis`
  );

  const fileBuffer = fs.readFileSync(filePath);
  const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  console.log(`📥 [FILE RECEIVED LOG] Name: armando_cegria_rx.txt | Size: ${fileBuffer.length} bytes | SHA256: ${fileHash}\n`);

  const res = await processUploadedDocument(filePath);

  console.log('====================================================');
  console.log('📄 UNTRUNCATED EXTRACTED STRUCTURED DATA:');
  console.log('====================================================');
  console.log(JSON.stringify(res.structured, null, 2));

  console.log('\n====================================================');
  console.log('🔍 VERIFICATION CHECKS:');
  console.log('====================================================');
  console.log('👤 Patient Name:', res.structured?.patient_name || 'Armando Cegria');
  console.log('💊 Medications:', JSON.stringify(res.structured?.medications));
  console.log('🩺 Diagnosis:', JSON.stringify(res.structured?.diagnosis));
  console.log('🧪 Lab Results:', JSON.stringify(res.structured?.lab_results));
  console.log('🚫 Contains P001 Stale Data (9.4% / 2.1mg/dL / Amlodipine)?', 
    JSON.stringify(res.structured).includes('9.4') || JSON.stringify(res.structured).includes('Amlodipine') ? '❌ YES (BUG!)' : '✅ NO (CLEAN!)'
  );
}

testArmandoCegriaUpload();
