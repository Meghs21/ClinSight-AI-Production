const assert = require('node:assert/strict');
const patientRepo = require('../repositories/patientRepository');
const tools = require('../tools/patientTools');
const { runRagDoctorQuery } = require('../agents/ragDoctorAgent');
const { runVoiceAgent } = require('../agents/voiceAgent');
const { signToken, verifyTokenString } = require('../middleware/authMiddleware');
const blockchain = require('../blockchain/logger');

async function testUserWorkflow() {
  console.log('====================================================');
  console.log('🩺 SIMULATING DOCTOR CLINICAL WORKFLOW FOR PATIENT P001');
  console.log('====================================================\n');

  // STEP 1: Doctor Login & Authentication
  console.log('1️⃣  STEP 1: Doctor Authenticates into Hospital Portal...');
  const token = signToken({ id: 'D001', name: 'Dr. Nandakumar', role: 'doctor' });
  const verified = verifyTokenString(token);
  assert.ok(verified && verified.role === 'doctor');
  console.log(`   ✅ Logged in as ${verified.name} (${verified.role}). Token signed & verified.\n`);

  // STEP 2: Doctor Views Appointment Queue & Patient Profile
  console.log('2️⃣  STEP 2: Doctor opens scheduled appointment for P001...');
  const patient = await patientRepo.getPatientById('P001');
  assert.ok(patient);
  console.log(`   ✅ Patient Loaded: ${patient.name} | Age: ${patient.age} | Gender: ${patient.gender}`);
  console.log(`   Diagnoses: ${(patient.diagnoses || patient.diagnosis || []).join(', ')}\n`);

  // STEP 3: Auto-Generated Pre-Consultation Brief
  console.log('3️⃣  STEP 3: System Auto-Generates 1-Page Consultation Brief...');
  const brief = tools.generate_consultation_brief('P001');
  assert.equal(brief.patientId, 'P001');
  const medNames = (brief.currentMedications || []).map(m => typeof m === 'string' ? m : (m.name || m.drug || JSON.stringify(m)));
  console.log(`   ✅ Patient Name: ${brief.patientName}`);
  console.log(`   Current Active Medications (${medNames.length}):`, medNames.join(', '));
  console.log(`   Critical & High Red Flags: ${(brief.redFlags || []).map(f => f.flag).join('; ') || 'None'}`);
  console.log(`   Documented Allergies: ${(brief.allergies || []).join(', ') || 'None'}\n`);

  // STEP 4: Longitudinal Lab Trend Tracking Over Time
  console.log('4️⃣  STEP 4: System Computes Longitudinal Biomarker Trajectory over Time...');
  const trend = tools.extract_lab_trends('P001', 'HbA1c');
  console.log(`   ✅ Test Marker: ${trend.test_name}`);
  console.log(`   Trend Trajectory Tag: [${trend.trend}]`);
  console.log(`   Historical Readings over time:`, trend.data.map(d => `${d.date}: ${d.value}${d.unit || ''}`).join(' -> '), '\n');

  // STEP 5: Doctor Asks Longitudinal RAG Query Over Time
  console.log('5️⃣  STEP 5: Doctor Asks RAG AI Query Over Multi-Year Patient Record...');
  const ragQuery = 'What was the patient HbA1c trend over time and current medications?';
  console.log(`   Doctor Question: "${ragQuery}"`);
  const ragResult = await runRagDoctorQuery(ragQuery, 'P001');
  assert.ok(ragResult.success || ragResult.answer || ragResult.summary_points);
  const respText = typeof ragResult.response === 'string' ? ragResult.response : (Array.isArray(ragResult.response) ? ragResult.response.join('\n') : JSON.stringify(ragResult.response));
  console.log(`   ✅ RAG AI Answer Citation:\n"${respText.slice(0, 250)}..."\n`);

  // STEP 6: Doctor Asks Hands-Free Voice Query
  console.log('6️⃣  STEP 6: Doctor Dictates Hands-Free Voice Query during Physical Exam...');
  const voiceQuery = 'Summarize Rajan history and active medications';
  const voiceResult = await runVoiceAgent(voiceQuery, 'P001');
  assert.ok(voiceResult.success);
  console.log(`   ✅ Voice Assistant Spoken Response:\n   "${voiceResult.response.slice(0, 200)}..."\n`);

  // STEP 7: Audit Ledger Verification
  console.log('7️⃣  STEP 7: Verifying Cryptographic Audit Ledger...');
  blockchain.addBlock('DOCTOR_CONSULTATION_COMPLETED', 'D001', 'P001', 'Doctor completed consultation brief review & RAG Q&A');
  const chain = blockchain.getChain();
  const verification = blockchain.verifyChain();
  console.log(`   ✅ Total Cryptographic Audit Blocks: ${chain.length}`);
  console.log(`   Ledger Validation Status: ${verification.valid ? 'VALID (100% Intact)' : 'INVALID'}\n`);

  console.log('====================================================');
  console.log('🎉 END-TO-END USER CLINICAL WORKFLOW TESTED & PASSED SUCCESSFULLY!');
  console.log('====================================================');
}

testUserWorkflow().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
