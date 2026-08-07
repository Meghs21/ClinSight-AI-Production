require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');
const { validate_drug_with_nih_rxnorm } = require('../tools/patientTools');

async function testGoogleGenAISDK() {
  console.log('====================================================');
  console.log('🧪 TESTING OFFICIAL @google/genai SDK ON IMAGE BYTES');
  console.log('====================================================\n');

  const apiKey = process.env.GEMINI_API_KEY;
  console.log(`🔑 Key Present: ${apiKey ? apiKey.slice(0, 10) + '...' : 'NO'}`);

  const uploadsDir = path.join(__dirname, '../uploads');
  const files = fs.readdirSync(uploadsDir).filter((f) => /gbfhjd|sle|rx/i.test(f) || /\.(jpeg|jpg|png)$/i.test(f));
  const imagePath = path.join(uploadsDir, files[0]);
  const ext = path.extname(imagePath).toLowerCase();
  let mimeType = 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
  const base64Data = fs.readFileSync(imagePath).toString('base64');

  const ai = new GoogleGenAI({ apiKey });

  const modelsToTest = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

  for (const modelName of modelsToTest) {
    console.log(`\n📡 Testing @google/genai SDK with model "${modelName}"...`);
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          'You are an expert clinical vision OCR engine. Read this handwritten doctor prescription image directly. Transcribe Patient Diagnosis and Prescribed Medications with full dosing frequency. Output JSON format: {"diagnosis":["string"], "medications":["string"]}',
          {
            inlineData: {
              data: base64Data,
              mimeType,
            },
          },
        ],
      });

      const text = response.text;
      console.log(`🎉 SUCCESS WITH SDK MODEL "${modelName}"!`);
      console.log('====================================================');
      console.log('👁️ @google/genai SDK RAW EXTRACTED OUTPUT:');
      console.log('====================================================');
      console.log(text);

      console.log('\n====================================================');
      console.log('📋 RXNORM VALIDATION RESULTS:');
      console.log('====================================================');
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log('🩺 Diagnosis:', JSON.stringify(parsed.diagnosis));
        for (const med of parsed.medications || []) {
          const rxRes = await validate_drug_with_nih_rxnorm(med);
          console.log(`💊 Medication: "${med}" -> RxNorm Verified: ${rxRes.verified ? '✅ YES (' + (rxRes.rxcui || rxRes.genericName) + ')' : '❌ NO (' + rxRes.error + ')'}`);
        }
      }
      return;
    } catch (err) {
      console.warn(`❌ Model "${modelName}" failed:`, err.message);
    }
  }
}

testGoogleGenAISDK();
