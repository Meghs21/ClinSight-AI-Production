require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');

async function testGroqCompoundVision() {
  console.log('====================================================');
  console.log('🧪 TESTING GROQ COMPOUND MULTIMODAL VISION ON RAW IMAGE');
  console.log('====================================================\n');

  const apiKey = process.env.GROQ_API_KEY;
  const uploadsDir = path.join(__dirname, '../uploads');
  const files = fs.readdirSync(uploadsDir).filter((f) => /gbfhjd|sle|rx/i.test(f) || /\.(jpeg|jpg|png)$/i.test(f));

  if (files.length === 0) {
    console.error('❌ No image files in uploads/');
    return;
  }

  const sampleImage = path.join(uploadsDir, files[0]);
  const stats = fs.statSync(sampleImage);
  console.log(`🖼️ Image File: ${files[0]} | Size: ${stats.size} bytes (Under 20MB limit)`);

  const ext = path.extname(sampleImage).toLowerCase();
  let mimeType = 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';

  const imageBuffer = fs.readFileSync(sampleImage);
  const base64Image = imageBuffer.toString('base64');

  const compoundModels = ['groq/compound', 'groq/compound-mini', 'openai/gpt-oss-120b'];

  for (const model of compoundModels) {
    console.log(`\n📡 Testing Groq Vision API with model: "${model}"...`);
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'You are an expert clinical vision OCR engine. Read this handwritten doctor prescription image directly. Transcribe the exact Patient Diagnosis, Prescribed Medications (Name, Dosage, Frequency, Schedule). Return ONLY clean transcribed medical text without commentary.',
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${mimeType};base64,${base64Image}`,
                  },
                },
              ],
            },
          ],
          temperature: 0.0,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        console.log(`✅ SUCCESS WITH GROQ MODEL "${model}":`);
        console.log(data.choices?.[0]?.message?.content);
        return;
      } else {
        console.warn(`❌ Model "${model}" error:`, data.error?.message || res.statusText);
      }
    } catch (err) {
      console.warn(`❌ Model "${model}" failed:`, err.message);
    }
  }
}

testGroqCompoundVision();
