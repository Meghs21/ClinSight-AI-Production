require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');

async function testDirectGroqVisionOCR() {
  console.log('====================================================');
  console.log('🧪 TESTING DIRECT MULTIMODAL VISION OCR ON GROQ');
  console.log('====================================================\n');

  const apiKey = process.env.GROQ_API_KEY;
  const uploadsDir = path.join(__dirname, '../uploads');
  const files = fs.readdirSync(uploadsDir).filter((f) => /\.(png|jpg|jpeg)$/i.test(f));

  if (files.length === 0) {
    console.log('⚠️ No image files found in uploads/');
    return;
  }

  const sampleImage = path.join(uploadsDir, files[0]);
  const ext = path.extname(sampleImage).toLowerCase();
  let mimeType = 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';

  const imageBuffer = fs.readFileSync(sampleImage);
  const base64Image = imageBuffer.toString('base64');

  const visionModels = [
    'llama-3.2-11b-vision-preview',
    'meta-llama/llama-3.2-11b-vision-instruct',
  ];

  for (const model of visionModels) {
    console.log(`📡 Trying model: "${model}"...`);
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
                  text: 'You are an expert clinical vision OCR engine. Read this handwritten doctor prescription image directly. Transcribe the exact Diagnosis, Medication Names, Dosages, Frequencies, and Duration. Return ONLY the clean transcribed medical text without commentary.',
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
        console.log(`✅ SUCCESS WITH MODEL "${model}":`);
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

testDirectGroqVisionOCR();
