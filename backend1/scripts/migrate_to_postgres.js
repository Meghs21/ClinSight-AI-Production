require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATA_DIR = path.join(__dirname, '../data');

async function migrateDataToPostgres() {
  console.log('====================================================');
  console.log('🐘 ONE-TIME DATA MIGRATION: JSON FILES -> POSTGRESQL');
  console.log('====================================================\n');

  const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/clindsight_ai';
  console.log(`🔌 Connecting to PostgreSQL at: ${connectionString.replace(/:[^:@]+@/, ':****@')}...`);

  let pool;
  try {
    pool = new Pool({ connectionString });
    await pool.query('SELECT 1');
    console.log('✅ PostgreSQL Connection Established!\n');
  } catch (err) {
    console.error('❌ Unable to connect to PostgreSQL:', err.message);
    console.error('⚠️ Ensure Docker PostgreSQL container is running (docker-compose up -d postgres).');
    process.exit(1);
  }

  // Ensure tables exist by executing DDL schema
  const schemaPath = path.join(__dirname, '../db/schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(schemaSql);
    console.log('📜 Database DDL schema verified.\n');
  }

  if (!fs.existsSync(DATA_DIR)) {
    console.error('❌ Data directory missing:', DATA_DIR);
    process.exit(1);
  }

  const patientFiles = fs.readdirSync(DATA_DIR).filter((name) => /^patient_.*\.json$/i.test(name));
  console.log(`📁 Found ${patientFiles.length} patient JSON files to migrate.\n`);

  let patientCount = 0;
  let visitCount = 0;
  let medCount = 0;
  let labCount = 0;

  for (const file of patientFiles) {
    const filePath = path.join(DATA_DIR, file);
    try {
      const p = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const patientId = p.id || p.patient_id;
      if (!patientId) continue;

      const diagnoses = [...(p.primaryDiagnosis || []), ...(p.secondaryDiagnosis || [])];
      const name = p.name || 'Unknown Patient';

      // 1. Upsert Patient
      await pool.query(
        `INSERT INTO patients (patient_id, name, email, age, gender, blood_group, city, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (patient_id) DO UPDATE SET
           name = EXCLUDED.name,
           email = EXCLUDED.email,
           age = EXCLUDED.age,
           gender = EXCLUDED.gender,
           status = EXCLUDED.status`,
        [
          patientId,
          name,
          p.email || `${patientId.toLowerCase()}@patient.local`,
          p.age || 45,
          p.gender || 'Unknown',
          p.bloodGroup || 'O+',
          p.city || 'Chennai',
          p.status || 'stable',
        ]
      );
      patientCount++;

      // 2. Upsert Visits
      const visits = p.visits || [];
      for (const v of visits) {
        const visitDate = v.date || new Date().toISOString().slice(0, 10);
        await pool.query(
          `INSERT INTO visits (patient_id, visit_date, doctor, department, chief_complaint, clinical_note, plan)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            patientId,
            visitDate,
            v.doctor || 'Attending Physician',
            v.department || 'General Medicine',
            v.chiefComplaint || '',
            v.clinicalNote || '',
            v.plan || '',
          ]
        );
        visitCount++;
      }

      // 3. Upsert Medications
      const meds = p.medications || [];
      for (const m of meds) {
        const drugName = typeof m === 'string' ? m : m.name;
        if (!drugName) continue;

        await pool.query(
          `INSERT INTO medications (patient_id, drug, dose, frequency, active)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            patientId,
            drugName,
            typeof m === 'object' ? m.dose || '' : '',
            typeof m === 'object' ? m.frequency || '' : '',
            typeof m === 'object' ? m.active !== false : true,
          ]
        );
        medCount++;
      }

      // 4. Upsert Labs
      const labResults = p.labResults || {};
      for (const [testName, entries] of Object.entries(labResults)) {
        if (!Array.isArray(entries)) continue;
        for (const entry of entries) {
          const labDate = entry.date || new Date().toISOString().slice(0, 10);
          const valStr = typeof entry.value === 'object' ? JSON.stringify(entry.value) : String(entry.value || entry.systolic || '');
          await pool.query(
            `INSERT INTO labs (patient_id, test_name, value, unit, status, normal_range, lab_date)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              patientId,
              testName,
              valStr,
              entry.unit || '',
              entry.status || 'NORMAL',
              entry.normalRange || '',
              labDate,
            ]
          );
          labCount++;
        }
      }
    } catch (err) {
      console.warn(`⚠️ Error processing ${file}:`, err.message);
    }
  }

  console.log('====================================================');
  console.log('📊 MIGRATION SUMMARY POST-CHECK METRICS:');
  console.log('====================================================');
  console.log(`✅ Patients Inserted/Upserted:   ${patientCount}`);
  console.log(`✅ Visits Inserted:              ${visitCount}`);
  console.log(`✅ Medications Inserted:         ${medCount}`);
  console.log(`✅ Labs Inserted:                ${labCount}`);

  // Query database counts directly to confirm persistence
  const checkP = await pool.query('SELECT COUNT(*) FROM patients');
  const checkV = await pool.query('SELECT COUNT(*) FROM visits');
  const checkM = await pool.query('SELECT COUNT(*) FROM medications');
  const checkL = await pool.query('SELECT COUNT(*) FROM labs');

  console.log('\n====================================================');
  console.log('🔍 POSTGRESQL VERIFIED ROW COUNTS IN DATABASE:');
  console.log('====================================================');
  console.log(`🟢 DB Patients Row Count:    ${checkP.rows[0].count}`);
  console.log(`🟢 DB Visits Row Count:      ${checkV.rows[0].count}`);
  console.log(`🟢 DB Medications Row Count: ${checkM.rows[0].count}`);
  console.log(`🟢 DB Labs Row Count:        ${checkL.rows[0].count}`);

  await pool.end();
  console.log('\n🎉 Migration complete! PostgreSQL is populated.\n');
}

migrateDataToPostgres();
