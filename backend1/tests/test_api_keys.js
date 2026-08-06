require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

async function testApiKeys() {
  console.log('====================================================');
  console.log('🧪 TESTING AI API KEYS (GROQ & GEMINI)');
  console.log('====================================================\n');

  // 1. Test Groq API Key
  const groqKey = process.env.GROQ_API_KEY;
  console.log('🔑 GROQ_API_KEY Status:', groqKey ? `Present (${groqKey.slice(0, 10)}...)` : '❌ Missing');

  if (groqKey) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: 'Respond with: GROQ_WORKING' }],
        }),
      });

      const data = await res.json();
      if (res.ok) {
        console.log('✅ GROQ API STATUS: 200 OK — Model response:', data.choices?.[0]?.message?.content);
      } else {
        console.error('❌ GROQ API ERROR:', data.error?.message || res.statusText);
      }
    } catch (err) {
      console.error('❌ GROQ Request Failed:', err.message);
    }
  }

  console.log('\n----------------------------------------------------');

  // 2. Test Gemini API Key
  const geminiKey = process.env.GEMINI_API_KEY;
  console.log('🔑 GEMINI_API_KEY Status:', geminiKey ? `Present (${geminiKey.slice(0, 10)}...)` : '⚠️ Missing from backend1/.env (Falls back to Groq Llama 3.3 70B)');
}

testApiKeys();
