'use strict';

/**
 * voiceIntakeAgent.js
 * Sarvam AI-powered Tamil / Indic Voice Intake Agent for ClinSight-AI
 *
 * Flow:
 *   1. Receive audio buffer from API (nurse / patient speaks in Tamil)
 *   2. Saaras (Sarvam STT) -> Tamil transcript
 *   3. Mayura (Sarvam Translation) -> English text
 *   4. Feed English complaint text into existing ClinSight Ingestion pipeline
 *
 * @module voiceIntakeAgent
 */

const sarvam = require('../services/sarvamClient');

const COMPLAINT_KEYWORDS = [
  'pain', 'ache', 'fever', 'vomit', 'nausea', 'dizzy', 'fatigue', 'swelling',
  'breathless', 'cough', 'chest', 'bleed', 'rash', 'unable', 'weakness',
];

/**
 * Extracts a structured chief complaint from raw English text.
 * Simple rule-based extractor - no LLM needed for this step.
 */
function extractChiefComplaint(englishText) {
  const text = englishText.toLowerCase();
  const detectedSymptoms = COMPLAINT_KEYWORDS.filter((kw) => text.includes(kw));
  return {
    raw_complaint: englishText,
    detected_symptoms: detectedSymptoms,
    urgency_hint: detectedSymptoms.some((s) => ['chest', 'breathless', 'bleed'].includes(s))
      ? 'HIGH'
      : detectedSymptoms.length > 2
      ? 'MEDIUM'
      : 'LOW',
  };
}

/**
 * Main Voice Intake Agent
 *
 * @param {object} params
 * @param {Buffer|string} params.audioInput      - Audio buffer or file path (WAV/MP3)
 * @param {string}        params.patientId       - Patient ID to link intake to
 * @param {string}        [params.languageCode]  - BCP-47 language code (default: 'ta-IN' Tamil)
 *
 * @returns {Promise<{
 *   success: boolean,
 *   patientId: string,
 *   original_transcript: string,  // Tamil text
 *   english_text: string,          // Translated English text
 *   chief_complaint: object,
 *   language: string,
 *   pipeline: string,
 *   ready_for_ingestion: object   // Structured object ready to feed into runIngestionAgent()
 * }>}
 */
async function runVoiceIntakeAgent({ audioInput, patientId, languageCode = 'ta-IN' }) {
  console.log('\n[VoiceIntakeAgent] Starting Sarvam voice intake pipeline...');
  console.log('[VoiceIntakeAgent] Patient: ' + patientId + ' | Language: ' + languageCode);

  if (!audioInput) {
    return { success: false, error: 'audioInput is required (Buffer or file path).' };
  }

  if (!patientId) {
    return { success: false, error: 'patientId is required to link the voice intake to a patient record.' };
  }

  // ---- Step 1 & 2: Saaras STT + Mayura Translation -------------------------
  const sarvamResult = await sarvam.voiceToEnglish(audioInput, languageCode);

  if (!sarvamResult.success) {
    return {
      success: false,
      error: 'Sarvam voice pipeline failed: ' + sarvamResult.error,
      stage: sarvamResult.stage || 'unknown',
    };
  }

  // ---- Step 3: Extract structured complaint from English text ---------------
  const chiefComplaint = extractChiefComplaint(sarvamResult.english_text);

  // ---- Step 4: Build ready-for-ingestion payload ----------------------------
  // This object matches the schema expected by runIngestionAgent()
  const ingestionPayload = {
    patient_name: null,              // Unknown from voice alone; linked via patientId
    symptoms: chiefComplaint.detected_symptoms,
    clinical_summary: sarvamResult.english_text,
    diagnosis: [],                   // Will be determined by Analysis/Triage agents downstream
    medications: [],                 // Empty - voice intake doesn't capture meds
    tests_recommended: [],
    lab_results: {},
    source: 'SARVAM_VOICE_INTAKE',
    language_source: sarvamResult.source_language_name || languageCode,
    original_transcript: sarvamResult.original_transcript,
  };

  console.log('[VoiceIntakeAgent] Intake complete.');
  console.log('[VoiceIntakeAgent] Detected symptoms: ' + chiefComplaint.detected_symptoms.join(', '));
  console.log('[VoiceIntakeAgent] Urgency hint: ' + chiefComplaint.urgency_hint);

  return {
    success: true,
    patientId,
    original_transcript: sarvamResult.original_transcript,
    english_text: sarvamResult.english_text,
    chief_complaint: chiefComplaint,
    language: sarvamResult.source_language_name || languageCode,
    pipeline: sarvamResult.pipeline,
    warning: sarvamResult.warning || null,
    ready_for_ingestion: ingestionPayload,
  };
}

module.exports = { runVoiceIntakeAgent };
