const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { validate_drug_with_nih_rxnorm } = require('../tools/patientTools');

async function testGeminiVisionPrescriptionRun(geminiApiKey) {
  console.log('====================================================');
  console.log('🧪 DIRECT GEMINI MULTIMODAL VISION OCR ON PRESCRIPTION IMAGE');
  console.log('====================================================\n');

  if (!geminiApiKey) {
    console.log('⚠️ GEMINI_API_KEY is required to execute multimodal image reading.');
    console.log('Gemini 1.5 Flash natively accepts raw image bytes (Base64) with 0 Tesseract garbling.');
    return;
  }

  const uploadsDir = path.join(__dirname, '../uploads');
  const files = fs.readdirSync(uploadsDir).filter((f) => /gbfhjd|sle|rx/i.test(f) || /\.(jpeg|jpg|png)$/i.test(f));

  if (files.length === 0) {
    console.error('❌ No image files in uploads/');
    return;
  }

  const imagePath = path.join(uploadsDir, files[0]);
  console.log(`🖼️ Ingesting raw image bytes directly: ${files[0]} (${fs.statSync(imagePath).size} bytes)`);

  const ext = path.extname(imagePath).toLowerCase();
  let mimeType = 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';

  const fileBuffer = fs.readFileSync(imagePath);
  const base64Data = fileBuffer.toString('base64');

  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `You are an expert clinical vision OCR engine.
Read this handwritten doctor prescription image directly.
Extract:
1. Patient Diagnosis
2. Prescribed Medications (Name, Dosage, Frequency, Schedule)

Return JSON format ONLY:
{
  "diagnosis": ["string"],
  "medications": ["string"]
}`;

  console.log('📡 Streaming base64 image bytes directly into gemini-1.5-flash (bypassing Tesseract 100%)...');

  try {
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64Data,
          mimeType,
        },
      },
    ]);

    const rawText = result.response?.text?.() || '';
    console.log('\n====================================================');
    console.log('👁️ GEMINI VISION RAW EXTRACTED PAYLOAD:');
    console.log('====================================================');
    console.log(rawText);

    console.log('\n====================================================');
    console.log('📋 RXNORM VALIDATION RESULTS:');
    console.log('====================================================');
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log('🩺 Diagnosis:', JSON.stringify(parsed.diagnosis));
      for (const med of parsed.medications || []) {
        const rxRes = await validate_drug_with_nih_rxnorm(med);
        console.log(`💊 Medication: "${med}" -> RxNorm Verified: ${rxRes.verified ? '✅ YES (' + (rxRes.rxcui || rxRes.genericName) + ')' : '❌ NO (' + rxRes.error + ')'}`);
      }
    }
  } catch (err) {
    console.error('❌ Gemini Vision call failed:', err.message);
  }
}

// Pass key from argument or process.env
const key = process.argv[2] || process.env.GEMINI_API_KEY;
testGeminiVisionPrescriptionRun(key);
