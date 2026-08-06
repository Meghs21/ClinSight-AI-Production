const path = require('path');
const fs = require('fs');
const { processUploadedDocument } = require('../agents/ocrAgent');

async function testDeterministicExecution() {
  console.log('====================================================');
  console.log('🧪 TESTING DETERMINISTIC RUN EXECUTION (TEMP = 0.0)');
  console.log('====================================================\n');

  const rxPath = path.join(__dirname, 'sle_scleroderma_rx.txt');
  fs.writeFileSync(
    rxPath,
    `Diagnosis: SLE with Scleroderma
Tab. HCQS 200mg one daily at night
Tab. Folitrax 15mg once per week
Tab. Folvite 5mg twice per week
Rablet-D one daily before breakfast
Cap. D-logy one every month
Tab. Wysolone 5mg once daily`
  );

  console.log('📡 RUN 1: Processing prescription...');
  const run1 = await processUploadedDocument(rxPath);

  console.log('\n📡 RUN 2: Re-processing identical prescription...');
  const run2 = await processUploadedDocument(rxPath);

  console.log('\n====================================================');
  console.log('🔍 COMPARISON OF RUN 1 vs RUN 2:');
  console.log('====================================================');
  console.log('💊 RUN 1 Medications:', JSON.stringify(run1.structured?.medications));
  console.log('💊 RUN 2 Medications:', JSON.stringify(run2.structured?.medications));

  const isIdentical = JSON.stringify(run1.structured) === JSON.stringify(run2.structured);
  console.log('\n🎯 RESULT: Are Run 1 and Run 2 100% Identical?', isIdentical ? '✅ YES (100% DETERMINISTIC!)' : '❌ NO');
}

testDeterministicExecution();
