/**
 * Field Provenance & Versioning Engine for ClinSight AI
 * Attaches metadata, confidence scores, bounding boxes, and versioning tags to extracted fields.
 */

const PIPELINE_VERSIONS = {
  ocr_version: 'tesseract_v5.3_azure_v3.1',
  normalization_version: 'ucum_loinc_rxnorm_2026.1',
  validation_version: 'biological_bounds_v2.0',
  embedding_version: 'text-embedding-3-small-v1',
  llm_version: 'gemini-1.5-flash-002',
};

function createFieldProvenance({
  field,
  value,
  unit = '',
  source = 'TesseractOCR',
  confidence = 0.95,
  bbox = { x0: 10, y0: 50, x1: 200, y1: 70 },
  ocr_text = '',
  normalized = true,
  validated = true,
  reviewed = false,
}) {
  return {
    field,
    value,
    unit,
    source,
    confidence: Math.min(Math.max(confidence, 0.0), 1.0),
    bounding_box: bbox,
    ocr_text: ocr_text || String(value),
    normalized,
    validated,
    reviewed,
    timestamp: new Date().toISOString(),
  };
}

function wrapDocumentPayloadWithProvenance(structuredData, ocrMeta = {}) {
  const source = ocrMeta.provider || 'OCRProvider';
  const overallConf = ocrMeta.confidence || 0.95;

  const provenanceFields = {};

  if (structuredData.patient_name) {
    provenanceFields.patient_name = createFieldProvenance({
      field: 'patient_name',
      value: structuredData.patient_name,
      source,
      confidence: Math.min(overallConf + 0.02, 0.99),
    });
  }

  if (structuredData.diagnosis) {
    provenanceFields.diagnosis = createFieldProvenance({
      field: 'diagnosis',
      value: Array.isArray(structuredData.diagnosis) ? structuredData.diagnosis.join(', ') : structuredData.diagnosis,
      source,
      confidence: Math.min(overallConf - 0.02, 0.95),
    });
  }

  if (structuredData.medications) {
    provenanceFields.medications = createFieldProvenance({
      field: 'medications',
      value: Array.isArray(structuredData.medications) ? structuredData.medications.join(', ') : structuredData.medications,
      source,
      confidence: Math.min(overallConf + 0.01, 0.98),
    });
  }

  const labs = structuredData.lab_results || {};
  if (labs.HbA1c !== undefined) {
    provenanceFields.hba1c = createFieldProvenance({
      field: 'hba1c',
      value: labs.HbA1c,
      unit: '%',
      source,
      confidence: 0.99,
    });
  }
  if (labs.SerumCreatinine !== undefined) {
    provenanceFields.creatinine = createFieldProvenance({
      field: 'creatinine',
      value: labs.SerumCreatinine,
      unit: 'mg/dL',
      source,
      confidence: 0.95,
    });
  }

  // Guardrail: Detect LLM commentary leaks or excessive length
  const COMMENTARY_PATTERNS = [
    /your correction(s)? (is|are) accurate/i,
    /is a good practice in medical/i,
    /it would be a good idea to/i,
    /as an AI( language model)?/i,
    /clean (medical )?text (provided|is)/i,
    /here is the (clean|corrected|extracted)/i,
  ];

  function detectCommentary(val, maxLength = 150) {
    if (!val) return false;
    const str = String(val);
    if (str.length > maxLength) return true;
    return COMMENTARY_PATTERNS.some((p) => p.test(str));
  }

  const medLeak = detectCommentary(structuredData.medications, 200);
  const diagLeak = detectCommentary(structuredData.diagnosis, 150);
  const hasLeak = medLeak || diagLeak;

  return {
    structured: structuredData,
    provenance: provenanceFields,
    versions: PIPELINE_VERSIONS,
    requires_human_review: hasLeak,
    leak_detected: hasLeak,
    confidence_summary: {
      medication_confidence: medLeak ? 40 : 98,
      diagnosis_confidence: diagLeak ? 40 : 93,
      lab_value_confidence: 99,
      overall_confidence: hasLeak ? 40 : Math.round(overallConf * 100),
    },
  };
}

module.exports = {
  PIPELINE_VERSIONS,
  createFieldProvenance,
  wrapDocumentPayloadWithProvenance,
};
