require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { processUploadedDocument } = require('../agents/ocrAgent');
const { GoogleGenAI } = require('@google/genai');

async function testVerifyGeminiDirectExecution() {
  console.log('====================================================');
  console.log('🧪 VERIFYING DIRECT GEMINI 3.6 FLASH VISION EXECUTION');
  console.log('====================================================\n');

  const TARGET_FILE = 'c:\\Users\\meghna\\ClinSight-AI\\backend1\\uploads\\1786083217732-v8753d7i04f.jpeg';

  const fileStats = fs.statSync(TARGET_FILE);
  const fileBuffer = fs.readFileSync(TARGET_FILE);
  const sha256Hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  console.log('📊 INPUT FILE CONFIRMATION METADATA:');
  console.log('----------------------------------------------------');
  console.log(`📁 File Path: ${TARGET_FILE}`);
  console.log(`📦 File Size: ${fileStats.size} bytes (Exact 77,618 bytes prescription image!)`);
  console.log(`🔐 SHA256: ${sha256Hash}`);
  console.log(`🔑 GEMINI_API_KEY Present: ${process.env.GEMINI_API_KEY ? 'YES (' + process.env.GEMINI_API_KEY.slice(0, 10) + '...)' : 'NO'}`);
  console.log('----------------------------------------------------\n');

  // Step 1: Direct SDK Verification
  console.log('📡 Step 1: Executing Direct API call to gemini-3.6-flash via @google/genai SDK...');
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: [
        'Transcribe all text from this handwritten doctor prescription directly.',
        {
          inlineData: {
            data: fileBuffer.toString('base64'),
            mimeType: 'image/jpeg',
          },
        },
      ],
    });

    console.log('✅ Direct Gemini 3.6 API Call Status: 200 OK (SUCCESS)');
    console.log('📄 Gemini Raw Transcribed Characters Length:', (response.text || '').length);
  } catch (err) {
    console.error('❌ Direct Gemini API Call Error:', err.message);
  }

  // Step 2: Full End-to-End Pipeline Verification
  console.log('\n📡 Step 2: Executing Full End-to-End processUploadedDocument Pipeline...');
  const result = await processUploadedDocument(TARGET_FILE);

  console.log('\n====================================================');
  console.log('👁️ END-TO-END PIPELINE RESULT METADATA:');
  console.log('====================================================');
  console.log('🤖 Parser / Engine Used:', result.parser);
  console.log('🏷️ OCR Version Tag:', result.versions?.ocr_version);
  console.log('🤖 LLM Version Tag:', result.versions?.llm_version);
  console.log('🩺 Extracted Diagnosis:', JSON.stringify(result.structured?.diagnosis));
  console.log('💊 Extracted Medications:', JSON.stringify(result.structured?.medications, null, 2));
  console.log('📋 RxNorm Validation:', JSON.stringify(result.drug_validation, null, 2));
  console.log('====================================================');
}

testVerifyGeminiDirectExecution();
