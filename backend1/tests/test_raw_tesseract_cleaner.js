const path = require('path');
const fs = require('fs');
const { processUploadedDocument } = require('../agents/ocrAgent');

async function testRawTesseractCleaner() {
  console.log('====================================================');
  console.log('🧪 TESTING RAW HANDWRITTEN TESSERACT OCR CLEANER');
  console.log('====================================================\n');

  const rawPath = path.join(__dirname, 'raw_tesseract_sample.txt');
  fs.writeFileSync(
    rawPath,
    `Le, LATE Sedroclunn
Chief Complaints & brief history of Complaints :-
OQ, Tock: H:CQOx 2080 gre dadly
Allergic history (if Any) :- at pot
Taub. Folshmue (Srv Ine pe (NE
Examination :- nek ay rg VD)
3 Teh - foludle Soy haves per Cesle
( Sectoseleg,s Srelpe)
Investigation :-
ie (<) Reklef-D one or
x3 be fove brentfort
NV
AT =) Cp De 24 Pe Reve, Us
EJ v Wysdlas Sop ones dl,
Se Tak se gr`
  );

  const res = await processUploadedDocument(rawPath);

  console.log('🩺 Extracted Diagnosis:', JSON.stringify(res.structured?.diagnosis));
  console.log('💊 Extracted Medications:', JSON.stringify(res.structured?.medications, null, 2));
  console.log('🛡️ Requires Human Review:', res.requires_human_review);
  console.log('📊 Confidence Summary:', res.confidence_summary);
  console.log('📋 Drug Validation:', JSON.stringify(res.drug_validation, null, 2));
}

testRawTesseractCleaner();
