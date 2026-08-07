const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const DATASET_DIR = process.env.DATASET_DIR ? path.resolve(process.env.DATASET_DIR) : null;

let datasetCache = null;

function normalizeFlagType(status = '') {
  const value = String(status).toLowerCase();
  if (value.includes('critical') || value.includes('high') || value.includes('abnormal')) return 'HIGH';
  if (value.includes('borderline') || value.includes('monitor')) return 'MEDIUM';
  return 'LOW';
}

function loadDatasetCache() {
  if (datasetCache) return datasetCache;
  if (!DATASET_DIR || !fs.existsSync(DATASET_DIR)) return null;

  const readJson = (file) => {
    const full = path.join(DATASET_DIR, file);
    if (!fs.existsSync(full)) return [];
    return JSON.parse(fs.readFileSync(full, 'utf8'));
  };

  datasetCache = {
    patients: readJson('patients.json'),
    visits: readJson('visits.json'),
    medications: readJson('medications.json'),
    labs: readJson('labs.json'),
  };
  return datasetCache;
}

function fromDataset(patientId) {
  const data = loadDatasetCache();
  if (!data) return null;

  const p = data.patients.find((row) => row.patient_id === patientId);
  if (!p) return null;

  const visits = data.visits
    .filter((v) => v.patient_id === patientId)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((v) => ({
      date: v.date,
      doctor: v.doctor || 'On File',
      department: v.department || 'General Medicine',
      chiefComplaint: Array.isArray(v.symptoms) ? v.symptoms.join(', ') : '',
      clinicalNote: v.doctor_notes || '',
      plan: v.doctor_notes || '',
    }));

  const medications = data.medications
    .filter((m) => m.patient_id === patientId)
    .map((m) => ({
      name: m.drug,
      dose: m.dose,
      frequency: m.frequency,
      since: m.start_date || null,
    }));

  const groupedLabs = {};
  const rawLabs = data.labs
    .filter((l) => l.patient_id === patientId)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  rawLabs.forEach((l) => {
    if (!groupedLabs[l.test]) groupedLabs[l.test] = [];
    groupedLabs[l.test].push({
      date: l.date,
      value: l.value,
      unit: l.unit || '',
      status: l.status || 'Normal',
      referenceRange: l.normal_range || '',
    });
  });

  const clinicalFlags = rawLabs
    .filter((l) => normalizeFlagType(l.status) !== 'LOW')
    .slice(-8)
    .map((l) => ({
      type: normalizeFlagType(l.status),
      flag: `${l.test}: ${l.status} (${l.value}${l.unit || ''})`,
      date: l.date,
    }));

  return {
    id: p.patient_id,
    name: p.name,
    age: p.age,
    gender: p.gender,
    blood_group: p.blood_group || null,
    diagnoses: p.diagnosis || [],
    primaryDiagnosis: (p.diagnosis || []).slice(0, 2),
    secondaryDiagnosis: (p.diagnosis || []).slice(2),
    medications,
    labResults: groupedLabs,
    clinicalFlags,
    visits,
    allergies: p.allergies || [],
    overdueTests: [],
  };
}

const patientRepository = require('../repositories/patientRepository');

function loadPatient(patientId) {
  const file = path.join(DATA_DIR, `patient_${patientId}.json`);
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  return fromDataset(patientId);
}

function get_patient_case_sheet(patient_id) {
  const patient = loadPatient(patient_id);
  if (!patient) return { error: `Patient ${patient_id} not found` };
  return patient;
}

function extract_lab_trends(patient_id, test_name, date_range) {
  const patient = loadPatient(patient_id);
  if (!patient) return { error: 'Patient not found' };
  const aliasMap = {
    SerumCreatinine: 'Creatinine',
    BloodPressure: 'Blood Pressure',
    Cholesterol: 'Total Cholesterol',
    Haemoglobin: 'Hemoglobin',
  };
  const normalizedTestName = patient.labResults[test_name]
    ? test_name
    : aliasMap[test_name] || test_name;
  const labs = patient.labResults[normalizedTestName];
  if (!labs) return { error: `No lab data found for ${test_name}` };
  let results = labs;
  if (date_range) {
    const { from, to } = date_range;
    results = labs.filter(l => {
      const d = new Date(l.date);
      return (!from || d >= new Date(from)) && (!to || d <= new Date(to));
    });
  }
  const values = results.map(r => r.value || r.systolic);
  const trend = values.length > 1
    ? values[values.length - 1] > values[0] ? 'WORSENING' : values[values.length - 1] < values[0] ? 'IMPROVING' : 'STABLE'
    : 'INSUFFICIENT_DATA';
  return { test_name: normalizedTestName, data: results, trend, count: results.length };
}

const BIOLOGICAL_BOUNDS = {
  HbA1c: { min: 3.0, max: 20.0, unit: '%', UCUM: '%' },
  SerumCreatinine: { min: 0.1, max: 25.0, unit: 'mg/dL', UCUM: 'mg/dL' },
  eGFR: { min: 5.0, max: 200.0, unit: 'mL/min', UCUM: 'mL/min/1.73m2' },
  Glucose: { min: 20.0, max: 1000.0, unit: 'mg/dL', UCUM: 'mg/dL' },
  Haemoglobin: { min: 2.0, max: 25.0, unit: 'g/dL', UCUM: 'g/dL' },
};

function validate_biological_bounds(labsObj) {
  const violations = [];
  if (!labsObj || typeof labsObj !== 'object') return violations;

  Object.entries(labsObj).forEach(([testName, value]) => {
    const bound = BIOLOGICAL_BOUNDS[testName];
    if (!bound) return;

    let numVal = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(numVal)) return;

    if (numVal < bound.min || numVal > bound.max) {
      violations.append ? violations.append : violations.push({
        test_name: testName,
        value: numVal,
        unit: bound.unit,
        severity: 'PHYSIOLOGICAL_VIOLATION',
        message: `Physiologically impossible ${testName} value: ${numVal}${bound.unit} (Expected ${bound.min}–${bound.max}${bound.unit})`,
      });
    }
  });

  return violations;
}

const INDIAN_BRAND_DICTIONARY = {
  'hcqs': 'Hydroxychloroquine 200mg',
  'folitrax': 'Methotrexate 15mg',
  'folvite': 'Folic Acid 5mg',
  'wysolone': 'Prednisolone 5mg',
  'rablet': 'Rabeprazole 20mg',
  'rablet-d': 'Rabeprazole + Domperidone',
  'rabletd': 'Rabeprazole + Domperidone',
  'd-logy': 'Cholecalciferol / Vitamin D3',
  'dlogy': 'Cholecalciferol / Vitamin D3',
  'augmentin': 'Amoxicillin + Clavulanate',
  'ecosprin': 'Aspirin 75mg',
  'pantocid': 'Pantoprazole 40mg',
  'pantodac': 'Pantoprazole 40mg',
  'dolo': 'Paracetamol 650mg',
  'dolo-650': 'Paracetamol 650mg',
  'dolo650': 'Paracetamol 650mg',
  'crocin': 'Paracetamol 500mg',
  'calpol': 'Paracetamol 500mg',
  'pan-d': 'Pantoprazole + Domperidone',
  'glycomet': 'Metformin 500mg',
  'metolar': 'Metoprolol 25mg',
  'febutaz': 'Febuxostat 40mg',
};

async function validate_drug_with_nih_rxnorm(drugName) {
  try {
    const raw = String(drugName).trim();
    const firstWord = raw.split(/\s+/)[0].toLowerCase();
    const cleanName = firstWord.replace(/[^a-zA-Z0-9\-]/g, '');
    const alphaOnly = firstWord.replace(/[^a-zA-Z]/g, '');

    // Check regional brand dictionary first
    const brandMatch = INDIAN_BRAND_DICTIONARY[cleanName] || INDIAN_BRAND_DICTIONARY[alphaOnly];
    if (brandMatch) {
      return {
        verified: true,
        drug: drugName,
        genericName: brandMatch,
        rxcui: 'BRAND_MATCH_' + alphaOnly.toUpperCase(),
        source: 'Regional_Brand_Dictionary',
      };
    }

    const url = `https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${encodeURIComponent(cleanName)}`;
    const res = await fetch(url);
    const data = await res.json();
    const rxcui = data.idGroup?.rxnormId?.[0];
    if (rxcui) {
      return { verified: true, drug: drugName, rxcui, source: 'NIH_NLM_RxNorm_API' };
    }
    return { verified: false, drug: drugName, error: `Unrecognized medication name: ${drugName} — possible AI/OCR hallucination`, source: 'NIH_NLM_RxNorm_API' };
  } catch (err) {
    return { verified: false, drug: drugName, error: err.message };
  }
}

function check_drug_interactions(medication_list) {
  const db = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'drug_interactions.json'), 'utf8'));
  const found = [];
  for (let i = 0; i < medication_list.length; i++) {
    for (let j = i + 1; j < medication_list.length; j++) {
      const d1 = medication_list[i].toLowerCase();
      const d2 = medication_list[j].toLowerCase();
      const match = db.find(entry =>
        (entry.drug1.toLowerCase() === d1 && entry.drug2.toLowerCase() === d2) ||
        (entry.drug1.toLowerCase() === d2 && entry.drug2.toLowerCase() === d1) ||
        d1.includes(entry.drug1.toLowerCase()) || d2.includes(entry.drug1.toLowerCase())
      );
      if (match) found.push(match);
    }
  }
  return { interactions: found, count: found.length, hasCritical: found.some(f => f.severity === 'CRITICAL') };
}

function get_clinical_guideline(diagnosis_code, query_type) {
  const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'clinical_guidelines.json'), 'utf8'));
  const matches = data.guidelines.filter(g => g.code === diagnosis_code);
  if (query_type) return matches.filter(g => g.test.toLowerCase().includes(query_type.toLowerCase()));
  return matches;
}

function generate_consultation_brief(patient_id) {
  const patient = loadPatient(patient_id);
  if (!patient) return { error: 'Patient not found' };
  const lastVisit = patient.visits[patient.visits.length - 1];
  const criticalFlags = patient.clinicalFlags.filter(f => f.type === 'CRITICAL');
  const highFlags = patient.clinicalFlags.filter(f => f.type === 'HIGH');
  const recentLabs = {};
  Object.entries(patient.labResults).forEach(([test, values]) => {
    if (values.length > 0) recentLabs[test] = values.slice(-3);
  });
  return {
    patientId: patient_id,
    patientName: patient.name,
    age: patient.age,
    primaryDiagnosis: patient.primaryDiagnosis,
    chiefComplaintHistory: patient.visits.map(v => ({ date: v.date, complaint: v.chiefComplaint, doctor: v.doctor })),
    currentMedications: patient.medications,
    last3LabResults: recentLabs,
    redFlags: [...criticalFlags, ...highFlags],
    lastVisitSummary: lastVisit,
    allergies: patient.allergies,
    overdueTests: patient.overdueTests,
    generatedAt: new Date().toISOString()
  };
}

function flag_clinical_pattern(patient_id, pattern_type) {
  const patient = loadPatient(patient_id);
  if (!patient) return { error: 'Patient not found' };
  const flags = patient.clinicalFlags;
  if (pattern_type) {
    return flags.filter(f => f.flag.toLowerCase().includes(pattern_type.toLowerCase()) || f.type === pattern_type.toUpperCase());
  }
  return flags;
}

function triage_patient(patient_id) {
  const patient = loadPatient(patient_id);
  if (!patient) return { error: 'Patient not found' };
  const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'clinical_guidelines.json'), 'utf8'));
  const criticalFlags = patient.clinicalFlags.filter(f => f.type === 'CRITICAL' || f.type === 'HIGH');
  const needsConsultation = criticalFlags.length > 0;
  const specialties = [];
  criticalFlags.forEach(flag => {
    data.specialtyRouting.forEach(route => {
      if (flag.flag.toLowerCase().includes(route.flag.split(' ')[0].toLowerCase())) {
        specialties.push({ specialty: route.specialty, department: route.department, priority: route.priority, reason: flag.flag });
      }
    });
  });
  return { needs_consultation: needsConsultation, specialties: [...new Map(specialties.map(s => [s.specialty, s])).values()], flags: criticalFlags };
}

function recommend_lab_tests(patient_id) {
  const patient = loadPatient(patient_id);
  if (!patient) return { error: 'Patient not found' };
  return patient.overdueTests;
}

function get_pharmacy_link(medication_name) {
  const name = encodeURIComponent(medication_name);
  return {
    medicine: medication_name,
    url_1mg: `https://www.1mg.com/search/all?name=${name}`,
    url_netmeds: `https://www.netmeds.com/catalogsearch/result?q=${name}`,
    nearby_pharmacy: `https://maps.google.com/?q=pharmacy+near+Melakottaiyur+Chennai`
  };
}

function transfer_patient_record(patient_id, from_doctor, to_doctor, reason) {
  const brief = generate_consultation_brief(patient_id);
  return {
    transfer_id: `TRF-${Date.now()}`,
    patient_id,
    from_doctor,
    to_doctor,
    reason,
    bundled_brief: brief,
    timestamp: new Date().toISOString(),
    status: 'TRANSFERRED'
  };
}

function search_patient_history(patient_id, query) {
  const patient = loadPatient(patient_id);
  if (!patient) return { error: 'Patient not found' };
  const q = query.toLowerCase();
  const results = [];
  patient.visits.forEach(visit => {
    const note = visit.clinicalNote.toLowerCase();
    const plan = visit.plan.toLowerCase();
    if (note.includes(q) || plan.includes(q)) {
      const idx = note.indexOf(q);
      const snippet = visit.clinicalNote.substring(Math.max(0, idx - 60), idx + 120);
      results.push({ date: visit.date, doctor: visit.doctor, department: visit.department, snippet: snippet + '...' });
    }
  });
  // Also search allergies
  const allergyMatch = patient.allergies.some(a => a.toLowerCase().includes(q));
  if (allergyMatch) {
    results.unshift({ date: 'ALLERGY RECORD', doctor: 'On File', department: 'Medical Records', snippet: patient.allergies.join(', ') });
  }
  return { query, results, found: results.length > 0 };
}

module.exports = {
  get_patient_case_sheet,
  extract_lab_trends,
  check_drug_interactions,
  get_clinical_guideline,
  generate_consultation_brief,
  flag_clinical_pattern,
  triage_patient,
  recommend_lab_tests,
  get_pharmacy_link,
  transfer_patient_record,
  search_patient_history,
  validate_biological_bounds,
  validate_drug_with_nih_rxnorm,
};
