const path = require('path');
const fs = require('fs');
const { processUploadedDocument } = require('../agents/ocrAgent');

async function runHandwrittenTest() {
  const sourceImage = 'C:\\Users\\meghna\\.gemini\\antigravity\\brain\\ea7bacef-119e-4551-bd4a-3132cf135370\\.user_uploaded\\media__1784818426346.png';
  const targetImage = path.join(__dirname, '../uploads/user_prescription.png');

  fs.copyFileSync(sourceImage, targetImage);

  console.log('====================================================');
  console.log('🏥 RUNNING 14-NODE PIPELINE ON REAL HANDWRITTEN PRESCRIPTION');
  console.log('====================================================');
  console.log(`📁 Source Image: ${sourceImage}\n`);

  const result = await processUploadedDocument(targetImage);

  console.log('====================================================');
  console.log('🎯 EXTRACTED PAYLOAD & PROVENANCE RESULTS');
  console.log('====================================================');
  console.log(JSON.stringify(result, null, 2));
}

runHandwrittenTest();
