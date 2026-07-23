const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { processUploadedDocument } = require('../agents/ocrAgent');

async function testUserImage() {
  const userImagePath = 'C:\\Users\\meghna\\.gemini\\antigravity\\brain\\ea7bacef-119e-4551-bd4a-3132cf135370\\.user_uploaded\\media__1784818426346.png';
  const targetPath = path.join(__dirname, '../uploads/test_user_rx.png');

  if (!fs.existsSync(userImagePath)) {
    console.error('Image file not found:', userImagePath);
    return;
  }

  fs.copyFileSync(userImagePath, targetPath);

  console.log('====================================================');
  console.log('⚡ TESTING USER HANDWRITTEN PRESCRIPTION WITH VISION ENGINE');
  console.log('====================================================');
  console.log(`📁 File Path: ${targetPath}`);
  console.log(`🔑 GROQ_API_KEY Present: ${!!process.env.GROQ_API_KEY}`);
  console.log(`🔑 GEMINI_API_KEY Present: ${!!process.env.GEMINI_API_KEY}\n`);

  const result = await processUploadedDocument(targetPath);

  console.log('====================================================');
  console.log('🎯 EXTRACTED PAYLOAD & PROVENANCE RESULTS:');
  console.log('====================================================');
  console.log(JSON.stringify(result, null, 2));

  if (fs.existsSync(targetPath)) {
    fs.unlinkSync(targetPath);
  }
}

testUserImage();
