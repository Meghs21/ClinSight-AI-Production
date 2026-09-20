'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { runRagDoctorQuery, runRagPatientSummary } = require('../agents/ragDoctorAgent');
const { runTriageAgent } = require('../agents/triageAgent');
const { runSecondOpinionAgent } = require('../agents/secondOpinionAgent');
const { runReceptionist } = require('../agents/receptionistAgent');
const { runNutritionAgent } = require('../agents/nutritionAgent');
const { runIngestionAgent } = require('../agents/ingestionAgent');
const { runTransferAgent } = require('../agents/transferAgent');
const { runVoiceAgent } = require('../agents/voiceAgent');

async function auditAllAgents() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║               AUDIT & TEST OF ALL CLINSIGHT AGENTS                 ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  const report = [];

  // 1. RAG Doctor Agent
  try {
    console.log('▶ [1/9] Testing RAG Doctor Agent (runRagDoctorQuery)...');
    const res = await runRagDoctorQuery('P001', "What was the patient's creatinine level on February 8 2026?");
    const working = res && (res.answer || res.response) && Array.isArray(res.rag_hits);
    report.push({
      agent: 'RAG Doctor Agent',
      role: 'Clinical Q&A with Evidence Retrieval',
      status: working ? '✅ WORKING' : '❌ FAILED',
      details: `Retrieved ${res.rag_hits?.length || 0} hits. Answer excerpt: ${(res.answer || '').substring(0, 75)}...`,
    });
    console.log(`  Result: ${working ? 'PASSED' : 'FAILED'}`);
  } catch (e) {
    report.push({ agent: 'RAG Doctor Agent', role: 'Clinical Q&A', status: '❌ ERROR', details: e.message });
    console.log(`  Result: ERROR (${e.message})`);
  }

  await new Promise(r => setTimeout(r, 2000));

  // 2. Triage Agent
  try {
    console.log('\n▶ [2/9] Testing Triage Agent (runTriageAgent)...');
    const res = await runTriageAgent('P001');
    const working = res && res.priority && (Array.isArray(res.recommended_specialties) || res.needs_consultation !== undefined);
    const specialtyList = (res.recommended_specialties || []).map(s => s.department || s).slice(0, 2).join(', ');
    report.push({
      agent: 'Triage Agent',
      role: 'Clinical Acuity Scoring & Specialty Routing',
      status: working ? '✅ WORKING' : '❌ FAILED',
      details: `Priority: ${res.priority} | Specialties: ${specialtyList || 'General Medicine'} | Needs Consult: ${res.needs_consultation}`,
    });
    console.log(`  Result: ${working ? 'PASSED' : 'FAILED'} (Priority: ${res.priority})`);
  } catch (e) {
    report.push({ agent: 'Triage Agent', role: 'Acuity Scoring', status: '❌ ERROR', details: e.message });
    console.log(`  Result: ERROR (${e.message})`);
  }

  await new Promise(r => setTimeout(r, 2000));

  // 3. Second Opinion Agent
  try {
    console.log('\n▶ [3/9] Testing Second Opinion Agent (runSecondOpinionAgent)...');
    const res = await runSecondOpinionAgent('P001', 'Diabetic Nephropathy');
    const working = res && res.verdict && typeof res.confidence_score === 'number' && Array.isArray(res.supporting_evidence);
    report.push({
      agent: 'Second Opinion Agent',
      role: 'Differential Diagnosis Validation & Risk Assessment',
      status: working ? '✅ WORKING' : '❌ FAILED',
      details: `Verdict: ${res.verdict} | Confidence: ${res.confidence_score}% | Evidence items: ${res.supporting_evidence?.length || 0}`,
    });
    console.log(`  Result: ${working ? 'PASSED' : 'FAILED'} (Verdict: ${res.verdict})`);
  } catch (e) {
    report.push({ agent: 'Second Opinion Agent', role: 'Second Opinion Validation', status: '❌ ERROR', details: e.message });
    console.log(`  Result: ERROR (${e.message})`);
  }

  await new Promise(r => setTimeout(r, 2000));

  // 4. Receptionist Agent
  try {
    console.log('\n▶ [4/9] Testing Receptionist Agent (runReceptionist)...');
    const res = await runReceptionist('What are the hospital visiting hours for Kathir Memorial?');
    const working = typeof res === 'string' && res.length > 10;
    report.push({
      agent: 'Receptionist Agent',
      role: 'Patient Inquiries & Hospital Navigation (Non-Clinical)',
      status: working ? '✅ WORKING' : '❌ FAILED',
      details: `Response: ${res.substring(0, 85)}...`,
    });
    console.log(`  Result: ${working ? 'PASSED' : 'FAILED'}`);
  } catch (e) {
    report.push({ agent: 'Receptionist Agent', role: 'Hospital Operations', status: '❌ ERROR', details: e.message });
    console.log(`  Result: ERROR (${e.message})`);
  }

  await new Promise(r => setTimeout(r, 2000));

  // 5. Nutrition Agent
  try {
    console.log('\n▶ [5/9] Testing Nutrition Agent (runNutritionAgent)...');
    const res = await runNutritionAgent('Recommend a low-glycemic high-protein diet', ['Type 2 Diabetes Mellitus', 'Hypertension']);
    const working = res && res.nutrition && res.health_score && Array.isArray(res.patient_specific_advice);
    report.push({
      agent: 'Nutrition Agent',
      role: 'Chronic Condition-Specific Dietary Guidance',
      status: working ? '✅ WORKING' : '❌ FAILED',
      details: `Score: ${res.health_score}/10 (${res.health_score_label}) | Calories: ${res.nutrition?.calories} kcal | Protein: ${res.nutrition?.protein_g}g`,
    });
    console.log(`  Result: ${working ? 'PASSED' : 'FAILED'}`);
  } catch (e) {
    report.push({ agent: 'Nutrition Agent', role: 'Dietary Guidance', status: '❌ ERROR', details: e.message });
    console.log(`  Result: ERROR (${e.message})`);
  }

  await new Promise(r => setTimeout(r, 2000));

  // 6. Ingestion Agent
  try {
    console.log('\n▶ [6/9] Testing Ingestion Agent (runIngestionAgent)...');
    const sampleExtraction = {
      patient_name: 'Rajan Subramaniam',
      diagnosis: ['Type 2 Diabetes Mellitus'],
      medications: ['Metformin 1000mg'],
      lab_results: { HbA1c: 9.4 },
    };
    const res = await runIngestionAgent('P001', sampleExtraction);
    const working = res && (res.success !== undefined || res.committed !== undefined || res.patient_id);
    report.push({
      agent: 'Ingestion Agent',
      role: 'Structured Extraction Ingestion & Medical Record Update',
      status: working ? '✅ WORKING' : '❌ FAILED',
      details: `Success: ${res.success} | Action: ${res.message || 'Committed'}`,
    });
    console.log(`  Result: ${working ? 'PASSED' : 'FAILED'}`);
  } catch (e) {
    report.push({ agent: 'Ingestion Agent', role: 'Data Ingestion', status: '❌ ERROR', details: e.message });
    console.log(`  Result: ERROR (${e.message})`);
  }

  await new Promise(r => setTimeout(r, 2000));

  // 7. RAG Patient Summarization Agent
  try {
    console.log('\n▶ [7/9] Testing RAG Summarization Agent (runRagPatientSummary)...');
    const res = await runRagPatientSummary('P001');
    const working = res && Array.isArray(res.summary_points) && res.summary_points.length > 0;
    report.push({
      agent: 'RAG Summarizer Agent',
      role: '60-Second Consultation Brief & Clinical Points',
      status: working ? '✅ WORKING' : '❌ FAILED',
      details: `Generated ${res.summary_points?.length || 0} bullet points from clinical bundle`,
    });
    console.log(`  Result: ${working ? 'PASSED' : 'FAILED'}`);
  } catch (e) {
    report.push({ agent: 'RAG Summarizer Agent', role: 'Consultation Brief', status: '❌ ERROR', details: e.message });
    console.log(`  Result: ERROR (${e.message})`);
  }

  await new Promise(r => setTimeout(r, 2000));

  // 8. Transfer Agent
  try {
    console.log('\n▶ [8/9] Testing Transfer Agent (runTransferAgent)...');
    const res = await runTransferAgent({
      patientId: 'P001',
      fromDoctor: 'Dr. Sharma',
      toSpecialty: 'Cardiology',
      reason: 'Hypertensive Nephropathy evaluation',
      includeAnalysis: false,
    });
    const working = res && res.success && res.transfer_id && Array.isArray(res.critical_flags);
    report.push({
      agent: 'Transfer Agent',
      role: 'Inter-departmental Handover & Transfer Packets',
      status: working ? '✅ WORKING' : '❌ FAILED',
      details: `Transfer ID: ${res.transfer_id} | Flags: ${res.critical_flags?.length || 0} | To: ${res.to_specialty}`,
    });
    console.log(`  Result: ${working ? 'PASSED' : 'FAILED'} (Transfer: ${res.transfer_id})`);
  } catch (e) {
    report.push({ agent: 'Transfer Agent', role: 'Transfer Packets', status: '❌ ERROR', details: e.message });
    console.log(`  Result: ERROR (${e.message})`);
  }

  await new Promise(r => setTimeout(r, 2000));

  // 9. Voice Doctor Agent
  try {
    console.log('\n▶ [9/9] Testing Voice Doctor Agent (runVoiceAgent)...');
    const res = await runVoiceAgent('Summarize Rajans active medications and blood pressure alerts', 'P001');
    const working = res && res.success && res.response && res.response.length > 20;
    report.push({
      agent: 'Voice Doctor Agent',
      role: 'Hands-Free Spoken Clinical Queries & Audio Synthesis',
      status: working ? '✅ WORKING' : '❌ FAILED',
      details: `Response excerpt: ${(res.response || '').replace(/\n/g, ' ').substring(0, 75)}...`,
    });
    console.log(`  Result: ${working ? 'PASSED' : 'FAILED'}`);
  } catch (e) {
    report.push({ agent: 'Voice Doctor Agent', role: 'Voice Assistant', status: '❌ ERROR', details: e.message });
    console.log(`  Result: ERROR (${e.message})`);
  }

  console.log('\n════════════════════════════════════════════════════════════════════');
  console.log('                      AGENT STATUS SUMMARY                          ');
  console.log('════════════════════════════════════════════════════════════════════\n');

  console.table(report.map(r => ({ Agent: r.agent, Role: r.role, Status: r.status, Details: r.details })));
}

auditAllAgents().catch(console.error);
