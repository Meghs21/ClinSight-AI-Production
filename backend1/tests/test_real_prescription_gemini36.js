require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');
const { validate_drug_with_nih_rxnorm } = require('../tools/patientTools');

async function testRealPrescriptionGemini36WithRetry() {
  console.log('====================================================');
  console.log('🧪 DIRECT MULTIMODAL VISION OCR WITH RETRY (GEMINI 3.6 / 2.0)');
  console.log('====================================================\n');

  const apiKey = process.env.GEMINI_API_KEY;
  const imagePath = 'C:\\Users\\meghna\\.gemini\\antigravity\\brain\\ea7bacef-119e-4551-bd4a-3132cf135370\\.user_uploaded\\media_1786046489610.png';

  console.log(`🖼️ Target Image File: ${path.basename(imagePath)} (${fs.statSync(imagePath).size} bytes)`);

  const fileBuffer = fs.readFileSync(imagePath);
  const base64Data = fileBuffer.toString('base64');

  const ai = new GoogleGenAI({ apiKey });
  const modelsToTry = ['gemini-3.6-flash', 'gemini-2.0-flash'];

  for (const modelName of modelsToTry) {
    console.log(`\n📡 Attempting Direct Vision Reading with Model "${modelName}"...`);
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: [
            'You are an expert clinical vision OCR engine. Transcribe all text from this medical image including handwritten notes, doctor prescriptions, dosage instructions, and lab numbers exactly as written. Return clean transcribed text.',
            {
              inlineData: {
                data: base64Data,
                mimeType: 'image/png',
              },
            },
          ],
        });

        const text = response.text || '';
        console.log(`\n🎉 SUCCESS WITH MULTIMODAL MODEL "${modelName}"!`);
        console.log('====================================================');
        console.log('👁️ GEMINI VISION RAW EXTRACTED TRANSCRIPT:');
        console.log('====================================================');
        console.log(text);
        return;
      } catch (err) {
        console.warn(`⚠️ Attempt ${attempt} on "${modelName}" failed:`, err.message.slice(0, 150));
        if (attempt < 3) {
          console.log('⏳ Waiting 15s before retry...');
          await new Promise((r) => setTimeout(r, 15000));
        }
      }
    }
  }
}

testRealPrescriptionGemini36WithRetry();
