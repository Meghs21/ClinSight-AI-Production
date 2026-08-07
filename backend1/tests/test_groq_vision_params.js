require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');

async function testGroqVisionParams() {
  const apiKey = process.env.GROQ_API_KEY;
  const uploadsDir = path.join(__dirname, '../uploads');
  const files = fs.readdirSync(uploadsDir).filter((f) => /\.(jpeg|jpg|png)$/i.test(f));
  const sampleImage = path.join(uploadsDir, files[0]);

  const ext = path.extname(sampleImage).toLowerCase();
  let mimeType = 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';

  const imageBuffer = fs.readFileSync(sampleImage);
  const base64Image = imageBuffer.toString('base64');
  const dataUrl = `data:${mimeType};base64,${base64Image}`;

  console.log('📡 Testing Groq with data URL prompt string...');

  const models = ['llama-3.3-70b-versatile', 'qwen/qwen3.6-27b', 'groq/compound'];

  for (const model of models) {
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
              content: `Read this medical prescription image data URL and transcribe the exact Patient Diagnosis and Medications:\n${dataUrl}`,
            },
          ],
          temperature: 0.0,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        console.log(`✅ Model "${model}" output:`);
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

testGroqVisionParams();
