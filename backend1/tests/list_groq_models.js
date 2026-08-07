require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

async function listGroqModels() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('❌ GROQ_API_KEY missing!');
    return;
  }

  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    const data = await res.json();
    console.log('====================================================');
    console.log('📋 AVAILABLE GROQ MODELS:');
    console.log('====================================================');
    if (data.data) {
      data.data.forEach((m) => {
        console.log(`- ID: ${m.id} | Context: ${m.context_window || 'N/A'} | Owned by: ${m.owned_by}`);
      });
    } else {
      console.log(data);
    }
  } catch (err) {
    console.error('Fetch failed:', err.message);
  }
}

listGroqModels();
