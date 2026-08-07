require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

async function getRawGemini36LiteralString() {
  const TARGET_FILE = 'c:\\Users\\meghna\\ClinSight-AI\\backend1\\uploads\\1786083217732-v8753d7i04f.jpeg';
  const fileBuffer = fs.readFileSync(TARGET_FILE);
  const base64Data = fileBuffer.toString('base64');

  const apiKey = process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({ apiKey });

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: [
          'You are an expert clinical vision OCR engine. Read this handwritten doctor prescription image directly. Transcribe Patient Diagnosis and Prescribed Medications with full dosing frequency and schedule. Return exact transcribed raw text.',
          {
            inlineData: {
              data: base64Data,
              mimeType: 'image/jpeg',
            },
          },
        ],
      });

      const rawText = response.text || '';
      console.log('====================================================');
      console.log(`📄 LITERAL GEMINI 3.6 FLASH RAW EXTRACTED STRING (${rawText.length} CHARACTERS):`);
      console.log('====================================================');
      console.log(rawText);
      console.log('====================================================');
      return;
    } catch (err) {
      console.warn(`Attempt ${attempt} error:`, err.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

getRawGemini36LiteralString();
