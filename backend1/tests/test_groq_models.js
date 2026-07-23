const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function checkGroqKey() {
  const key = process.env.GROQ_API_KEY;
  console.log('Testing GROQ_API_KEY:', key ? `${key.slice(0, 8)}...` : 'MISSING');

  const modelsToTest = [
    'llama-3.2-11b-vision-preview',
    'llama-3.2-90b-vision-preview',
    'llama-3.2-11b-vision-instruct',
    'llama-3.2-90b-vision-instruct',
    'llama-3.3-70b-versatile',
    'llama3-70b-8192',
    'mixtral-8x7b-32768',
  ];

  for (const m of modelsToTest) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: m,
          messages: [{ role: 'user', content: 'hello' }],
          max_tokens: 5,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        console.log(`✅ Model ${m} is WORKING!`);
      } else {
        console.log(`❌ Model ${m}: ${data.error?.message || 'Failed'}`);
      }
    } catch (e) {
      console.log(`❌ Model ${m}: ${e.message}`);
    }
  }
}

checkGroqKey();
