const path = require('path');
const fs = require('fs');
const { processUploadedDocument } = require('../agents/ocrAgent');

async function testWeeklyDosingGuardrail() {
  console.log('====================================================');
  console.log('🧪 TESTING FULL DOSING SCHEDULE & FOLITRAX GUARDRAIL');
  console.log('====================================================\n');

  // Test Case 1: Prescription with full schedules (Folitrax once per week Friday night)
  const fullRxPath = path.join(__dirname, 'full_schedule_sample.txt');
  fs.writeFileSync(
    fullRxPath,
    `Diagnosis: SLE with Scleroderma
Tab. HCQS 200mg one daily at night
Tab. Folitrax 15mg once per week (Friday night)
Tab. Folvite 5mg twice per week (Saturdays, Sundays)
Rablet-D one daily before breakfast
Cap. D-logy one every month
Tab. Wysolone 5mg once daily`
  );

  console.log('📡 Case 1: Processing full schedule prescription...');
  const res1 = await processUploadedDocument(fullRxPath);

  console.log('💊 Extracted Medications:');
  console.log(JSON.stringify(res1.structured?.medications, null, 2));
  console.log('🛡️ Requires Human Review:', res1.requires_human_review);
  console.log('📊 Confidence Summary:', res1.confidence_summary);
  console.log('⚠️ Weekly Dosing Violation:', res1.weekly_dosing_violation, '(Expected: false)');

  console.log('\n----------------------------------------------------');

  // Test Case 2: DANGEROUS TEST CASE — Folitrax 15mg daily (Missing weekly schedule)
  const dangerousRxPath = path.join(__dirname, 'dangerous_folitrax_daily.txt');
  fs.writeFileSync(
    dangerousRxPath,
    `Diagnosis: Rheumatoid Arthritis
Tab. Folitrax 15mg once daily`
  );

  console.log('📡 Case 2: Processing DANGEROUS daily Folitrax test case...');
  const res2 = await processUploadedDocument(dangerousRxPath);

  console.log('💊 Extracted Medications:', JSON.stringify(res2.structured?.medications));
  console.log('🚨 Weekly Dosing Violation Detected:', res2.weekly_dosing_violation, '(Expected: true)');
  console.log('🛡️ Requires Human Review Forced:', res2.requires_human_review, '(Expected: true)');
  console.log('📊 Medication Confidence Dropped:', res2.confidence_summary?.medication_confidence, '% (Expected: 30%)');
  console.log('📋 Safety Violations Logged:', JSON.stringify(res2.validation_violations, null, 2));
}

testWeeklyDosingGuardrail();
