const path = require('path');
const { processUploadedDocument } = require('../agents/ocrAgent');
const { runIngestionAgent } = require('../agents/ingestionAgent');
const blockchain = require('../blockchain/logger');

async function uploadDocument(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { patientId, apiKey, model, autoIngest } = req.body || {};
    const filePath = req.file.path;

    const ocrResult = await processUploadedDocument(filePath, apiKey, model);

    const shouldAutoIngest = autoIngest !== false && autoIngest !== 'false';
    if (patientId && ocrResult.success && ocrResult.structured && shouldAutoIngest) {
      await runIngestionAgent(patientId, ocrResult.structured);
    }

    if (req.io) {
      blockchain.addBlock('DOCUMENT_UPLOADED', 'SYSTEM', patientId || null, `Uploaded ${req.file.originalname}`);
    }

    res.json({
      success: true,
      file: req.file.originalname,
      ocr: ocrResult,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function ingestDocument(req, res) {
  try {
    const { patientId, clinicalData } = req.body || {};
    if (!patientId || !clinicalData) {
      return res.status(400).json({ error: 'patientId and clinicalData are required' });
    }

    const result = await runIngestionAgent(patientId, clinicalData);

    if (req.io) {
      blockchain.addBlock('DOCUMENT_INGESTED', 'SYSTEM', String(patientId), `Ingested clinical data bundle`);
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  uploadDocument,
  ingestDocument,
};
