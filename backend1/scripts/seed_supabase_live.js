const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://vfwotpdkxzullsdbrfpn.supabase.co';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_UchIxEVAjG2Fm1jypGENZQ_A1gC912-';

const supabase = createClient(url, key);

async function seedFullLiveSupabase() {
  console.log('====================================================');
  console.log('🚀 FULL LIVE SUPABASE DATABASE SEEDING OVER HTTPS');
  console.log('====================================================\n');

  // 1. Users
  const usersData = [
    { id: 'D001', name: 'Dr. Nandakumar', email: 'nandakumar@kathir.in', password_hash: 'doctor123', role: 'doctor', department: 'General Medicine & Diabetology', patient_id: 'D001' },
    { id: 'P001', name: 'Rajan Subramaniam', email: 'rajan@patient.in', password_hash: 'patient123', role: 'patient', department: 'General Practice', patient_id: 'P001' }
  ];
  console.log('📡 Seeding Users into Supabase...');
  const { data: uRes, error: uErr } = await supabase.from('users').upsert(usersData, { onConflict: 'email' }).select();
  if (uErr) console.warn('⚠️ Users table status:', uErr.message);
  else console.log(`✅ Users Seeded Successfully! Rows: ${uRes.length}`);

  // 2. Patients
  const patientsData = [
    { patient_id: 'P001', name: 'Rajan Subramaniam', email: 'rajan@patient.in', age: 58, gender: 'Male', blood_group: 'B+', city: 'Chennai', status: 'critical' },
    { patient_id: 'P002', name: 'Meenakshi Pillai', email: 'meenakshi@patient.in', age: 42, gender: 'Female', blood_group: 'O+', city: 'Chennai', status: 'stable' },
    { patient_id: 'P003', name: 'Anand Krishnan', email: 'anand@patient.in', age: 65, gender: 'Male', blood_group: 'A+', city: 'Chennai', status: 'monitoring' }
  ];
  console.log('\n📡 Seeding Patients into Supabase...');
  const { data: pRes, error: pErr } = await supabase.from('patients').upsert(patientsData, { onConflict: 'patient_id' }).select();
  if (pErr) console.error('❌ Patients error:', pErr.message);
  else console.log(`✅ Patients Seeded Successfully! Rows: ${pRes.length}`);

  // 3. Visits
  const visitsData = [
    { patient_id: 'P001', visit_date: '2025-02-10', doctor: 'Dr. Nandakumar', department: 'General Medicine & Diabetology', chief_complaint: 'Polyuria, fatigue, increased thirst', clinical_note: 'Patient presents with polyuria and fatigue. HbA1c elevated at 7.2%. Counselled extensively on diabetic diet. Increased Metformin to 1000mg twice daily.', plan: 'Repeat HbA1c in 3 months. Lipid recheck in 6 months.' },
    { patient_id: 'P001', visit_date: '2025-06-15', doctor: 'Dr. Nandakumar', department: 'General Medicine & Diabetology', chief_complaint: 'BP not controlled, occasional dizziness', clinical_note: 'BP poorly controlled at 150/94. HbA1c 8.1% — worsening trend noted. Added Amlodipine 5mg once daily for BP.', plan: 'Review BP in 4 weeks. Repeat creatinine in 3 months.' },
    { patient_id: 'P001', visit_date: '2025-10-10', doctor: 'Dr. Nandakumar', department: 'General Medicine & Diabetology', chief_complaint: 'Routine follow-up, ankle swelling noted', clinical_note: 'HbA1c 9.0% — significant worsening over 6 consecutive visits. Creatinine rising to 1.9 mg/dL, eGFR dropping — early nephropathy progressing.', plan: 'Nephrology referral. Urine microalbumin test.' },
    { patient_id: 'P001', visit_date: '2026-02-08', doctor: 'Dr. Jenson Isaac', department: 'General Medicine & Diabetology', chief_complaint: 'Post-transfer follow-up, worsening kidney function', clinical_note: 'Patient transferred from Dr. Nandakumar. HbA1c 9.4 — insulin initiation being actively considered. Creatinine 2.1 concerning — nephropathy well established.', plan: 'Initiate insulin Glargine 10 units at night. Cardiology referral.' }
  ];
  console.log('\n📡 Seeding Visits into Supabase...');
  const { data: vRes, error: vErr } = await supabase.from('visits').insert(visitsData).select();
  if (vErr) console.warn('⚠️ Visits table status:', vErr.message);
  else console.log(`✅ Visits Seeded Successfully! Rows: ${vRes.length}`);

  // 4. Medications
  const medsData = [
    { patient_id: 'P001', drug: 'Metformin', dose: '1000mg', frequency: 'Twice daily with meals', active: true },
    { patient_id: 'P001', drug: 'Amlodipine', dose: '5mg', frequency: 'Once daily morning', active: true },
    { patient_id: 'P001', drug: 'Simvastatin', dose: '20mg', frequency: 'Once daily at night', active: true }
  ];
  console.log('\n📡 Seeding Medications into Supabase...');
  const { data: mRes, error: mErr } = await supabase.from('medications').insert(medsData).select();
  if (mErr) console.error('❌ Medications error:', mErr.message);
  else console.log(`✅ Medications Seeded Successfully! Rows: ${mRes.length}`);

  // 5. Labs
  const labsData = [
    { patient_id: 'P001', test_name: 'HbA1c', value: '7.2', unit: '%', status: 'borderline', normal_range: '<7.0', lab_date: '2025-02-10' },
    { patient_id: 'P001', test_name: 'HbA1c', value: '7.8', unit: '%', status: 'high', normal_range: '<7.0', lab_date: '2025-04-15' },
    { patient_id: 'P001', test_name: 'HbA1c', value: '8.1', unit: '%', status: 'high', normal_range: '<7.0', lab_date: '2025-06-20' },
    { patient_id: 'P001', test_name: 'HbA1c', value: '8.6', unit: '%', status: 'high', normal_range: '<7.0', lab_date: '2025-08-18' },
    { patient_id: 'P001', test_name: 'HbA1c', value: '9.0', unit: '%', status: 'critical', normal_range: '<7.0', lab_date: '2025-10-10' },
    { patient_id: 'P001', test_name: 'HbA1c', value: '9.2', unit: '%', status: 'critical', normal_range: '<7.0', lab_date: '2025-12-05' },
    { patient_id: 'P001', test_name: 'HbA1c', value: '9.4', unit: '%', status: 'critical', normal_range: '<7.0', lab_date: '2026-02-08' },
    { patient_id: 'P001', test_name: 'SerumCreatinine', value: '1.1', unit: 'mg/dL', status: 'normal', normal_range: '0.7-1.2', lab_date: '2025-03-12' },
    { patient_id: 'P001', test_name: 'SerumCreatinine', value: '1.3', unit: 'mg/dL', status: 'borderline', normal_range: '0.7-1.2', lab_date: '2025-06-20' },
    { patient_id: 'P001', test_name: 'SerumCreatinine', value: '1.6', unit: 'mg/dL', status: 'high', normal_range: '0.7-1.2', lab_date: '2025-09-15' },
    { patient_id: 'P001', test_name: 'SerumCreatinine', value: '1.9', unit: 'mg/dL', status: 'high', normal_range: '0.7-1.2', lab_date: '2025-12-05' },
    { patient_id: 'P001', test_name: 'SerumCreatinine', value: '2.1', unit: 'mg/dL', status: 'critical', normal_range: '0.7-1.2', lab_date: '2026-02-08' }
  ];
  console.log('\n📡 Seeding Labs into Supabase...');
  const { data: lRes, error: lErr } = await supabase.from('labs').insert(labsData).select();
  if (lErr) console.error('❌ Labs error:', lErr.message);
  else console.log(`✅ Labs Seeded Successfully! Rows: ${lRes.length}`);

  console.log('\n====================================================');
  console.log('🎉 FULL LIVE SUPABASE DATABASE SEEDING COMPLETE!');
  console.log('====================================================');
}

seedFullLiveSupabase();
