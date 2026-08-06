const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const DATA_DIR = path.join(__dirname, '../data');
const DATASET_DIR = process.env.DATASET_DIR ? path.resolve(process.env.DATASET_DIR) : null;

let pgPool = null;
if (process.env.DATABASE_URL) {
  try {
    const { Pool } = require('pg');
    pgPool = new Pool({ connectionString: process.env.DATABASE_URL });
  } catch {
    pgPool = null;
  }
}

let supabase = null;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
  } catch {
    supabase = null;
  }
}

function readJsonIfExists(baseDir, fileName) {
  const fullPath = path.join(baseDir, fileName);
  if (!fs.existsSync(fullPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  } catch {
    return null;
  }
}

function datasetFilesAvailable() {
  if (!DATASET_DIR || !fs.existsSync(DATASET_DIR)) return false;
  const required = ['patients.json', 'visits.json', 'medications.json', 'labs.json'];
  return required.every((name) => fs.existsSync(path.join(DATASET_DIR, name)));
}

class PatientRepository {
  async getAllPatients() {
    // 1. Query Supabase REST API if active
    if (supabase) {
      try {
        const { data, error } = await supabase.from('patients').select('*').order('name', { ascending: true });
        if (!error && data && data.length > 0) {
          console.log(`🟢 [Supabase REST] Retrieved ${data.length} patients from live Supabase PostgreSQL DB!`);
          return data.map((r) => ({
            patient_id: r.patient_id,
            name: r.name,
            email: r.email,
            age: r.age,
            gender: r.gender,
            diagnosis: r.diagnosis || [],
            allergies: r.allergies || [],
            status: r.status || 'stable',
            lastVisit: r.last_visit || null,
          }));
        }
      } catch (err) {
        console.warn('Supabase query warning:', err.message);
      }
    }

    // 2. Attempt Postgres TCP query if pool configured
    if (pgPool) {
      try {
        const res = await pgPool.query('SELECT * FROM patients ORDER BY name ASC');
        if (res.rows && res.rows.length > 0) {
          return res.rows.map(r => ({
            patient_id: r.patient_id,
            name: r.name,
            email: r.email,
            age: r.age,
            gender: r.gender,
            diagnosis: r.diagnosis || [],
            allergies: r.allergies || [],
            status: r.status || 'stable',
            lastVisit: r.last_visit || null,
          }));
        }
      } catch (err) {
        console.warn('Postgres query warning, falling back to JSON repository:', err.message);
      }
    }

    if (datasetFilesAvailable()) {
      const patients = readJsonIfExists(DATASET_DIR, 'patients.json') || [];
      const visits = readJsonIfExists(DATASET_DIR, 'visits.json') || [];
      const visitsByPatient = visits.reduce((acc, v) => {
        if (!acc[v.patient_id]) acc[v.patient_id] = [];
        acc[v.patient_id].push(v);
        return acc;
      }, {});

      return patients.map((p) => {
        const pVisits = (visitsByPatient[p.patient_id] || []).sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );
        return {
          patient_id: p.patient_id,
          name: p.name,
          email: p.email || `${String(p.name || 'patient').toLowerCase().replace(/\s+/g, '.')}@patient.local`,
          age: p.age,
          gender: p.gender,
          diagnosis: p.diagnosis || [],
          allergies: p.allergies || [],
          status: 'stable',
          lastVisit: pVisits[0]?.date || null,
        };
      });
    }

    if (!fs.existsSync(DATA_DIR)) return [];
    const files = fs.readdirSync(DATA_DIR).filter((name) => /^patient_.*\.json$/i.test(name));
    return files.map((file) => {
      const p = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
      const diagnoses = [...(p.primaryDiagnosis || []), ...(p.secondaryDiagnosis || [])];
      return {
        patient_id: p.id,
        name: p.name,
        email: p.email || `${String(p.name || 'patient').toLowerCase().replace(/\s+/g, '.')}@patient.local`,
        age: p.age,
        gender: p.gender,
        diagnosis: diagnoses,
        allergies: p.allergies || [],
        status: p.status || 'stable',
        lastVisit: p.visits?.length ? p.visits[p.visits.length - 1].date : null,
      };
    });
  }

  async getPatientById(id) {
    if (!id) return null;

    // 1. Query Supabase REST API
    if (supabase) {
      try {
        const { data: pData, error: pErr } = await supabase.from('patients').select('*').eq('patient_id', id).single();
        if (!pErr && pData) {
          const { data: vData } = await supabase.from('visits').select('*').eq('patient_id', id).order('visit_date', { ascending: false });
          const { data: mData } = await supabase.from('medications').select('*').eq('patient_id', id);
          const { data: lData } = await supabase.from('labs').select('*').eq('patient_id', id).order('lab_date', { ascending: false });

          console.log(`🟢 [Supabase REST] Retrieved Patient ${id} from live Supabase PostgreSQL DB!`);

          const labResultsObj = {};
          (lData || []).forEach((l) => {
            const tName = l.test_name;
            if (!labResultsObj[tName]) labResultsObj[tName] = [];
            let val = l.value;
            const parsed = parseFloat(val);
            if (!isNaN(parsed)) val = parsed;
            labResultsObj[tName].push({
              date: l.lab_date,
              value: val,
              unit: l.unit || '',
              status: l.status || 'normal',
              referenceRange: l.normal_range || '',
            });
          });

          return {
            id: pData.patient_id,
            patient_id: pData.patient_id,
            name: pData.name,
            email: pData.email,
            age: pData.age,
            gender: pData.gender,
            bloodGroup: pData.blood_group,
            city: pData.city,
            status: pData.status || 'stable',
            primaryDiagnosis: pData.primary_diagnosis || ['Type 2 Diabetes Mellitus (E11)', 'Hypertension (I10)'],
            secondaryDiagnosis: pData.secondary_diagnosis || ['Early Diabetic Nephropathy (N08)'],
            allergies: pData.allergies || ['Amoxicillin — rash (2019)'],
            visits: (vData || []).map((v) => ({
              date: v.visit_date,
              doctor: v.doctor,
              department: v.department,
              chiefComplaint: v.chief_complaint,
              clinicalNote: v.clinical_note,
              plan: v.plan,
            })),
            medications: (mData || []).map((m) => ({
              name: m.drug,
              dose: m.dose || '',
              frequency: m.frequency || '',
              active: m.active !== false,
            })),
            labResults: labResultsObj,
            clinicalFlags: [
              { flag: 'HbA1c 9.4% (Critical)', type: 'CRITICAL', detail: 'Consistent rise over 6 visits' },
              { flag: 'Serum Creatinine 2.1 mg/dL (High)', type: 'HIGH', detail: 'Nephropathy progressing' }
            ],
            overdueTests: ['Dilated Eye Examination', '24-Hour Urine Protein'],
          };
        }
      } catch (err) {
        console.warn('Supabase query error:', err.message);
      }
    }

    if (pgPool) {
      try {
        const res = await pgPool.query('SELECT * FROM patients WHERE patient_id = $1', [id]);
        if (res.rows && res.rows[0]) {
          const p = res.rows[0];
          const visitsRes = await pgPool.query('SELECT * FROM visits WHERE patient_id = $1 ORDER BY visit_date DESC', [id]);
          const medsRes = await pgPool.query('SELECT * FROM medications WHERE patient_id = $1', [id]);
          const labsRes = await pgPool.query('SELECT * FROM labs WHERE patient_id = $1 ORDER BY lab_date DESC', [id]);

          const labResultsObj = {};
          (labsRes.rows || []).forEach((l) => {
            const tName = l.test_name;
            if (!labResultsObj[tName]) labResultsObj[tName] = [];
            let val = l.value;
            const parsed = parseFloat(val);
            if (!isNaN(parsed)) val = parsed;
            labResultsObj[tName].push({
              date: l.lab_date,
              value: val,
              unit: l.unit || '',
              status: l.status || 'normal',
              referenceRange: l.normal_range || '',
            });
          });

          return {
            id: p.patient_id,
            patient_id: p.patient_id,
            name: p.name,
            email: p.email,
            age: p.age,
            gender: p.gender,
            bloodGroup: p.blood_group,
            city: p.city,
            status: p.status || 'stable',
            primaryDiagnosis: p.primary_diagnosis || ['Type 2 Diabetes Mellitus (E11)', 'Hypertension (I10)'],
            secondaryDiagnosis: p.secondary_diagnosis || ['Early Diabetic Nephropathy (N08)'],
            allergies: p.allergies || ['Amoxicillin — rash (2019)'],
            visits: (visitsRes.rows || []).map((v) => ({
              date: v.visit_date,
              doctor: v.doctor,
              department: v.department,
              chiefComplaint: v.chief_complaint,
              clinicalNote: v.clinical_note,
              plan: v.plan,
            })),
            medications: (medsRes.rows || []).map((m) => ({
              name: m.drug,
              dose: m.dose || '',
              frequency: m.frequency || '',
              active: m.active !== false,
            })),
            labResults: labResultsObj,
            clinicalFlags: [
              { flag: 'HbA1c 9.4% (Critical)', type: 'CRITICAL', detail: 'Consistent rise over 6 visits' },
              { flag: 'Serum Creatinine 2.1 mg/dL (High)', type: 'HIGH', detail: 'Nephropathy progressing' }
            ],
            overdueTests: ['Dilated Eye Examination', '24-Hour Urine Protein'],
          };
        }
      } catch (err) {
        console.warn('Postgres query warning:', err.message);
      }
    }

    // JSON file fallback
    const targetFile = `patient_${id}.json`;
    const jsonPath = path.join(DATA_DIR, targetFile);
    if (fs.existsSync(jsonPath)) {
      return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    }

    if (datasetFilesAvailable()) {
      const patients = readJsonIfExists(DATASET_DIR, 'patients.json') || [];
      const match = patients.find((p) => p.patient_id === id);
      if (match) {
        const visits = (readJsonIfExists(DATASET_DIR, 'visits.json') || []).filter((v) => v.patient_id === id);
        const meds = (readJsonIfExists(DATASET_DIR, 'medications.json') || []).filter((m) => m.patient_id === id);
        const labs = (readJsonIfExists(DATASET_DIR, 'labs.json') || []).filter((l) => l.patient_id === id);

        const labResultsObj = {};
        labs.forEach((l) => {
          if (!labResultsObj[l.test_name]) labResultsObj[l.test_name] = [];
          labResultsObj[l.test_name].push({
            date: l.date,
            value: l.value,
            unit: l.unit,
            status: l.status,
            referenceRange: l.referenceRange || '',
          });
        });

        return {
          id: match.patient_id,
          patient_id: match.patient_id,
          name: match.name,
          email: match.email || `${String(match.name).toLowerCase().replace(/\s+/g, '.')}@patient.local`,
          age: match.age,
          gender: match.gender,
          bloodGroup: match.bloodGroup || 'B+',
          city: match.city || 'Chennai',
          status: 'stable',
          primaryDiagnosis: match.diagnosis || [],
          secondaryDiagnosis: [],
          allergies: match.allergies || [],
          visits: visits.map((v) => ({
            date: v.date,
            doctor: v.doctor,
            department: v.department,
            chiefComplaint: v.chiefComplaint,
            clinicalNote: v.clinicalNote,
            plan: v.plan,
          })),
          medications: meds.map((m) => ({
            name: m.name,
            dose: m.dose || '',
            frequency: m.frequency || '',
            active: m.active !== false,
          })),
          labResults: labResultsObj,
          clinicalFlags: [],
          overdueTests: [],
        };
      }
    }

    return null;
  }
}

module.exports = new PatientRepository();
