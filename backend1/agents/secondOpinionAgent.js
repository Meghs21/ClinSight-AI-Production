const Anthropic = require('@anthropic-ai/sdk');
const Groq = require('groq-sdk');
const tools = require('../tools/patientTools');

const SYSTEM_PROMPT = `You are the Second Opinion Agent at Kathir Memorial Hospital, Chennai.

A physician has proposed a diagnosis. Your job is to scan the patient's complete history and return a structured verdict.

ALWAYS return your response in this EXACT JSON format:
{
  "proposed_diagnosis": "string",
  "verdict": "STRONGLY SUPPORTED | SUPPORTED | PARTIALLY SUPPORTED | CONTRADICTED | INSUFFICIENT DATA",
  "confidence_score": 0-100,
  "supporting_evidence": [
    { "date": "string", "finding": "string", "significance": "plain language explanation" }
  ],
  "contradicting_findings": [
    { "date": "string", "finding": "string", "significance": "plain language explanation" }
  ],
  "medical_terms_explained": [
    { "term": "string", "plain_language": "string" }
  ],
  "disclaimer": "All findings are insights for physician review, not clinical decisions. Apply clinical judgement before acting on this analysis."
}

Rules:
- Always cite the exact date and source (lab result, visit note) for each evidence item
- Include plain-language explanations for every medical term used
- Be objective — if evidence is mixed, say so
- Confidence score should reflect weight of evidence, not just count`;

// ---- Shared JSON extractor --------------------------------------------------
function extractJSON(text) {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return { error: 'Could not parse response', raw: text };
  } catch (e) {
    return { error: 'Parse error', raw: text };
  }
}

// ---- Primary: Anthropic Claude ---------------------------------------------
async function runWithAnthropic(prompt, apiKey, modelOverride) {
  const client = new Anthropic({ apiKey: apiKey || process.env.ANTHROPIC_API_KEY });
  const model = modelOverride || 'claude-haiku-4-5-20251001';

  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  return { text: response.content[0].text, provider: 'anthropic', model };
}

// ---- Fallback: Groq Llama-3.3-70B ------------------------------------------
async function runWithGroq(prompt) {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    temperature: 0.1,
    max_tokens: 2048,
  });

  const text = completion.choices[0]?.message?.content || '';
  return { text, provider: 'groq', model: 'llama-3.3-70b-versatile' };
}

// ---- Main Agent ------------------------------------------------------------
async function runSecondOpinionAgent(patientId, proposedDiagnosis, apiKey, modelOverride) {
  const patientData = tools.get_patient_case_sheet(patientId);
  const flags = tools.flag_clinical_pattern(patientId, null);

  const prompt = `Patient ID: ${patientId}
Proposed Diagnosis by Physician: "${proposedDiagnosis}"

Complete Patient Data:
${JSON.stringify(patientData, null, 2)}

Clinical Flags Already Detected:
${JSON.stringify(flags, null, 2)}

Please analyse the complete history and return your second opinion in the specified JSON format.`;

  // Primary: Anthropic Claude
  if (process.env.ANTHROPIC_API_KEY || apiKey) {
    try {
      const { text, provider, model } = await runWithAnthropic(prompt, apiKey, modelOverride);
      console.log(`[SecondOpinionAgent] Response via ${provider} (${model})`);
      return { ...extractJSON(text), _provider: provider, _model: model };
    } catch (err) {
      console.warn(`[SecondOpinionAgent] Anthropic failed (${err.message}), falling back to Groq...`);
    }
  }

  // Fallback: Groq Llama-3.3-70B
  try {
    const { text, provider, model } = await runWithGroq(prompt);
    console.log(`[SecondOpinionAgent] Response via ${provider} (${model})`);
    return { ...extractJSON(text), _provider: provider, _model: model };
  } catch (err) {
    return {
      error: 'Both Anthropic and Groq failed.',
      groq_error: err.message,
    };
  }
}

module.exports = { runSecondOpinionAgent };
