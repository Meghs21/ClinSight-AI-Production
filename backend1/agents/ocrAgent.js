require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { getOCRProvider, GeminiVisionProvider, TesseractProvider } = require("../ocr/ocrProvider");
const { isDigitalNativePDF, extractDigitalPDFText } = require("../ocr/pdfRouter");
const { detectHandwriting } = require("../ocr/handwritingDetector");
const { wrapDocumentPayloadWithProvenance } = require("../ocr/provenanceEngine");
const { validate_biological_bounds, validate_drug_with_nih_rxnorm } = require("../tools/patientTools");
const llmGateway = require("../services/llmGateway");

// 1. File Validation
function validateFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { valid: false, error: `File not found: ${filePath}` };
  }
  const stats = fs.statSync(filePath);
  if (stats.size > 25 * 1024 * 1024) { // 25MB limit
    return { valid: false, error: "File size exceeds 25MB safety limit" };
  }
  return { valid: true };
}

// 2. Document Classification
function classifyDocument(rawText) {
  const text = (rawText || "").toLowerCase();
  if (text.includes("reference range") || text.includes("biological interval") || text.includes("mg/dl") || text.includes("hba1c")) {
    return "LAB_REPORT";
  }
  if (text.includes("rx") || text.includes("sig:") || text.includes("tab.") || text.includes("cap.") || text.includes("dosage")) {
    return "PRESCRIPTION";
  }
  if (text.includes("discharge date") || text.includes("hospital course") || text.includes("condition on discharge")) {
    return "DISCHARGE_SUMMARY";
  }
  if (text.includes("radiology") || text.includes("x-ray") || text.includes("mri") || text.includes("ct scan")) {
    return "RADIOLOGY";
  }
  return "CONSULTATION_NOTE";
}

function heuristicExtract(rawText) {
  const text = rawText || "";
  const compact = text.replace(/\r/g, "");
  const lines = compact.split("\n").map((l) => l.trim()).filter(Boolean);

  const meds = [];
  const isLabLine = (line) => /(mg\/dl|g\/dl|mmol\/l|creatinine|hba1c|egfr|haemoglobin|hemoglobin|blood\s*pressure)/i.test(line);
  for (const line of lines) {
    if (!isLabLine(line) && /(rx|tablet|tab\b|capsule|cap\b|syrup|inj\b|\bmg\b|\bml\b|once|twice|daily|bd|od|hs|po|qd)/i.test(line)) {
      meds.push(line);
    }
  }

  // Diagnosis extraction for SLE, Scleroderma, Lupus, etc.
  const diagnoses = [];
  const sleMatch = compact.match(/(SLE(?:\s+with\s+Scleroderma)?|Scleroderma|Lupus|Systemic\s+Lupus|Diabetes|Nephropathy|Sinusitis|Hypertension|Arthritis)/i);
  const diagMatch = compact.match(/(?:Diagnosis|Diag|Impression|Condition)\s*[:\-]?\s*([^\n\r]+)/i);

  if (sleMatch) diagnoses.push(sleMatch[1].trim());
  if (diagMatch && diagMatch[1]) diagnoses.push(diagMatch[1].trim());
  const uniqueDiag = [...new Set(diagnoses)].filter(Boolean);

  const bpMatch = compact.match(/(?:BP|Blood\s*Pressure)\s*[:\-]?\s*(\d{2,3})\s*\/\s*(\d{2,3})/i);
  const hba1cMatch = compact.match(/HbA1c\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?)/i);
  const crMatch = compact.match(/(?:Creatinine|Serum\s*Creatinine)\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?)/i);
  const egfrMatch = compact.match(/eGFR\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?)/i);
  const hbMatch = compact.match(/(?:Haemoglobin|Hemoglobin|Hb)\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?)/i);

  const uniqueMeds = [...new Set(meds.map((m) => m.trim()))].filter(Boolean);

  return {
    patient_name: null,
    symptoms: [],
    medications: uniqueMeds.slice(0, 20),
    diagnosis: uniqueDiag,
    allergies: [],
    tests_recommended: [],
    clinical_summary: lines.slice(0, 12).join(" "),
    lab_results: {
      BloodPressure: bpMatch ? { systolic: Number(bpMatch[1]), diastolic: Number(bpMatch[2]) } : null,
      HbA1c: hba1cMatch ? Number(hba1cMatch[1]) : null,
      SerumCreatinine: crMatch ? Number(crMatch[1]) : null,
      eGFR: egfrMatch ? Number(egfrMatch[1]) : null,
      Haemoglobin: hbMatch ? Number(hbMatch[1]) : null,
    },
    raw_text: compact.slice(0, 20000),
  };
}

async function processUploadedDocument(filePath, apiKeyOverride, modelOverride) {
  try {
    // Stage 1: File Validation
    const fileVal = validateFile(filePath);
    if (!fileVal.valid) {
      return { success: false, error: fileVal.error };
    }

    let ocrMeta = null;
    let rawText = "";

    // Stage 2 & 3: Document Inspection & Has Embedded Text?
    const hasEmbeddedText = await isDigitalNativePDF(filePath);
    if (hasEmbeddedText) {
      // Branch 1: PDF/Text Extraction (<20ms Fast Path)
      const pdfRes = await extractDigitalPDFText(filePath);
      if (pdfRes.success) {
        rawText = pdfRes.text;
        ocrMeta = { provider: pdfRes.provider, confidence: 1.0, isDigitalNative: true };
      }
    }

    // Branch 2: Image Preprocessing & Handwriting Detection
    if (!rawText) {
      const hwCheck = await detectHandwriting(filePath);
      let provider = null;

      if (hwCheck.isHandwritten) {
        // Sub-Branch A: Mostly Handwritten? YES -> Multimodal Vision Provider (Gemini / Groq Vision)
        const visionTarget = process.env.GEMINI_API_KEY ? 'gemini' : (process.env.OCR_PROVIDER || 'groq');
        provider = getOCRProvider(filePath, visionTarget);
      } else {
        // Sub-Branch B: Mostly Handwritten? NO -> OCR Provider Factory (Tesseract / Azure)
        provider = getOCRProvider(filePath);
      }

      const ocrRes = await provider.processDocument(filePath);
      rawText = ocrRes.text;
      ocrMeta = {
        provider: ocrRes.provider,
        confidence: ocrRes.confidence,
        version: ocrRes.version,
        isHandwritten: hwCheck.isHandwritten,
      };
    }

    console.log(`🤖 [OCR PROVIDER]: ${ocrMeta?.provider || 'Unknown'} | Length: ${rawText.length} chars | Handwritten: ${ocrMeta?.isHandwritten}`);
    console.log(`🤖 [OCR RAW EXTRACTED TEXT]:\n${rawText.slice(0, 1000)}`);

    if (!rawText || !rawText.trim()) {
      return { success: false, error: "OCR produced empty text" };
    }

    // Stage 4: Document Classification
    const docCategory = classifyDocument(rawText);

    // Stage 5: Clinical Entity Extraction via LLM Gateway
    let structured = null;
    try {
      const llmRes = await llmGateway.generateJSON({
        prompt: `Extract structured clinical data from this medical text into JSON:
        Document Type: ${docCategory}
        Text: ${rawText.slice(0, 25000)}`,
        schema: {
          patient_name: "string",
          diagnosis: ["string"],
          medications: ["string"],
          symptoms: ["string"],
          lab_results: { HbA1c: "number", SerumCreatinine: "number" }
        }
      });
      if (llmRes.data) structured = llmRes.data;
    } catch {
      structured = null;
    }

    if (!structured) {
      structured = heuristicExtract(rawText);
    }

    // Universal Key Normalization
    structured.patient_name = structured.patient_name || structured.patientName || null;

    // Normalize medications: support singular "medication", object, string, or array
    let rawMeds = structured.medications || structured.medication || [];
    if (!Array.isArray(rawMeds)) rawMeds = [rawMeds];
    structured.medications = [...new Set(rawMeds.map((m) => {
      if (typeof m === 'object' && m !== null) {
        const name = m.name || m.medication || m.drug || '';
        let dose = m.dose || m.dosage || '';
        if (typeof dose === 'object' && dose !== null) {
          dose = `${dose.strength || ''} ${dose.form || ''} ${dose.frequency || ''} ${dose.duration ? 'x ' + dose.duration : ''}`.trim();
        }
        const freq = typeof m.frequency === 'string' ? m.frequency : (m.sig || m.route || '');
        const dur = typeof m.duration === 'string' ? `x ${m.duration}` : '';
        return `${name} ${dose} ${freq} ${dur}`.replace(/\s+/g, ' ').trim() || JSON.stringify(m);
      }
      return String(m).trim();
    }))].filter(Boolean);

    // Normalize diagnosis: support singular string, object, or array
    let rawDiag = structured.diagnosis || structured.diagnoses || [];
    if (!Array.isArray(rawDiag)) rawDiag = [rawDiag];
    structured.diagnosis = [...new Set(rawDiag.map((d) => {
      if (typeof d === 'object' && d !== null) {
        return d.name || d.diagnosis || JSON.stringify(d);
      }
      return String(d).trim();
    }))].filter(Boolean);

    // Stage 6: Validation (Biological Bounds Checking & RxNorm Hallucination Checking)
    const rangeViolations = validate_biological_bounds(structured.lab_results || {});

    let hasUnrecognizedDrug = false;
    const drugValidationResults = [];

    for (const medStr of structured.medications || []) {
      const rxRes = await validate_drug_with_nih_rxnorm(medStr);
      drugValidationResults.push(rxRes);
      if (!rxRes.verified) {
        hasUnrecognizedDrug = true;
        console.warn(`⚠️ [RxNorm HALLUCINATION GUARDRAIL]: ${rxRes.error}`);
      }
    }

    // Stage 6.5: Methotrexate / Folitrax Weekly Dosing Safety Guardrail
    const WEEKLY_ONLY_DRUGS = [/folitrax/i, /methotrexate/i, /trexall/i, /rasuvo/i];
    let weeklyDosingViolation = false;
    let weeklyDosingMessage = "";

    for (const medStr of structured.medications || []) {
      const isWeeklyDrug = WEEKLY_ONLY_DRUGS.some((regex) => regex.test(medStr));
      if (isWeeklyDrug) {
        const mentionsWeekly = /(once\s+per\s+week|weekly|1x\/week|once\s+a\s+week|friday|sat|sun|week)/i.test(medStr);
        const mentionsDaily = /\b(daily|once\s+daily|every\s+day|qd|1x\/day)\b/i.test(medStr);
        if (mentionsDaily || !mentionsWeekly) {
          weeklyDosingViolation = true;
          weeklyDosingMessage = `🚨 CRITICAL SAFETY GUARDRAIL: ${medStr} (Methotrexate-class) must be dosed WEEKLY. Daily or unspecified frequency detected — mandatory human review required!`;
          console.warn(`🚨 [CRITICAL DOSING SAFETY GUARDRAIL]: ${weeklyDosingMessage}`);
        }
      }
    }

    // Stage 7: Wrap Payload with Field Provenance & Versioning Tags
    const wrapped = wrapDocumentPayloadWithProvenance(structured, ocrMeta);

    if (hasUnrecognizedDrug || weeklyDosingViolation) {
      wrapped.confidence_summary.medication_confidence = 30;
      wrapped.confidence_summary.overall_confidence = 30;
    }

    const allViolations = [...rangeViolations];
    if (weeklyDosingViolation) {
      allViolations.push({
        test_name: 'WeeklyDosingCheck',
        severity: 'CRITICAL_MEDICATION_SAFETY_VIOLATION',
        message: weeklyDosingMessage,
      });
    }

    return {
      success: true,
      document_category: docCategory,
      source_file: filePath,
      raw_text: rawText.slice(0, 20000),
      structured: wrapped.structured,
      provenance: wrapped.provenance,
      versions: wrapped.versions,
      confidence_summary: wrapped.confidence_summary,
      validation_violations: allViolations,
      parser: ocrMeta?.provider || "TesseractOCR",
      requires_human_review: rangeViolations.length > 0 || (ocrMeta?.confidence || 0.95) < 0.85 || hasUnrecognizedDrug || weeklyDosingViolation,
      drug_validation: drugValidationResults,
      unrecognized_drug_detected: hasUnrecognizedDrug,
      weekly_dosing_violation: weeklyDosingViolation,
    };
  } catch (error) {
    return {
      success: false,
      error: "OCR pipeline processing failed",
      message: error.message,
    };
  }
}

module.exports = { processUploadedDocument, classifyDocument };
