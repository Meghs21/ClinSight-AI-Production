const fs = require('fs');
const path = require('path');

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
    // Attempt Postgres query if pool configured
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

    if (pgPool) {
      try {
        const res = await pgPool.query('SELECT * FROM patients WHERE patient_id = $1', [id]);
        if (res.rows && res.rows[0]) {
          const p = res.rows[0];
          const visitsRes = await pgPool.query('SELECT * FROM visits WHERE patient_id = $1 ORDER BY visit_date DESC', [id]);
          const medsRes = await pgPool.query('SELECT * FROM medications WHERE patient_id = $1', [id]);
          const labsRes = await pgPool.query('SELECT * FROM labs WHERE patient_id = $1 ORDER BY lab_date DESC', [id]);

          // Reconstruct labResults object grouped by test_name
          const labResultsObj = {};
          (labsRes.rows || []).forEach((l) => {
            const tName = l.test_name;
            if (!labResultsObj[tName]) labResultsObj[tName] = [];
            let val = l.value;
            try {
              if (typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))) {
                val = JSON.parse(val);
              } else if (!isNaN(Number(val))) {
                val = Number(val);
              }
            } catch {}

            labResultsObj[tName].push({
              date: l.lab_date ? new Date(l.lab_date).toISOString().slice(0, 10) : '',
              value: val,
              unit: l.unit || '',
              status: l.status || 'NORMAL',
              normalRange: l.normal_range || '',
            });
          });

          // Reconstruct visits array
          const visitsArr = (visitsRes.rows || []).map((v) => ({
            date: v.visit_date ? new Date(v.visit_date).toISOString().slice(0, 10) : '',
            doctor: v.doctor || 'Attending Physician',
            department: v.department || 'General Medicine',
            chiefComplaint: v.chief_complaint || '',
            clinicalNote: v.clinical_note || '',
            plan: v.plan || '',
          }));

          // Reconstruct medications array
          const medsArr = (medsRes.rows || []).map((m) => ({
            name: m.drug,
            dose: m.dose || '',
            frequency: m.frequency || '',
            prescribedBy: m.prescribed_by || '',
            active: m.active !== false,
          }));

          return {
            id: p.patient_id,
            patient_id: p.patient_id,
            name: p.name,
            email: p.email || '',
            age: p.age,
            gender: p.gender,
            bloodGroup: p.blood_group || 'O+',
            city: p.city || 'Chennai',
            status: p.status || 'stable',
            primaryDiagnosis: Array.isArray(p.diagnosis) ? p.diagnosis : [p.diagnosis].filter(Boolean),
            secondaryDiagnosis: [],
            allergies: Array.isArray(p.allergies) ? p.allergies : [p.allergies].filter(Boolean),
            medications: medsArr,
            labResults: labResultsObj,
            visits: visitsArr,
            clinicalFlags: [],
            overdueTests: [],
          };
        }
      } catch (err) {
        console.warn('Postgres query warning, falling back to JSON repository:', err.message);
      }
    }

    const targetFile = path.join(DATA_DIR, `patient_${id}.json`);
    if (fs.existsSync(targetFile)) {
      try {
        return JSON.parse(fs.readFileSync(targetFile, 'utf8'));
      } catch {
        return null;
      }
    }

    if (datasetFilesAvailable()) {
      const patients = readJsonIfExists(DATASET_DIR, 'patients.json') || [];
      const patient = patients.find((p) => String(p.patient_id) === String(id) || String(p.id) === String(id));
      if (!patient) return null;

      const visits = (readJsonIfExists(DATASET_DIR, 'visits.json') || []).filter((v) => String(v.patient_id) === String(id));
      const meds = (readJsonIfExists(DATASET_DIR, 'medications.json') || []).filter((m) => String(m.patient_id) === String(id));
      const labs = (readJsonIfExists(DATASET_DIR, 'labs.json') || []).filter((l) => String(l.patient_id) === String(id));

      return {
        id: patient.patient_id || patient.id,
        name: patient.name,
        age: patient.age,
        gender: patient.gender,
        diagnosis: patient.diagnosis || [],
        allergies: patient.allergies || [],
        visits,
        medications: meds,
        labs,
      };
    }

    return null;
  }

  async savePatientBundle(patientId, bundle) {
    if (!patientId || !bundle) return false;
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

    const targetFile = path.join(DATA_DIR, `patient_${patientId}.json`);
    try {
      fs.writeFileSync(targetFile, JSON.stringify(bundle, null, 2), 'utf8');
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = new PatientRepository();
