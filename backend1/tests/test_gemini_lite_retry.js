require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { validate_drug_with_nih_rxnorm } = require('../tools/patientTools');

async function testGeminiLiteRetry() {
  console.log('====================================================');
  console.log('🧪 TESTING GEMINI 2.0 FLASH LITE WITH RETRY');
  console.log('====================================================\n');

  const apiKey = process.env.GEMINI_API_KEY;
  const uploadsDir = path.join(__dirname, '../uploads');
  const files = fs.readdirSync(uploadsDir).filter((f) => /gbfhjd|sle|rx/i.test(f) || /\.(jpeg|jpg|png)$/i.test(f));
  const imagePath = path.join(uploadsDir, files[0]);
  const ext = path.extname(imagePath).toLowerCase();
  let mimeType = 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
  const base64Data = fs.readFileSync(imagePath).toString('base64');

  const genAI = new GoogleGenerativeAI(apiKey);

  const models = ['gemini-2.0-flash-lite', 'gemini-2.0-flash'];

  for (const modelName of models) {
    console.log(`📡 Waiting 6s before calling model "${modelName}"...`);
    await new Promise((r) => setTimeout(r, 6000));

    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([
        'Read this handwritten prescription image directly. Extract Diagnosis and Medications in JSON: {"diagnosis":["string"], "medications":["string"]}',
        { inlineData: { data: base64Data, mimeType } },
      ]);

      const text = result.response?.text?.();
      console.log(`🎉 SUCCESS WITH MODEL "${modelName}"!`);
      console.log('====================================================');
      console.log('👁️ GEMINI VISION RAW EXTRACTED OUTPUT:');
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

testGeminiLiteRetry();
