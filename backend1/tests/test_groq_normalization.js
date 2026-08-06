const path = require('path');
const fs = require('fs');
const { processUploadedDocument } = require('../agents/ocrAgent');

async function testGroqNormalization() {
  console.log('====================================================');
  console.log('🧪 TESTING GROQ NORMALIZATION ON HANDWRITTEN OCR TEXT');
  console.log('====================================================\n');

  const filePath = path.join(__dirname, 'test_handwritten_raw.txt');
  fs.writeFileSync(
    filePath,
    `Patient: Armando Cegria
Rx: 39 cap 3x a day x 7 days
Diagnosis: Sinusitis`
  );

  const res = await processUploadedDocument(filePath);

  console.log('📄 UNTRUNCATED EXTRACTED STRUCTURED PAYLOAD:');
  console.log(JSON.stringify(res.structured, null, 2));

  console.log('\n====================================================');
  console.log('💊 Extracted Medications:', JSON.stringify(res.structured?.medications));
  console.log('🩺 Extracted Diagnosis:', JSON.stringify(res.structured?.diagnosis));
}

testGroqNormalization();
