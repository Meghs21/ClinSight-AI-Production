require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const path = require('path');
const fs = require('fs');
const { processUploadedDocument } = require('../agents/ocrAgent');

async function testLiveGeminiRouting() {
  console.log('====================================================');
  console.log('🧪 TESTING LIVE GEMINI 3.6 FLASH ROUTING ON UPLOADED IMAGE');
  console.log('====================================================\n');

  const uploadsDir = path.join(__dirname, '../uploads');
  const files = fs.readdirSync(uploadsDir).filter((f) => /gbfhjd|sle|rx/i.test(f) || /\.(jpeg|jpg|png)$/i.test(f));

  if (files.length === 0) {
    console.error('❌ No uploaded prescription image found in backend1/uploads/');
    return;
  }

  const targetImage = path.join(uploadsDir, files[0]);
  console.log(`🖼️ Ingesting image: ${files[0]}`);

  const res = await processUploadedDocument(targetImage);

  console.log('\n====================================================');
  console.log('👁️ EXTRACTED PROVIDER & PAYLOAD:');
  console.log('====================================================');
  console.log('🤖 Provider Name:', res.parser);
  console.log('🩺 Extracted Diagnosis:', JSON.stringify(res.structured?.diagnosis));
  console.log('💊 Extracted Medications:', JSON.stringify(res.structured?.medications, null, 2));
  console.log('====================================================');
}

testLiveGeminiRouting();
