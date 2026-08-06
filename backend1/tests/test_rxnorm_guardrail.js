const { validate_drug_with_nih_rxnorm } = require('../tools/patientTools');

async function testRxNormValidation() {
  console.log('====================================================');
  console.log('🧪 TESTING NIH NLM RXNORM DRUG VALIDATION');
  console.log('====================================================\n');

  const testDrugs = [
    'Amoxicillin',
    'HCQS',
    'Folitrax',
    'Folvite',
    'Wysolone',
    'Rablet',
    'Sedroclun', // Fictional / hallucinated string
    'Sectoseleg', // Fictional / hallucinated string
  ];

  for (const drug of testDrugs) {
    const res = await validate_drug_with_nih_rxnorm(drug);
    console.log(`💊 Drug: "${drug}" -> Verified: ${res.verified ? '✅ YES (RxCUI: ' + res.rxcui + ')' : '❌ NO (Unrecognized / Possible Hallucination)'}`);
  }
}

testRxNormValidation();
