const path = require('path');
const fs = require('fs');
const { processUploadedDocument } = require('../agents/ocrAgent');

async function testUploadedPng() {
  console.log('====================================================');
  console.log('🧪 TESTING OCR ON UPLOADED IMAGE WITH PRESERVED EXTENSION');
  console.log('====================================================\n');

  const srcPath = path.join(__dirname, '../uploads/54cbd2be80d3f1f4270cea29032ad59c');
  const targetPath = path.join(__dirname, '../uploads/test_upload.png');
  
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, targetPath);
  }

  const res = await processUploadedDocument(targetPath);

  console.log('====================================================');
  console.log('📄 EXTRACTED RAW TEXT:');
  console.log('====================================================');
  console.log(res.raw_text?.slice(0, 1000));

  console.log('\n====================================================');
  console.log('🎯 EXTRACTED STRUCTURED DATA:');
  console.log('====================================================');
  console.log(JSON.stringify(res.structured, null, 2));
}

testUploadedPng();
