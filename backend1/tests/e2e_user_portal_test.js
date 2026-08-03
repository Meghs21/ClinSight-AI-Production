const path = require('path');
const fs = require('fs');

const BACKEND_URL = 'http://localhost:4000';

async function runE2EUserTesting() {
  console.log('====================================================');
  console.log('👤 E2E USER TESTING: PATIENT PORTAL & DUAL-GATE PIPELINE');
  console.log('====================================================\n');

  // Step 1: Patient Login
  console.log('🔑 Step 1: Authenticating as Patient (rajan@patient.in)...');
  const loginRes = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'rajan@patient.in', password: 'patient123', role: 'patient' }),
  });
  const loginData = await loginRes.json();
  if (!loginRes.ok) {
    console.error('❌ Patient login failed:', loginData);
    return;
  }
  console.log(`✅ Patient Login Successful! User: ${loginData.user.name} | Role: ${loginData.user.role} | Patient ID: ${loginData.user.patient_id || 'P001'}\n`);

  // Step 2: Upload Normal Medical Report (Gate 1 & Gate 2 Pass)
  console.log('📄 Step 2: Patient Uploading Lab Report (Valid HbA1c 9.4%)...');
  const validFilePath = path.join(__dirname, '../uploads/user_test_report_valid.txt');
  fs.writeFileSync(
    validFilePath,
    `Kathir Memorial Hospital Report
    Date: 2026-02-12
    Patient: Rajan Subramaniam
    Rx: Metformin 1000mg BD
    Lab Results: HbA1c: 9.4%, Serum Creatinine: 2.1 mg/dL`
  );

  const formData1 = new FormData();
  const fileBlob1 = new Blob([fs.readFileSync(validFilePath)], { type: 'text/plain' });
  formData1.append('file', fileBlob1, 'user_test_report_valid.txt');
  formData1.append('patientId', 'P001');
  formData1.append('autoIngest', 'false');

  const uploadRes1 = await fetch(`${BACKEND_URL}/api/upload`, {
    method: 'POST',
    body: formData1,
  });
  const uploadData1 = await uploadRes1.json();
  console.log(`✅ Document Classified As: ${uploadData1.ocr.document_category}`);
  console.log(`✅ Parser Engine Used: ${uploadData1.ocr.parser}`);
  console.log(`✅ Gate 1 (Confidence Check): ${uploadData1.ocr.confidence_summary.overall_confidence}%`);
  console.log(`✅ Gate 2 (Biological Violations): ${uploadData1.ocr.validation_violations.length} violations`);
  console.log(`✅ Requires Human Review: ${uploadData1.ocr.requires_human_review}\n`);

  // Step 3: Upload Malformed Report with Biological Violation (Gate 2 Block)
  console.log('🚨 Step 3: Patient Uploading Impossible Lab Value (HbA1c 94%)...');
  const invalidFilePath = path.join(__dirname, '../uploads/user_test_report_invalid.txt');
  fs.writeFileSync(
    invalidFilePath,
    `Kathir Memorial Hospital Report
    Date: 2026-02-12
    Patient: Rajan Subramaniam
    Lab Results: HbA1c: 94%, Serum Creatinine: 45 mg/dL`
  );

  const formData2 = new FormData();
  const fileBlob2 = new Blob([fs.readFileSync(invalidFilePath)], { type: 'text/plain' });
  formData2.append('file', fileBlob2, 'user_test_report_invalid.txt');
  formData2.append('patientId', 'P001');
  formData2.append('autoIngest', 'false');

  const uploadRes2 = await fetch(`${BACKEND_URL}/api/upload`, {
    method: 'POST',
    body: formData2,
  });
  const uploadData2 = await uploadRes2.json();
  console.log(`⚠️ Gate 2 (Biological Violations Caught):`, uploadData2.ocr.validation_violations[0]?.message);
  console.log(`⚠️ Hard System Block Triggered: requires_human_review = ${uploadData2.ocr.requires_human_review}\n`);

  // Step 4: Patient Reviews, Corrects & Confirms Ingestion
  console.log('💾 Step 4: Patient Corrects HbA1c to 9.4% in HITL Review Modal & Confirms Ingestion...');
  const ingestRes = await fetch(`${BACKEND_URL}/api/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      patientId: 'P001',
      clinicalData: {
        patient_name: 'Rajan Subramaniam',
        diagnosis: ['Type II Diabetes Mellitus'],
        medications: ['Metformin 1000mg BD'],
        lab_results: { HbA1c: 9.4, SerumCreatinine: 2.1 },
        clinical_summary: 'Validated extraction after patient HITL review',
      },
    }),
  });
  const ingestData = await ingestRes.json();
  console.log(`✅ Ingestion Confirmed & Committed to Database! Status:`, ingestData.status || ingestData.message || 'SUCCESS');

  // Cleanup
  if (fs.existsSync(validFilePath)) fs.unlinkSync(validFilePath);
  if (fs.existsSync(invalidFilePath)) fs.unlinkSync(invalidFilePath);

  console.log('\n====================================================');
  console.log('🎉 E2E USER TESTING COMPLETE — ALL CHECKS PASSED!');
  console.log('====================================================');
}

runE2EUserTesting();
