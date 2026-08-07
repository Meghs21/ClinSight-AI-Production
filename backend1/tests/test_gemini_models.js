require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testGeminiModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  console.log('🔑 Key:', apiKey ? apiKey.slice(0, 10) + '...' : 'Missing');

  const modelsToTest = [
    'gemini-1.5-flash-8b',
    'gemini-2.0-flash-lite-preview-02-05',
    'gemini-2.0-flash',
  ];

  const genAI = new GoogleGenerativeAI(apiKey);

  for (const modelName of modelsToTest) {
    console.log(`\n📡 Testing Gemini model: "${modelName}"...`);
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent('Respond with: GEMINI_VISION_OK');
      const text = result.response?.text?.();
      console.log(`✅ SUCCESS WITH MODEL "${modelName}":`, text);
      return modelName;
    } catch (err) {
      console.warn(`❌ Model "${modelName}" failed:`, err.message);
    }
  }
}

testGeminiModels();
