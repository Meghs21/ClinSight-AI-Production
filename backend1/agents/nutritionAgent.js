const Groq = require('groq-sdk');

// Compact schema — keeps the JSON response well within token limits
const SYSTEM_PROMPT = `You are a clinical Nutrition AI. Analyse the food and return ONLY this JSON (no extra text):
{
  "foods_identified": ["string"],
  "nutrition": {"calories": number, "protein_g": number, "carbs_g": number, "fat_g": number, "fiber_g": number, "sodium_mg": number},
  "health_score": number,
  "health_score_label": "Poor|Fair|Good|Excellent",
  "patient_specific_advice": ["string"],
  "general_advice": ["string"],
  "disclaimer": "Estimates only. Consult your dietitian."
}
Be concise. Indian foods. 2–3 advice items max.`;

// Deterministic fallback — used when the LLM returns a 400 or malformed JSON
function buildFallbackNutrition(foodDescription, patientConditions) {
  return {
    foods_identified: [foodDescription],
    nutrition: { calories: null, protein_g: null, carbs_g: null, fat_g: null, fiber_g: null, sodium_mg: null },
    health_score: null,
    health_score_label: 'Unavailable',
    patient_specific_advice: [
      'Nutritional analysis temporarily unavailable.',
      'Please consult your dietitian for personalized advice.'
    ],
    general_advice: ['Prefer low-sodium, high-fiber foods.', 'Maintain regular meal timings.'],
    disclaimer: 'Estimates only. Consult your dietitian.',
    _fallback: true
  };
}

async function runNutritionAgent(foodDescription, patientConditions, apiKey) {
  const client = new Groq({ apiKey: apiKey || process.env.GROQ_API_KEY });

  const prompt = `Food: "${foodDescription}". Patient conditions: ${patientConditions?.join(', ') || 'None'}. Return JSON.`;

  try {
    const response = await client.chat.completions.create({
      model: process.env.GROQ_MODEL || 'groq/compound-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ],
      max_tokens: 600,          // compact schema fits comfortably in 600 tokens
      response_format: { type: 'json_object' }
    });

    try {
      return JSON.parse(response.choices[0].message.content);
    } catch (parseErr) {
      console.warn('[NutritionAgent] JSON parse failed, using fallback:', parseErr.message);
      return buildFallbackNutrition(foodDescription, patientConditions);
    }
  } catch (apiErr) {
    console.warn('[NutritionAgent] API error, using fallback:', apiErr.message);
    return buildFallbackNutrition(foodDescription, patientConditions);
  }
}

module.exports = { runNutritionAgent };
