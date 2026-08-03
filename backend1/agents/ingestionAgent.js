require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { indexPatient } = require("../rag/vectorStore");

const DATA_DIR = path.join(__dirname, "../data");

function patientFile(patientId) {
  return path.join(DATA_DIR, `patient_${patientId}.json`);
}

function loadPatient(patientId) {
  const file = patientFile(patientId);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function savePatient(patientId, data) {
  fs.writeFileSync(patientFile(patientId), JSON.stringify(data, null, 2));
}

async function savePatientToPostgres(patientId, patient) {
  if (!process.env.DATABASE_URL) return;
  try {
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const now = new Date().toISOString().slice(0, 10);

    // 1. Upsert Patient
    await pool.query(
      `INSERT INTO patients (patient_id, name, email, age, gender, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (patient_id) DO UPDATE SET
         name = EXCLUDED.name,
         status = EXCLUDED.status`,
      [patientId, patient.name || 'Unknown', `${patientId.toLowerCase()}@patient.local`, patient.age || 45, patient.gender || 'Unknown', patient.status || 'stable']
    );

    // 2. Insert Visits
    if (patient.visits?.length) {
      const v = patient.visits[patient.visits.length - 1];
      await pool.query(
        `INSERT INTO visits (patient_id, visit_date, doctor, department, chief_complaint, clinical_note, plan)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [patientId, v.date || now, v.doctor || 'OCR Import', v.department || 'Medical Records', v.chiefComplaint || '', v.clinicalNote || '', v.plan || '']
      );
    }

    // 3. Insert Medications
    for (const m of (patient.medications || [])) {
      const name = typeof m === 'string' ? m : m.name;
      if (name) {
        await pool.query(
          `INSERT INTO medications (patient_id, drug, active) VALUES ($1, $2, $3)`,
          [patientId, name, true]
        );
      }
    }

    // 4. Insert Labs
    for (const [testName, entries] of Object.entries(patient.labResults || {})) {
      if (Array.isArray(entries) && entries.length) {
        const lastEntry = entries[entries.length - 1];
        await pool.query(
          `INSERT INTO labs (patient_id, test_name, value, unit, status, lab_date) VALUES ($1, $2, $3, $4, $5, $6)`,
          [patientId, testName, String(lastEntry.value || ''), lastEntry.unit || '', 'NORMAL', lastEntry.date || now]
        );
      }
    }

    await pool.end();
  } catch (err) {
    console.warn('Postgres SQL upsert warning during ingestion:', err.message);
  }
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function uniqStrings(values) {
  return [...new Set(values.map((v) => String(v).trim()).filter(Boolean))];
}

function appendLab(patient, testName, entry) {
  if (!patient.labResults[testName]) patient.labResults[testName] = [];
  patient.labResults[testName].push(entry);
}

function normalizeRecord(patientId, existing) {
  return existing || {
    id: String(patientId),
    name: "Unknown",
    age: null,
    gender: null,
    bloodGroup: null,
    primaryDiagnosis: [],
    secondaryDiagnosis: [],
    allergies: [],
    medications: [],
    labResults: {},
    visits: [],
    clinicalFlags: [],
    overdueTests: [],
  };
}

async function runIngestionAgent(patientId, structuredOCRData) {
  try {
    if (!patientId || !structuredOCRData) {
      return { success: false, error: "patientId and structuredOCRData are required" };
    }

    const patient = normalizeRecord(patientId, loadPatient(patientId));
    const now = new Date().toISOString();

    if (structuredOCRData.patient_name) {
      patient.name = structuredOCRData.patient_name;
    }

    patient.primaryDiagnosis = uniqStrings([
      ...toArray(patient.primaryDiagnosis),
      ...toArray(structuredOCRData.diagnosis),
    ]);

    patient.allergies = uniqStrings([
      ...toArray(patient.allergies),
      ...toArray(structuredOCRData.allergies),
    ]);

    const oldMeds = toArray(patient.medications).map((m) => (typeof m === "string" ? m : m.name));
    const newMeds = toArray(structuredOCRData.medications);
    patient.medications = uniqStrings([...oldMeds, ...newMeds]).map((name) => ({ name }));

    const tests = toArray(structuredOCRData.tests_recommended);
    const existingTests = toArray(patient.overdueTests).map((t) => (typeof t === "string" ? t : t.test));
    patient.overdueTests = uniqStrings([...existingTests, ...tests]).map((test) => ({ test }));

    const symptoms = toArray(structuredOCRData.symptoms);
    for (const symptom of symptoms) {
      patient.clinicalFlags.push({
        type: "HIGH",
        flag: `Reported symptom: ${symptom}`,
        evidence: "Imported from OCR document",
        recommendation: "Physician review advised",
      });
    }

    const labs = structuredOCRData.lab_results || {};
    if (typeof labs.HbA1c === "number") {
      appendLab(patient, "HbA1c", { date: now.slice(0, 10), value: labs.HbA1c, source: "OCR_INGESTION" });
    }
    if (typeof labs.SerumCreatinine === "number") {
      appendLab(patient, "SerumCreatinine", { date: now.slice(0, 10), value: labs.SerumCreatinine, source: "OCR_INGESTION" });
    }
    if (typeof labs.eGFR === "number") {
      appendLab(patient, "eGFR", { date: now.slice(0, 10), value: labs.eGFR, source: "OCR_INGESTION" });
    }
    if (typeof labs.Haemoglobin === "number") {
      appendLab(patient, "Haemoglobin", { date: now.slice(0, 10), value: labs.Haemoglobin, source: "OCR_INGESTION" });
    }
    if (labs.BloodPressure && typeof labs.BloodPressure.systolic === "number" && typeof labs.BloodPressure.diastolic === "number") {
      appendLab(patient, "BloodPressure", {
        date: now.slice(0, 10),
        systolic: labs.BloodPressure.systolic,
        diastolic: labs.BloodPressure.diastolic,
        source: "OCR_INGESTION",
      });
    }

    patient.visits.push({
      date: now.slice(0, 10),
      doctor: "OCR Import",
      department: "Medical Records",
      chiefComplaint: symptoms.join(", ") || "Document ingestion",
      clinicalNote: structuredOCRData.clinical_summary || "",
      plan: tests.join(", "),
      source: "OCR_INGESTION",
    });

    savePatient(patientId, patient);
    await savePatientToPostgres(patientId, patient);
    await indexPatient(patient);

    return {
      success: true,
      patient_id: String(patientId),
      message: "Patient data ingested successfully",
      medications_count: patient.medications.length,
      visits_count: patient.visits.length,
      diagnoses_count: patient.primaryDiagnosis.length,
    };
  } catch (error) {
    return {
      success: false,
      error: "Ingestion agent failed",
      message: error.message,
    };
  }
}

module.exports = { runIngestionAgent };
