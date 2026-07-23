const apiKey = process.env.GROQ_API_KEY;

async function listGroqModels() {
  if (!apiKey) {
    console.log('No GROQ_API_KEY');
    return;
  }
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    const data = await res.json();
    console.log('Groq Available Models:', data.data?.map(m => m.id));
  } catch (err) {
    console.error('Error fetching Groq models:', err.message);
  }
}

listGroqModels();
