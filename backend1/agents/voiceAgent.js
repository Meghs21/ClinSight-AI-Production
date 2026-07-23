'use strict';

const Groq = require('groq-sdk');
const { getPatientContext } = require('../rag/patientContext');
const patientRepo = require('../repositories/patientRepository');

function getGroqClient() {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  return new Groq({ apiKey: key });
}

async function runVoiceAgent(query, patientId = null) {
  try {
    if (!query || String(query).trim() === '') {
      return { success: false, response: 'Query is required.' };
    }

    const pId = patientId || 'P001';
    const bundle = await getPatientContext(pId).catch(() => null);

    const groq = getGroqClient();

    if (!groq || !bundle) {
      // Deterministic fallback response if Groq is unavailable
      const p = bundle?.patient || {};
      const visits = bundle?.visits || [];
      const meds = bundle?.medications || [];
      return {
        success: true,
        response: `[Voice Assistant Fallback] Patient ${p.name || pId} (${p.age || 'NA'}y/${p.gender || 'NA'}). Diagnoses: ${(p.diagnosis || []).join(', ') || 'None'}. Active meds: ${meds.length}. Last visit: ${visits[0]?.date || 'NA'}.`,
        meta: { intent: 'single', fallback: true },
      };
    }

    const systemPrompt = `You are an expert AI Voice Doctor Assistant for Kathir Memorial Hospital.
Provide accurate, concise, and clinically relevant spoken responses based on patient records.
Keep output clear, professional, and under 150 words.`;

    const contextText = `Patient ID: ${bundle.patient.patient_id}
Name: ${bundle.patient.name}
Age/Gender: ${bundle.patient.age} / ${bundle.patient.gender}
Diagnoses: ${(bundle.patient.diagnosis || []).join(', ')}
Meds: ${(bundle.medications || []).map((m) => `${m.drug} ${m.dose}`).join(', ')}`;

    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Context:\n${contextText}\n\nDoctor Voice Query: ${query}` },
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

    const response = completion.choices[0]?.message?.content || 'No response generated.';

    return {
      success: true,
      response,
      meta: {
        intent: 'single',
        patientId: bundle.patient.patient_id,
      },
    };
  } catch (err) {
    return {
      success: false,
      response: `Error in voice agent: ${err.message}`,
    };
  }
}

module.exports = { runVoiceAgent };
