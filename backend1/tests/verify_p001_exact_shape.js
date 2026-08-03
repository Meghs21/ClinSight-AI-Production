const path = require('path');
const fs = require('fs');
const patientRepository = require('../repositories/patientRepository');

async function verifyP001Data() {
  console.log('====================================================');
  console.log('🔍 EXACT DATA VERIFICATION FOR PATIENT P001');
  console.log('====================================================\n');

  const repoPatient = await patientRepository.getPatientById('P001');

  console.log('--- [1. UNTRUNCATED MEDICATIONS ARRAY] ---');
  console.log(JSON.stringify(repoPatient.medications, null, 2));

  console.log('\n--- [2. UNTRUNCATED 4 VISITS ARRAY] ---');
  console.log(JSON.stringify(repoPatient.visits, null, 2));
}

verifyP001Data();
