'use strict';

/**
 * sarvam.js — REST routes for Sarvam AI Voice Intake
 *
 * POST /api/sarvam/voice-intake
 *   Accepts: multipart/form-data { audio: <file>, patientId: string, languageCode?: string }
 *   Returns: { transcript, english_text, chief_complaint, ready_for_ingestion }
 *
 * POST /api/sarvam/translate
 *   Accepts: { text: string, sourceLanguage?: string, targetLanguage?: string }
 *   Returns: { translated_text, source_language, target_language }
 *
 * GET /api/sarvam/languages
 *   Returns: list of all supported Indic languages
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { runVoiceIntakeAgent } = require('../agents/voiceIntakeAgent');
const { translate, SUPPORTED_LANGUAGES } = require('../services/sarvamClient');
const blockchain = require('../blockchain/logger');

// Multer: store audio in memory (max 10MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['audio/wav', 'audio/mpeg', 'audio/ogg', 'audio/mp4', 'audio/webm'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported audio format. Use WAV, MP3, OGG, or WebM.'));
    }
  },
});

// ---- GET /api/sarvam/languages ----------------------------------------------
router.get('/languages', (req, res) => {
  res.json({
    success: true,
    supported_languages: SUPPORTED_LANGUAGES,
    default: 'ta-IN',
    note: 'Tamil (ta-IN) is the default for Kathir Memorial Hospital, Chennai.',
  });
});

// ---- POST /api/sarvam/voice-intake ------------------------------------------
router.post('/voice-intake', upload.single('audio'), async (req, res) => {
  try {
    const { patientId, languageCode = 'ta-IN' } = req.body;

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Audio file is required. Send as multipart field "audio".' });
    }

    if (!patientId) {
      return res.status(400).json({ success: false, error: 'patientId is required.' });
    }

    console.log('[POST /api/sarvam/voice-intake] Patient: ' + patientId + ' | Language: ' + languageCode + ' | Audio: ' + req.file.size + ' bytes');

    const result = await runVoiceIntakeAgent({
      audioInput: req.file.buffer,
      patientId,
      languageCode,
    });

    // Audit log
    blockchain.addBlock(
      'SARVAM_VOICE_INTAKE',
      req.headers['x-actor-id'] || 'NURSE',
      patientId,
      'Voice intake via Sarvam AI (' + languageCode + '). Symptoms: ' + (result.chief_complaint?.detected_symptoms?.join(', ') || 'none') + '. Pipeline: ' + result.pipeline
    );

    if (!result.success) {
      return res.status(500).json(result);
    }

    return res.json(result);
  } catch (err) {
    console.error('[Sarvam Route Error]:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---- POST /api/sarvam/translate ---------------------------------------------
router.post('/translate', async (req, res) => {
  try {
    const { text, sourceLanguage = 'ta-IN', targetLanguage = 'en-IN' } = req.body;

    if (!text) {
      return res.status(400).json({ success: false, error: 'text is required.' });
    }

    const result = await translate(text, sourceLanguage, targetLanguage);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
