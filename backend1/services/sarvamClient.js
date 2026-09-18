'use strict';

/**
 * sarvamClient.js
 * Sarvam AI API Client for ClinSight-AI
 *
 * Provides two core capabilities:
 *   1. Saaras  — Indic Speech-to-Text (Audio -> Tamil/Hindi/Regional Text)
 *   2. Mayura  — Indic Translation     (Tamil/Hindi -> English)
 *
 * Sarvam AI Docs: https://docs.sarvam.ai
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const FormData = require('form-data');

const SARVAM_BASE_URL = 'https://api.sarvam.ai';
const SARVAM_API_KEY = process.env.SARVAM_API_KEY;

const SUPPORTED_LANGUAGES = {
  'ta-IN': 'Tamil',
  'hi-IN': 'Hindi',
  'te-IN': 'Telugu',
  'kn-IN': 'Kannada',
  'ml-IN': 'Malayalam',
  'mr-IN': 'Marathi',
  'bn-IN': 'Bengali',
  'gu-IN': 'Gujarati',
  'od-IN': 'Odia',
  'pa-IN': 'Punjabi',
  'en-IN': 'Indian English',
};

function checkApiKey() {
  if (!SARVAM_API_KEY) {
    throw new Error('SARVAM_API_KEY is missing. Add it to your .env file. Get your key at https://console.sarvam.ai');
  }
}

// ---- 1. Saaras: Indic Speech-to-Text ----------------------------------------

async function speechToText(audioInput, languageCode = 'ta-IN') {
  checkApiKey();

  if (!SUPPORTED_LANGUAGES[languageCode]) {
    return { success: false, error: `Unsupported language code: ${languageCode}` };
  }

  try {
    const audioBuffer = typeof audioInput === 'string' ? fs.readFileSync(audioInput) : audioInput;

    const form = new FormData();
    form.append('file', audioBuffer, { filename: 'audio.wav', contentType: 'audio/wav' });
    form.append('language_code', languageCode);
    form.append('model', 'saaras:v2');
    form.append('with_timestamps', 'false');
    form.append('debug_mode', 'false');

    const response = await fetch(SARVAM_BASE_URL + '/speech-to-text', {
      method: 'POST',
      headers: { 'api-subscription-key': SARVAM_API_KEY, ...form.getHeaders() },
      body: form,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error('Saaras API error ' + response.status + ': ' + errorText);
    }

    const data = await response.json();
    const transcript = data.transcript || '';

    console.log('[Saaras STT] Language: ' + languageCode + ' | Transcript: "' + transcript.slice(0, 80) + '..."');

    return {
      success: true,
      transcript,
      language_code: languageCode,
      language_name: SUPPORTED_LANGUAGES[languageCode],
      model: 'saaras:v2',
    };
  } catch (err) {
    console.error('[Saaras STT Error]:', err.message);
    return { success: false, error: err.message };
  }
}

// ---- 2. Mayura: Indic Translation -------------------------------------------

async function translate(text, sourceLanguage = 'ta-IN', targetLanguage = 'en-IN') {
  checkApiKey();

  if (!text || !text.trim()) {
    return { success: false, error: 'Input text is required for translation.' };
  }

  try {
    const response = await fetch(SARVAM_BASE_URL + '/translate', {
      method: 'POST',
      headers: { 'api-subscription-key': SARVAM_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: text,
        source_language_code: sourceLanguage,
        target_language_code: targetLanguage,
        speaker_gender: 'Male',
        mode: 'formal',
        model: 'mayura:v1',
        enable_preprocessing: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error('Mayura API error ' + response.status + ': ' + errorText);
    }

    const data = await response.json();
    const translatedText = data.translated_text || '';

    console.log('[Mayura Translate] ' + sourceLanguage + ' -> ' + targetLanguage + ' | "' + translatedText.slice(0, 80) + '..."');

    return {
      success: true,
      translated_text: translatedText,
      source_language: sourceLanguage,
      target_language: targetLanguage,
      model: 'mayura:v1',
    };
  } catch (err) {
    console.error('[Mayura Translate Error]:', err.message);
    return { success: false, error: err.message };
  }
}

// ---- 3. Combined: Audio -> English text (full Sarvam pipeline) ---------------

async function voiceToEnglish(audioInput, languageCode = 'ta-IN') {
  console.log('\n[Sarvam Voice Pipeline] ' + (SUPPORTED_LANGUAGES[languageCode] || languageCode) + ' -> English');

  // Step 1: Saaras - Audio -> Regional language text
  const sttResult = await speechToText(audioInput, languageCode);
  if (!sttResult.success) {
    return { success: false, error: 'STT failed: ' + sttResult.error, stage: 'speech_to_text' };
  }

  // If already English, skip translation
  if (languageCode === 'en-IN') {
    return {
      success: true,
      original_transcript: sttResult.transcript,
      english_text: sttResult.transcript,
      source_language: languageCode,
      pipeline: 'saaras_only',
    };
  }

  // Step 2: Mayura - Regional text -> English
  const translationResult = await translate(sttResult.transcript, languageCode, 'en-IN');
  if (!translationResult.success) {
    // Graceful degradation: return raw transcript even if translation fails
    console.warn('[Sarvam] Translation failed, returning raw transcript for manual review.');
    return {
      success: true,
      original_transcript: sttResult.transcript,
      english_text: sttResult.transcript,
      source_language: languageCode,
      pipeline: 'saaras_only_translation_failed',
      warning: 'Translation failed: ' + translationResult.error,
    };
  }

  return {
    success: true,
    original_transcript: sttResult.transcript,
    english_text: translationResult.translated_text,
    source_language: languageCode,
    source_language_name: SUPPORTED_LANGUAGES[languageCode],
    pipeline: 'saaras:v2 -> mayura:v1',
  };
}

// ---- 4. Sarvam-M: LLM Text Generation (OpenAI-compatible) ------------------

/**
 * Calls Sarvam-M — Sarvam's multilingual reasoning LLM.
 * Used as a fallback when Anthropic Claude is unavailable.
 * Sarvam-M uses an OpenAI-compatible /v1/chat/completions endpoint.
 *
 * @param {string} prompt        - User prompt
 * @param {string} systemPrompt  - System instruction
 * @param {number} maxTokens     - Max output tokens (default: 2048)
 * @returns {Promise<{ success: boolean, text: string, model: string }>}
 */
async function generateText(prompt, systemPrompt = '', maxTokens = 2048) {
  checkApiKey();

  try {
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });

    const response = await fetch('https://api.sarvam.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'api-subscription-key': SARVAM_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sarvam-m',
        messages,
        max_tokens: maxTokens,
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error('Sarvam-M API error ' + response.status + ': ' + errorText);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';

    console.log('[Sarvam-M] Generated ' + text.length + ' chars via sarvam-m');

    return { success: true, text, model: 'sarvam-m', provider: 'sarvam' };
  } catch (err) {
    console.error('[Sarvam-M Error]:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { speechToText, translate, voiceToEnglish, generateText, SUPPORTED_LANGUAGES };
