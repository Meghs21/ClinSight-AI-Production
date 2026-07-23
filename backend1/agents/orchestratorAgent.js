'use strict';

const { processUploadedDocument } = require('./ocrAgent');
const { runIngestionAgent } = require('./ingestionAgent');
const { runAnalysisAgent } = require('./analysisAgent');
const { runTriageAgent } = require('./triageAgent');
const { runTransferAgent } = require('./transferAgent');
const { PipelineContext } = require('./pipelineContext');
const blockchain = require('../blockchain/logger');

async function runOrchestratorAgent(params) {
  const context = new PipelineContext(params || {});

  if (!context.patientId || !context.filePath) {
    return { success: false, error: 'patientId and filePath are required', steps: [] };
  }

  // 1. Sequential OCR Stage
  const ocr = await processUploadedDocument(context.filePath, context.apiKey, context.model);
  context.setOCR(ocr);

  if (!ocr.success) {
    context.flagForHumanReview(ocr.error || 'OCR document processing failed');
    return context.toResponse();
  }

  // AI Supervisory Confidence Check
  const ocrConfidence = ocr.confidence ?? 0.85;
  if (ocrConfidence < 0.5) {
    context.flagForHumanReview(`Low OCR confidence score (${(ocrConfidence * 100).toFixed(0)}%)`);
    return context.toResponse();
  }

  // 2. Sequential Ingestion Stage
  const ingestion = await runIngestionAgent(context.patientId, ocr.structured);
  context.setIngestion(ingestion);

  if (!ingestion.success) {
    context.flagForHumanReview(ingestion.error || 'Ingestion failure');
    return context.toResponse();
  }

  // 3. PARALLEL EXECUTION STAGE: Run Analysis & Triage concurrently
  const [analysis, triage] = await Promise.all([
    runAnalysisAgent(context.query, context.patientId, context.apiKey, context.model).catch((err) => ({
      response: `Error in analysis: ${err.message}`,
    })),
    runTriageAgent(context.patientId, context.apiKey).catch((err) => ({
      agent_error: true,
      error_message: err.message,
      needs_consultation: true,
    })),
  ]);

  context.setAnalysis(analysis);
  context.setTriage(triage);

  // 4. Conditional Transfer Stage (if triage indicates specialist consultation needed)
  if (triage && triage.needs_consultation) {
    const transfer = await runTransferAgent({
      patientId: context.patientId,
      fromDoctor: context.fromDoctor,
      toSpecialty: context.toSpecialty || (triage.recommended_specialties?.[0]?.department || 'General Medicine & Diabetology'),
      reason: context.reason || 'Auto-generated from triage recommendation',
      includeAnalysis: true,
      apiKey: context.apiKey,
      model: context.model,
    }).catch((err) => ({ success: false, error: err.message }));

    context.setTransfer(transfer);
  }

  // Cross-cutting Concern: Audit Ledger Event Logging
  blockchain.addBlock(
    'BALANCED_PIPELINE_EXECUTED',
    'SYSTEM',
    context.patientId,
    `Pipeline executed in ${Date.now() - context.startTime}ms. Human review required: ${context.humanReviewRequired}`
  );

  return context.toResponse();
}

module.exports = { runOrchestratorAgent };
