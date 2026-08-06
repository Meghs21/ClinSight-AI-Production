const path = require('path');
const fs = require('fs');
const { processUploadedDocument } = require('../agents/ocrAgent');

async function verifyOcrFix() {
  console.log('====================================================');
  console.log('🧪 VERIFYING GROQ LLM PROMPT FIX & SAFETY GUARDRAIL');
  console.log('====================================================\n');

  // Test sample with artificial commentary leakage attempt
  const samplePath = path.join(__dirname, 'test_sample.txt');
  fs.writeFileSync(
    samplePath,
    `Patient Name: Rajan Subramaniam
Rx: Lipitor 20mg PO QD
HbA1c: 9.4%
Serum Creatinine: 2.1 mg/dL`
  );

  console.log('📡 Running processUploadedDocument on sample image/text...');
  const result = await processUploadedDocument(samplePath);

  console.log('\n====================================================');
  console.log('🎯 EXTRACTED STRUCTURED OUTPUT & PROVENANCE:');
  console.log('====================================================');
  console.log('📄 Extracted Medications:', JSON.stringify(result.structured?.medications));
  console.log('📄 Extracted Text Cleaned:', JSON.stringify(result.structured?.raw_text));
  console.log('🛡️ Requires Human Review Flag:', result.requires_human_review);
  console.log('📊 Confidence Summary:', result.confidence_summary);
  console.log('====================================================');
}

verifyOcrFix();
