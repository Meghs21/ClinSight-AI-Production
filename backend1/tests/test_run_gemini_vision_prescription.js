require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const path = require('path');
const fs = require('fs');
const { processUploadedDocument } = require('../agents/ocrAgent');
const { GeminiVisionProvider } = require('../ocr/ocrProvider');

async function testRunGeminiVisionPrescription() {
  console.log('====================================================');
  console.log('🧪 RUNNING REAL HANDWRITTEN PRESCRIPTION IMAGE VIA GEMINI VISION');
  console.log('====================================================\n');

  // Find gbfhjd.jpeg or uploaded prescription image in uploads/
  const uploadsDir = path.join(__dirname, '../uploads');
  const files = fs.readdirSync(uploadsDir).filter((f) => /gbfhjd|sle|rx/i.test(f) || /\.(jpeg|jpg|png)$/i.test(f));

  if (files.length === 0) {
    console.error('❌ No uploaded prescription image found in backend1/uploads/');
    return;
  }

  const targetImage = path.join(uploadsDir, files[0]);
  console.log(`🖼️ Target Image File: ${files[0]} (${fs.statSync(targetImage).size} bytes)`);

  // Set OCR_PROVIDER=gemini environment variable
  process.env.OCR_PROVIDER = 'gemini';

  console.log('📡 Dispatching raw image bytes directly to GeminiVisionProvider (bypassing Tesseract)...');

  try {
    const res = await processUploadedDocument(targetImage);

    console.log('\n====================================================');
    console.log('👁️ GEMINI VISION RAW EXTRACTED STRUCTURED PAYLOAD:');
    console.log('====================================================');
    console.log(JSON.stringify(res, null, 2));

    console.log('\n====================================================');
    console.log('🩺 Extracted Diagnosis:', JSON.stringify(res.structured?.diagnosis));
    console.log('💊 Extracted Medications:', JSON.stringify(res.structured?.medications, null, 2));
    console.log('🛡️ Requires Human Review:', res.requires_human_review);
    console.log('📊 Confidence Summary:', JSON.stringify(res.confidence_summary, null, 2));
    console.log('📋 RxNorm Drug Validation:', JSON.stringify(res.drug_validation, null, 2));
    console.log('====================================================');
  } catch (err) {
    console.error('❌ Processing failed:', err.message);
  }
}

testRunGeminiVisionPrescription();
