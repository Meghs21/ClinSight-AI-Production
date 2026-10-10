'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { processUploadedDocument } = require('../agents/ocrAgent');

const DATA_DIR = path.join(__dirname, 'data');
const GT_FILE = path.join(__dirname, 'ground_truth.json');

async function runEvaluation() {
  console.log('====================================================');
  console.log('   ClinSight-AI — OCR Accuracy Evaluation Benchmark   ');
  console.log('====================================================\n');

  if (!fs.existsSync(GT_FILE)) {
    console.error('Error: ground_truth.json not found!');
    process.exit(1);
  }

  const groundTruth = JSON.parse(fs.readFileSync(GT_FILE, 'utf-8'));
  const imageFiles = Object.keys(groundTruth).filter(file => fs.existsSync(path.join(DATA_DIR, file)));

  console.log(`Found ${imageFiles.length} annotated test images.\n`);

  let totalImages = 0;
  let successCount = 0;
  let totalTrueMeds = 0;
  let matchedMeds = 0;
  let totalTrueDiags = 0;
  let matchedDiags = 0;
  let totalReviewFlags = 0;

  const resultsTable = [];

  for (const filename of imageFiles) {
    totalImages++;
    const filePath = path.join(DATA_DIR, filename);
    const gt = groundTruth[filename];

    process.stdout.write(`Evaluating [${totalImages}/${imageFiles.length}] ${filename}... `);

    const startTime = Date.now();
    try {
      const res = await processUploadedDocument(filePath);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      if (!res || !res.success) {
        console.log(`❌ Failed (${elapsed}s): ${res?.error || 'Unknown error'}`);
        resultsTable.push({
          file: filename,
          status: 'FAIL',
          elapsed: `${elapsed}s`,
          foundMeds: 0,
          trueMeds: gt.medications?.length || 0,
          requiresReview: true
        });
        continue;
      }

      successCount++;
      const extractedMeds = res.structured?.medications || [];
      const extractedDiag = res.structured?.diagnosis || [];

      // Calculate Medication matches (case-insensitive fuzzy/substring)
      let fileMatchedMeds = 0;
      for (const tMed of gt.medications || []) {
        const tClean = tMed.toLowerCase().replace(/[^a-z0-9]/g, ' ');
        const matched = extractedMeds.some(eMed => {
          const eClean = eMed.toLowerCase().replace(/[^a-z0-9]/g, ' ');
          // Check if any key drug root token matches
          const tokens = tClean.split(' ').filter(tok => tok.length > 3 && !['tablet', 'syrup', 'capsule', 'tabs'].includes(tok));
          return tokens.some(tok => eClean.includes(tok));
        });
        if (matched) fileMatchedMeds++;
      }

      // Calculate Diagnosis matches
      let fileMatchedDiags = 0;
      for (const tDiag of gt.diagnosis || []) {
        const tClean = tDiag.toLowerCase();
        const matched = extractedDiag.some(eDiag => {
          const eClean = eDiag.toLowerCase();
          const tokens = tClean.split(' ').filter(tok => tok.length > 4);
          return tokens.some(tok => eClean.includes(tok));
        });
        if (matched) fileMatchedDiags++;
      }

      totalTrueMeds += (gt.medications?.length || 0);
      matchedMeds += fileMatchedMeds;

      totalTrueDiags += (gt.diagnosis?.length || 0);
      matchedDiags += fileMatchedDiags;

      if (res.requires_human_review) {
        totalReviewFlags++;
      }

      console.log(`✅ Success (${elapsed}s) | Meds: ${fileMatchedMeds}/${gt.medications?.length || 0} | Provider: ${res.parser}`);

      resultsTable.push({
        file: filename,
        status: 'OK',
        provider: res.parser,
        elapsed: `${elapsed}s`,
        medsMatch: `${fileMatchedMeds}/${gt.medications?.length || 0}`,
        review: res.requires_human_review ? 'FLAGGED' : 'AUTO-PASS'
      });

    } catch (err) {
      console.log(`❌ Error: ${err.message}`);
    }
  }

  console.log('\n====================================================');
  console.log('                 BENCHMARK SUMMARY                  ');
  console.log('====================================================');
  console.table(resultsTable);

  const medRecall = totalTrueMeds > 0 ? ((matchedMeds / totalTrueMeds) * 100).toFixed(1) : 0;
  const diagRecall = totalTrueDiags > 0 ? ((matchedDiags / totalTrueDiags) * 100).toFixed(1) : 0;
  const pipelineSuccessRate = ((successCount / totalImages) * 100).toFixed(1);
  const reviewFlagRate = ((totalReviewFlags / totalImages) * 100).toFixed(1);

  console.log(`• Pipeline Execution Success Rate : ${pipelineSuccessRate}% (${successCount}/${totalImages})`);
  console.log(`• Medication Recall Accuracy      : ${medRecall}% (${matchedMeds}/${totalTrueMeds} detected)`);
  console.log(`• Diagnosis Recall Accuracy       : ${diagRecall}% (${matchedDiags}/${totalTrueDiags} detected)`);
  console.log(`• Human Review Escalation Rate    : ${reviewFlagRate}% (${totalReviewFlags}/${totalImages} flagged)`);
  console.log('====================================================\n');
}

runEvaluation().catch(console.error);
