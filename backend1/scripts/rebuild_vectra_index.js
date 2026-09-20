'use strict';

const fs = require('fs');
const path = require('path');
const { initIndex, indexPatient, indexPatientBundle } = require('../rag/vectorStore');

async function rebuild() {
  const vectraDir = path.join(__dirname, '../data/vectra_index');
  if (fs.existsSync(vectraDir)) {
    fs.rmSync(vectraDir, { recursive: true, force: true });
    console.log('Cleared stale vectra_index directory.');
  }

  await initIndex();
  const dataDir = path.join(__dirname, '../data');
  const files = fs.readdirSync(dataDir).filter((f) => /^patient_.*\.json$/i.test(f));

  for (const f of files) {
    const p = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
    const res = await indexPatient(p);
    console.log(`Indexed ${p.name || p.id}: ${res.indexed} chunks across all 4 sections.`);
  }

  // Also index dataset patient P051 to test the data-quality consistency issue
  try {
    const datasetDir = path.join(__dirname, '../dataset_output');
    const datasetPatients = JSON.parse(fs.readFileSync(path.join(datasetDir, 'patients.json'), 'utf8'));
    const datasetLabs = JSON.parse(fs.readFileSync(path.join(datasetDir, 'labs.json'), 'utf8'));
    const datasetVisits = JSON.parse(fs.readFileSync(path.join(datasetDir, 'visits.json'), 'utf8'));
    const datasetMeds = JSON.parse(fs.readFileSync(path.join(datasetDir, 'medications.json'), 'utf8'));

    const p051 = datasetPatients.find((p) => p.patient_id === 'P051');
    if (p051) {
      const bundle51 = {
        patient: p051,
        visits: datasetVisits.filter((v) => v.patient_id === 'P051'),
        medications: datasetMeds.filter((m) => m.patient_id === 'P051'),
        labs: datasetLabs.filter((l) => l.patient_id === 'P051'),
      };
      const r51 = await indexPatientBundle(bundle51);
      console.log(`Indexed P051 (dataset): ${r51.indexed} chunks.`);
    }
  } catch (err) {
    console.warn('Dataset P051 index warning:', err.message);
  }

  console.log('✅ Rebuild complete!');
}

rebuild().catch(console.error);
