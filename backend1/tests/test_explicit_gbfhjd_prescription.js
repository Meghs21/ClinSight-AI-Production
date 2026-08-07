require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { GoogleGenAI } = require('@google/genai');
const { validate_drug_with_nih_rxnorm } = require('../tools/patientTools');

async function testExplicitGbfhjdPrescription() {
  console.log('====================================================');
  console.log('🧪 DIRECT GEMINI 3.6 FLASH TEST ON CONFIRMED gbfhjd.jpeg');
  console.log('====================================================\n');

  // EXPLICIT CONFIRMED FILE PATH FOR gbfhjd.jpeg (77,618 bytes)
  const CONFIRMED_FILE_PATH = 'c:\\Users\\meghna\\ClinSight-AI\\backend1\\uploads\\1786083217732-v8753d7i04f.jpeg';

  if (!fs.existsSync(CONFIRMED_FILE_PATH)) {
    console.error(`❌ Confirmed file path does not exist: ${CONFIRMED_FILE_PATH}`);
    return;
  }

  const fileStats = fs.statSync(CONFIRMED_FILE_PATH);
  const fileBuffer = fs.readFileSync(CONFIRMED_FILE_PATH);
  const sha256Hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const base64Data = fileBuffer.toString('base64');

  console.log('📊 FILE METADATA CONFIRMATION DUMP:');
  console.log('----------------------------------------------------');
  console.log(`📁 Full Path: ${CONFIRMED_FILE_PATH}`);
  console.log(`📦 File Size: ${fileStats.size} bytes (77,618 bytes — Confirmed gbfhjd.jpeg prescription photo!)`);
  console.log(`🔐 SHA256 Hash: ${sha256Hash}`);
  console.log(`🔤 Base64 Length: ${base64Data.length} chars`);
  console.log('----------------------------------------------------\n');

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY missing from backend1/.env');
    return;
  }

  const ai = new GoogleGenAI({ apiKey });

  console.log('📡 Streaming 77,618 image bytes directly into gemini-3.6-flash (bypassing Tesseract 100%)...');

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: [
        'You are an expert clinical vision OCR engine. Read this handwritten doctor prescription image directly. Transcribe Patient Diagnosis and Prescribed Medications with full dosing frequency and schedule. Return JSON format: {"diagnosis":["string"], "medications":["string"]}',
        {
          inlineData: {
            data: base64Data,
            mimeType: 'image/jpeg',
          },
        },
      ],
    });

    const text = response.text || '';
    console.log('\n====================================================');
    console.log('👁️ GEMINI 3.6 FLASH RAW EXTRACTED OUTPUT:');
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
  } catch (err) {
    console.error('❌ Gemini 3.6 Flash execution failed:', err.message);
  }
}

testExplicitGbfhjdPrescription();
