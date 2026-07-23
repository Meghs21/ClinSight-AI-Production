'use strict';

class PipelineContext {
  constructor({ patientId, filePath, query, fromDoctor, toSpecialty, reason, apiKey, model }) {
    this.patientId = String(patientId);
    this.filePath = filePath;
    this.query = query || 'Generate physician-ready insights from latest ingested records.';
    this.fromDoctor = fromDoctor || 'Primary Physician';
    this.toSpecialty = toSpecialty;
    this.reason = reason;
    this.apiKey = apiKey;
    this.model = model;

    this.startTime = Date.now();
    this.steps = [];
    this.ocr = null;
    this.ingestion = null;
    this.analysis = null;
    this.triage = null;
    this.transfer = null;
    this.humanReviewRequired = false;
    this.humanReviewReason = null;
  }

  addStep(stepName, success, details = {}) {
    this.steps.push({
      step: stepName,
      success: !!success,
      timestamp: Date.now(),
      ...details,
    });
  }

  flagForHumanReview(reason) {
    this.humanReviewRequired = true;
    this.humanReviewReason = reason;
    this.addStep('supervision', false, { reason });
  }

  setOCR(ocrResult) {
    this.ocr = ocrResult;
    const confidence = ocrResult?.confidence ?? (ocrResult?.success ? 0.9 : 0.0);
    this.addStep('ocr', !!ocrResult?.success, {
      parser: ocrResult?.parser || null,
      confidence,
      error: ocrResult?.error || null,
    });
  }

  setIngestion(ingestionResult) {
    this.ingestion = ingestionResult;
    this.addStep('ingestion', !!ingestionResult?.success, {
      error: ingestionResult?.error || null,
    });
  }

  setAnalysis(analysisResult) {
    this.analysis = analysisResult;
    const success = !String(analysisResult?.response || '').startsWith('Error');
    this.addStep('analysis', success);
  }

  setTriage(triageResult) {
    this.triage = triageResult;
    const success = !triageResult?.agent_error;
    this.addStep('triage', success, {
      error: triageResult?.agent_error ? triageResult?.error_message || 'Triage fallback used' : null,
    });
  }

  setTransfer(transferResult) {
    this.transfer = transferResult;
    this.addStep('transfer', !!transferResult?.success, {
      error: transferResult?.error || null,
    });
  }

  toResponse() {
    return {
      success: !this.humanReviewRequired && (this.ocr?.success ?? true) && (this.ingestion?.success ?? true),
      pipeline: 'OCR -> Ingestion -> [Analysis || Triage] -> Transfer',
      patient_id: this.patientId,
      execution_time_ms: Date.now() - this.startTime,
      human_review_required: this.humanReviewRequired,
      human_review_reason: this.humanReviewReason,
      steps: this.steps,
      ocr: this.ocr,
      ingestion: this.ingestion,
      analysis: this.analysis,
      triage: this.triage,
      transfer: this.transfer,
    };
  }
}

module.exports = { PipelineContext };
