require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { getOCRProvider } = require("../ocr/ocrProvider");
const { isDigitalNativePDF, extractDigitalPDFText } = require("../ocr/pdfRouter");
const { wrapDocumentPayloadWithProvenance } = require("../ocr/provenanceEngine");
const { validate_biological_bounds } = require("../tools/patientTools");
const llmGateway = require("../services/llmGateway");

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
  for (const line of lines) {
    if (/(tablet|tab|capsule|cap|mg|ml|once|twice|daily|bd|od|hs)/i.test(line)) {
      meds.push(line);
    }
  }

  const bpMatch = compact.match(/(?:BP|Blood\s*Pressure)\s*[:\-]?\s*(\d{2,3})\s*\/\s*(\d{2,3})/i);
  const hba1cMatch = compact.match(/HbA1c\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?)/i);
  const crMatch = compact.match(/(?:Creatinine|Serum\s*Creatinine)\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?)/i);
  const egfrMatch = compact.match(/eGFR\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?)/i);
  const hbMatch = compact.match(/(?:Haemoglobin|Hemoglobin|Hb)\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?)/i);

  return {
    patient_name: null,
    symptoms: [],
    medications: meds.slice(0, 20),
    diagnosis: [],
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
    if (!fs.existsSync(filePath)) {
      return { success: false, error: `File not found: ${filePath}` };
    }

    let ocrMeta = null;
    let rawText = "";

    // Step 1: Check Digital PDF Fast-Path Router (<20ms)
    const isDigitalPDF = await isDigitalNativePDF(filePath);
    if (isDigitalPDF) {
      const pdfRes = await extractDigitalPDFText(filePath);
      if (pdfRes.success) {
        rawText = pdfRes.text;
        ocrMeta = { provider: pdfRes.provider, confidence: 1.0, isDigitalNative: true };
      }
    }

    // Step 2: Fall back to Pluggable OCR Provider Architecture (Tesseract/Azure)
    if (!rawText) {
      const provider = getOCRProvider();
      const ocrRes = await provider.processDocument(filePath);
      rawText = ocrRes.text;
      ocrMeta = { provider: ocrRes.provider, confidence: ocrRes.confidence, version: ocrRes.version };
    }

    if (!rawText || !rawText.trim()) {
      return { success: false, error: "OCR produced empty text" };
    }

    // Step 3: Document Classification
    const docCategory = classifyDocument(rawText);

    // Step 4: Information Extraction via LLM Gateway
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
      if (llmRes.json) structured = llmRes.json;
    } catch {
      structured = null;
    }

    if (!structured) {
      structured = heuristicExtract(rawText);
    }

    // Step 5: Biological Range Validation
    const rangeViolations = validate_biological_bounds(structured.lab_results || {});

    // Step 6: Field Provenance & Versioning Wrap
    const wrapped = wrapDocumentPayloadWithProvenance(structured, ocrMeta);

    return {
      success: true,
      document_category: docCategory,
      source_file: filePath,
      raw_text: rawText.slice(0, 20000),
      structured: wrapped.structured,
      provenance: wrapped.provenance,
      versions: wrapped.versions,
      confidence_summary: wrapped.confidence_summary,
      validation_violations: rangeViolations,
      parser: ocrMeta.provider,
    };
  } catch (error) {
    return {
      success: false,
      error: "OCR agent failed",
      message: error.message,
    };
  }
}

module.exports = { processUploadedDocument, classifyDocument };
