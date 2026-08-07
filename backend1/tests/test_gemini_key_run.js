const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { validate_drug_with_nih_rxnorm } = require('../tools/patientTools');

async function testGeminiVisionDirectRun() {
  console.log('====================================================');
  console.log('🧪 DIRECT MULTIMODAL GEMINI VISION API EXECUTION');
  console.log('====================================================\n');

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    console.log('⚠️ GEMINI_API_KEY is missing from backend1/.env.');
    console.log('To run Gemini Vision directly on image bytes, please add GEMINI_API_KEY=AIzaSy... to backend1/.env.');
    return;
  }

  const uploadsDir = path.join(__dirname, '../uploads');
  const files = fs.readdirSync(uploadsDir).filter((f) => /gbfhjd|sle|rx/i.test(f) || /\.(jpeg|jpg|png)$/i.test(f));

  if (files.length === 0) {
    console.error('❌ No image files in uploads/');
    return;
  }

  const imagePath = path.join(uploadsDir, files[0]);
  console.log(`🖼️ Ingesting image bytes directly: ${files[0]} (${fs.statSync(imagePath).size} bytes)`);

  const ext = path.extname(imagePath).toLowerCase();
  let mimeType = 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';

  const fileBuffer = fs.readFileSync(imagePath);
  const base64Data = fileBuffer.toString('base64');

  const genAI = new GoogleGenerativeAI(geminiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const prompt = `You are an expert clinical vision OCR engine.
Read this handwritten doctor prescription image directly.
Extract:
1. Patient Diagnosis
2. Prescribed Medications (Name, Dosage, Frequency, Schedule)

Return JSON format:
{
  "diagnosis": ["string"],
  "medications": ["string"]
}`;

  console.log('📡 Sending base64 image bytes directly to gemini-1.5-flash (bypassing Tesseract)...');
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
  console.log('👁️ GEMINI VISION DIRECT MULTIMODAL OUTPUT:');
  console.log('====================================================');
  console.log(rawText);

  // RxNorm Validation on extracted medications
  console.log('\n====================================================');
  console.log('📋 RXNORM VALIDATION ON GEMINI VISION MEDICATIONS:');
  console.log('====================================================');
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      for (const med of parsed.medications || []) {
        const rxRes = await validate_drug_with_nih_rxnorm(med);
        console.log(`💊 Medication: "${med}" -> RxNorm Verified: ${rxRes.verified ? '✅ YES (' + rxRes.rxcui + ')' : '❌ NO (' + rxRes.error + ')'}`);
      }
    }
  } catch (err) {
    console.error('JSON parse error:', err.message);
  }
}

testGeminiVisionDirectRun();
