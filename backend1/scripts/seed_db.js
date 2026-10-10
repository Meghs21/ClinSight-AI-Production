'use strict';

/**
 * ClinSight AI — Database Seed Script
 * ------------------------------------
 * Seeds 5 realistic Indian clinical patients into:
 *   1. Supabase REST API (patients, visits, medications, labs, users tables)
 *   2. Local JSON files (data/patient_PXXX.json) — used by the JSON fallback
 *
 * Run:  node scripts/seed_db.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const fs   = require('fs');
const { createClient } = require('@supabase/supabase-js');

const DATA_DIR    = path.join(__dirname, '../data');
const SUPA_URL    = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY    = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// ─── Fake Clinical Dataset ────────────────────────────────────────────────────

const PATIENTS = [
  {
    // ── P001: existing — Rajan Subramaniam (keep consistent with existing JSON) ──
    id: 'P001',
    name: 'Rajan Subramaniam',
    age: 58, gender: 'Male', bloodGroup: 'B+',
    city: 'Chennai', smoking: 'Non-smoker', alcohol: 'Occasional',
    email: 'rajan.subramaniam@example.com', status: 'critical',
    primaryDiagnosis: ['Type 2 Diabetes Mellitus (E11)', 'Hypertension (I10)'],
    secondaryDiagnosis: ['Early Diabetic Nephropathy (N08)'],
    allergies: ['Amoxicillin — rash (2019)'],
    visits: [
      { date: '2026-02-08', doctor: 'Dr. Priya Nair', department: 'Nephrology',
        chiefComplaint: 'Swelling in feet, reduced urine output',
        clinicalNote: 'Creatinine critically elevated at 2.1 mg/dL. BP 162/98. Diabetic nephropathy progressing.',
        plan: 'Reduce Metformin, start ACE inhibitor, nephrology follow-up in 2 weeks.',
        bp: { systolic: 162, diastolic: 98 }, pulse: 88, weight: 81.2 },
      { date: '2025-11-20', doctor: 'Dr. Priya Nair', department: 'Endocrinology',
        chiefComplaint: 'Uncontrolled blood sugar, fatigue',
        clinicalNote: 'HbA1c 9.4% — poorly controlled. Increase Metformin dose.',
        plan: 'Metformin 1000mg BID, dietary counselling.',
        bp: { systolic: 148, diastolic: 92 }, pulse: 82, weight: 80.5 },
    ],
    medications: [
      { drug: 'Metformin', dose: '1000 mg', frequency: 'BID', route: 'PO', startDate: '2022-01-15', active: true },
      { drug: 'Amlodipine', dose: '5 mg', frequency: 'QD', route: 'PO', startDate: '2022-03-10', active: true },
      { drug: 'Enalapril', dose: '5 mg', frequency: 'QD', route: 'PO', startDate: '2026-02-09', active: true },
      { drug: 'Simvastatin', dose: '20 mg', frequency: 'QD', route: 'PO', startDate: '2023-06-01', active: true },
    ],
    labs: [
      { test: 'Serum Creatinine', value: '2.1', unit: 'mg/dL', status: 'critical', range: '0.7-1.2', date: '2026-02-08' },
      { test: 'Serum Creatinine', value: '1.1', unit: 'mg/dL', status: 'normal',   range: '0.7-1.2', date: '2025-03-12' },
      { test: 'HbA1c',           value: '9.4', unit: '%',     status: 'high',     range: '<7.0',    date: '2025-11-20' },
      { test: 'Blood Glucose',   value: '210', unit: 'mg/dL', status: 'high',     range: '70-110',  date: '2026-02-08' },
      { test: 'eGFR',            value: '42',  unit: 'mL/min/1.73m²', status: 'low', range: '>60', date: '2026-02-08' },
      { test: 'BP Systolic',     value: '162', unit: 'mmHg',  status: 'critical', range: '<130',    date: '2026-02-08' },
    ],
  },
  {
    // ── P002: Meena Krishnamurthy — Post-MI cardiac patient ──
    id: 'P002',
    name: 'Meena Krishnamurthy',
    age: 62, gender: 'Female', bloodGroup: 'O+',
    city: 'Coimbatore', smoking: 'Ex-smoker', alcohol: 'None',
    email: 'meena.krishnamurthy@example.com', status: 'stable',
    primaryDiagnosis: ['Ischaemic Heart Disease (I25)', 'Hyperlipidaemia (E78.5)'],
    secondaryDiagnosis: ['Type 2 Diabetes Mellitus'],
    allergies: ['Aspirin — GI intolerance'],
    visits: [
      { date: '2026-01-15', doctor: 'Dr. Arvind Menon', department: 'Cardiology',
        chiefComplaint: 'Chest tightness on exertion, shortness of breath',
        clinicalNote: 'Post-MI (2023). EF 45%. BP controlled on carvedilol. LDL 130 mg/dL — statin needs titration.',
        plan: 'Increase Rosuvastatin to 20 mg, Echo in 3 months, cardiac rehab referral.',
        bp: { systolic: 128, diastolic: 80 }, pulse: 68, weight: 72.0 },
      { date: '2025-08-10', doctor: 'Dr. Arvind Menon', department: 'Cardiology',
        chiefComplaint: 'Routine cardiac follow-up',
        clinicalNote: 'Stable. No new ischaemic events. Compliance good.',
        plan: 'Continue current medications. Repeat lipid panel in 3 months.',
        bp: { systolic: 130, diastolic: 82 }, pulse: 70, weight: 72.5 },
    ],
    medications: [
      { drug: 'Carvedilol',    dose: '12.5 mg', frequency: 'BID', route: 'PO', startDate: '2023-09-01', active: true },
      { drug: 'Rosuvastatin',  dose: '20 mg',   frequency: 'QD',  route: 'PO', startDate: '2023-09-01', active: true },
      { drug: 'Clopidogrel',   dose: '75 mg',   frequency: 'QD',  route: 'PO', startDate: '2023-09-01', active: true },
      { drug: 'Ramipril',      dose: '2.5 mg',  frequency: 'QD',  route: 'PO', startDate: '2023-09-01', active: true },
      { drug: 'Metformin',     dose: '500 mg',  frequency: 'BID', route: 'PO', startDate: '2021-04-10', active: true },
    ],
    labs: [
      { test: 'LDL Cholesterol',  value: '130', unit: 'mg/dL', status: 'high',   range: '<100',   date: '2026-01-15' },
      { test: 'HDL Cholesterol',  value: '42',  unit: 'mg/dL', status: 'low',    range: '>50',    date: '2026-01-15' },
      { test: 'Triglycerides',    value: '185', unit: 'mg/dL', status: 'borderline', range: '<150', date: '2026-01-15' },
      { test: 'HbA1c',           value: '7.2', unit: '%',     status: 'borderline', range: '<7.0', date: '2026-01-15' },
      { test: 'Troponin I',      value: '0.01',unit: 'ng/mL', status: 'normal', range: '<0.04',   date: '2026-01-15' },
      { test: 'BNP',             value: '180', unit: 'pg/mL', status: 'elevated', range: '<100',  date: '2026-01-15' },
    ],
  },
  {
    // ── P003: Arjun Sharma — Young asthmatic with recurrent infections ──
    id: 'P003',
    name: 'Arjun Sharma',
    age: 29, gender: 'Male', bloodGroup: 'A+',
    city: 'Bangalore', smoking: 'Non-smoker', alcohol: 'Social',
    email: 'arjun.sharma@example.com', status: 'stable',
    primaryDiagnosis: ['Bronchial Asthma (J45.1)', 'Allergic Rhinitis (J30.1)'],
    secondaryDiagnosis: [],
    allergies: ['Dust mites', 'Pollen', 'NSAIDs — bronchospasm'],
    visits: [
      { date: '2026-03-02', doctor: 'Dr. Sumathy Iyer', department: 'Pulmonology',
        chiefComplaint: 'Worsening breathlessness, nocturnal cough for 3 days',
        clinicalNote: 'Moderate persistent asthma exacerbation. SpO2 94% on RA. Bilateral wheeze. Peak flow 65% predicted.',
        plan: 'Nebulised salbutamol, prednisolone 40 mg x5 days, double ICS dose, review in 1 week.',
        bp: { systolic: 118, diastolic: 76 }, pulse: 102, weight: 68.0 },
      { date: '2025-12-05', doctor: 'Dr. Sumathy Iyer', department: 'Pulmonology',
        chiefComplaint: 'Annual asthma review',
        clinicalNote: 'Well controlled on current regimen. No nocturnal symptoms. Good technique.',
        plan: 'Continue Seretide 250/25 BD. Annual spirometry booked.',
        bp: { systolic: 116, diastolic: 74 }, pulse: 76, weight: 67.5 },
    ],
    medications: [
      { drug: 'Fluticasone/Salmeterol (Seretide 250/25)', dose: '250/25 mcg', frequency: 'BID', route: 'Inhaler', startDate: '2023-07-01', active: true },
      { drug: 'Salbutamol inhaler (rescue)',              dose: '100 mcg',    frequency: 'PRN', route: 'Inhaler', startDate: '2023-07-01', active: true },
      { drug: 'Montelukast',                             dose: '10 mg',      frequency: 'QD',  route: 'PO',     startDate: '2024-01-15', active: true },
    ],
    labs: [
      { test: 'Peak Flow (% predicted)', value: '65',  unit: '%',     status: 'low',     range: '>80',   date: '2026-03-02' },
      { test: 'SpO2',                    value: '94',  unit: '%',     status: 'low',     range: '>95',   date: '2026-03-02' },
      { test: 'IgE (Total)',             value: '420', unit: 'IU/mL', status: 'high',    range: '<150',  date: '2025-12-05' },
      { test: 'Eosinophils',             value: '620', unit: 'cells/μL', status: 'high', range: '<400',  date: '2025-12-05' },
      { test: 'Spirometry FEV1',         value: '68',  unit: '%',     status: 'low',     range: '>80',   date: '2025-12-05' },
    ],
  },
  {
    // ── P004: Saraswati Devi — Elderly osteoporotic, CKD stage 3 ──
    id: 'P004',
    name: 'Saraswati Devi',
    age: 74, gender: 'Female', bloodGroup: 'AB+',
    city: 'Hyderabad', smoking: 'Non-smoker', alcohol: 'None',
    email: 'saraswati.devi@example.com', status: 'stable',
    primaryDiagnosis: ['Osteoporosis with fracture risk (M81.0)', 'CKD Stage 3 (N18.3)'],
    secondaryDiagnosis: ['Hypothyroidism (E03.9)', 'Vitamin D Deficiency (E55.9)'],
    allergies: ['Sulpha drugs — rash'],
    visits: [
      { date: '2026-02-20', doctor: 'Dr. Karthik Balasubramanian', department: 'General Medicine',
        chiefComplaint: 'Back pain, generalised weakness, increased fatigue',
        clinicalNote: 'DEXA T-score -2.8 (osteoporosis). eGFR 38. TSH elevated at 8.2 mIU/L — undertreated hypothyroid. Vitamin D critically low.',
        plan: 'Increase levothyroxine to 75 mcg, Calcium+D3, Alendronate 70mg weekly, renal diet advice.',
        bp: { systolic: 138, diastolic: 84 }, pulse: 64, weight: 54.5 },
    ],
    medications: [
      { drug: 'Levothyroxine',          dose: '75 mcg',  frequency: 'QD morning', route: 'PO', startDate: '2020-03-10', active: true },
      { drug: 'Alendronate',            dose: '70 mg',   frequency: 'Weekly',     route: 'PO', startDate: '2026-02-20', active: true },
      { drug: 'Calcium + Vitamin D3',   dose: '500mg+400IU', frequency: 'BID',   route: 'PO', startDate: '2026-02-20', active: true },
      { drug: 'Calcitriol',             dose: '0.25 mcg', frequency: 'QD',        route: 'PO', startDate: '2026-02-20', active: true },
    ],
    labs: [
      { test: 'eGFR',           value: '38',   unit: 'mL/min/1.73m²', status: 'low',      range: '>60',      date: '2026-02-20' },
      { test: 'TSH',            value: '8.2',  unit: 'mIU/L',          status: 'high',     range: '0.4-4.0',  date: '2026-02-20' },
      { test: 'Vitamin D (25-OH)', value: '11', unit: 'ng/mL',         status: 'critical', range: '30-100',   date: '2026-02-20' },
      { test: 'Serum Calcium',  value: '8.1',  unit: 'mg/dL',          status: 'low',      range: '8.5-10.5', date: '2026-02-20' },
      { test: 'Serum Phosphorus', value: '4.8', unit: 'mg/dL',         status: 'high',     range: '2.5-4.5',  date: '2026-02-20' },
      { test: 'Serum Creatinine', value: '1.7', unit: 'mg/dL',         status: 'elevated', range: '0.5-1.1',  date: '2026-02-20' },
    ],
  },
  {
    // ── P005: Vikram Reddy — Young hypertensive executive, metabolic syndrome ──
    id: 'P005',
    name: 'Vikram Reddy',
    age: 42, gender: 'Male', bloodGroup: 'O-',
    city: 'Mumbai', smoking: 'Smoker (10 pack-years)', alcohol: 'Moderate',
    email: 'vikram.reddy@example.com', status: 'monitoring',
    primaryDiagnosis: ['Hypertension (I10)', 'Metabolic Syndrome (E88.81)'],
    secondaryDiagnosis: ['Non-alcoholic Fatty Liver Disease (K76.0)'],
    allergies: ['None known'],
    visits: [
      { date: '2026-03-10', doctor: 'Dr. Ananya Ghosh', department: 'Cardiology',
        chiefComplaint: 'Occasional headaches, work stress, check-up',
        clinicalNote: 'BP 158/96 despite current medication. BMI 31. Waist 102 cm. Fatty liver on USG. Triglycerides 260 mg/dL. Fasting glucose 118 mg/dL (pre-diabetic).',
        plan: 'Add Amlodipine 5mg, lifestyle intensification, smoking cessation referral, repeat fasting glucose in 3 months.',
        bp: { systolic: 158, diastolic: 96 }, pulse: 84, weight: 95.0 },
      { date: '2025-09-22', doctor: 'Dr. Ananya Ghosh', department: 'Cardiology',
        chiefComplaint: 'BP follow-up',
        clinicalNote: 'BP 148/90 on Telmisartan. Weight unchanged. Smoker — counselled.',
        plan: 'Continue Telmisartan, increase exercise, diet review.',
        bp: { systolic: 148, diastolic: 90 }, pulse: 80, weight: 94.5 },
    ],
    medications: [
      { drug: 'Telmisartan',   dose: '40 mg',  frequency: 'QD',  route: 'PO', startDate: '2025-01-10', active: true },
      { drug: 'Amlodipine',    dose: '5 mg',   frequency: 'QD',  route: 'PO', startDate: '2026-03-10', active: true },
      { drug: 'Fenofibrate',   dose: '145 mg', frequency: 'QD',  route: 'PO', startDate: '2026-03-10', active: true },
    ],
    labs: [
      { test: 'Fasting Blood Glucose', value: '118', unit: 'mg/dL', status: 'pre-diabetic', range: '70-100',  date: '2026-03-10' },
      { test: 'Triglycerides',         value: '260', unit: 'mg/dL', status: 'high',         range: '<150',    date: '2026-03-10' },
      { test: 'LDL Cholesterol',       value: '148', unit: 'mg/dL', status: 'high',         range: '<100',    date: '2026-03-10' },
      { test: 'HDL Cholesterol',       value: '36',  unit: 'mg/dL', status: 'low',          range: '>40',     date: '2026-03-10' },
      { test: 'ALT (SGPT)',            value: '68',  unit: 'U/L',   status: 'high',         range: '<40',     date: '2026-03-10' },
      { test: 'AST (SGOT)',            value: '52',  unit: 'U/L',   status: 'high',         range: '<40',     date: '2026-03-10' },
      { test: 'BMI',                   value: '31',  unit: 'kg/m²', status: 'obese',        range: '18.5-24.9', date: '2026-03-10' },
    ],
  },
];

// ─── Convert to patient_PXXX.json format ────────────────────────────────────
function toJsonFileFormat(p) {
  return {
    id: p.id,
    name: p.name,
    age: p.age,
    gender: p.gender,
    bloodGroup: p.bloodGroup,
    city: p.city,
    smoking: p.smoking,
    alcohol: p.alcohol,
    email: p.email,
    status: p.status,
    registeredAt: 'Kathir Memorial Hospital',
    primaryDiagnosis: p.primaryDiagnosis,
    secondaryDiagnosis: p.secondaryDiagnosis,
    allergies: p.allergies,
    medications: p.medications.map(m => ({
      name: m.drug, dose: m.dose, frequency: m.frequency,
      route: m.route, since: m.startDate, active: m.active
    })),
    visits: p.visits.map(v => ({
      date: v.date, doctor: v.doctor, department: v.department,
      visitType: 'OPD', chiefComplaint: v.chiefComplaint,
      clinicalNote: v.clinicalNote, plan: v.plan,
      vitals: { bp: `${v.bp.systolic}/${v.bp.diastolic}`, pulse: v.pulse, weight: v.weight }
    })),
    labResults: (() => {
      const grouped = {};
      p.labs.forEach(l => {
        if (!grouped[l.test]) grouped[l.test] = [];
        grouped[l.test].push({ value: l.value, unit: l.unit, status: l.status, referenceRange: l.range, date: l.date });
      });
      return grouped;
    })(),
    flags: p.labs.filter(l => ['critical','high','low','elevated'].includes(l.status)).map(l =>
      `${l.test}: ${l.value} ${l.unit} (${l.status})`
    ),
  };
}

// ─── Seed local JSON files ───────────────────────────────────────────────────
function seedJsonFiles() {
  console.log('\n📁 Seeding local JSON files in data/...');
  let written = 0;
  for (const p of PATIENTS) {
    // Only write if file doesn't already exist (to avoid overwriting P001 intentionally)
    const filePath = path.join(DATA_DIR, `patient_${p.id}.json`);
    const payload  = toJsonFileFormat(p);
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`  ✅ Wrote ${path.basename(filePath)}`);
    written++;
  }
  console.log(`  → ${written} JSON files written to ${DATA_DIR}`);
}

// ─── Seed Supabase via REST (JS client) ─────────────────────────────────────
// Real live columns (probed 2026-09-24):
//   patients   → patient_id, name, email, age, gender, blood_group, city, status
//   visits     → patient_id, visit_date, doctor, department, chief_complaint, clinical_note, plan
//   medications→ patient_id, drug, dose, frequency, active
//   labs       → patient_id, test_name, value, unit, status, normal_range, lab_date
//   users      → id, name, email, password_hash, role, department, patient_id
async function seedSupabase(supabase) {
  console.log('\n☁️  Seeding Supabase tables...');

  let totalInserted = 0;

  for (const p of PATIENTS) {
    console.log(`\n  Patient ${p.id}: ${p.name}`);

    // 1. patients — only columns that exist in the live schema
    const { error: pErr } = await supabase.from('patients').upsert({
      patient_id: p.id,
      name:       p.name,
      email:      p.email,
      age:        p.age,
      gender:     p.gender,
      blood_group: p.bloodGroup,
      city:       p.city,
      status:     p.status,
    }, { onConflict: 'patient_id' });
    if (pErr) { console.warn(`    ⚠️  patients: ${pErr.message}`); continue; } // skip rest if patient fails
    console.log(`    ✅ patients`);
    totalInserted++;

    // 2. visits — only columns that exist
    for (const v of p.visits) {
      const { error: vErr } = await supabase.from('visits').insert({
        patient_id:      p.id,
        visit_date:      v.date,
        doctor:          v.doctor,
        department:      v.department,
        chief_complaint: v.chiefComplaint,
        clinical_note:   v.clinicalNote,
        plan:            v.plan,
      });
      if (vErr) console.warn(`    ⚠️  visit ${v.date}: ${vErr.message}`);
      else { process.stdout.write('.'); totalInserted++; }
    }
    console.log(` visits`);

    // 3. medications — only columns that exist
    for (const m of p.medications) {
      const { error: mErr } = await supabase.from('medications').insert({
        patient_id: p.id,
        drug:       m.drug,
        dose:       m.dose,
        frequency:  m.frequency,
        active:     m.active,
      });
      if (mErr) console.warn(`    ⚠️  med ${m.drug}: ${mErr.message}`);
      else { process.stdout.write('.'); totalInserted++; }
    }
    console.log(` medications`);

    // 4. labs
    for (const l of p.labs) {
      const { error: lErr } = await supabase.from('labs').insert({
        patient_id:  p.id,
        test_name:   l.test,
        value:       l.value,
        unit:        l.unit,
        status:      l.status,
        normal_range: l.range,
        lab_date:    l.date,
      });
      if (lErr) console.warn(`    ⚠️  lab ${l.test}: ${lErr.message}`);
      else { process.stdout.write('.'); totalInserted++; }
    }
    console.log(` labs`);
  }

  // 5. Seed a demo doctor user
  const bcrypt = (() => { try { return require('bcryptjs'); } catch { return null; } })();
  if (bcrypt) {
    const hash = bcrypt.hashSync('demo1234', 10);
    const { error: uErr } = await supabase.from('users').upsert({
      id:            'dev-demo-doctor',
      name:          'Dr. Demo',
      email:         'demo@clinsight.ai',
      password_hash: hash,
      role:          'doctor',
      department:    'General Medicine',
    }, { onConflict: 'id' });
    if (uErr) console.warn(`  ⚠️  users upsert: ${uErr.message}`);
    else { console.log('\n  ✅ users (demo doctor)'); totalInserted++; }
  }

  return totalInserted;
}


// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║          ClinSight AI — Database Seed Script         ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  // Always write JSON files (works offline, fast)
  seedJsonFiles();

  // Attempt Supabase seeding
  if (!SUPA_URL || !SUPA_KEY) {
    console.log('\n⚠️  SUPABASE_URL or SUPABASE_ANON_KEY not set — skipping Supabase seed.');
    console.log('   Local JSON files are ready for the JSON fallback path.');
    return;
  }

  console.log(`\n🔌 Connecting to Supabase: ${SUPA_URL}`);
  const supabase = createClient(SUPA_URL, SUPA_KEY);

  // Test connectivity with a lightweight probe
  const { data: probe, error: probeErr } = await supabase.from('patients').select('patient_id').limit(1);
  if (probeErr) {
    console.log(`\n❌ Supabase connection failed: ${probeErr.message}`);
    console.log('   This usually means:');
    console.log('   • The tables haven\'t been created yet → run db/schema.sql in Supabase SQL Editor first');
    console.log('   • RLS is blocking the anon key → check that policies allow read/write for all');
    console.log('   • Network/firewall issue');
    console.log('\n✅ Local JSON files are ready — the app will use those as fallback.');
    return;
  }

  console.log(`   ✅ Supabase REST reachable. Existing patients in DB: ${probe?.length ?? 0}`);

  const total = await seedSupabase(supabase);

  console.log('\n════════════════════════════════════════════════════════');
  console.log(`✅ Seed complete!`);
  console.log(`   • ${PATIENTS.length} patients seeded to Supabase`);
  console.log(`   • ${total} total rows inserted/upserted`);
  console.log(`   • ${PATIENTS.length} patient_PXXX.json files written to data/`);
  console.log('════════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('\n❌ Seed script failed:', err.message);
  process.exit(1);
});
