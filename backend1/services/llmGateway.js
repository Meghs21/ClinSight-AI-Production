'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { GoogleGenerativeAI } = require('@google/generative-ai');
const Groq = require('groq-sdk');
const OpenAI = require('openai');

class LLMGateway {
  getGeminiClient(apiKeyOverride) {
    const key = apiKeyOverride || process.env.GEMINI_API_KEY;
    if (!key) return null;
    return new GoogleGenerativeAI(key);
  }

  getGroqClient(apiKeyOverride) {
    const key = apiKeyOverride || process.env.GROQ_API_KEY;
    if (!key) return null;
    return new Groq({ apiKey: key });
  }

  getOpenAIClient(apiKeyOverride) {
    const key = apiKeyOverride || process.env.OPENAI_API_KEY;
    if (!key) return null;
    return new OpenAI({ apiKey: key });
  }

  async generateText({ prompt, systemPrompt, provider = 'auto', apiKey, model }) {
    // 1. Try Gemini
    if (provider === 'gemini' || provider === 'auto') {
      const genAI = this.getGeminiClient(apiKey);
      if (genAI) {
        try {
          const m = genAI.getGenerativeModel({
            model: model || 'gemini-1.5-flash',
            systemInstruction: systemPrompt || undefined,
          });
          const res = await m.generateContent(prompt);
          const text = res.response?.text();
          if (text) return { text, provider: 'gemini', model: model || 'gemini-1.5-flash' };
        } catch (err) {
          console.warn('Gemini gateway call failed, attempting fallback:', err.message);
        }
      }
    }

    // 2. Try Groq
    if (provider === 'groq' || provider === 'auto') {
      const groq = this.getGroqClient(apiKey);
      if (groq) {
        try {
          const messages = [];
          if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
          messages.push({ role: 'user', content: prompt });

          const res = await groq.chat.completions.create({
            model: model || 'llama-3.3-70b-versatile',
            messages,
            temperature: 0.3,
          });
          const text = res.choices[0]?.message?.content;
          if (text) return { text, provider: 'groq', model: model || 'llama-3.3-70b-versatile' };
        } catch (err) {
          console.warn('Groq gateway call failed, attempting fallback:', err.message);
        }
      }
    }

    // 3. Deterministic Fallback if no LLM APIs are active
    return {
      text: `[LLM Gateway Fallback] Query processed deterministically. Prompt preview: "${prompt.slice(0, 100)}..."`,
      provider: 'fallback',
      model: 'rule-engine',
    };
  }

  async generateJSON({ prompt, systemPrompt, provider = 'auto', apiKey, model }) {
    const jsonPrompt = `${prompt}\n\nIMPORTANT: Return ONLY valid JSON output matching the required schema. No conversational prose or markdown formatting outside the JSON object.`;
    const result = await this.generateText({ prompt: jsonPrompt, systemPrompt, provider, apiKey, model });

    try {
      const cleanText = result.text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanText);
      return { data: parsed, meta: result };
    } catch {
      return { data: { raw_text: result.text }, meta: result };
    }
  }
}

module.exports = new LLMGateway();
